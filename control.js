const connectionEl = document.getElementById("connection");
const stepText = document.getElementById("stepText");
const playState = document.getElementById("playState");
const timeline = document.getElementById("timeline");
const playBtn = document.getElementById("playBtn");
const pauseBtn = document.getElementById("pauseBtn");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const speedButtons = [...document.querySelectorAll("[data-speed]")];

let socket = null;
let lastState = {
  index:0,
  totalSteps:6,
  playing:false,
  speed:1500
};

function sendCommand(command, value){
  if(!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({
    type:"command",
    command,
    value
  }));
}

function renderState(state){
  lastState = {...lastState, ...state};
  const total = Math.max(1, lastState.totalSteps || 1);
  timeline.max = total - 1;
  timeline.value = Math.min(lastState.index || 0, total - 1);
  stepText.textContent = `${Number(timeline.value) + 1} / ${total}`;
  playState.textContent = lastState.playing ? "PLAYING" : "PAUSE";

  speedButtons.forEach(button => {
    button.classList.toggle("active", Number(button.dataset.speed) === Number(lastState.speed));
  });
}

function connect(){
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${protocol}//${location.host}/ws`);

  socket.addEventListener("open", () => {
    connectionEl.textContent = "CONNECTED";
    connectionEl.className = "connection online";
    socket.send(JSON.stringify({type:"hello", role:"control"}));
  });

  socket.addEventListener("message", event => {
    try{
      const message = JSON.parse(event.data);
      if(message.type === "state"){
        renderState(message);
      }
    }catch(error){
      console.warn("Invalid WebSocket message", error);
    }
  });

  socket.addEventListener("close", () => {
    connectionEl.textContent = "DISCONNECTED";
    connectionEl.className = "connection offline";
    setTimeout(connect, 1500);
  });
}

playBtn.addEventListener("click", () => sendCommand("play"));
pauseBtn.addEventListener("click", () => sendCommand("pause"));
prevBtn.addEventListener("click", () => sendCommand("prev"));
nextBtn.addEventListener("click", () => sendCommand("next"));

timeline.addEventListener("input", () => {
  sendCommand("seek", Number(timeline.value));
});

speedButtons.forEach(button => {
  button.addEventListener("click", () => {
    sendCommand("speed", Number(button.dataset.speed));
  });
});

renderState(lastState);
connect();
