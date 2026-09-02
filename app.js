const pointsG=document.getElementById("points");
const checkersG=document.getElementById("checkers");
const diceG=document.getElementById("dice");
const cubeG=document.getElementById("cube");

const defaultMeta={
  tournamentTitleLine1:"JBS第31期名人戦 準々決勝",
  tournamentTitleLine2:"2025/08/30　25ポイントマッチ　勝てばベスト4",
  blackName:"柳 暢祐",whiteName:"平林 直",blackScore:0,whiteScore:0,matchFile:""
};
const standardPoints=[0,-2,0,0,0,0,5,0,3,0,0,0,-5,5,0,0,0,-3,0,-5,0,0,0,0,2];
const emptyState={
  phase:"empty",score:[0,0],activePlayer:0,position:{points:standardPoints,blackBar:0,whiteBar:0},
  dice:null,cube:{value:1,owner:0},winRate:{black:50,white:50},analysis:{type:"none"},historyEvent:null
};

let index=0,meta={...defaultMeta},matchData={states:[emptyState]},loadedMatchFile="",socket=null;
let adFiles=[],adIndex=0,adTimer=null;
const isLocal=()=>location.hostname==="localhost"||location.hostname==="127.0.0.1";
const pageChannel=(!isLocal()&&"BroadcastChannel" in window)?new BroadcastChannel("match-replay-control"):null;

const els={
  stageWrap:document.getElementById("stage-wrap"),stage:document.getElementById("stage"),
  tournamentTitleLine1:document.getElementById("tournamentTitleLine1"),tournamentTitleLine2:document.getElementById("tournamentTitleLine2"),
  blackName:document.getElementById("blackName"),whiteName:document.getElementById("whiteName"),
  blackHistoryName:document.getElementById("blackHistoryName"),whiteHistoryName:document.getElementById("whiteHistoryName"),
  blackScore:document.getElementById("blackScore"),whiteScore:document.getElementById("whiteScore"),
  winBarBlack:document.getElementById("winBarBlack"),winBarWhite:document.getElementById("winBarWhite"),
  blackRateText:document.getElementById("blackRateText"),whiteRateText:document.getElementById("whiteRateText"),
  blackHistoryList:document.getElementById("blackHistoryList"),whiteHistoryList:document.getElementById("whiteHistoryList"),
  analysisContent:document.getElementById("analysisContent"),adImage:document.getElementById("adImage"),adPlaceholder:document.getElementById("adPlaceholder")
};

function trianglePoints(){
  pointsG.innerHTML="";const labelsG=document.getElementById("pointLabels");labelsG.innerHTML="";
  const centers=[81.75,126.25,170.75,215.25,259.75,304.25,397.75,442.25,486.75,531.25,575.75,620.25],w=44.5;
  for(let i=0;i<12;i++){
    const cx=centers[i],left=cx-w/2;
    for(const [top,color] of [[true,i%2===0?"#fff":"#cfcfcf"],[false,i%2===0?"#cfcfcf":"#fff"]]){
      const p=document.createElementNS("http://www.w3.org/2000/svg","polygon");p.setAttribute("class","point");p.setAttribute("fill",color);
      p.setAttribute("points",top?`${left},30 ${left+w},30 ${cx},251`:`${left},516 ${left+w},516 ${cx},294`);pointsG.appendChild(p);
    }
  }
  const topNums=[13,14,15,16,17,18,19,20,21,22,23,24],bottomNums=[12,11,10,9,8,7,6,5,4,3,2,1];
  centers.forEach((cx,i)=>{
    for(const [y,n] of [[18,topNums[i]],[540,bottomNums[i]]]){const t=document.createElementNS("http://www.w3.org/2000/svg","text");t.setAttribute("x",cx);t.setAttribute("y",y);t.setAttribute("class","point-label");t.textContent=n;labelsG.appendChild(t);}
  });
}
function pointCoord(p){const c=[81.75,126.25,170.75,215.25,259.75,304.25,397.75,442.25,486.75,531.25,575.75,620.25];return p<=12?{x:c[12-p],y:493,dir:-1}:{x:c[p-13],y:53,dir:1};}
function addStack(x,y,dir,n,klass){
  if(!n)return;const max=Math.min(n,5);
  for(let i=0;i<max;i++){const c=document.createElementNS("http://www.w3.org/2000/svg","circle");c.setAttribute("cx",x);c.setAttribute("cy",y+dir*i*43);c.setAttribute("r","21.1");c.setAttribute("class",klass);checkersG.appendChild(c);}
  if(n>5){const t=document.createElementNS("http://www.w3.org/2000/svg","text");t.setAttribute("x",x);t.setAttribute("y",y+dir*4*43+6);t.setAttribute("class","checker-text");t.setAttribute("fill",klass.includes("black")?"#fff":"#000");t.textContent=n;checkersG.appendChild(t);}
}
function drawCheckers(position){
  checkersG.innerHTML="";const arr=position?.points||standardPoints;
  for(let p=1;p<=24;p++){const v=arr[p]||0;if(!v)continue;const q=pointCoord(p);addStack(q.x,q.y,q.dir,Math.abs(v),v>0?"checker-piece-black":"checker-piece-white");}
  addStack(350.5,474,-1,position?.blackBar||0,"checker-piece-black");
  addStack(350.5,72,1,position?.whiteBar||0,"checker-piece-white");
}
function drawDice(vals,activePlayer){
  diceG.innerHTML="";if(!vals)return;const spots={1:[[18,18]],2:[[10,10],[26,26]],3:[[10,10],[18,18],[26,26]],4:[[10,10],[26,10],[10,26],[26,26]],5:[[10,10],[26,10],[18,18],[10,26],[26,26]],6:[[10,9],[26,9],[10,18],[26,18],[10,27],[26,27]]};
  function die(x,y,n){const g=document.createElementNS("http://www.w3.org/2000/svg","g"),black=activePlayer===1,r=document.createElementNS("http://www.w3.org/2000/svg","rect");r.setAttribute("x",x);r.setAttribute("y",y);r.setAttribute("width",36);r.setAttribute("height",36);r.setAttribute("rx",4);r.setAttribute("fill",black?"#000":"#fff");r.setAttribute("stroke","#000");g.appendChild(r);(spots[n]||[]).forEach(([dx,dy])=>{const c=document.createElementNS("http://www.w3.org/2000/svg","circle");c.setAttribute("cx",x+dx);c.setAttribute("cy",y+dy);c.setAttribute("r","3.4");c.setAttribute("fill",black?"#fff":"#000");g.appendChild(c);});return g;}
  diceG.appendChild(die(286.5,254,vals[0]));diceG.appendChild(die(332.5,254,vals[1]));
}
function drawCube(v){cubeG.innerHTML="";if(!v||v<=1)return;const r=document.createElementNS("http://www.w3.org/2000/svg","rect");r.setAttribute("x","332.5");r.setAttribute("y","35");r.setAttribute("width","36");r.setAttribute("height","36");r.setAttribute("rx","3");r.setAttribute("fill","#fff");r.setAttribute("stroke","#000");cubeG.appendChild(r);const t=document.createElementNS("http://www.w3.org/2000/svg","text");t.setAttribute("x","350.5");t.setAttribute("y","60");t.setAttribute("text-anchor","middle");t.setAttribute("font-size","23");t.textContent=v;cubeG.appendChild(t);}
trianglePoints();

