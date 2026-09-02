const pointsG=document.getElementById("points");
const checkersG=document.getElementById("checkers");
const diceG=document.getElementById("dice");
const cubeG=document.getElementById("cube");
const boardSvg=document.getElementById("board");
const gameOverlayG=document.createElementNS("http://www.w3.org/2000/svg","g");
gameOverlayG.setAttribute("id","gameOverlay");
boardSvg.appendChild(gameOverlayG);

const defaultMeta={
  tournamentTitleLine1:"JBS第31期名人戦 準々決勝",
  tournamentTitleLine2:"2025-08-30　25ポイントマッチ　勝てばベスト4",
  blackName:"柳 暢祐",whiteName:"平林 直",blackScore:0,whiteScore:0,matchFile:"",themeColor:"#6B670D",designPreset:"classic"
};
const standardPoints=[0,-2,0,0,0,0,5,0,3,0,0,0,-5,5,0,0,0,-3,0,-5,0,0,0,0,2];
const emptyState={
  phase:"empty",score:[0,0],activePlayer:0,position:{points:standardPoints,blackBar:0,whiteBar:0},
  dice:null,cube:{value:1,owner:0},winRate:{black:50,white:50},analysis:{type:"none"},historyEvent:null
};

const FALLBACK_DESIGN={
  id:"classic",name:"クラシック（黒・白）",
  checkers:{player1:"#111111",player2:"#FFFFFF"},
  winRate:{player1:"#111111",player2:"#FFFFFF"},
  board:{surface:"#FFFFFF",pointLight:"#FFFFFF",pointDark:"#CFCFCF",bar:"#111111",line:"#000000"}
};
let designPresets=[FALLBACK_DESIGN];
let currentDesign=FALLBACK_DESIGN;
let appliedDesignPresetId="";

let index=0,meta={...defaultMeta},matchData={states:[emptyState]},loadedMatchFile="",socket=null;
let adFiles=[],adIndex=0,adTimer=null;
let pagesTimer=null;
const PLAYBACK_SPEED=2000;
let pagesState={index:0,totalSteps:1,playing:false,speed:PLAYBACK_SPEED,mode:"auto"};
const isLocal=()=>location.hostname==="localhost"||location.hostname==="127.0.0.1";
const pageChannel=(!isLocal()&&"BroadcastChannel" in window)?new BroadcastChannel("match-replay-control"):null;
let pagesMetaRevision="";
let pagesMetaPoller=null;

const els={
  stageWrap:document.getElementById("stage-wrap"),stage:document.getElementById("stage"),
  tournamentTitleLine1:document.getElementById("tournamentTitleLine1"),
  tournamentTitleLine2:document.getElementById("tournamentTitleLine2"),
  blackName:document.getElementById("blackName"),whiteName:document.getElementById("whiteName"),
  blackHistoryName:document.getElementById("blackHistoryName"),whiteHistoryName:document.getElementById("whiteHistoryName"),
  blackScore:document.getElementById("blackScore"),whiteScore:document.getElementById("whiteScore"),
  winBarBlack:document.getElementById("winBarBlack"),winBarWhite:document.getElementById("winBarWhite"),
  blackRateText:document.getElementById("blackRateText"),whiteRateText:document.getElementById("whiteRateText"),
  historyList:document.getElementById("historyList"),
  analysisContent:document.getElementById("analysisContent"),
  adImage1:document.getElementById("adImage1"),adImage2:document.getElementById("adImage2")
};

