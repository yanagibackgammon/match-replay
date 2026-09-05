const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer, WebSocket } = require("ws");
const { parseXgFile } = require("./scripts/xg-parser.cjs");

const PORT = Number(process.env.PORT || 3000);
const SEQUENCE_SPEED = 6000;
const PLAYBACK_SPEED = SEQUENCE_SPEED;
const PRE_ROLL_SPEED = SEQUENCE_SPEED;
const ROLL_SPEED = SEQUENCE_SPEED;
const CANDIDATE_SPEED = SEQUENCE_SPEED;
const MOVE_SPEED = SEQUENCE_SPEED;
const CUBE_SPEED = SEQUENCE_SPEED;
const SCORE_SEQUENCE_SPEED = SEQUENCE_SPEED;
const BIG_COMEBACK_DIM_SPEED = SEQUENCE_SPEED;
const CHECKER_MOVE_DURATION = 500;
const ROOT = __dirname;
const MATCH_DIR = path.join(ROOT, "matches");
const ADS_DIR = path.join(ROOT, "ads");
const GENERATED_DIR = path.join(MATCH_DIR, "generated");
const CONFIG_PATH = path.join(ROOT, "stream-config.json");

const MIME = {
  ".html":"text/html; charset=utf-8",
  ".css":"text/css; charset=utf-8",
  ".js":"application/javascript; charset=utf-8",
  ".cjs":"application/javascript; charset=utf-8",
  ".json":"application/json; charset=utf-8",
  ".svg":"image/svg+xml",
  ".png":"image/png",
  ".jpg":"image/jpeg",
  ".jpeg":"image/jpeg",
  ".webp":"image/webp",
  ".gif":"image/gif",
  ".txt":"text/plain; charset=utf-8",
  ".xg":"application/octet-stream"
};

const defaultMeta = {
  tournamentTitleLine1: "",
  tournamentTitleLine2: "",
  blackName: "",
  whiteName: "",
  blackScore: 0,
  whiteScore: 0,
  matchFile: "",
  themeColor: "#6B670D",
  designPreset: "green"
};

function ensureDirs(){
  fs.mkdirSync(MATCH_DIR,{recursive:true});
  fs.mkdirSync(ADS_DIR,{recursive:true});
  fs.mkdirSync(GENERATED_DIR,{recursive:true});
}

function loadConfig(){
  try{
    const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH,"utf8"));
    return {...defaultMeta,...parsed};
  }catch{
    return {...defaultMeta};
  }
}

function saveConfig(meta){
  try{ fs.writeFileSync(CONFIG_PATH,JSON.stringify(meta,null,2),"utf8"); }
  catch(error){ console.error("Failed to save config",error); }
}

function listFiles(dir,regex){
  ensureDirs();
  try{
    return fs.readdirSync(dir,{withFileTypes:true})
      .filter(e=>e.isFile())
      .map(e=>e.name)
      .filter(n=>regex.test(n))
      .sort((a,b)=>a.localeCompare(b,"ja"));
  }catch{return [];}
}

function listMatchFiles(){
  return listFiles(MATCH_DIR,/\.(xg|json)$/i).filter(n=>n!=="manifest.json");
}
function listAdFiles(){ return listFiles(ADS_DIR,/\.(png|jpe?g|webp|gif)$/i); }

function safeBasename(name){
  if(typeof name !== "string" || !name || path.basename(name)!==name) throw new Error("Invalid file name");
  return name;
}

const matchCache = new Map();
function loadMatchData(file){
  file = safeBasename(file);
  const full = path.join(MATCH_DIR,file);
  if(!fs.existsSync(full)) throw new Error(`Match file not found: ${file}`);
  const stat = fs.statSync(full);
  const key = `${file}:${stat.mtimeMs}:${stat.size}`;
  if(matchCache.has(key)) return matchCache.get(key);

  let data;
  if(/\.xg$/i.test(file)){
    data = parseXgFile(full);
    const out = path.join(GENERATED_DIR,`${file}.json`);
    fs.writeFileSync(out,JSON.stringify(data));
  }else{
    data = JSON.parse(fs.readFileSync(full,"utf8"));
  }
  if(!data || !Array.isArray(data.states)) throw new Error("Invalid replay data");
  matchCache.clear();
  matchCache.set(key,data);
  return data;
}

function safePath(urlPath){
  const requested = decodeURIComponent((urlPath || "/").split("?")[0]);
  const normalized = requested === "/" ? "/index.html" : requested;
  const filePath = path.resolve(ROOT,"."+normalized);
  if(!filePath.startsWith(ROOT)) return null;
  return filePath;
}