function renderMeta(state){
  els.tournamentTitleLine1.textContent=meta.tournamentTitleLine1;els.tournamentTitleLine2.textContent=meta.tournamentTitleLine2;
  els.blackName.textContent=meta.blackName;els.whiteName.textContent=meta.whiteName;els.blackHistoryName.textContent=meta.blackName;els.whiteHistoryName.textContent=meta.whiteName;
  const score=state?.score||[meta.blackScore,meta.whiteScore];els.blackScore.textContent=score[0]??meta.blackScore;els.whiteScore.textContent=score[1]??meta.whiteScore;
}
function diePips(face){return {1:["p5"],2:["p1","p9"],3:["p1","p5","p9"],4:["p1","p3","p7","p9"],5:["p1","p3","p5","p7","p9"],6:["p1","p3","p4","p6","p7","p9"]}[face]||[];}
function renderDie(face){return `<span class="die">${diePips(face).map(c=>`<span class="die-pip ${c}"></span>`).join("")}</span>`;}
function renderPair(pair){return pair&&pair.length===2?`<div class="dice-pair-inline">${renderDie(pair[0])}${renderDie(pair[1])}</div>`:'<div class="dice-pair-inline"></div>';}
function historyClass(error){if(error<=-0.080)return"error-red";if(error<=-0.020)return"error-green";return"";}
function renderHistoryColumn(player){
  const events=matchData.states.slice(0,index+1).map(s=>s.historyEvent).filter(e=>e&&e.player===player).slice(-6).reverse();
  return events.map(e=>`<div class="history-row ${historyClass(e.error)}">${renderPair(e.dice)}<span class="history-move">${e.move||""}</span></div>`).join("");
}
function renderHistory(){els.blackHistoryList.innerHTML=renderHistoryColumn("black");els.whiteHistoryList.innerHTML=renderHistoryColumn("white");}
function renderAnalysis(a){
  if(!a||a.type==="none"){els.analysisContent.innerHTML="";return;}
  if(a.type==="jokers"){
    const block=(rows,cls)=>`<div class="analysis-dice-block ${cls}">${(rows||[]).map(d=>`<div class="dice-pair-block">${renderDie(d[0])}${renderDie(d[1])}</div>`).join("")}</div>`;
    els.analysisContent.innerHTML=`<div class="analysis-jokers">${block(a.joker,"plus")}${block(a.antiJoker,"minus")}</div>`;return;
  }
  const rows=(a.candidates||[]).slice(0,6).map(c=>`<div class="analysis-row"><span class="analysis-move">${c.move||""}</span><span class="analysis-eq">${Number(c.error??0).toFixed(3)}</span></div>`).join("");
  els.analysisContent.innerHTML=`<div class="analysis-moves">${rows}</div>`;
}
function currentState(){return matchData.states[Math.max(0,Math.min(index,matchData.states.length-1))]||emptyState;}
function render(){
  const s=currentState(),b=Number(s.winRate?.black??50),w=Number(s.winRate?.white??(100-b));renderMeta(s);
  els.winBarBlack.style.width=`${b}%`;els.winBarWhite.style.width=`${w}%`;els.blackRateText.textContent=`${b.toFixed(1)}%`;els.whiteRateText.textContent=`${w.toFixed(1)}%`;
  drawCheckers(s.position);drawDice(s.dice,s.activePlayer);drawCube(s.cube?.value||1);renderHistory();renderAnalysis(s.analysis);
}