const pointLabelCenters=[81.75,126.25,170.75,215.25,259.75,304.25,397.75,442.25,486.75,531.25,575.75,620.25];
function drawPointLabels(activePlayer=1){
  const labelsG=document.getElementById("pointLabels");labelsG.innerHTML="";
  const player2=activePlayer===-1;
  const topNums=player2?[12,11,10,9,8,7,6,5,4,3,2,1]:[13,14,15,16,17,18,19,20,21,22,23,24];
  const bottomNums=player2?[13,14,15,16,17,18,19,20,21,22,23,24]:[12,11,10,9,8,7,6,5,4,3,2,1];
  pointLabelCenters.forEach((cx,i)=>{
    for(const [y,n] of [[18,topNums[i]],[540,bottomNums[i]]]){
      const t=document.createElementNS("http://www.w3.org/2000/svg","text");
      t.setAttribute("x",cx);t.setAttribute("y",y);t.setAttribute("class","point-label");t.textContent=n;labelsG.appendChild(t);
    }
  });
}
function trianglePoints(){
  pointsG.innerHTML="";
  const centers=pointLabelCenters,w=44.5;
  for(let i=0;i<12;i++){
    const cx=centers[i],left=cx-w/2;
    const light=currentDesign?.board?.pointLight||"#FFFFFF";
    const dark=currentDesign?.board?.pointDark||"#CFCFCF";
    for(const [top,color] of [[true,i%2===0?light:dark],[false,i%2===0?dark:light]]){
      const p=document.createElementNS("http://www.w3.org/2000/svg","polygon");p.setAttribute("class","point");p.setAttribute("fill",color);
      p.setAttribute("points",top?`${left},30 ${left+w},30 ${cx},251`:`${left},516 ${left+w},516 ${cx},294`);pointsG.appendChild(p);
    }
  }
  drawPointLabels(1);
}
function pointCoord(p){const c=[81.75,126.25,170.75,215.25,259.75,304.25,397.75,442.25,486.75,531.25,575.75,620.25];return p<=12?{x:c[12-p],y:493,dir:-1}:{x:c[p-13],y:53,dir:1};}
function addStack(x,y,dir,n,klass){
  if(!n)return;const max=Math.min(n,5);
  for(let i=0;i<max;i++){const c=document.createElementNS("http://www.w3.org/2000/svg","circle");c.setAttribute("cx",x);c.setAttribute("cy",y+dir*i*43);c.setAttribute("r","21.1");c.setAttribute("class",klass);checkersG.appendChild(c);}
  if(n>5){const t=document.createElementNS("http://www.w3.org/2000/svg","text");t.setAttribute("x",x);t.setAttribute("y",y+dir*4*43+6);t.setAttribute("class","checker-text");const checkerFill=klass.includes("black")?(currentDesign?.checkers?.player1||"#111111"):(currentDesign?.checkers?.player2||"#FFFFFF");
    t.setAttribute("fill",contrastText(checkerFill));t.textContent=n;checkersG.appendChild(t);}
}
function addBarStack(centerY,n,klass){
  const count=Math.max(0,Number(n)||0);
  if(!count)return;
  // Position Drill / 添付SVG準拠。バーの上下ハーフ中央を基準にし、
  // 2枚なら 38px 間隔。枚数が多い場合だけ自動的に詰めてハーフ内へ収める。
  const spacing=count<=1?0:Math.min(38,190/(count-1));
  const firstY=centerY-spacing*(count-1)/2;
  for(let i=0;i<count;i++){
    const c=document.createElementNS("http://www.w3.org/2000/svg","circle");
    c.setAttribute("cx","350.5");
    c.setAttribute("cy",String(firstY+spacing*i));
    c.setAttribute("r","21.1");
    c.setAttribute("class",klass);
    checkersG.appendChild(c);
  }
}
function drawCheckers(position){
  checkersG.innerHTML="";const arr=position?.points||standardPoints;
  for(let p=1;p<=24;p++){const v=arr[p]||0;if(!v)continue;const q=pointCoord(p);addStack(q.x,q.y,q.dir,Math.abs(v),v>0?"checker-piece-black":"checker-piece-white");}
  // 添付SVG: 白は上側バー中央 (y=150.5)、黒は下側バー中央 (y=395.5)。
  addBarStack(150.5,position?.whiteBar||0,"checker-piece-white");
  addBarStack(395.5,position?.blackBar||0,"checker-piece-black");
}
function drawDice(vals,activePlayer){
  diceG.innerHTML="";if(!vals)return;const spots={1:[[18,18]],2:[[10,10],[26,26]],3:[[10,10],[18,18],[26,26]],4:[[10,10],[26,10],[10,26],[26,26]],5:[[10,10],[26,10],[18,18],[10,26],[26,26]],6:[[10,9],[26,9],[10,18],[26,18],[10,27],[26,27]]};
  const player1=activePlayer===1;
  const face=normalizeHex(player1?currentDesign?.checkers?.player1:currentDesign?.checkers?.player2,player1?"#111111":"#FFFFFF");
  const pip=contrastText(face);
  function die(x,y,n){const g=document.createElementNS("http://www.w3.org/2000/svg","g"),r=document.createElementNS("http://www.w3.org/2000/svg","rect");r.setAttribute("x",x);r.setAttribute("y",y);r.setAttribute("width",36);r.setAttribute("height",36);r.setAttribute("rx",4);r.setAttribute("fill",face);r.setAttribute("stroke",pip);r.setAttribute("stroke-width","1.5");g.appendChild(r);(spots[n]||[]).forEach(([dx,dy])=>{const c=document.createElementNS("http://www.w3.org/2000/svg","circle");c.setAttribute("cx",x+dx);c.setAttribute("cy",y+dy);c.setAttribute("r","3.4");c.setAttribute("fill",pip);g.appendChild(c);});return g;}
  // Player 1 is shown in the center of the right half; Player 2 in the center of the left half.
  const xs=player1?[468.5,514.5]:[151.5,197.5];
  diceG.appendChild(die(xs[0],254,vals[0]));diceG.appendChild(die(xs[1],254,vals[1]));
}
function drawCube(cube){
  cubeG.innerHTML="";
  const value=Math.max(1,Number(cube?.value)||1);
  const owner=cube?.owner||0;
  // 添付SVG準拠: センターはバー中央、白所有は上端、黒所有は下端。
  const y=owner==="white"?35:(owner==="black"?475:255);
  const r=document.createElementNS("http://www.w3.org/2000/svg","rect");
  r.setAttribute("x","332.5");r.setAttribute("y",String(y));r.setAttribute("width","36");r.setAttribute("height","36");r.setAttribute("rx","3");
  r.setAttribute("fill","#fff");r.setAttribute("stroke","#000");r.setAttribute("stroke-width","1.5");cubeG.appendChild(r);
  const t=document.createElementNS("http://www.w3.org/2000/svg","text");
  t.setAttribute("x","350.5");t.setAttribute("y",String(y+25));t.setAttribute("text-anchor","middle");t.setAttribute("fill","#000");
  t.setAttribute("font-family","Arial, Helvetica, sans-serif");t.setAttribute("font-size","23");t.textContent=value;cubeG.appendChild(t);
}
function drawGameOverlay(state){
  gameOverlayG.innerHTML="";
  if(!state || state.phase!=="gameStart") return;
  const r=document.createElementNS("http://www.w3.org/2000/svg","rect");
  r.setAttribute("x","246");r.setAttribute("y","232");r.setAttribute("width","210");r.setAttribute("height","82");r.setAttribute("rx","14");
  r.setAttribute("fill","rgba(0,0,0,.82)");r.setAttribute("stroke","#fff");r.setAttribute("stroke-width","2");
  gameOverlayG.appendChild(r);
  const t=document.createElementNS("http://www.w3.org/2000/svg","text");
  t.setAttribute("x","351");t.setAttribute("y","286");t.setAttribute("text-anchor","middle");t.setAttribute("fill","#fff");
  t.setAttribute("font-family","Arial, Helvetica, sans-serif");t.setAttribute("font-size","42");t.setAttribute("font-weight","700");
  t.textContent=`Game ${state.gameNumber || 1}`;gameOverlayG.appendChild(t);
}
trianglePoints();

