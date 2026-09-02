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
    top.setAttribute("stroke","#000000");
    top.setAttribute("stroke-width","1");
    top.setAttribute("points", `${left},30 ${left+pointW},30 ${cx},251`);
    pointsG.appendChild(top);

    const bottom = document.createElementNS("http://www.w3.org/2000/svg","polygon");
    bottom.setAttribute("class","point");
    bottom.setAttribute("fill", bottomColor);
    bottom.setAttribute("stroke","#000000");
    bottom.setAttribute("stroke-width","1");
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

  // Position Drill SVG:
  // top = 13..24 from left to right
  // bottom = 12..1 from left to right
  if(p <= 12){
    const idx = 12 - p;
    return {x:centers[idx], y:493, dir:-1};
  }else{
    const idx = p - 13;
    return {x:centers[idx], y:53, dir:1};
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

function die(x, y, n, player){
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

  const spots = {
    1:[[18,18]],
    2:[[10,10],[26,26]],
    3:[[10,10],[18,18],[26,26]],
    4:[[10,10],[26,10],[10,26],[26,26]],
    5:[[10,10],[26,10],[18,18],[10,26],[26,26]],
    6:[[10,9],[26,9],[10,18],[26,18],[10,27],[26,27]]
  }[n] || [];

  spots.forEach(([dx,dy])=>{
    const c = document.createElementNS("http://www.w3.org/2000/svg","circle");
    c.setAttribute("cx", x+dx);
    c.setAttribute("cy", y+dy);
    c.setAttribute("r", "3.4");
    c.setAttribute("fill", isBlack ? "#ffffff" : "#000000");
    g.appendChild(c);
  });

  return g;
}

function drawDice(vals, action){
  diceG.innerHTML = "";
  if(!vals) return;

  const player = action.startsWith("柳") ? "black" : "white";
  diceG.appendChild(die(286.5,254,vals[0],player));
  diceG.appendChild(die(332.5,254,vals[1],player));
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
  drawDice(s.dice, s.action);
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
