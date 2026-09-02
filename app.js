const pointsG = document.getElementById("points");
const checkersG = document.getElementById("checkers");
const diceG = document.getElementById("dice");
const cubeG = document.getElementById("cube");

const defaultMeta = {
  tournamentTitleLine1: "JBS第31期名人戦 準々決勝",
  tournamentTitleLine2: "2025/08/30　25ポイントマッチ　勝てばベスト4",
  blackName: "柳 暢祐",
  whiteName: "平林 直",
  blackScore: 0,
  whiteScore: 0,
  matchFile: ""
};

const JOKER_WINRATE_THRESHOLD = 5.0;

const states = [
  {
    mode:"jokers", action:"Opening position", big:"GAME START", dice:null, cube:1, blackRate:50.0, whiteRate:50.0,
    jokersPlus:[{dice:[6,6], deltaW:9.2},{dice:[5,5], deltaW:7.5},{dice:[4,4], deltaW:5.4}],
    jokersMinus:[{dice:[2,1], deltaW:-8.8},{dice:[3,1], deltaW:-6.2},{dice:[1,1], deltaW:-5.1}],
    analysis:[]
  },
  {
    mode:"moves", player:"black", moveText:"8/5 6/5", error:0.000,
    action:"柳 31: 8/5 6/5", big:"BLACK 31", dice:[3,1], cube:1, blackRate:51.8, whiteRate:48.2,
    analysis:[
      {move:"24/21 13/12", eq:"+0.000"},
      {move:"8/5 6/5", eq:"+0.000"},
      {move:"13/10 13/12", eq:"-0.012"},
      {move:"24/23 13/10", eq:"-0.031"},
      {move:"6/2", eq:"-0.079"}
    ]
  },
  {
    mode:"moves", player:"white", moveText:"8/4 6/4", error:-0.020,
    action:"平林 42: 8/4 6/4", big:"WHITE 42", dice:[4,2], cube:1, blackRate:49.4, whiteRate:50.6,
    analysis:[
      {move:"24/20 13/11", eq:"+0.000"},
      {move:"8/4 6/4", eq:"-0.020"},
      {move:"13/9 24/22", eq:"-0.028"},
      {move:"24/18", eq:"-0.072"},
      {move:"6/2 6/4", eq:"-0.103"}
    ]
  },
  {
    mode:"moves", player:"black", moveText:"13/7 13/8", error:-0.080,
    action:"柳 65: 13/7 13/8", big:"BLACK 65", dice:[6,5], cube:1, blackRate:55.1, whiteRate:44.9,
    analysis:[
      {move:"24/18 13/8", eq:"+0.000"},
      {move:"13/7 13/8", eq:"-0.080"},
      {move:"24/13", eq:"-0.092"},
      {move:"8/2 6/1", eq:"-0.116"},
      {move:"13/2", eq:"-0.158"}
    ]
  },
  {
    mode:"moves", player:"white", moveText:"Double", error:0.000,
    action:"平林 Doubles", big:"DOUBLE", dice:null, cube:2, blackRate:43.7, whiteRate:56.3,
    analysis:[
      {move:"Double", eq:"+0.000"},
      {move:"No double", eq:"-0.063"},
      {move:"Pass (for opponent)", eq:"-0.437"}
    ]
  },
  {
    mode:"moves", player:"black", moveText:"Take", error:0.000,
    action:"柳 Takes", big:"TAKE", dice:null, cube:2, blackRate:43.7, whiteRate:56.3,
    analysis:[
      {move:"Take", eq:"+0.000"},
      {move:"Pass", eq:"-1.000"}
    ]
  }
];

const start=[0,2,0,0,0,0,-5,0,-3,0,0,0,5,-5,0,0,0,3,0,5,0,0,0,0,-2];
const positions = [
  start,
  [0,1,0,0,0,1,-5,0,-3,0,0,0,5,-5,0,0,0,3,0,5,0,0,0,0,-2],
  [0,1,0,-1,-1,1,-3,0,-3,0,0,0,5,-5,0,0,0,3,0,5,0,0,0,0,-2],
  [0,1,0,-1,-1,1,-3,1,-3,0,0,0,3,-5,0,0,0,3,0,5,0,0,0,0,-2],
  [0,1,0,-1,-1,1,-3,1,-3,0,0,0,3,-5,0,0,0,3,0,5,0,0,0,0,-2],
  [0,1,0,-1,-1,1,-3,1,-3,0,0,0,3,-5,0,0,0,3,0,5,0,0,0,0,-2]
];