function normalizeThemeColor(value){
  const text=String(value||"").trim();
  return /^#[0-9a-fA-F]{6}$/.test(text)?text:"#6B670D";
}

function normalizeHex(value,fallback){
  const text=String(value||"").trim();
  return /^#[0-9a-fA-F]{6}$/.test(text)?text:fallback;
}
function contrastText(hex){
  const color=normalizeHex(hex,"#FFFFFF").slice(1);
  const r=parseInt(color.slice(0,2),16),g=parseInt(color.slice(2,4),16),b=parseInt(color.slice(4,6),16);
  const lum=(r*299+g*587+b*114)/1000;
  return lum>=150?"#111111":"#FFFFFF";
}
function findDesignPreset(id){
  return designPresets.find(p=>p&&p.id===id)||designPresets[0]||FALLBACK_DESIGN;
}
function applyDesignPreset(id){
  const next=findDesignPreset(id||"classic");
  currentDesign=next;
  if(appliedDesignPresetId===next.id) return;
  appliedDesignPresetId=next.id;
  const root=document.documentElement;
  const checkerPlayer1=normalizeHex(next.checkers?.player1,"#111111");
  const checkerPlayer2=normalizeHex(next.checkers?.player2,"#FFFFFF");
  root.style.setProperty("--checker-player1",checkerPlayer1);
  root.style.setProperty("--checker-player2",checkerPlayer2);
  root.style.setProperty("--die-player1",checkerPlayer1);
  root.style.setProperty("--die-player2",checkerPlayer2);
  root.style.setProperty("--die-player1-pip",contrastText(checkerPlayer1));
  root.style.setProperty("--die-player2-pip",contrastText(checkerPlayer2));
  root.style.setProperty("--win-player1",normalizeHex(next.winRate?.player1,"#111111"));
  root.style.setProperty("--win-player2",normalizeHex(next.winRate?.player2,"#FFFFFF"));
  root.style.setProperty("--board-surface",normalizeHex(next.board?.surface,"#FFFFFF"));
  root.style.setProperty("--point-light",normalizeHex(next.board?.pointLight,"#FFFFFF"));
  root.style.setProperty("--point-dark",normalizeHex(next.board?.pointDark,"#CFCFCF"));
  root.style.setProperty("--board-bar",normalizeHex(next.board?.bar,"#111111"));
  root.style.setProperty("--board-line",normalizeHex(next.board?.line,"#000000"));

  const directBg=boardSvg.firstElementChild;
  if(directBg&&directBg.tagName.toLowerCase()==="rect") directBg.setAttribute("fill",normalizeHex(next.board?.surface,"#FFFFFF"));
  const baseRects=[...document.querySelectorAll("#boardBase rect")];
  if(baseRects[0]) baseRects[0].setAttribute("fill",normalizeHex(next.board?.surface,"#FFFFFF"));
  if(baseRects[1]) baseRects[1].setAttribute("fill",normalizeHex(next.board?.bar,"#111111"));
  if(baseRects[2]) baseRects[2].setAttribute("fill",normalizeHex(next.board?.bar,"#111111"));
  trianglePoints();
}
async function loadDesignPresets(){
  try{
    const u=new URL("./design-presets.json",location.href);u.searchParams.set("t",Date.now());
    const r=await fetch(u,{cache:"no-store"});
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    const data=await r.json();
    if(Array.isArray(data.presets)&&data.presets.length) designPresets=data.presets;
  }catch(error){
    console.warn("Failed to load design presets; using fallback.",error);
    designPresets=[FALLBACK_DESIGN];
  }
  appliedDesignPresetId="";
  applyDesignPreset(meta.designPreset||"classic");
  render();
}

