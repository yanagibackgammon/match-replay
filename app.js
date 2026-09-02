const pointsG = document.getElementById("points");
const checkersG = document.getElementById("checkers");
const diceG = document.getElementById("dice");
const cubeG = document.getElementById("cube");

const states = [
  {
    game:1, move:1, black:0, white:0, action:"Opening position", big:"GAME START", dice:null, cube:1,
    blackRate:50.0, whiteRate:50.0, blackEq:"+0.000", whiteEq:"+0.000", blackGw:"0.0%", whiteGw:"0.0%"
  },
  {
    game:1, move:2, black:0, white:0, action:"柳 31: 8/5 6/5", big:"BLACK 31", dice:[3,1], cube:1,
    blackRate:51.8, whiteRate:48.2, blackEq:"+0.072", whiteEq:"-0.072", blackGw:"1.8%", whiteGw:"1.1%"
  },
  {
    game:1, move:3, black:0, white:0, action:"平林 42: 8/4 6/4", big:"WHITE 42", dice:[4,2], cube:1,
    blackRate:49.4, whiteRate:50.6, blackEq:"-0.018", whiteEq:"+0.018", blackGw:"1.2%", whiteGw:"1.7%"
  },
  {
    game:1, move:4, black:0, white:0, action:"柳 65: 13/7 13/8", big:"BLACK 65", dice:[6,5], cube:1,
    blackRate:55.1, whiteRate:44.9, blackEq:"+0.146", whiteEq:"-0.146", blackGw:"3.4%", whiteGw:"1.0%"
  },
  {
    game:1, move:5, black:0, white:0, action:"平林 Doubles", big:"DOUBLE", dice:null, cube:2,
    blackRate:43.7, whiteRate:56.3, blackEq:"-0.101", whiteEq:"+0.101", blackGw:"2.1%", whiteGw:"4.0%"
  },
  {
    game:1, move:6, black:0, white:0, action:"柳 Takes", big:"TAKE", dice:null, cube:2,
    blackRate:43.7, whiteRate:56.3, blackEq:"-0.101", whiteEq:"+0.101", blackGw:"2.1%", whiteGw:"4.0%"
  }
];

// Demo position arrays. Index 1..24; positive = black, negative = white.
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
  const startX = 54;
  const pointW = 108;
  const barGap = 64;
  const topY = 48;
  const bottomY = 652;
  const tipTop = 322;
  const tipBottom = 378;

  for(let i=0;i<12;i++){
    const left = i < 6 ? startX + i * pointW : startX + 6 * pointW + barGap + (i - 6) * pointW;
    const topColor = i % 2 === 0 ? "#111" : "#B7924B";
    const bottomColor = i % 2 === 0 ? "#B7924B" : "#111";

    const top = document.createElementNS("http://www.w3.org/2000/svg","polygon");
    top.setAttribute("class","point");
    top.setAttribute("fill", topColor);
    top.setAttribute("points", `${left},${topY} ${left + pointW},${topY} ${left + pointW/2},${tipTop}`);
    pointsG.appendChild(top);

    const bottom = document.createElementNS("http://www.w3.org/2000/svg","polygon");
    bottom.setAttribute("class","point");
    bottom.setAttribute("fill", bottomColor);
    bottom.setAttribute("points", `${left},${bottomY} ${left + pointW},${bottomY} ${left + pointW/2},${tipBottom}`);
    pointsG.appendChild(bottom);
  }
}

function pointCoord(p){
  const pointW = 108;
  const barGap = 64;
  const startX = 54;

  if(p <= 12){
    const idx = 12 - p;
    const x = idx < 6 ? startX + idx * pointW + pointW / 2 : startX + 6 * pointW + barGap + (idx - 6) * pointW + pointW / 2;
    return {x, y:618, dir:-1};
  }else{
    const idx = p - 13;
    const x = idx < 6 ? startX + idx * pointW + pointW / 2 : startX + 6 * pointW + barGap + (idx - 6) * pointW + pointW / 2;
    return {x, y:82, dir:1};
  }
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
      circle.setAttribute("cy", coord.y + coord.dir * i * 50);
      circle.setAttribute("r", 27);
      circle.setAttribute("class", klass);
      checkersG.appendChild(circle);
    }

    if(n > 5){
      const text = document.createElementNS("http://www.w3.org/2000/svg","text");
      text.setAttribute("x", coord.x);
      text.setAttribute("y", coord.y + coord.dir * 4 * 50);
      text.setAttribute("class", "checker-text");
      text.setAttribute("fill", v > 0 ? "#fff" : "#111");
      text.textContent = n;
      checkersG.appendChild(text);
    }
  }
}

function die(x, y, n){
  const g = document.createElementNS("http://www.w3.org/2000/svg","g");
  const r = document.createElementNS("http://www.w3.org/2000/svg","rect");
  r.setAttribute("x", x);
  r.setAttribute("y", y);
  r.setAttribute("width", 72);
  r.setAttribute("height", 72);
  r.setAttribute("rx", 10);
  r.setAttribute("class", "die");
  g.appendChild(r);

  const spots = {
    1:[[36,36]],
    2:[[20,20],[52,52]],
    3:[[20,20],[36,36],[52,52]],
    4:[[20,20],[52,20],[20,52],[52,52]],
    5:[[20,20],[52,20],[36,36],[20,52],[52,52]],
    6:[[20,18],[52,18],[20,36],[52,36],[20,54],[52,54]]
  }[n] || [];

  spots.forEach(([dx, dy]) => {
    const c = document.createElementNS("http://www.w3.org/2000/svg","circle");
    c.setAttribute("cx", x + dx);
    c.setAttribute("cy", y + dy);
    c.setAttribute("r", 6);
    c.setAttribute("class", "pip");
    g.appendChild(c);
  });

  return g;
}