function trianglePoints(){
  pointsG.innerHTML = "";
  const labelsG = document.getElementById("pointLabels");
  labelsG.innerHTML = "";

  const centersLeft = [81.75,126.25,170.75,215.25,259.75,304.25];
  const centersRight = [397.75,442.25,486.75,531.25,575.75,620.25];
  const centers = [...centersLeft, ...centersRight];
  const pointW = 44.5;

  for(let i=0;i<12;i++){
    const cx = centers[i];
    const left = cx - pointW/2;
    const topColor = i % 2 === 0 ? "#ffffff" : "#cfcfcf";
    const bottomColor = i % 2 === 0 ? "#cfcfcf" : "#ffffff";

    const top = document.createElementNS("http://www.w3.org/2000/svg","polygon");
    top.setAttribute("class","point");
    top.setAttribute("fill", topColor);
    top.setAttribute("points", `${left},30 ${left+pointW},30 ${cx},251`);
    pointsG.appendChild(top);

    const bottom = document.createElementNS("http://www.w3.org/2000/svg","polygon");
    bottom.setAttribute("class","point");
    bottom.setAttribute("fill", bottomColor);
    bottom.setAttribute("points", `${left},516 ${left+pointW},516 ${cx},294`);
    pointsG.appendChild(bottom);
  }

  const topNums = [13,14,15,16,17,18,19,20,21,22,23,24];
  const bottomNums = [12,11,10,9,8,7,6,5,4,3,2,1];

  centers.forEach((cx,i)=>{
    const topText = document.createElementNS("http://www.w3.org/2000/svg","text");
    topText.setAttribute("x",cx);
    topText.setAttribute("y","18");
    topText.setAttribute("class","point-label");
    topText.textContent = topNums[i];
    labelsG.appendChild(topText);

    const bottomText = document.createElementNS("http://www.w3.org/2000/svg","text");
    bottomText.setAttribute("x",cx);
    bottomText.setAttribute("y","540");
    bottomText.setAttribute("class","point-label");
    bottomText.textContent = bottomNums[i];
    labelsG.appendChild(bottomText);
  });
}

function pointCoord(p){
  const centers = [81.75,126.25,170.75,215.25,259.75,304.25,397.75,442.25,486.75,531.25,575.75,620.25];
  if(p <= 12){
    const idx = 12 - p;
    return {x:centers[idx], y:493, dir:-1};
  }
  const idx = p - 13;
  return {x:centers[idx], y:53, dir:1};
}

function drawCheckers(arr){
  checkersG.innerHTML = "";
  for(let p=1; p<=24; p++){
    const v = arr[p] || 0;
    if(!v) continue;
    const n = Math.abs(v);
    const coord = pointCoord(p);
    const klass = v > 0 ? "checker-piece-black" : "checker-piece-white";
    const maxShow = Math.min(n, 5);

    for(let i=0; i<maxShow; i++){
      const circle = document.createElementNS("http://www.w3.org/2000/svg","circle");
      circle.setAttribute("cx", coord.x);
      circle.setAttribute("cy", coord.y + coord.dir * i * 43);
      circle.setAttribute("r", "21.1");
      circle.setAttribute("class", klass);
      checkersG.appendChild(circle);
    }

    if(n > 5){
      const text = document.createElementNS("http://www.w3.org/2000/svg","text");
      text.setAttribute("x", coord.x);
      text.setAttribute("y", coord.y + coord.dir * 4 * 43 + 6);
      text.setAttribute("class", "checker-text");
      text.setAttribute("fill", v > 0 ? "#fff" : "#000");
      text.textContent = n;
      checkersG.appendChild(text);
    }
  }
}