function renderMeta(state){
  document.documentElement.style.setProperty("--theme-color",normalizeThemeColor(meta.themeColor));
  applyDesignPreset(meta.designPreset||"classic");
  els.tournamentTitleLine1.textContent=meta.tournamentTitleLine1;
  els.tournamentTitleLine2.textContent=meta.tournamentTitleLine2||"";
  els.blackName.textContent=meta.blackName;els.whiteName.textContent=meta.whiteName;els.blackHistoryName.textContent=meta.blackName;els.whiteHistoryName.textContent=meta.whiteName;
  const score=state?.score||[meta.blackScore,meta.whiteScore];els.blackScore.textContent=score[0]??meta.blackScore;els.whiteScore.textContent=score[1]??meta.whiteScore;
}
function diePips(face){return {1:["p5"],2:["p1","p9"],3:["p1","p5","p9"],4:["p1","p3","p7","p9"],5:["p1","p3","p5","p7","p9"],6:["p1","p3","p4","p6","p7","p9"]}[face]||[];}
function diePlayerClass(player){return player===1||player==="black"?"player1":"player2";}
function renderDie(face,player){return `<span class="die ${diePlayerClass(player)}">${diePips(face).map(c=>`<span class="die-pip ${c}"></span>`).join("")}</span>`;}
function renderPair(pair,player){return pair&&pair.length===2?`<div class="dice-pair-inline">${renderDie(pair[0],player)}${renderDie(pair[1],player)}</div>`:'<div class="dice-pair-inline"></div>';}
function historyClass(error){if(error<=-0.080)return"error-red";if(error<=-0.020)return"error-green";return"";}
function historyMoveLabel(move){return move==="Dance"?"Cannot Move":(move||"");}
function historyCell(event,player){
  if(!event)return '<div class="history-cell"></div>';
  return `<div class="history-cell ${historyClass(event.error)}">${renderPair(event.dice,player)}<span class="history-move">${historyMoveLabel(event.move)}</span></div>`;
}
function collectHistoryRows(){
  const rows=[];
  let openMoveRow=null;
  for(const state of matchData.states.slice(0,index+1)){
    if(!state)continue;
    if(state.phase==="gameStart"){
      rows.push({kind:"game",gameNumber:Number(state.gameNumber)||1});
      openMoveRow=null;
      continue;
    }
    const grouped=Array.isArray(state.historyEvents)?state.historyEvents.filter(Boolean):[];
    if(grouped.length){
      const row={kind:"actions",black:null,white:null};
      for(const event of grouped){
        if(event.player==="black"||event.player==="white")row[event.player]=event;
      }
      rows.push(row);
      openMoveRow=null;
      continue;
    }
    const event=state.historyEvent;
    if(!event||(event.player!=="black"&&event.player!=="white"))continue;
    if(event.kind==="cube"){
      const row={kind:"actions",black:null,white:null};
      row[event.player]=event;rows.push(row);openMoveRow=null;continue;
    }
    if(!openMoveRow||openMoveRow[event.player]){
      openMoveRow={kind:"actions",black:null,white:null};
      rows.push(openMoveRow);
    }
    openMoveRow[event.player]=event;
    if(openMoveRow.black&&openMoveRow.white)openMoveRow=null;
  }
  return rows.slice(-4);
}
function renderHistory(){
  const rows=collectHistoryRows();
  els.historyList.innerHTML=rows.map(row=>{
    if(row.kind==="game")return `<div class="history-timeline-row history-game-row"><div class="history-game-label">Game ${row.gameNumber}</div></div>`;
    return `<div class="history-timeline-row">${historyCell(row.black,"black")}${historyCell(row.white,"white")}</div>`;
  }).join("");
}
function renderAnalysis(a){
  if(!a||a.type==="none"){els.analysisContent.innerHTML="";return;}
  if(a.type==="jokers"){
    const activePlayer=currentState().activePlayer===1?1:-1;
    const block=(rows,cls)=>`<div class="analysis-dice-block ${cls}">${(rows||[]).map(d=>`<div class="dice-pair-block">${renderDie(d[0],activePlayer)}${renderDie(d[1],activePlayer)}</div>`).join("")}</div>`;
    els.analysisContent.innerHTML=`<div class="analysis-jokers">${block(a.joker,"plus")}${block(a.antiJoker,"minus")}</div>`;return;
  }
  const selectedIndex=Number.isInteger(a.playedIndex)?a.playedIndex:-1;
  const all=a.candidates||[];
  let visible=all.slice(0,6).map((c,i)=>({candidate:c,index:i}));
  // 選択手が上位6候補の外でも必ず画面内に残す。
  if(selectedIndex>=6 && all[selectedIndex]){
    const entry={candidate:all[selectedIndex],index:selectedIndex};
    if(visible.length<6)visible.push(entry);else visible[visible.length-1]=entry;
  }
  const rows=visible.map(({candidate:c,index:i})=>`<div class="analysis-row${i===selectedIndex?" is-selected":""}"><span class="analysis-move">${historyMoveLabel(c.move)}</span><span class="analysis-eq">${Number(c.error??0).toFixed(3)}</span></div>`).join("");
  els.analysisContent.innerHTML=`<div class="analysis-moves">${rows}</div>`;
}
function currentState(){return matchData.states[Math.max(0,Math.min(index,matchData.states.length-1))]||emptyState;}
function render(){
  const s=currentState(),b=Number(s.winRate?.black??50),w=Number(s.winRate?.white??(100-b));renderMeta(s);
  els.winBarBlack.style.width=`${b}%`;els.winBarWhite.style.width=`${w}%`;els.blackRateText.textContent=`${b.toFixed(1)}%`;els.whiteRateText.textContent=`${w.toFixed(1)}%`;
  els.blackHistoryName.classList.toggle("active-turn",s.activePlayer===1);
  els.whiteHistoryName.classList.toggle("active-turn",s.activePlayer===-1);
  drawPointLabels(s.activePlayer);drawCheckers(s.position);drawDice(s.dice,s.activePlayer);drawCube(s.cube);drawGameOverlay(s);renderHistory();renderAnalysis(s.analysis);
}

