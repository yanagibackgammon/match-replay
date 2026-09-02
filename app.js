const pointsG=document.getElementById("points");
const checkersG=document.getElementById("checkers");
const diceG=document.getElementById("dice");
const cubeG=document.getElementById("cube");

const states=[
  {game:1,move:1,black:0,white:0,action:"Opening position",big:"GAME START",dice:null,cube:1},
  {game:1,move:2,black:0,white:0,action:"柳　31: 8/5 6/5",big:"BLACK 31",dice:[3,1],cube:1},
  {game:1,move:3,black:0,white:0,action:"平林　42: 8/4 6/4",big:"WHITE 42",dice:[4,2],cube:1},
  {game:1,move:4,black:0,white:0,action:"柳　65: 13/7 13/8",big:"BLACK 65",dice:[6,5],cube:1},
  {game:1,move:5,black:0,white:0,action:"平林　Doubles",big:"DOUBLE",dice:null,cube:2},
  {game:1,move:6,black:0,white:0,action:"柳　Takes",big:"TAKE",dice:null,cube:2},
];

// Demo position arrays. Index 1..24; + = black, - = white.
// This prototype uses the supplied XG file as source asset/metadata,
// while exact XG move extraction will be wired in the parser phase.
const start=[0,2,0,0,0,0,-5,0,-3,0,0,0,5,-5,0,0,0,3,0,5,0,0,0,0,-2];
const positions=[
 start,
 [0,1,0,0,0,1,-5,0,-3,0,0,0,5,-5,0,0,0,3,0,5,0,0,0,0,-2],
 [0,1,0,-1,-1,1,-3,0,-3,0,0,0,5,-5,0,0,0,3,0,5,0,0,0,0,-2],
 [0,1,0,-1,-1,1,-3,1,-3,0,0,0,3,-5,0,0,0,3,0,5,0,0,0,0,-2],
 [0,1,0,-1,-1,1,-3,1,-3,0,0,0,3,-5,0,0,0,3,0,5,0,0,0,0,-2],
 [0,1,0,-1,-1,1,-3,1,-3,0,0,0,3,-5,0,0,0,3,0,5,0,0,0,0,-2]
];

function trianglePoints(){
  pointsG.innerHTML="";
  const x0=48,w=84,gap=48,mid=600;
  const usable=[0,1,2,3,4,5,6,7,8,9,10,11];
  for(let i=0;i<12;i++){
    const left = i<6 ? x0+i*w : x0+6*w+gap+(i-6)*w;
    const color=i%2===0?"#111":"#B7924B";
    const top=document.createElementNS("http://www.w3.org/2000/svg","polygon");
    top.setAttribute("class","point"); top.setAttribute("fill",color);
    top.setAttribute("points",`${left},40 ${left+w},40 ${left+w/2},310`);
    pointsG.appendChild(top);
    const bottom=document.createElementNS("http://www.w3.org/2000/svg","polygon");
    bottom.setAttribute("class","point"); bottom.setAttribute("fill",i%2===0?"#B7924B":"#111");
    bottom.setAttribute("points",`${left},680 ${left+w},680 ${left+w/2},410`);
    pointsG.appendChild(bottom);
  }
}
function pointCoord(p){
  const w=84,gap=48,x0=48;
  // 1..12 bottom right->left, 13..24 top left->right
  if(p<=12){
    const idx=12-p;
    const x=idx<6?x0+idx*w+w/2:x0+6*w+gap+(idx-6)*w+w/2;
    return {x,y:646,dir:-1};
  } else {
    const idx=p-13;
    const x=idx<6?x0+idx*w+w/2:x0+6*w+gap+(idx-6)*w+w/2;
    return {x,y:74,dir:1};
  }
}
function drawCheckers(arr){
  checkersG.innerHTML="";
  for(let p=1;p<=24;p++){
    const v=arr[p]||0;if(!v)continue;
    const n=Math.abs(v),c=pointCoord(p),cls=v>0?"checker-black":"checker-white";
    const maxShow=Math.min(n,5);
    for(let i=0;i<maxShow;i++){
      const y=c.y+c.dir*i*48;
      const circ=document.createElementNS("http://www.w3.org/2000/svg","circle");
      circ.setAttribute("cx",c.x);circ.setAttribute("cy",y);circ.setAttribute("r",24);circ.setAttribute("class",cls);
      checkersG.appendChild(circ);
    }
    if(n>5){
      const t=document.createElementNS("http://www.w3.org/2000/svg","text");
      t.setAttribute("x",c.x);t.setAttribute("y",c.y+c.dir*4*48);t.setAttribute("class","checker-text");
      t.setAttribute("fill",v>0?"#fff":"#111");t.textContent=n;checkersG.appendChild(t);
    }
  }
}
function die(x,y,n){
  const g=document.createElementNS("http://www.w3.org/2000/svg","g");
  const r=document.createElementNS("http://www.w3.org/2000/svg","rect");
  r.setAttribute("x",x);r.setAttribute("y",y);r.setAttribute("width",64);r.setAttribute("height",64);r.setAttribute("rx",8);r.setAttribute("class","die");g.appendChild(r);
  const spots={1:[[32,32]],2:[[18,18],[46,46]],3:[[18,18],[32,32],[46,46]],4:[[18,18],[46,18],[18,46],[46,46]],5:[[18,18],[46,18],[32,32],[18,46],[46,46]],6:[[18,16],[46,16],[18,32],[46,32],[18,48],[46,48]]}[n]||[];
  spots.forEach(([dx,dy])=>{const c=document.createElementNS("http://www.w3.org/2000/svg","circle");c.setAttribute("cx",x+dx);c.setAttribute("cy",y+dy);c.setAttribute("r",6);c.setAttribute("class","pip");g.appendChild(c)});
  return g;
}
function drawDice(vals){
  diceG.innerHTML=""; if(!vals)return;
  diceG.appendChild(die(500,328,vals[0]));diceG.appendChild(die(636,328,vals[1]));
}
function drawCube(v){
  cubeG.innerHTML="";
  if(v<=1)return;
  const r=document.createElementNS("http://www.w3.org/2000/svg","rect");r.setAttribute("x",572);r.setAttribute("y",120);r.setAttribute("width",56);r.setAttribute("height",56);r.setAttribute("rx",5);r.setAttribute("class","cube-box");cubeG.appendChild(r);
  const t=document.createElementNS("http://www.w3.org/2000/svg","text");t.setAttribute("x",600);t.setAttribute("y",148);t.setAttribute("class","cube-num");t.textContent=v;cubeG.appendChild(t);
}
trianglePoints();