function drawDice(vals, action){
  diceG.innerHTML = "";
  if(!vals) return;

  const player = action.startsWith("柳") ? "black" : "white";
  const spots = {
    1:[[18,18]], 2:[[10,10],[26,26]], 3:[[10,10],[18,18],[26,26]],
    4:[[10,10],[26,10],[10,26],[26,26]], 5:[[10,10],[26,10],[18,18],[10,26],[26,26]],
    6:[[10,9],[26,9],[10,18],[26,18],[10,27],[26,27]]
  };

  function die(x, y, n){
    const g = document.createElementNS("http://www.w3.org/2000/svg","g");
    const isBlack = player === "black";
    const r = document.createElementNS("http://www.w3.org/2000/svg","rect");
    r.setAttribute("x", x);
    r.setAttribute("y", y);
    r.setAttribute("width", 36);
    r.setAttribute("height", 36);
    r.setAttribute("rx", 4);
    r.setAttribute("fill", isBlack ? "#000000" : "#ffffff");
    r.setAttribute("stroke", "#000000");
    r.setAttribute("stroke-width", isBlack ? "0" : "1.2");
    g.appendChild(r);

    (spots[n] || []).forEach(([dx,dy])=>{
      const c = document.createElementNS("http://www.w3.org/2000/svg","circle");
      c.setAttribute("cx", x + dx);
      c.setAttribute("cy", y + dy);
      c.setAttribute("r", "3.4");
      c.setAttribute("fill", isBlack ? "#ffffff" : "#000000");
      g.appendChild(c);
    });
    return g;
  }

  diceG.appendChild(die(286.5, 254, vals[0]));
  diceG.appendChild(die(332.5, 254, vals[1]));
}

function drawCube(v){
  cubeG.innerHTML = "";
  if(v <= 1) return;
  const rect = document.createElementNS("http://www.w3.org/2000/svg","rect");
  rect.setAttribute("x","332.5");
  rect.setAttribute("y","35");
  rect.setAttribute("width","36");
  rect.setAttribute("height","36");
  rect.setAttribute("rx","3");
  rect.setAttribute("fill","#ffffff");
  rect.setAttribute("stroke","#000000");
  rect.setAttribute("stroke-width","1.5");
  cubeG.appendChild(rect);

  const text = document.createElementNS("http://www.w3.org/2000/svg","text");
  text.setAttribute("x","350.5");
  text.setAttribute("y","60");
  text.setAttribute("text-anchor","middle");
  text.setAttribute("fill","#000000");
  text.setAttribute("font-family","Arial, Helvetica, sans-serif");
  text.setAttribute("font-size","23");
  text.textContent = v;
  cubeG.appendChild(text);
}

trianglePoints();

let index = 0;
let meta = {...defaultMeta};
let adFiles = [];
let adIndex = 0;
let adTimer = null;

const els = {
  stageWrap: document.getElementById("stage-wrap"),
  stage: document.getElementById("stage"),
  tournamentTitleLine1: document.getElementById("tournamentTitleLine1"),
  tournamentTitleLine2: document.getElementById("tournamentTitleLine2"),
  blackName: document.getElementById("blackName"),
  whiteName: document.getElementById("whiteName"),
  blackHistoryName: document.getElementById("blackHistoryName"),
  whiteHistoryName: document.getElementById("whiteHistoryName"),
  blackScore: document.getElementById("blackScore"),
  whiteScore: document.getElementById("whiteScore"),
  winBarBlack: document.getElementById("winBarBlack"),
  winBarWhite: document.getElementById("winBarWhite"),
  blackRateText: document.getElementById("blackRateText"),
  whiteRateText: document.getElementById("whiteRateText"),
  blackHistoryList: document.getElementById("blackHistoryList"),
  whiteHistoryList: document.getElementById("whiteHistoryList"),
  analysisContent: document.getElementById("analysisContent"),
  adImage: document.getElementById("adImage"),
  adPlaceholder: document.getElementById("adPlaceholder")
};

function renderMeta(){
  els.tournamentTitleLine1.textContent = meta.tournamentTitleLine1;
  els.tournamentTitleLine2.textContent = meta.tournamentTitleLine2;
  els.blackName.textContent = meta.blackName;
  els.whiteName.textContent = meta.whiteName;
  els.blackHistoryName.textContent = meta.blackName;
  els.whiteHistoryName.textContent = meta.whiteName;
  els.blackScore.textContent = meta.blackScore;
  els.whiteScore.textContent = meta.whiteScore;
}

function diePipPositions(face){
  const map = {
    1:["p5"],
    2:["p1","p9"],
    3:["p1","p5","p9"],
    4:["p1","p3","p7","p9"],
    5:["p1","p3","p5","p7","p9"],
    6:["p1","p3","p4","p6","p7","p9"]
  };
  return map[face] || [];
}

function renderDie(face){
  const pips = diePipPositions(face).map(cls => `<span class="die-pip ${cls}"></span>`).join("");
  return `<span class="die">${pips}</span>`;
}

function renderDicePairInline(pair){
  if(!pair || pair.length < 2){
    return '<div class="dice-pair-inline"><span class="die"></span></div>';
  }
  return `<div class="dice-pair-inline">${renderDie(pair[0])}${renderDie(pair[1])}</div>`;
}

