const pointsG = document.getElementById("points");
const checkersG = document.getElementById("checkers");
const diceG = document.getElementById("dice");
const cubeG = document.getElementById("cube");

const defaultMeta = {
  tournamentTitle: "JBS第31期名人戦 準々決勝　25ptマッチ",
  blackName: "柳 暢祐",
  whiteName: "平林 直",
  blackScore: 0,
  whiteScore: 0,
  matchFile: ""
};

const diceChars = {
  1:"⚀", 2:"⚁", 3:"⚂", 4:"⚃", 5:"⚄", 6:"⚅"
};

const states = [
  {
    action:"Opening position", big:"GAME START", dice:null, cube:1, blackRate:50.0, whiteRate:50.0,
    jokersPlus:[[6,6], [5,5], [4,4]],
    jokersMinus:[[2,1], [3,1], [1,1]],
    analysis:[
      {move:"24/21 13/11", eq:"+0.021"},
      {move:"24/23 13/10", eq:"+0.000"},
      {move:"8/5 6/4", eq:"-0.018"},
      {move:"13/11 13/10", eq:"-0.036"},
      {move:"24/22 24/23", eq:"-0.061"}
    ]
  },
  {
    player:"black", moveText:"8/5 6/5", error:0.000,
    action:"柳 31: 8/5 6/5", big:"BLACK 31", dice:[3,1], cube:1, blackRate:51.8, whiteRate:48.2,
    jokersPlus:[[6,6], [6,5], [4,4]],
    jokersMinus:[[2,1], [3,2], [1,1]],
    analysis:[
      {move:"24/21 13/12", eq:"+0.000"},
      {move:"8/5 6/5", eq:"+0.000"},
      {move:"13/10 13/12", eq:"-0.012"},
      {move:"24/23 13/10", eq:"-0.031"},
      {move:"6/2", eq:"-0.079"}
    ]
  },
  {
    player:"white", moveText:"8/4 6/4", error:-0.020,
    action:"平林 42: 8/4 6/4", big:"WHITE 42", dice:[4,2], cube:1, blackRate:49.4, whiteRate:50.6,
    jokersPlus:[[6,6], [5,5], [5,3]],
    jokersMinus:[[2,1], [1,1], [3,1]],
    analysis:[
      {move:"24/20 13/11", eq:"+0.000"},
      {move:"8/4 6/4", eq:"-0.020"},
      {move:"13/9 24/22", eq:"-0.028"},
      {move:"24/18", eq:"-0.072"},
      {move:"6/2 6/4", eq:"-0.103"}
    ]
  },
  {
    player:"black", moveText:"13/7 13/8", error:-0.080,
    action:"柳 65: 13/7 13/8", big:"BLACK 65", dice:[6,5], cube:1, blackRate:55.1, whiteRate:44.9,
    jokersPlus:[[5,5], [6,6], [4,4]],
    jokersMinus:[[2,1], [1,1], [3,1]],
    analysis:[
      {move:"24/18 13/8", eq:"+0.000"},
      {move:"13/7 13/8", eq:"-0.080"},
      {move:"24/13", eq:"-0.092"},
      {move:"8/2 6/1", eq:"-0.116"},
      {move:"13/2", eq:"-0.158"}
    ]
  },
  {
    player:"white", moveText:"Double", error:0.000,
    action:"平林 Doubles", big:"DOUBLE", dice:null, cube:2, blackRate:43.7, whiteRate:56.3,
    jokersPlus:[[6,6], [6,5], [4,4]],
    jokersMinus:[[1,1], [2,1], [3,1]],
    analysis:[
      {move:"Double", eq:"+0.000"},
      {move:"No double", eq:"-0.063"},
      {move:"Pass (for opponent)", eq:"-0.437"}
    ]
  },
  {
    player:"black", moveText:"Take", error:0.000,
    action:"柳 Takes", big:"TAKE", dice:null, cube:2, blackRate:43.7, whiteRate:56.3,
    jokersPlus:[[6,6], [6,5], [4,4]],
    jokersMinus:[[1,1], [2,1], [3,1]],
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

const els = {
  stageWrap: document.getElementById("stage-wrap"),
  stage: document.getElementById("stage"),
  tournamentTitle: document.getElementById("tournamentTitle"),
  blackName: document.getElementById("blackName"),
  whiteName: document.getElementById("whiteName"),
  blackScore: document.getElementById("blackScore"),
  whiteScore: document.getElementById("whiteScore"),
  winBarBlack: document.getElementById("winBarBlack"),
  winBarWhite: document.getElementById("winBarWhite"),
  blackRateText: document.getElementById("blackRateText"),
  whiteRateText: document.getElementById("whiteRateText"),
  jokerPlus: document.getElementById("jokerPlus"),
  jokerMinus: document.getElementById("jokerMinus"),
  historyList: document.getElementById("historyList"),
  analysisList: document.getElementById("analysisList")
};

function renderMeta(){
  els.tournamentTitle.textContent = meta.tournamentTitle;
  els.blackName.textContent = meta.blackName;
  els.whiteName.textContent = meta.whiteName;
  els.blackScore.textContent = meta.blackScore;
  els.whiteScore.textContent = meta.whiteScore;
}

function renderDiceIcon(face){
  return `<span class="die">${diceChars[face] || ""}</span>`;
}

function renderJokers(state){
  const renderPairs = (target, pairs) => {
    target.innerHTML = (pairs || []).map(pair => `
      <div class="dice-pair">
        ${renderDiceIcon(pair[0])}
        ${renderDiceIcon(pair[1])}
      </div>
    `).join("");
  };
  renderPairs(els.jokerPlus, state.jokersPlus);
  renderPairs(els.jokerMinus, state.jokersMinus);
}

function errorClass(error){
  if(error <= -0.080) return "red";
  if(error <= -0.020) return "green";
  return "";
}

function renderHistory(){
  const rows = states
    .slice(1, index + 1)
    .map((s) => {
      const err = typeof s.error === "number" ? s.error.toFixed(3) : "";
      const signErr = s.error > 0 ? `+${err}` : err;
      return `
        <div class="history-row">
          <span class="checker-dot ${s.player === "white" ? "white" : "black"}"></span>
          <span class="history-move">${s.moveText || ""}</span>
          <span class="history-error ${errorClass(s.error)}">${err ? signErr : ""}</span>
        </div>
      `;
    }).join("");
  els.historyList.innerHTML = rows || "";
}

function renderAnalysis(state){
  els.analysisList.innerHTML = (state.analysis || []).map((row) => `
    <div class="analysis-row">
      <span class="analysis-move">${row.move}</span>
      <span class="analysis-eq">${row.eq}</span>
    </div>
  `).join("");
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
  renderJokers(s);
  renderHistory();
  renderAnalysis(s);
}

function applyRemoteState(message){
  if(typeof message.index === "number"){
    index = Math.max(0, Math.min(states.length - 1, message.index));
  }
  if(message.meta && typeof message.meta === "object"){
    meta = {...meta, ...message.meta};
  }
  renderMeta();
  renderState();
}

function connectWebSocket(){
  if(!location.host) return;
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${protocol}//${location.host}/ws`);

  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({
      type:"hello",
      role:"display",
      totalSteps:states.length
    }));
  });

  socket.addEventListener("message", event => {
    try{
      const message = JSON.parse(event.data);
      if(message.type === "state"){
        applyRemoteState(message);
      }
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
connectWebSocket();