async function fetchManifest(){try{const u=new URL("./matches/manifest.json",location.href);u.searchParams.set("t",Date.now());const r=await fetch(u,{cache:"no-store"});return r.ok?await r.json():{};}catch{return {};}}
async function loadMatch(file,{force=false,resetIndex=false}={}){
  if(!file){
    loadedMatchFile="";
    matchData={states:[emptyState]};
    index=0;
    if(!isLocal()){
      pagesState.index=0;
      pagesState.totalSteps=1;
      publishPagesState();
    }
    render();
    return true;
  }
  if(!force && file===loadedMatchFile && matchData.states.length>1) return true;
  try{
    let url;
    if(isLocal()) url=`/api/match?file=${encodeURIComponent(file)}&t=${Date.now()}`;
    else{
      const m=await fetchManifest();
      const rel=m.generated?.[file]||(/\.xg$/i.test(file)?`generated/${file}.json`:file);
      url=new URL(`./matches/${rel}`,location.href);
      url.searchParams.set("t",Date.now());
      url=url.toString();
    }
    const r=await fetch(url,{cache:"no-store"});
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    const data=await r.json();
    if(!Array.isArray(data.states)||!data.states.length) throw new Error("No replay states");
    matchData=data;
    loadedMatchFile=file;
    if(resetIndex) index=0;
    index=Math.max(0,Math.min(index,data.states.length-1));
    if(!isLocal()){
      pagesState.totalSteps=data.states.length;
      pagesState.index=index;
      publishPagesState();
    }
    render();
    return true;
  }catch(error){
    console.error("Failed to load match",error);
    loadedMatchFile="";
    matchData={states:[emptyState]};
    index=0;
    if(!isLocal()){
      pagesState.index=0;
      pagesState.totalSteps=1;
      pagesState.playing=false;
      publishPagesState({matchError:String(error.message||error)});
    }
    render();
    return false;
  }
}
async function applyStateMessage(message){
  if(typeof message.index==="number") index=message.index;
  const old=meta.matchFile;
  if(message.meta) meta={...meta,...message.meta};
  if(meta.matchFile!==old||meta.matchFile!==loadedMatchFile) await loadMatch(meta.matchFile,{force:true,resetIndex:meta.matchFile!==old});
  render();
}

