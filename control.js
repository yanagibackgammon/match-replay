const connectionEl = document.getElementById("connection");
const stepText = document.getElementById("stepText");
const playState = document.getElementById("playState");
const timeline = document.getElementById("timeline");
const playBtn = document.getElementById("playBtn");
const pauseBtn = document.getElementById("pauseBtn");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const speedButtons = [...document.querySelectorAll("[data-speed]")];

const tournamentLine1Input = document.getElementById("tournamentLine1Input");
const tournamentLine2Input = document.getElementById("tournamentLine2Input");
const blackNameInput = document.getElementById("blackNameInput");
const whiteNameInput = document.getElementById("whiteNameInput");
const blackScoreInput = document.getElementById("blackScoreInput");
const whiteScoreInput = document.getElementById("whiteScoreInput");
const matchFileSelect = document.getElementById("matchFileSelect");
const applyMetaBtn = document.getElementById("applyMetaBtn");
const refreshMatchesBtn = document.getElementById("refreshMatchesBtn");

let socket = null;
let lastState = {
  index:0,
  totalSteps:6,
  playing:false,
  speed:1500,
  meta:{
    tournamentTitleLine1:"JBS第31期名人戦 準々決勝",
    tournamentTitleLine2:"2025/08/30　25ポイントマッチ　勝てばベスト4",
    blackName:"柳 暢祐",
    whiteName:"平林 直",
    blackScore:0,
    whiteScore:0,
    matchFile:""
  }
};

function sendCommand(command, value){
  if(!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({type:"command", command, value}));
}

function ensureOption(value){
  if(!value) return;
  const exists = [...matchFileSelect.options].some(opt => opt.value === value);
  if(!exists){
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    matchFileSelect.appendChild(option);
  }
}

function renderState(state){
  lastState = {...lastState, ...state};
  lastState.meta = {...(lastState.meta || {}), ...((state && state.meta) || {})};

  const total = Math.max(1, lastState.totalSteps || 1);
  timeline.max = total - 1;
  timeline.value = Math.min(lastState.index || 0, total - 1);
  stepText.textContent = `${Number(timeline.value) + 1} / ${total}`;
  playState.textContent = lastState.playing ? "PLAYING" : "PAUSE";

  speedButtons.forEach(button => {
    button.classList.toggle("active", Number(button.dataset.speed) === Number(lastState.speed));
  });

  tournamentLine1Input.value = lastState.meta.tournamentTitleLine1 || lastState.meta.tournamentTitle || "";
  tournamentLine2Input.value = lastState.meta.tournamentTitleLine2 || "";
  blackNameInput.value = lastState.meta.blackName || "";
  whiteNameInput.value = lastState.meta.whiteName || "";
  blackScoreInput.value = lastState.meta.blackScore ?? 0;
  whiteScoreInput.value = lastState.meta.whiteScore ?? 0;
  ensureOption(lastState.meta.matchFile || "");
  matchFileSelect.value = lastState.meta.matchFile || "";
}

async function refreshMatches(){
  try{
    const res = await fetch("/api/matches", {cache:"no-store"});
    const data = await res.json();
    const current = matchFileSelect.value;
    matchFileSelect.innerHTML = '<option value="">(未選択)</option>';
    (data.files || []).forEach(file => {
      const option = document.createElement("option");
      option.value = file;
      option.textContent = file;
      matchFileSelect.appendChild(option);
    });
    if(current) ensureOption(current);
    matchFileSelect.value = current || (lastState.meta.matchFile || "");
  }catch(error){
    console.warn("Failed to load matches", error);
  }
}

function applyMeta(){
  sendCommand("setMeta", {
    tournamentTitleLine1: tournamentLine1Input.value.trim(),
    tournamentTitleLine2: tournamentLine2Input.value.trim(),
    blackName: blackNameInput.value.trim(),
    whiteName: whiteNameInput.value.trim(),
    blackScore: Number(blackScoreInput.value || 0),
    whiteScore: Number(whiteScoreInput.value || 0),
    matchFile: matchFileSelect.value
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
      if(message.type === "state") renderState(message);
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

timeline.addEventListener("input", () => sendCommand("seek", Number(timeline.value)));
speedButtons.forEach(button => button.addEventListener("click", () => sendCommand("speed", Number(button.dataset.speed))));
applyMetaBtn.addEventListener("click", applyMeta);
refreshMatchesBtn.addEventListener("click", refreshMatches);
matchFileSelect.addEventListener("change", applyMeta);

renderState(lastState);
refreshMatches();
connect();