async function fetchManifest(){try{const u=new URL("./matches/manifest.json",location.href);u.searchParams.set("t",Date.now());const r=await fetch(u,{cache:"no-store"});return r.ok?await r.json():{};}catch{return {};}}
async function loadMatch(file){
  if(!file){loadedMatchFile="";matchData={states:[emptyState]};index=0;render();return;}
  if(file===loadedMatchFile&&matchData.states.length>1)return;
  try{
    let url;
    if(isLocal()) url=`/api/match?file=${encodeURIComponent(file)}`;
    else{
      const m=await fetchManifest();const rel=m.generated?.[file]||(/\.xg$/i.test(file)?`generated/${file}.json`:file);
      url=new URL(`./matches/${rel}`,location.href).toString();
    }
    const r=await fetch(url,{cache:"no-store"});if(!r.ok)throw new Error(`HTTP ${r.status}`);const data=await r.json();if(!Array.isArray(data.states)||!data.states.length)throw new Error("No replay states");
    matchData=data;loadedMatchFile=file;index=Math.min(index,data.states.length-1);render();
  }catch(error){console.error("Failed to load match",error);loadedMatchFile="";matchData={states:[emptyState]};index=0;render();}
}
async function applyStateMessage(message){
  if(typeof message.index==="number")index=message.index;
  const old=meta.matchFile;if(message.meta)meta={...meta,...message.meta};
  if(meta.matchFile!==old||meta.matchFile!==loadedMatchFile)await loadMatch(meta.matchFile);
  render();
}

async function loadInitialPagesMeta(){
  if(isLocal())return;
  try{const r=await fetch(new URL("./stream-config.json",location.href),{cache:"no-store"});if(r.ok)meta={...meta,...await r.json()};}catch{}
  try{const s=localStorage.getItem("matchReplayMeta");if(s)meta={...meta,...JSON.parse(s)};}catch{}
  await loadMatch(meta.matchFile);render();
}
function connectWebSocket(){
  if(!isLocal())return;const protocol=location.protocol==="https:"?"wss:":"ws:";socket=new WebSocket(`${protocol}//${location.host}/ws`);
  socket.addEventListener("open",()=>socket.send(JSON.stringify({type:"hello",role:"display"})));
  socket.addEventListener("message",async e=>{try{const m=JSON.parse(e.data);if(m.type==="state")await applyStateMessage(m);}catch(err){console.warn(err);}});
  socket.addEventListener("close",()=>setTimeout(connectWebSocket,1500));
}
if(pageChannel)pageChannel.addEventListener("message",async e=>{if(e.data?.type==="meta"){meta={...meta,...e.data.meta};await loadMatch(meta.matchFile);render();}});
addEventListener("storage",async e=>{if(!isLocal()&&e.key==="matchReplayMeta"&&e.newValue){try{meta={...meta,...JSON.parse(e.newValue)};await loadMatch(meta.matchFile);render();}catch{}}});

async function loadAds(){
  try{let r;if(isLocal())r=await fetch("/api/ads",{cache:"no-store"});else r=await fetch(new URL("./ads/manifest.json",location.href),{cache:"no-store"});const d=await r.json();adFiles=Array.isArray(d.files)?d.files:[];}catch{adFiles=[];}
}
function showAd(f){if(!f){els.adImage.hidden=true;els.adImage.removeAttribute("src");return;}els.adImage.src=`./ads/${encodeURIComponent(f)}`;els.adImage.hidden=false;}
async function cycleAds(){await loadAds();if(!adFiles.length){showAd(null);return;}showAd(adFiles[adIndex%adFiles.length]);adIndex++;}
function startAdRotation(){if(adTimer)clearInterval(adTimer);cycleAds();adTimer=setInterval(cycleAds,30000);}
function scaleStage(){const vw=document.documentElement.clientWidth||innerWidth||1920,s=vw/1920;els.stage.style.transform=`scale(${s})`;els.stageWrap.style.height=`${Math.ceil(1080*s)}px`;}
addEventListener("resize",scaleStage);scaleStage();render();startAdRotation();loadInitialPagesMeta();connectWebSocket();