function publishPagesState(extra={}){
  if(isLocal()) return;
  const payload={type:"state",...pagesState,meta:{...meta},...extra};
  try{localStorage.setItem("matchReplayPlaybackState",JSON.stringify(payload));}catch{}
  if(pageChannel) pageChannel.postMessage(payload);
}
function stopPagesTimer(){if(pagesTimer){clearInterval(pagesTimer);pagesTimer=null;}}
function startPagesTimer(){
  stopPagesTimer();
  if(!pagesState.playing || pagesState.mode!=="auto") return;
  pagesTimer=setInterval(()=>{
    const last=Math.max(0,pagesState.totalSteps-1);
    if(pagesState.index>=last){
      pagesState.index=last;pagesState.playing=false;stopPagesTimer();publishPagesState();return;
    }
    pagesState.index+=1;index=pagesState.index;render();publishPagesState();
  },PLAYBACK_SPEED);
}
function handlePagesCommand(command,value){
  pagesState.speed=PLAYBACK_SPEED;
  switch(command){
    case "setMode":
      pagesState.mode=value==="manual"?"manual":"auto";
      pagesState.playing=false;stopPagesTimer();
      break;
    case "play":
      if(pagesState.mode==="auto"){pagesState.playing=true;startPagesTimer();}
      break;
    case "pause": pagesState.playing=false;stopPagesTimer();break;
    case "prev": pagesState.playing=false;stopPagesTimer();pagesState.index=Math.max(0,pagesState.index-1);break;
    case "next": pagesState.playing=false;stopPagesTimer();pagesState.index=Math.min(Math.max(0,pagesState.totalSteps-1),pagesState.index+1);break;
    case "seek": pagesState.playing=false;stopPagesTimer();pagesState.index=Math.max(0,Math.min(Math.max(0,pagesState.totalSteps-1),Number(value)||0));break;
  }
  index=pagesState.index;render();publishPagesState();
}

