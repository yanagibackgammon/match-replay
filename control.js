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
const blackNameInput = document.getElementById("blackNameInput");
const whiteNameInput = document.getElementById("whiteNameInput");
const blackScoreInput = document.getElementById("blackScoreInput");
const whiteScoreInput = document.getElementById("whiteScoreInput");
const matchFileSelect = document.getElementById("matchFileSelect");
const applyMetaBtn = document.getElementById("applyMetaBtn");
const refreshMatchesBtn = document.getElementById("refreshMatchesBtn");

let socket = null;
const pageChannel = (!isLocalRuntime() && "BroadcastChannel" in window) ? new BroadcastChannel("match-replay-control") : null;
let lastState = {
  index:0,
  totalSteps:1,
  playing:false,
  speed:1500,
  meta:{
    tournamentTitleLine1:"JBS第31期名人戦 準々決勝",
    blackName:"柳 暢祐",
    whiteName:"平林 直",
    blackScore:0,
    whiteScore:0,
    matchFile:""
  }
};

function isLocalRuntime(){
  return location.hostname === "localhost" || location.hostname === "127.0.0.1";
}

function sendCommand(command, value){
  if(socket && socket.readyState === WebSocket.OPEN){
    socket.send(JSON.stringify({type:"command", command, value}));
    return;
  }
  if(!isLocalRuntime() && pageChannel){
    pageChannel.postMessage({type:"command", command, value});
  }
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
  blackNameInput.value = lastState.meta.blackName || "";
  whiteNameInput.value = lastState.meta.whiteName || "";
  blackScoreInput.value = lastState.meta.blackScore ?? 0;
  whiteScoreInput.value = lastState.meta.whiteScore ?? 0;
  ensureOption(lastState.meta.matchFile || "");
  matchFileSelect.value = lastState.meta.matchFile || "";
}

async function loadMatchList(){
  // ローカル起動時は server.js のAPIを優先。
  if(isLocalRuntime()){
    try{
      const res = await fetch("/api/matches", {cache:"no-store"});
      if(res.ok){
        const data = await res.json();
        if(Array.isArray(data.files)) return data.files;
      }
    }catch(error){
      console.warn("Local match API unavailable, falling back to manifest.", error);
    }
  }

  // GitHub PagesおよびAPI利用不可時は静的manifestを使用。
  try{
    const manifestUrl = new URL("./matches/manifest.json", location.href);
    manifestUrl.searchParams.set("t", Date.now());
    const res = await fetch(manifestUrl, {cache:"no-store"});
    if(!res.ok) throw new Error(`manifest HTTP ${res.status}`);
    const data = await res.json();
    return Array.isArray(data.files) ? data.files : [];
  }catch(error){
    console.warn("Failed to load match manifest.", error);
    return [];
  }
}

async function refreshMatches(){
  const current = matchFileSelect.value;
  const files = await loadMatchList();

  matchFileSelect.innerHTML = '<option value="">(未選択)</option>';
  files.forEach(file => {
    const option = document.createElement("option");
    option.value = file;
    option.textContent = file;
    matchFileSelect.appendChild(option);
  });

  if(current) ensureOption(current);
  if(lastState.meta.matchFile) ensureOption(lastState.meta.matchFile);
  matchFileSelect.value = current || lastState.meta.matchFile || "";
}

async function fetchPagesManifest(){
  try{
    const u=new URL("./matches/manifest.json",location.href);u.searchParams.set("t",Date.now());
    const r=await fetch(u,{cache:"no-store"});
    return r.ok?await r.json():{};
  }catch{return {};}
}

async function getPagesMatchTotal(file){
  if(!file) return 1;
  const manifest=await fetchPagesManifest();
  const rel=manifest.generated?.[file]||(/\.xg$/i.test(file)?`generated/${file}.json`:file);
  const u=new URL(`./matches/${rel}`,location.href);u.searchParams.set("t",Date.now());
  const r=await fetch(u,{cache:"no-store"});
  if(!r.ok) throw new Error(`棋譜データを取得できません (HTTP ${r.status})`);
  const data=await r.json();
  if(!Array.isArray(data.states)||!data.states.length) throw new Error("棋譜データに再生ステートがありません");
  return data.states.length;
}