function renderHistoryColumn(player){
  return states
    .slice(1, index + 1)
    .filter(s => s.player === player)
    .slice(-6)
    .reverse()
    .map(s => `
      <div class="history-row">
        ${renderDicePairInline(s.dice)}
        <span class="history-move">${s.moveText || ""}</span>
      </div>
    `).join("");
}

function renderHistory(){
  els.blackHistoryList.innerHTML = renderHistoryColumn("black");
  els.whiteHistoryList.innerHTML = renderHistoryColumn("white");
}

function renderJokers(state){
  const plus = (state.jokersPlus || []).filter(r => r.deltaW >= JOKER_WINRATE_THRESHOLD);
  const minus = (state.jokersMinus || []).filter(r => Math.abs(r.deltaW) >= JOKER_WINRATE_THRESHOLD);

  const renderBlock = (rows, cls) => `
    <div class="analysis-dice-block ${cls}">
      ${rows.map(row => `<div class="dice-pair-block">${renderDie(row.dice[0])}${renderDie(row.dice[1])}</div>`).join("")}
    </div>
  `;

  els.analysisContent.innerHTML = `
    <div class="analysis-jokers">
      ${renderBlock(plus, "plus")}
      ${renderBlock(minus, "minus")}
    </div>
  `;
}

function renderMoves(state){
  els.analysisContent.innerHTML = `
    <div class="analysis-moves">
      ${(state.analysis || []).map(row => `
        <div class="analysis-row">
          <span class="analysis-move">${row.move}</span>
          <span class="analysis-eq">${row.eq}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderAnalysis(state){
  if(state.mode === "jokers") renderJokers(state);
  else renderMoves(state);
}

function renderState(){
  const s = states[index];
  els.winBarBlack.style.width = `${s.blackRate}%`;
  els.winBarWhite.style.width = `${s.whiteRate}%`;
  els.blackRateText.textContent = `${s.blackRate.toFixed(1)}%`;
  els.whiteRateText.textContent = `${s.whiteRate.toFixed(1)}%`;
  drawCheckers(positions[index]);
  drawDice(s.dice, s.action);
  drawCube(s.cube);
  renderHistory();
  renderAnalysis(s);
}

function applyRemoteState(message){
  if(typeof message.index === "number") index = Math.max(0, Math.min(states.length - 1, message.index));
  if(message.meta && typeof message.meta === "object") meta = {...meta, ...message.meta};
  renderMeta();
  renderState();
}

async function loadAds(){
  try{
    const res = await fetch('/api/ads', {cache:'no-store'});
    const data = await res.json();
    adFiles = Array.isArray(data.files) ? data.files : [];
  }catch(error){
    console.warn('Failed to load ads', error);
    adFiles = [];
  }
}

function showAd(file){
  if(!file){
    els.adImage.hidden = true;
    els.adImage.removeAttribute('src');
    els.adPlaceholder.textContent = '';
    return;
  }
  els.adImage.src = `./ads/${encodeURIComponent(file)}`;
  els.adImage.hidden = false;
  els.adPlaceholder.textContent = '';
}

async function cycleAds(){
  await loadAds();
  if(!adFiles.length){
    els.adImage.hidden = true;
    els.adImage.removeAttribute('src');
    els.adPlaceholder.textContent = '';
    return;
  }
  showAd(adFiles[adIndex % adFiles.length]);
  adIndex += 1;
}

function startAdRotation(){
  if(adTimer) clearInterval(adTimer);
  cycleAds();
  adTimer = setInterval(cycleAds, 30000);
}

function connectWebSocket(){
  if(!location.host) return;
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${protocol}//${location.host}/ws`);

  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({type:"hello", role:"display", totalSteps:states.length}));
  });

  socket.addEventListener("message", event => {
    try{
      const message = JSON.parse(event.data);
      if(message.type === "state") applyRemoteState(message);
    }catch(error){
      console.warn("Invalid WebSocket message", error);
    }
  });

  socket.addEventListener("close", () => {
    setTimeout(connectWebSocket, 1500);
  });
}

function scaleStage(){
  const viewportW = document.documentElement.clientWidth || window.innerWidth || 1920;
  const scale = viewportW / 1920;
  const scaledHeight = Math.ceil(1080 * scale);
  els.stage.style.transform = `scale(${scale})`;
  els.stageWrap.style.height = `${scaledHeight}px`;
}

addEventListener("resize", scaleStage);
scaleStage();
renderMeta();
renderState();
startAdRotation();
connectWebSocket();