async function applyPagesMeta(nextMeta,{force=false}={}){
  if(isLocal()||!nextMeta||typeof nextMeta!=="object") return;
  const oldFile=meta.matchFile;
  meta={...meta,...nextMeta};
  const fileChanged=meta.matchFile!==oldFile;
  if(force||fileChanged||meta.matchFile!==loadedMatchFile){
    await loadMatch(meta.matchFile,{force:true,resetIndex:fileChanged});
  }
  if(fileChanged){
    pagesState.index=0;
    index=0;
  }
  render();
  publishPagesState();
}

function startPagesMetaPolling(){
  if(isLocal()||pagesMetaPoller) return;
  try{pagesMetaRevision=localStorage.getItem("matchReplayMetaRevision")||"";}catch{}
  pagesMetaPoller=setInterval(async()=>{
    try{
      const revision=localStorage.getItem("matchReplayMetaRevision")||"";
      if(!revision||revision===pagesMetaRevision) return;
      pagesMetaRevision=revision;
      const raw=localStorage.getItem("matchReplayMeta");
      if(!raw) return;
      await applyPagesMeta(JSON.parse(raw),{force:true});
    }catch(error){
      console.warn("Failed to synchronize display settings",error);
    }
  },300);
}

async function loadInitialPagesMeta(){
  if(isLocal())return;
  try{const r=await fetch(new URL("./stream-config.json",location.href),{cache:"no-store"});if(r.ok)meta={...meta,...await r.json()};}catch{}
  try{const s=localStorage.getItem("matchReplayMeta");if(s)meta={...meta,...JSON.parse(s)};pagesMetaRevision=localStorage.getItem("matchReplayMetaRevision")||"";}catch{}
  try{const s=localStorage.getItem("matchReplayPlaybackState");if(s){const p=JSON.parse(s);pagesState={...pagesState,...p,speed:PLAYBACK_SPEED};index=Number(p.index)||0;}}catch{}
  pagesState.speed=PLAYBACK_SPEED;
  await loadMatch(meta.matchFile,{force:true});
  pagesState.index=Math.max(0,Math.min(index,pagesState.totalSteps-1));
  index=pagesState.index;
  render();publishPagesState();
}
function connectWebSocket(){
  if(!isLocal())return;const protocol=location.protocol==="https:"?"wss:":"ws:";socket=new WebSocket(`${protocol}//${location.host}/ws`);
  socket.addEventListener("open",()=>socket.send(JSON.stringify({type:"hello",role:"display"})));
  socket.addEventListener("message",async e=>{try{const m=JSON.parse(e.data);if(m.type==="state")await applyStateMessage(m);}catch(err){console.warn(err);}});
  socket.addEventListener("close",()=>setTimeout(connectWebSocket,1500));
}
if(pageChannel)pageChannel.addEventListener("message",async e=>{
  const m=e.data||{};
  if(m.type==="meta"){
    if(m.revision) pagesMetaRevision=String(m.revision);
    await applyPagesMeta(m.meta,{force:true});
  }else if(m.type==="command"){
    handlePagesCommand(m.command,m.value);
  }else if(m.type==="state-request"){
    publishPagesState();
  }
});
addEventListener("storage",async e=>{
  if(isLocal()) return;
  try{
    if(e.key==="matchReplayMetaRevision"){
      pagesMetaRevision=e.newValue||"";
      const raw=localStorage.getItem("matchReplayMeta");
      if(raw) await applyPagesMeta(JSON.parse(raw),{force:true});
    }else if(e.key==="matchReplayMeta"&&e.newValue){
      await applyPagesMeta(JSON.parse(e.newValue),{force:true});
    }
  }catch(error){console.warn("Failed to synchronize display settings",error);}
});