async function loadPagesInitialState(){
  if(isLocalRuntime()) return;
  try{const r=await fetch(new URL("./stream-config.json",location.href),{cache:"no-store"});if(r.ok)lastState.meta={...lastState.meta,...await r.json()};}catch{}
  try{const s=localStorage.getItem("matchReplayMeta");if(s)lastState.meta={...lastState.meta,...JSON.parse(s)};}catch{}
  try{const s=localStorage.getItem("matchReplayPlaybackState");if(s)lastState={...lastState,...JSON.parse(s),meta:lastState.meta};}catch{}
  try{lastState.totalSteps=await getPagesMatchTotal(lastState.meta.matchFile);lastState.index=Math.min(Number(lastState.index)||0,lastState.totalSteps-1);}catch(error){console.warn(error);lastState.totalSteps=1;lastState.index=0;}
  renderState(lastState);
  if(pageChannel)pageChannel.postMessage({type:"state-request"});
}

async function applyMeta(){
  const nextMeta = {
    tournamentTitleLine1: tournamentLine1Input.value.trim(),
    tournamentTitleLine2: "",
    blackName: blackNameInput.value.trim(),
    whiteName: whiteNameInput.value.trim(),
    blackScore: Number(blackScoreInput.value || 0),
    whiteScore: Number(whiteScoreInput.value || 0),
    matchFile: matchFileSelect.value
  };

  const originalText = applyMetaBtn.textContent;
  applyMetaBtn.disabled = true;
  applyMetaBtn.textContent = "反映中…";

  try{
    if(isLocalRuntime()){
      // WebSocketの接続状態に依存せず、HTTP APIで確実に反映する。
      const res = await fetch("/api/meta", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        cache:"no-store",
        body:JSON.stringify(nextMeta)
      });
      const data = await res.json().catch(() => ({}));
      if(!res.ok){
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      if(data.state) renderState(data.state);
    }else{
      // GitHub Pagesでは実棋譜JSONを先に確認し、総ステップ数も更新する。
      const oldFile=lastState.meta.matchFile;
      const totalSteps=await getPagesMatchTotal(nextMeta.matchFile);
      lastState.meta={...lastState.meta,...nextMeta};
      lastState.totalSteps=totalSteps;
      if(nextMeta.matchFile!==oldFile) lastState.index=0;
      else lastState.index=Math.min(lastState.index,totalSteps-1);
      localStorage.setItem("matchReplayMeta",JSON.stringify(lastState.meta));
      localStorage.setItem("matchReplayPlaybackState",JSON.stringify({index:lastState.index,totalSteps:lastState.totalSteps,playing:false,speed:lastState.speed}));
      if(pageChannel)pageChannel.postMessage({type:"meta",meta:lastState.meta});
      renderState(lastState);
    }

    applyMetaBtn.textContent = "反映済み";
    setTimeout(() => {
      applyMetaBtn.textContent = originalText;
      applyMetaBtn.disabled = false;
    }, 1200);
  }catch(error){
    console.error("Failed to apply display settings", error);
    applyMetaBtn.textContent = "反映エラー";
    applyMetaBtn.disabled = false;
    alert(`表示への反映に失敗しました。\n${error.message || error}`);
    setTimeout(() => { applyMetaBtn.textContent = originalText; }, 1800);
  }
}

function connect(){
  if(!isLocalRuntime()){
    connectionEl.textContent = "PAGES MODE";
    connectionEl.className = "connection offline";
    return;
  }

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

if(pageChannel){
  pageChannel.addEventListener("message",event=>{
    const message=event.data||{};
    if(message.type==="state"){
      renderState(message);
    }
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

renderState(lastState);
refreshMatches();
loadPagesInitialState();
connect();
