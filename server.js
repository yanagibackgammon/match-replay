const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer, WebSocket } = require("ws");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const MATCH_DIR = path.join(ROOT, "matches");
const CONFIG_PATH = path.join(ROOT, "stream-config.json");

const MIME = {
  ".html":"text/html; charset=utf-8",
  ".css":"text/css; charset=utf-8",
  ".js":"application/javascript; charset=utf-8",
  ".json":"application/json; charset=utf-8",
  ".svg":"image/svg+xml",
  ".png":"image/png",
  ".jpg":"image/jpeg",
  ".jpeg":"image/jpeg",
  ".txt":"text/plain; charset=utf-8",
  ".xg":"application/octet-stream"
};

const defaultMeta = {
  tournamentTitle: "JBS第31期名人戦 準々決勝　25ptマッチ",
  blackName: "柳 暢祐",
  whiteName: "平林 直",
  blackScore: 0,
  whiteScore: 0,
  matchFile: ""
};

function ensureDirs(){
  if(!fs.existsSync(MATCH_DIR)) fs.mkdirSync(MATCH_DIR, {recursive:true});
}

function loadConfig(){
  try{
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return {...defaultMeta, ...parsed};
  }catch{
    return {...defaultMeta};
  }
}

function saveConfig(meta){
  try{
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(meta, null, 2), "utf8");
  }catch(error){
    console.error("Failed to save config", error);
  }
}

function listMatchFiles(){
  ensureDirs();
  try{
    return fs.readdirSync(MATCH_DIR, {withFileTypes:true})
      .filter(entry => entry.isFile())
      .map(entry => entry.name)
      .filter(name => /\.(xg|json)$/i.test(name))
      .sort((a, b) => a.localeCompare(b, "ja"));
  }catch{
    return [];
  }
}

function safePath(urlPath){
  const requested = decodeURIComponent((urlPath || "/").split("?")[0]);
  const normalized = requested === "/" ? "/index.html" : requested;
  const filePath = path.resolve(ROOT, "." + normalized);
  if(!filePath.startsWith(ROOT)) return null;
  return filePath;
}

ensureDirs();

let state = {
  index:0,
  totalSteps:6,
  playing:false,
  speed:1500,
  meta: loadConfig()
};

let timer = null;

function json(res, payload){
  res.writeHead(200, {
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store"
  });
  res.end(JSON.stringify(payload));
}

const server = http.createServer((req, res) => {
  const requestPath = decodeURIComponent((req.url || "/").split("?")[0]);

  if(requestPath === "/api/matches"){
    return json(res, {files:listMatchFiles()});
  }

  const filePath = safePath(req.url);
  if(!filePath){
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.stat(filePath, (statError, stat) => {
    if(statError || !stat.isFile()){
      res.writeHead(404);
      res.end("Not Found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control":"no-store"
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

const wss = new WebSocketServer({server, path:"/ws"});

function broadcastState(){
  const payload = JSON.stringify({type:"state", ...state});
  for(const client of wss.clients){
    if(client.readyState === WebSocket.OPEN){
      client.send(payload);
    }
  }
}

function stopTimer(){
  if(timer){
    clearInterval(timer);
    timer = null;
  }
}

function startTimer(){
  stopTimer();
  if(!state.playing) return;

  timer = setInterval(() => {
    const lastIndex = Math.max(0, state.totalSteps - 1);
    if(state.index >= lastIndex){
      state.index = lastIndex;
      state.playing = false;
      stopTimer();
      broadcastState();
      return;
    }
    state.index += 1;
    broadcastState();
  }, state.speed);
}

function setIndex(index){
  const lastIndex = Math.max(0, state.totalSteps - 1);
  state.index = Math.max(0, Math.min(lastIndex, Number(index) || 0));
}

function applyMetaPatch(patch){
  state.meta = {
    ...state.meta,
    tournamentTitle: String(patch.tournamentTitle ?? state.meta.tournamentTitle || "").trim(),
    blackName: String(patch.blackName ?? state.meta.blackName || "").trim(),
    whiteName: String(patch.whiteName ?? state.meta.whiteName || "").trim(),
    blackScore: Number.isFinite(Number(patch.blackScore)) ? Number(patch.blackScore) : state.meta.blackScore,
    whiteScore: Number.isFinite(Number(patch.whiteScore)) ? Number(patch.whiteScore) : state.meta.whiteScore,
    matchFile: String(patch.matchFile ?? state.meta.matchFile || "").trim()
  };
  saveConfig(state.meta);
}

function handleCommand(message){
  switch(message.command){
    case "play":
      state.playing = true;
      startTimer();
      break;
    case "pause":
      state.playing = false;
      stopTimer();
      break;
    case "prev":
      state.playing = false;
      stopTimer();
      setIndex(state.index - 1);
      break;
    case "next":
      state.playing = false;
      stopTimer();
      setIndex(state.index + 1);
      break;
    case "seek":
      state.playing = false;
      stopTimer();
      setIndex(message.value);
      break;
    case "speed":
      state.speed = Math.max(200, Number(message.value) || 1500);
      if(state.playing) startTimer();
      break;
    case "setMeta":
      applyMetaPatch(message.value || {});
      break;
  }
  broadcastState();
}

wss.on("connection", socket => {
  socket.send(JSON.stringify({type:"state", ...state}));

  socket.on("message", data => {
    try{
      const message = JSON.parse(data.toString());

      if(message.type === "hello" && message.role === "display"){
        const totalSteps = Number(message.totalSteps);
        if(Number.isFinite(totalSteps) && totalSteps > 0){
          state.totalSteps = Math.floor(totalSteps);
          setIndex(state.index);
          broadcastState();
        }
        return;
      }

      if(message.type === "command"){
        handleCommand(message);
      }
    }catch(error){
      console.error("Invalid message:", error);
    }
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Match Replay server: http://localhost:${PORT}/`);
  console.log(`Control panel:       http://localhost:${PORT}/control.html`);
});