ensureDirs();
let state = {index:0,totalSteps:1,playing:false,speed:PLAYBACK_SPEED,playbackRate:1,mode:"auto",gameStarts:[],meta:loadConfig(),matchError:""};
let timer = null;

function syncSelectedMatch(resetIndex=false){
  const file = state.meta.matchFile;
  if(!file){
    state.totalSteps=1;
    state.gameStarts=[];
    state.matchError="";
    if(resetIndex) state.index=0;
    return;
  }
  try{
    const data=loadMatchData(file);
    state.totalSteps=Math.max(1,data.states.length);
    state.gameStarts=data.states.reduce((list,item,index)=>{
      if(item && item.phase==="gameStart") list.push({index,gameNumber:Number(item.gameNumber)||list.length+1});
      return list;
    },[]);
    state.matchError="";
    if(resetIndex) state.index=0;
    else state.index=Math.min(state.index,state.totalSteps-1);
  }catch(error){
    state.totalSteps=1;
    state.gameStarts=[];
    state.index=0;
    state.matchError=String(error.message||error);
    console.error(error);
  }
}
syncSelectedMatch(false);

function json(res,payload,status=200){
  res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"});
  res.end(JSON.stringify(payload));
}

function readJsonBody(req, limit=1024*1024){
  return new Promise((resolve,reject)=>{
    let body="";
    req.setEncoding("utf8");
    req.on("data",chunk=>{
      body+=chunk;
      if(body.length>limit){
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end",()=>{
      try{ resolve(body ? JSON.parse(body) : {}); }
      catch(error){ reject(new Error("Invalid JSON")); }
    });
    req.on("error",reject);
  });
}

const server=http.createServer(async (req,res)=>{
  const u=new URL(req.url,"http://localhost");

  if(u.pathname==="/api/meta" && req.method==="POST"){
    try{
      const patch=await readJsonBody(req);
      applyMetaPatch(patch||{});
      if(state.matchError) return json(res,{ok:false,error:state.matchError,state:{type:"state",...state}},400);
      broadcastState();
      return json(res,{ok:true,state:{type:"state",...state}});
    }catch(error){
      return json(res,{ok:false,error:String(error.message||error)},400);
    }
  }

  if(u.pathname==="/api/matches") return json(res,{files:listMatchFiles()});
  if(u.pathname==="/api/ads") return json(res,{files:listAdFiles()});
  if(u.pathname==="/api/match"){
    try{return json(res,loadMatchData(u.searchParams.get("file")||""));}
    catch(error){return json(res,{error:String(error.message||error)},400);}
  }

  const filePath=safePath(req.url);
  if(!filePath){res.writeHead(403);res.end("Forbidden");return;}
  fs.stat(filePath,(err,stat)=>{
    if(err||!stat.isFile()){res.writeHead(404);res.end("Not Found");return;}
    const ext=path.extname(filePath).toLowerCase();
    res.writeHead(200,{"Content-Type":MIME[ext]||"application/octet-stream","Cache-Control":"no-store"});
    fs.createReadStream(filePath).pipe(res);
  });
});

const wss=new WebSocketServer({server,path:"/ws"});
function broadcastState(){
  const payload=JSON.stringify({type:"state",...state});
  for(const client of wss.clients) if(client.readyState===WebSocket.OPEN) client.send(payload);
}
function normalizedPlaybackRate(value){const rate=Number(value);return [1,2,3,6].includes(rate)?rate:1;}
function scaledDelay(ms){return Math.max(1,Math.round(ms/normalizedPlaybackRate(state.playbackRate)));}
function currentPlaybackDelay(){
  try{
    const file=state.meta.matchFile;
    if(!file)return scaledDelay(PLAYBACK_SPEED);
    const data=loadMatchData(file);
    const current=data.states?.[state.index];
    if(current?.phase==="gameEnd" || current?.phase==="matchStart" || current?.phase==="matchEnd")return scaledDelay(SCORE_SEQUENCE_SPEED);
    if(current?.phase==="bigComebackIntro")return scaledDelay(BIG_COMEBACK_DIM_SPEED);
    if(current?.phase==="preRoll")return scaledDelay(PRE_ROLL_SPEED);
    if(["cubeOffer","cubeOfferSelect","cubeResponse","cubeResponseSelect"].includes(current?.phase))return scaledDelay(CUBE_SPEED);
    const segments=Array.isArray(current?.moveAnimation?.segments)?current.moveAnimation.segments:[];
    const checkerMoveDuration=CHECKER_MOVE_DURATION/normalizedPlaybackRate(state.playbackRate);
    if(current?.phase==="roll"&&current?.noContactCombined){
      const hitCount=segments.reduce((n,s)=>n+(s?.hit?1:0),0);
      const animationMs=segments.length?(segments.length+hitCount)*checkerMoveDuration+250/normalizedPlaybackRate(state.playbackRate):0;
      return Math.max(scaledDelay(ROLL_SPEED),animationMs);
    }
    if(current?.phase==="roll")return scaledDelay(ROLL_SPEED);
    const hitCount=segments.reduce((n,s)=>n+(s?.hit?1:0),0);
    const animationMs=segments.length?(segments.length+hitCount)*checkerMoveDuration+250/normalizedPlaybackRate(state.playbackRate):0;
    if(current?.phase==="analysis" || (current?.phase==="candidates"&&current?.forcedMove))return Math.max(scaledDelay(MOVE_SPEED),animationMs);
    if(current?.phase==="candidates")return scaledDelay(CANDIDATE_SPEED);
    if(segments.length)return Math.max(scaledDelay(PLAYBACK_SPEED),animationMs);
    return scaledDelay(PLAYBACK_SPEED);
  }catch{return scaledDelay(PLAYBACK_SPEED);}
}
function stopTimer(){if(timer){clearTimeout(timer);timer=null;}}
function startTimer(){
  stopTimer();
  if(!state.playing || state.mode!=="auto")return;
  timer=setTimeout(()=>{
    timer=null;
    const last=Math.max(0,state.totalSteps-1);
    if(state.index>=last){state.index=last;state.playing=false;broadcastState();return;}
    state.index+=1;broadcastState();
    startTimer();
  },currentPlaybackDelay());
}
function setIndex(v){state.index=Math.max(0,Math.min(Math.max(0,state.totalSteps-1),Number(v)||0));}

function applyMetaPatch(patch){
  const oldFile=state.meta.matchFile;
  state.meta={
    ...state.meta,
    tournamentTitleLine1:String(patch.tournamentTitleLine1 ?? state.meta.tournamentTitleLine1 ?? "").trim(),
    tournamentTitleLine2:String(patch.tournamentTitleLine2 ?? state.meta.tournamentTitleLine2 ?? "").trim(),
    themeColor:/^#[0-9a-fA-F]{6}$/.test(String(patch.themeColor ?? state.meta.themeColor ?? "")) ? String(patch.themeColor ?? state.meta.themeColor) : "#6B670D",
    designPreset:String(patch.designPreset ?? state.meta.designPreset ?? "green").trim() || "green",
    blackName:String(patch.blackName ?? state.meta.blackName ?? "").trim(),
    whiteName:String(patch.whiteName ?? state.meta.whiteName ?? "").trim(),
    blackScore:Number.isFinite(Number(patch.blackScore))?Number(patch.blackScore):state.meta.blackScore,
    whiteScore:Number.isFinite(Number(patch.whiteScore))?Number(patch.whiteScore):state.meta.whiteScore,
    matchFile:String(patch.matchFile ?? state.meta.matchFile ?? "").trim()
  };
  saveConfig(state.meta);
  const changed=state.meta.matchFile!==oldFile;
  if(changed){state.playing=false;stopTimer();}
  // 同じ棋譜を再選択した場合も、ファイル追加・更新後に再解析できるよう必ず同期する。
  syncSelectedMatch(changed);
}

function handleCommand(m){
  switch(m.command){
    case"setMode":
      state.mode=m.value==="manual"?"manual":"auto";
      state.playing=false;stopTimer();
      break;
    case"play":
      state.speed=scaledDelay(PLAYBACK_SPEED);
      if(state.mode==="auto"){state.playing=true;startTimer();}
      break;
    case"pause":state.playing=false;stopTimer();break;
    case"prev":state.playing=false;stopTimer();setIndex(state.index-1);break;
    case"next":state.playing=false;stopTimer();setIndex(state.index+1);break;
    case"seek":state.playing=false;stopTimer();setIndex(m.value);break;
    case"speed":
      state.playbackRate=normalizedPlaybackRate(m.value);
      state.speed=scaledDelay(PLAYBACK_SPEED);
      if(state.playing&&state.mode==="auto")startTimer();
      break;
    case"setMeta":applyMetaPatch(m.value||{});break;
  }
  broadcastState();
}

wss.on("connection",socket=>{
  socket.send(JSON.stringify({type:"state",...state}));
  socket.on("message",data=>{
    try{
      const m=JSON.parse(data.toString());
      if(m.type==="command")handleCommand(m);
      else if(m.type==="hello") socket.send(JSON.stringify({type:"state",...state}));
    }catch(error){console.error("Invalid message",error);}
  });
});

server.listen(PORT,"127.0.0.1",()=>{
  console.log(`Match Replay server: http://localhost:${PORT}/`);
  console.log(`Control panel:       http://localhost:${PORT}/control.html`);
  if(state.matchError) console.log(`Match error: ${state.matchError}`);
});