let index=0,timer=null;
const els={
 scoreBlack:document.getElementById("scoreBlack"),scoreWhite:document.getElementById("scoreWhite"),
 gameNo:document.getElementById("gameNo"),moveNo:document.getElementById("moveNo"),actionText:document.getElementById("actionText"),
 bigAction:document.getElementById("bigAction"),diceText:document.getElementById("diceText"),cubeValue:document.getElementById("cubeValue"),
 moveList:document.getElementById("moveList"),timeline:document.getElementById("timeline"),stepLabel:document.getElementById("stepLabel"),
 playBtn:document.getElementById("playBtn"),speed:document.getElementById("speed")
};
els.timeline.max=states.length-1;
function renderList(){
  els.moveList.innerHTML=states.map((s,i)=>`<div class="move-row ${i===index?"active":""}" data-i="${i}"><span class="n">${String(i+1).padStart(2,"0")}</span><span>${s.action}</span></div>`).join("");
}
function render(){
  const s=states[index];
  els.scoreBlack.textContent=s.black;els.scoreWhite.textContent=s.white;els.gameNo.textContent=s.game;els.moveNo.textContent=s.move;
  els.actionText.textContent=s.action;els.bigAction.textContent=s.big;els.diceText.textContent=s.dice?`DICE  ${s.dice[0]}-${s.dice[1]}`:"—";
  els.cubeValue.textContent=s.cube;els.timeline.value=index;els.stepLabel.textContent=`${index+1} / ${states.length}`;
  drawCheckers(positions[index]);drawDice(s.dice);drawCube(s.cube);renderList();
}
function stop(){clearInterval(timer);timer=null;els.playBtn.textContent="▶ PLAY";}
function play(){
  if(timer){stop();return}
  els.playBtn.textContent="Ⅱ PAUSE";
  const tick=()=>{if(index>=states.length-1){stop();return}index++;render()}
  timer=setInterval(tick,Number(els.speed.value));
}
document.getElementById("prevBtn").onclick=()=>{stop();index=Math.max(0,index-1);render()};
document.getElementById("nextBtn").onclick=()=>{stop();index=Math.min(states.length-1,index+1);render()};
els.playBtn.onclick=play;
els.timeline.oninput=e=>{stop();index=Number(e.target.value);render()};
els.speed.onchange=()=>{if(timer){stop();play()}};
els.moveList.onclick=e=>{const row=e.target.closest(".move-row");if(!row)return;stop();index=Number(row.dataset.i);render()};
function scaleStage(){
  const s=Math.min(innerWidth/1920,innerHeight/1080);
  document.getElementById("stage").style.transform=`scale(${s})`;
}
addEventListener("resize",scaleStage);scaleStage();render();