function drawDice(vals){
  diceG.innerHTML = "";
  if(!vals) return;
  diceG.appendChild(die(600, 314, vals[0]));
  diceG.appendChild(die(828, 314, vals[1]));
}

function drawCube(v){
  cubeG.innerHTML = "";
  if(v <= 1) return;
  const rect = document.createElementNS("http://www.w3.org/2000/svg","rect");
  rect.setAttribute("x", 721);
  rect.setAttribute("y", 116);
  rect.setAttribute("width", 58);
  rect.setAttribute("height", 58);
  rect.setAttribute("rx", 5);
  rect.setAttribute("class", "cube-box");
  cubeG.appendChild(rect);

  const text = document.createElementNS("http://www.w3.org/2000/svg","text");
  text.setAttribute("x", 750);
  text.setAttribute("y", 145);
  text.setAttribute("class", "cube-num");
  text.textContent = v;
  cubeG.appendChild(text);
}

trianglePoints();

let index = 0;
let timer = null;

const els = {
  scoreBlack:document.getElementById("scoreBlack"),
  scoreWhite:document.getElementById("scoreWhite"),
  gameNo:document.getElementById("gameNo"),
  moveNo:document.getElementById("moveNo"),
  actionText:document.getElementById("actionText"),
  cubeValue:document.getElementById("cubeValue"),
  blackRateText:document.getElementById("blackRateText"),
  whiteRateText:document.getElementById("whiteRateText"),
  blackEq:document.getElementById("blackEq"),
  whiteEq:document.getElementById("whiteEq"),
  blackGw:document.getElementById("blackGw"),
  whiteGw:document.getElementById("whiteGw"),
  winBarBlack:document.getElementById("winBarBlack"),
  winBarWhite:document.getElementById("winBarWhite"),
  bigAction:document.getElementById("bigAction"),
  diceText:document.getElementById("diceText"),
  moveList:document.getElementById("moveList"),
  timeline:document.getElementById("timeline"),
  stepLabel:document.getElementById("stepLabel"),
  playBtn:document.getElementById("playBtn"),
  speed:document.getElementById("speed")
};

els.timeline.max = states.length - 1;

function renderList(){
  els.moveList.innerHTML = states.map((s, i) =>
    `<div class="move-row ${i === index ? "active" : ""}" data-i="${i}">
      <span class="n">${String(i + 1).padStart(2, "0")}</span>
      <span>${s.action}</span>
    </div>`
  ).join("");
}

function render(){
  const s = states[index];
  els.scoreBlack.textContent = s.black;
  els.scoreWhite.textContent = s.white;
  els.gameNo.textContent = s.game;
  els.moveNo.textContent = s.move;
  els.actionText.textContent = s.action;
  els.cubeValue.textContent = s.cube;
  els.blackRateText.textContent = `${s.blackRate.toFixed(1)}%`;
  els.whiteRateText.textContent = `${s.whiteRate.toFixed(1)}%`;
  els.blackEq.textContent = s.blackEq;
  els.whiteEq.textContent = s.whiteEq;
  els.blackGw.textContent = s.blackGw;
  els.whiteGw.textContent = s.whiteGw;
  els.winBarBlack.style.width = `${s.blackRate}%`;
  els.winBarWhite.style.width = `${s.whiteRate}%`;
  els.bigAction.textContent = s.big;
  els.diceText.textContent = s.dice ? `DICE ${s.dice[0]}-${s.dice[1]}` : "DICE —";
  els.timeline.value = index;
  els.stepLabel.textContent = `${index + 1} / ${states.length}`;
  drawCheckers(positions[index]);
  drawDice(s.dice);
  drawCube(s.cube);
  renderList();
}

function stop(){
  clearInterval(timer);
  timer = null;
  els.playBtn.textContent = "▶ PLAY";
}
function play(){
  if(timer){
    stop();
    return;
  }
  els.playBtn.textContent = "Ⅱ PAUSE";
  const tick = () => {
    if(index >= states.length - 1){
      stop();
      return;
    }
    index++;
    render();
  };
  timer = setInterval(tick, Number(els.speed.value));
}

document.getElementById("prevBtn").onclick = () => {
  stop();
  index = Math.max(0, index - 1);
  render();
};
document.getElementById("nextBtn").onclick = () => {
  stop();
  index = Math.min(states.length - 1, index + 1);
  render();
};
els.playBtn.onclick = play;
els.timeline.oninput = e => {
  stop();
  index = Number(e.target.value);
  render();
};
els.speed.onchange = () => {
  if(timer){
    stop();
    play();
  }
};
els.moveList.onclick = e => {
  const row = e.target.closest(".move-row");
  if(!row) return;
  stop();
  index = Number(row.dataset.i);
  render();
};

function scaleStage(){
  const s = Math.min(innerWidth / 1920, innerHeight / 1080);
  document.getElementById("stage").style.transform = `scale(${s})`;
}
addEventListener("resize", scaleStage);
scaleStage();
render();