async function loadAds(){
  try{let r;if(isLocal())r=await fetch("/api/ads",{cache:"no-store"});else{const u=new URL("./ads/manifest.json",location.href);u.searchParams.set("t",Date.now());r=await fetch(u,{cache:"no-store"});}const d=await r.json();adFiles=Array.isArray(d.files)?d.files:[];}catch{adFiles=[];}
}
function setAdImage(el,file){
  if(!file){el.hidden=true;el.removeAttribute("src");return;}
  el.src=`./ads/${encodeURIComponent(file)}`;el.hidden=false;
}
async function cycleAds(){
  await loadAds();
  if(!adFiles.length){setAdImage(els.adImage1,null);setAdImage(els.adImage2,null);return;}
  const first=adFiles[adIndex%adFiles.length];
  const second=adFiles.length>1?adFiles[(adIndex+1)%adFiles.length]:null;
  setAdImage(els.adImage1,first);setAdImage(els.adImage2,second);
  adIndex=(adIndex+2)%adFiles.length;
}
function startAdRotation(){if(adTimer)clearInterval(adTimer);cycleAds();adTimer=setInterval(cycleAds,60000);}
function scaleStage(){const vw=document.documentElement.clientWidth||innerWidth||1920,s=vw/1920;els.stage.style.transform=`scale(${s})`;els.stageWrap.style.height=`${Math.ceil(1080*s)}px`;}
addEventListener("resize",scaleStage);scaleStage();render();loadDesignPresets();startAdRotation();loadInitialPagesMeta();startPagesMetaPolling();connectWebSocket();
