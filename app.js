const pointsG=document.getElementById("points");
const checkersG=document.getElementById("checkers");
const diceG=document.getElementById("dice");
const cubeG=document.getElementById("cube");
const boardSvg=document.getElementById("board");
const gameOverlayG=document.createElementNS("http://www.w3.org/2000/svg","g");
gameOverlayG.setAttribute("id","gameOverlay");
boardSvg.appendChild(gameOverlayG);
const moveAnimationG=document.createElementNS("http://www.w3.org/2000/svg","g");
moveAnimationG.setAttribute("id","moveAnimation");
boardSvg.appendChild(moveAnimationG);
let moveAnimationToken=0;
let moveAnimationRunning=false;
let lastMoveAnimationKey="";
const CHECKER_MOVE_DURATION=500;

const defaultMeta={
  tournamentTitleLine1:"JBS第31期名人戦 準々決勝",
  tournamentTitleLine2:"2025-08-30　25ポイントマッチ　勝てばベスト4",
  blackName:"柳 暢祐",whiteName:"平林 直",blackScore:0,whiteScore:0,matchFile:"",themeColor:"#6B670D",designPreset:"classic"
};
const standardPoints=[0,-2,0,0,0,0,5,0,3,0,0,0,-5,5,0,0,0,-3,0,-5,0,0,0,0,2];
const emptyState={
  phase:"empty",score:[0,0],activePlayer:0,position:{points:standardPoints,blackBar:0,whiteBar:0,blackOff:0,whiteOff:0},
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
const PLAYBACK_SPEED=3000;
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
  blackHistoryList:document.getElementById("blackHistoryList"),whiteHistoryList:document.getElementById("whiteHistoryList"),
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
function addBearOffStack(count,klass,upper){
  const n=Math.max(0,Math.min(15,Number(count)||0));
  if(!n)return;
  // ベアオフは右端トレイに薄いチェッカーを積む。選手2=上、選手1=下。
  const x=651.5,w=34,h=9,pitch=14;
  for(let i=0;i<n;i++){
    const r=document.createElementNS("http://www.w3.org/2000/svg","rect");
    r.setAttribute("x",String(x));
    r.setAttribute("y",String(upper ? 38+i*pitch : 499-h-i*pitch));
    r.setAttribute("width",String(w));r.setAttribute("height",String(h));r.setAttribute("rx","4.5");
    r.setAttribute("class",klass);checkersG.appendChild(r);
  }
}
function drawCheckers(position){
  checkersG.innerHTML="";const arr=position?.points||standardPoints;
  for(let p=1;p<=24;p++){const v=arr[p]||0;if(!v)continue;const q=pointCoord(p);addStack(q.x,q.y,q.dir,Math.abs(v),v>0?"checker-piece-black":"checker-piece-white");}
  // 添付SVG: 白は上側バー中央 (y=150.5)、黒は下側バー中央 (y=395.5)。
  addBarStack(150.5,position?.whiteBar||0,"checker-piece-white");
  addBarStack(395.5,position?.blackBar||0,"checker-piece-black");
  addBearOffStack(position?.whiteOff||0,"checker-piece-white",true);
  addBearOffStack(position?.blackOff||0,"checker-piece-black",false);
}

function cloneVisualPosition(position){
  return {
    points:(position?.points||Array(25).fill(0)).slice(),
    blackBar:Number(position?.blackBar||0),whiteBar:Number(position?.whiteBar||0),
    blackOff:Number(position?.blackOff||0),whiteOff:Number(position?.whiteOff||0)
  };
}
function moveCheckerClass(activePlayer){return activePlayer===1?"checker-piece-black":"checker-piece-white";}
function ownCountAt(position,point,activePlayer){
  const v=Number(position?.points?.[point]||0);
  return activePlayer===1?Math.max(0,v):Math.max(0,-v);
}
function stackTopCoord(point,count){
  const q=pointCoord(point),i=Math.max(0,Math.min(Math.max(1,count),5)-1);
  return {x:q.x,y:q.y+q.dir*i*43};
}
function barMoveCoord(position,activePlayer){
  const count=Math.max(1,Number(activePlayer===1?position?.blackBar:position?.whiteBar)||1);
  const centerY=activePlayer===1?395.5:150.5;
  const spacing=count<=1?0:Math.min(38,190/(count-1));
  const firstY=centerY-spacing*(count-1)/2;
  // バー中央寄りの一枚から動かす。
  const y=activePlayer===1?firstY:firstY+spacing*(count-1);
  return {x:350.5,y};
}
function bearOffMoveCoord(position,activePlayer){
  const h=9,pitch=14,x=668.5;
  if(activePlayer===1){
    const n=Math.max(0,Number(position?.blackOff)||0);
    return {x,y:499-h-n*pitch+h/2};
  }
  const n=Math.max(0,Number(position?.whiteOff)||0);
  return {x,y:38+n*pitch+h/2};
}
function sourceMoveCoord(position,segment,activePlayer){
  if(segment?.source==="bar")return barMoveCoord(position,activePlayer);
  const p=Number(segment?.source);
  if(Number.isInteger(p)&&p>=1&&p<=24)return stackTopCoord(p,ownCountAt(position,p,activePlayer));
  return {x:350.5,y:273};
}
function destinationMoveCoord(positionAfterSource,segment,activePlayer){
  const p=Number(segment?.destination);
  if(Number.isInteger(p)&&p>=1&&p<=24){
    const q=pointCoord(p),own=ownCountAt(positionAfterSource,p,activePlayer);
    const v=Number(positionAfterSource?.points?.[p]||0);
    const opponentBlot=activePlayer===1?v===-1:v===1;
    const i=opponentBlot?0:Math.min(own,4);
    return {x:q.x,y:q.y+q.dir*i*43};
  }
  return bearOffMoveCoord(positionAfterSource,activePlayer);
}
function removeMovingChecker(position,segment,activePlayer){
  const out=cloneVisualPosition(position),sign=activePlayer===1?1:-1;
  if(segment?.source==="bar"){
    if(activePlayer===1)out.blackBar=Math.max(0,out.blackBar-1);else out.whiteBar=Math.max(0,out.whiteBar-1);
  }else{
    const p=Number(segment?.source);if(Number.isInteger(p)&&p>=1&&p<=24)out.points[p]-=sign;
  }
  return out;
}
function finishMovingChecker(positionAfterSource,segment,activePlayer){
  const out=cloneVisualPosition(positionAfterSource),sign=activePlayer===1?1:-1;
  const p=Number(segment?.destination);
  if(Number.isInteger(p)&&p>=1&&p<=24){
    if(activePlayer===1&&out.points[p]===-1){out.points[p]=0;out.whiteBar+=1;}
    else if(activePlayer===-1&&out.points[p]===1){out.points[p]=0;out.blackBar+=1;}
    out.points[p]+=sign;
  }else if(activePlayer===1)out.blackOff+=1;else out.whiteOff+=1;
  return out;
}
function easeCheckerMove(t){return t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;}
function animateCheckerBetween(from,to,activePlayer,token){
  return new Promise(resolve=>{
    if(token!==moveAnimationToken){resolve(false);return;}
    const c=document.createElementNS("http://www.w3.org/2000/svg","circle");
    c.setAttribute("cx",String(from.x));c.setAttribute("cy",String(from.y));c.setAttribute("r","21.1");
    c.setAttribute("class",moveCheckerClass(activePlayer));
    moveAnimationG.appendChild(c);
    const started=performance.now();
    const frame=now=>{
      if(token!==moveAnimationToken){c.remove();resolve(false);return;}
      const t=Math.min(1,(now-started)/CHECKER_MOVE_DURATION),e=easeCheckerMove(t);
      c.setAttribute("cx",String(from.x+(to.x-from.x)*e));
      c.setAttribute("cy",String(from.y+(to.y-from.y)*e));
      if(t>=1){c.remove();resolve(true);return;}
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}
function cancelCheckerAnimation(){
  moveAnimationToken+=1;moveAnimationRunning=false;moveAnimationG.innerHTML="";
}
async function runCheckerAnimation(state,key){
  const token=++moveAnimationToken;
  moveAnimationRunning=true;moveAnimationG.innerHTML="";
  let board=cloneVisualPosition(state.moveAnimation.beforePosition);
  drawCheckers(board);
  for(const segment of state.moveAnimation.segments||[]){
    if(token!==moveAnimationToken)return;
    const from=sourceMoveCoord(board,segment,state.activePlayer);
    const withoutSource=removeMovingChecker(board,segment,state.activePlayer);
    const to=destinationMoveCoord(withoutSource,segment,state.activePlayer);
    drawCheckers(withoutSource);
    const completed=await animateCheckerBetween(from,to,state.activePlayer,token);
    if(!completed||token!==moveAnimationToken)return;
    board=finishMovingChecker(withoutSource,segment,state.activePlayer);
    drawCheckers(board);
  }
  if(token!==moveAnimationToken)return;
  moveAnimationRunning=false;moveAnimationG.innerHTML="";
  drawCheckers(state.position);
}
function renderAnimatedCheckers(state){
  const eligible=state?.phase==="analysis"&&state?.moveAnimation&&Array.isArray(state.moveAnimation.segments)&&state.moveAnimation.segments.length>0;
  const key=`${loadedMatchFile}|${index}`;
  if(!eligible){
    if(moveAnimationRunning)cancelCheckerAnimation();
    lastMoveAnimationKey="";moveAnimationG.innerHTML="";drawCheckers(state?.position);return;
  }
  if(lastMoveAnimationKey!==key){
    if(moveAnimationRunning)cancelCheckerAnimation();
    lastMoveAnimationKey=key;
    runCheckerAnimation(state,key);
    return;
  }
  if(!moveAnimationRunning)drawCheckers(state.position);
}
function drawDice(vals,activePlayer,{luckKind=null}={}){
  diceG.innerHTML="";
  diceG.classList.toggle("is-joker-glow",luckKind==="joker");
  diceG.classList.toggle("is-antijoker-glow",luckKind==="antiJoker");
  if(!vals)return;const spots={1:[[18,18]],2:[[10,10],[26,26]],3:[[10,10],[18,18],[26,26]],4:[[10,10],[26,10],[10,26],[26,26]],5:[[10,10],[26,10],[18,18],[10,26],[26,26]],6:[[10,9],[26,9],[10,18],[26,18],[10,27],[26,27]]};
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
  if(baseRects[1]) baseRects[1].setAttribute("fill",normalizeHex(next.board?.line,"#000000"));
  if(baseRects[2]) baseRects[2].setAttribute("fill",normalizeHex(next.board?.line,"#000000"));
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

function ensureHistoryHeader(el){
  if(!el)return {pr:null,name:null};
  let pr=el.querySelector('.history-pr');
  let name=el.querySelector('.history-name-text');
  if(!pr||!name){
    el.textContent='';
    pr=document.createElement('span');pr.className='history-pr';
    name=document.createElement('span');name.className='history-name-text';
    el.append(pr,name);
  }
  return {pr,name};
}
function renderHistoryHeader(el,prValue,nameText){
  const parts=ensureHistoryHeader(el);
  if(parts.pr)parts.pr.textContent=`PR ${Number(prValue||0).toFixed(2)}`;
  if(parts.name)parts.name.textContent=nameText||'';
}
function renderMeta(state){
  document.documentElement.style.setProperty("--theme-color",normalizeThemeColor(meta.themeColor));
  applyDesignPreset(meta.designPreset||"classic");
  els.tournamentTitleLine1.textContent=meta.tournamentTitleLine1;
  els.tournamentTitleLine2.textContent=meta.tournamentTitleLine2||"";
  els.blackName.textContent=meta.blackName;els.whiteName.textContent=meta.whiteName;
  renderHistoryHeader(els.blackHistoryName,state?.pr?.black,meta.blackName);
  renderHistoryHeader(els.whiteHistoryName,state?.pr?.white,meta.whiteName);
  const score=state?.score||[meta.blackScore,meta.whiteScore];
  const blackGain=state?.scoreDelta?.winner==='black'?Number(state.scoreDelta.points)||0:0;
  const whiteGain=state?.scoreDelta?.winner==='white'?Number(state.scoreDelta.points)||0:0;
  function renderScoreValue(el,value,gain){
    if(!el)return;
    const gainNow=gain>0;
    el.textContent=gainNow?`+${gain}`:value;
    el.classList.toggle('is-score-gain',gainNow);
    if(gainNow){
      const key=`${state?.gameNumber||0}-${index}-${gain}`;
      if(el.dataset.scoreGainKey!==key){
        el.dataset.scoreGainKey=key;
        el.classList.remove('score-gain-animate');
        void el.offsetWidth;
        el.classList.add('score-gain-animate');
      }
    }else{
      el.dataset.scoreGainKey='';
      el.classList.remove('score-gain-animate');
    }
  }
  renderScoreValue(els.blackScore,score[0]??meta.blackScore,blackGain);
  renderScoreValue(els.whiteScore,score[1]??meta.whiteScore,whiteGain);
}
function diePips(face){return {1:["p5"],2:["p1","p9"],3:["p1","p5","p9"],4:["p1","p3","p7","p9"],5:["p1","p3","p5","p7","p9"],6:["p1","p3","p4","p6","p7","p9"]}[face]||[];}
function diePlayerClass(player){return player===1||player==="black"?"player1":"player2";}
function renderDie(face,player){return `<span class="die ${diePlayerClass(player)}">${diePips(face).map(c=>`<span class="die-pip ${c}"></span>`).join("")}</span>`;}
function renderPair(pair,player){return pair&&pair.length===2?`<div class="dice-pair-inline">${renderDie(pair[0],player)}${renderDie(pair[1],player)}</div>`:'<div class="dice-pair-inline"></div>';}
function renderHistoryCube(value){
  const shown=Math.max(2,Number(value)||2);
  return `<div class="history-cube-pair"><span class="history-icon-spacer"></span><span class="history-cube-icon">${shown}</span></div>`;
}
function historyClass(error){
  const loss=Math.abs(Number(error)||0);
  if(loss>=0.080)return"history-blunder";
  if(loss>=0.020)return"history-error";
  return"";
}
function candidateErrorClass(error){const value=Number(error);if(value<=-0.080)return"error-purple";if(value<=-0.020)return"error-red";return"";}
function historyMoveLabel(move){return move==="Dance"?"Cannot Move":(move||"");}
function historyCell(event,player){
  if(!event)return '<div class="history-cell"></div>';
  const icon=event.kind==="cube"?renderHistoryCube(event.cubeValue):renderPair(event.dice,player);
  return `<div class="history-cell ${historyClass(event.error)}">${icon}<span class="history-move">${historyMoveLabel(event.move)}</span></div>`;
}
function collectHistoryRows(){
  const rows=[];
  const cubeRows=new Map();
  let leadPlayer=null;
  let openMoveRow=null;
  for(let stateIndex=0;stateIndex<=index&&stateIndex<matchData.states.length;stateIndex++){
    const state=matchData.states[stateIndex];
    if(!state)continue;
    if(state.phase==="gameStart"){
      rows.push({kind:"game",gameNumber:Number(state.gameNumber)||1});
      leadPlayer=null;openMoveRow=null;cubeRows.clear();
      continue;
    }

    // 各ゲームで最初に手番を迎えた側を先行とする。
    // 先行のpreRoll（手番開始）が来た時点で、ムーブ表示前でも次の行を先に作る。
    if(state.phase==="preRoll"){
      const turnPlayer=state.activePlayer===1?"black":(state.activePlayer===-1?"white":null);
      if(turnPlayer){
        if(!leadPlayer)leadPlayer=turnPlayer;
        if(turnPlayer===leadPlayer){openMoveRow={kind:"actions",black:null,white:null};rows.push(openMoveRow);}
      }
    }

    // Legacy generated JSON compatibility.
    const grouped=Array.isArray(state.historyEvents)?state.historyEvents.filter(Boolean):[];
    if(grouped.length){
      const row={kind:"actions",black:null,white:null};
      for(const event of grouped){if(event.player==="black"||event.player==="white")row[event.player]=event;}
      rows.push(row);openMoveRow=null;continue;
    }

    const event=state.historyEvent;
    if(event&&(event.player==="black"||event.player==="white")){
      if(event.kind==="cube"){
        const row={kind:"actions",black:null,white:null};
        row[event.player]=event;rows.push(row);openMoveRow=null;
        if(event.pairId)cubeRows.set(event.pairId,row);
        continue;
      }
      if(event.kind==="cubeResponse"){
        let row=event.pairId?cubeRows.get(event.pairId):null;
        if(!row){row={kind:"actions",black:null,white:null};rows.push(row);if(event.pairId)cubeRows.set(event.pairId,row);}
        row[event.player]=event;openMoveRow=null;continue;
      }
      if(!leadPlayer)leadPlayer=event.player;
      if(!openMoveRow||openMoveRow[event.player]){openMoveRow={kind:"actions",black:null,white:null};rows.push(openMoveRow);}
      openMoveRow[event.player]=event;
      continue;
    }

    // ロールした瞬間は、現在行にダイスだけ先に表示する。
    if(stateIndex===index&&state.phase==="roll"&&Array.isArray(state.dice)){
      const turnPlayer=state.activePlayer===1?"black":(state.activePlayer===-1?"white":null);
      if(turnPlayer){
        if(!leadPlayer)leadPlayer=turnPlayer;
        if(!openMoveRow||openMoveRow[turnPlayer]){openMoveRow={kind:"actions",black:null,white:null};rows.push(openMoveRow);}
        openMoveRow[turnPlayer]={player:turnPlayer,dice:state.dice,move:"",error:0,kind:"roll"};
      }
    }
  }
  return rows.slice(-4);
}
function renderHistory(){
  const rows=collectHistoryRows();
  // v36で履歴DOM構造を変更したため、Pages/OBSのキャッシュでHTMLとJSの
  // 世代が一時的にずれても描画全体を止めないよう新旧DOMの両方に対応する。
  if(els.historyList){
    const padded=[...Array(Math.max(0,4-rows.length)).fill(null),...rows].slice(-4);
    els.historyList.innerHTML=padded.map(row=>{
      if(!row)return `<div class="history-timeline-row history-empty-row">${historyCell(null,"black")}${historyCell(null,"white")}</div>`;
      if(row.kind==="game")return `<div class="history-timeline-row history-game-row"><div class="history-game-label">Game ${row.gameNumber}</div></div>`;
      return `<div class="history-timeline-row">${historyCell(row.black,"black")}${historyCell(row.white,"white")}</div>`;
    }).join("");
    return;
  }
  if(els.blackHistoryList&&els.whiteHistoryList){
    els.blackHistoryList.innerHTML=rows.map(row=>row.kind==="game"?`<div class="history-row">Game ${row.gameNumber}</div>`:historyCell(row.black,"black")).join("");
    els.whiteHistoryList.innerHTML=rows.map(row=>row.kind==="game"?'<div class="history-row"></div>':historyCell(row.white,"white")).join("");
  }
}
function renderAnalysis(a){
  if(!a||a.type==="none"){els.analysisContent.innerHTML="";return;}
  if(a.type==="jokers"){
    const activePlayer=currentState().activePlayer===1?1:-1;
    const pair=(d,kind)=>`<div class="joker-glow ${kind}"><div class="dice-pair-block">${renderDie(d[0],activePlayer)}${renderDie(d[1],activePlayer)}</div></div>`;
    const items=[...(a.joker||[]).map(d=>pair(d,"plus")),...(a.antiJoker||[]).map(d=>pair(d,"minus"))];
    els.analysisContent.innerHTML=`<div class="analysis-jokers${items.length>6?" is-many":""}">${items.join("")}</div>`;return;
  }
  const selectedIndex=Number.isInteger(a.playedIndex)?a.playedIndex:-1;
  const all=a.candidates||[];
  let visible=all.slice(0,5).map((c,i)=>({candidate:c,index:i}));
  // 選択手が6位以下の場合は、5行目を実際の選択手に置き換える。
  if(selectedIndex>=5 && all[selectedIndex]){
    const entry={candidate:all[selectedIndex],index:selectedIndex};
    if(visible.length<5)visible.push(entry);else visible[4]=entry;
  }
  const rows=visible.map(({candidate:c,index:i})=>{
    const errorClass=candidateErrorClass(c.error);
    const selected=i===selectedIndex;
    const selectedClass=selected?(errorClass==="error-purple"?" is-selected is-selected-blunder":errorClass==="error-red"?" is-selected is-selected-error":" is-selected"):"";
    return `<div class="analysis-row${selectedClass}"><span class="analysis-move">${historyMoveLabel(c.move)}</span><span class="analysis-eq ${errorClass}">${Number(c.error??0).toFixed(3)}</span></div>`;
  });
  while(rows.length<5) rows.push('<div class="analysis-row analysis-row-empty"><span class="analysis-move"></span><span class="analysis-eq"></span></div>');
  els.analysisContent.innerHTML=`<div class="analysis-moves">${rows.slice(0,5).join("")}</div>`;
}
function currentState(){return matchData.states[Math.max(0,Math.min(index,matchData.states.length-1))]||emptyState;}
function render(){
  const s=currentState(),b=Number(s.winRate?.black??50),w=Number(s.winRate?.white??(100-b));renderMeta(s);
  const displayBlack=Math.round(b),displayWhite=100-displayBlack;
  els.winBarBlack.style.width=`${b}%`;els.winBarWhite.style.width=`${w}%`;els.blackRateText.textContent=`${displayBlack}%`;els.whiteRateText.textContent=`${displayWhite}%`;
  els.blackHistoryName.classList.toggle("active-turn",s.activePlayer===1);
  els.whiteHistoryName.classList.toggle("active-turn",s.activePlayer===-1);
  drawPointLabels(s.activePlayer);renderAnimatedCheckers(s);drawDice(s.dice,s.activePlayer,{luckKind:s.luckKind||null});drawCube(s.cube);drawGameOverlay(s);renderHistory();renderAnalysis(s.analysis);
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
