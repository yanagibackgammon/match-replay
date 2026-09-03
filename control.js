const connectionEl = document.getElementById("connection");
const stepText = document.getElementById("stepText");
const playState = document.getElementById("playState");
const timeline = document.getElementById("timeline");
const playBtn = document.getElementById("playBtn");
const pauseBtn = document.getElementById("pauseBtn");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const autoModeBtn = document.getElementById("autoModeBtn");
const manualModeBtn = document.getElementById("manualModeBtn");

const tournamentLine1Input = document.getElementById("tournamentLine1Input");
const tournamentLine2Input = document.getElementById("tournamentLine2Input");
const themeColorInput = document.getElementById("themeColorInput");
const themeColorPreview = document.getElementById("themeColorPreview");
const designPresetSelect = document.getElementById("designPresetSelect");
const designPresetPreview = document.getElementById("designPresetPreview");
const blackNameInput = document.getElementById("blackNameInput");
const whiteNameInput = document.getElementById("whiteNameInput");
const matchFileSelect = document.getElementById("matchFileSelect");
const applyMetaBtn = document.getElementById("applyMetaBtn");
const refreshMatchesBtn = document.getElementById("refreshMatchesBtn");
const loadedFileName = document.getElementById("loadedFileName");
const gameMarkers = document.getElementById("gameMarkers");

let socket = null;
const pageChannel = (!isLocalRuntime() && "BroadcastChannel" in window) ? new BroadcastChannel("match-replay-control") : null;
let lastState = {
  index:0,
  totalSteps:1,
  playing:false,
  speed:3000,
  mode:"auto",
  gameStarts:[],
  meta:{
    tournamentTitleLine1:"JBS第31期名人戦 準々決勝",
    tournamentTitleLine2:"2025-08-30　25ポイントマッチ　勝てばベスト4",
    blackName:"柳 暢祐",
    whiteName:"平林 直",
    blackScore:0,
    whiteScore:0,
    matchFile:"",
    themeColor:"#6B670D",
    designPreset:"green"
  }
};

let designPresets=[];


// 操作画面の入力中データを、再生状態の定期受信で上書きしない。
// 「表示へ反映」が成功した時点で編集状態を確定する。
const dirtyMetaFields = new Set();
const metaEditors = [
  [tournamentLine1Input,"tournamentTitleLine1","input"],
  [tournamentLine2Input,"tournamentTitleLine2","input"],
  [themeColorInput,"themeColor","input"],
  [designPresetSelect,"designPreset","change"],
  [blackNameInput,"blackName","input"],
  [whiteNameInput,"whiteName","input"],
  [matchFileSelect,"matchFile","change"]
];

for(const [element,key,eventName] of metaEditors){
  if(!element) continue;
  element.addEventListener(eventName,()=>dirtyMetaFields.add(key));
}

function syncEditorValue(element,key,value){
  if(!element) return;
  if(dirtyMetaFields.has(key)) return;
  element.value = value ?? "";
}

function acceptAppliedMeta(){
  dirtyMetaFields.clear();
  // lastState は反映後の確定値を保持しているため、ここで入力欄も確定値へ揃える。
  syncMetaEditorsFromState();
}

function syncMetaEditorsFromState(){
  syncEditorValue(tournamentLine1Input,"tournamentTitleLine1",lastState.meta.tournamentTitleLine1 || lastState.meta.tournamentTitle || "");
  syncEditorValue(tournamentLine2Input,"tournamentTitleLine2",lastState.meta.tournamentTitleLine2 || "");
  syncEditorValue(themeColorInput,"themeColor",lastState.meta.themeColor || "#6B670D");
  renderThemeColorPreview();
  syncEditorValue(blackNameInput,"blackName",lastState.meta.blackName || "");
  syncEditorValue(whiteNameInput,"whiteName",lastState.meta.whiteName || "");

  if(designPresetSelect && !dirtyMetaFields.has("designPreset")){
    const presetId=lastState.meta.designPreset||"green";
    if(![...designPresetSelect.options].some(opt=>opt.value===presetId)){
      const option=document.createElement("option");
      option.value=presetId;
      option.textContent=presetId;
      designPresetSelect.appendChild(option);
    }
    designPresetSelect.value=presetId;
    renderDesignPreview();
  }

  if(matchFileSelect && !dirtyMetaFields.has("matchFile")){
    ensureOption(lastState.meta.matchFile || "");
    matchFileSelect.value = lastState.meta.matchFile || "";
  }
}

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

function renderThemeColorPreview(){
  if(!themeColorPreview) return;
  const value=String(themeColorInput?.value||"#6B670D").trim();
  themeColorPreview.style.background=/^#[0-9a-fA-F]{6}$/.test(value)?value:"#6B670D";
}

function renderDesignPreview(){
  const preset=designPresets.find(p=>p.id===designPresetSelect.value)||designPresets[0];
  if(!preset){designPresetPreview.innerHTML="";return;}
  const colors=[
    preset.checkers?.player1,preset.checkers?.player2,
    preset.winRate?.player1,preset.winRate?.player2,
    preset.board?.pointLight,preset.board?.pointDark
  ].filter(Boolean);
  designPresetPreview.innerHTML=colors.map(color=>`<span style="background:${color}"></span>`).join("");
}
function renderDesignOptions(){
  const current=lastState.meta.designPreset||designPresetSelect.value||"green";
  designPresetSelect.innerHTML="";
  designPresets.forEach(preset=>{
    const option=document.createElement("option");option.value=preset.id;option.textContent=preset.name||preset.id;designPresetSelect.appendChild(option);
  });
  if(!designPresets.some(p=>p.id===current)){
    const option=document.createElement("option");option.value=current;option.textContent=current;designPresetSelect.appendChild(option);
  }
  designPresetSelect.value=current;
  renderDesignPreview();
}
async function loadDesignPresets(){
  try{
    const u=new URL("./design-presets.json",location.href);u.searchParams.set("t",Date.now());
    const r=await fetch(u,{cache:"no-store"});
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    const data=await r.json();
    designPresets=Array.isArray(data.presets)?data.presets:[];
  }catch(error){
    console.warn("Failed to load design presets",error);
    designPresets=[{id:"green",name:"グリーン",checkers:{player1:"#17382C",player2:"#F7F0DE"},winRate:{player1:"#1E513D",player2:"#E8DDBF"},board:{surface:"#CDBB91",pointLight:"#F2E6C6",pointDark:"#3E705B",bar:"#284F3D",line:"#173327"}}];
  }
  renderDesignOptions();
}


function renderGameMarkers(){
  const total=Math.max(1,Number(lastState.totalSteps)||1);
  const starts=Array.isArray(lastState.gameStarts)?lastState.gameStarts:[];
  gameMarkers.innerHTML=starts.map((g,i)=>{
    const idx=Math.max(0,Math.min(total-1,Number(g.index)||0));
    const pct=total<=1?0:(idx/(total-1))*100;
    const edgeClass=pct<=0.5?" first":(pct>=99.5?" last":"");
    const gameNumber=Number(g.gameNumber)||i+1;
    return `<span class="game-marker${edgeClass}" style="left:${pct}%" title="Game ${gameNumber}">▼</span>`;
  }).join("");
}

function renderState(state){
  lastState = {...lastState, ...state, speed:3000};
  lastState.meta = {...(lastState.meta || {}), ...((state && state.meta) || {})};

  const total = Math.max(1, lastState.totalSteps || 1);
  timeline.max = total - 1;
  timeline.value = Math.min(lastState.index || 0, total - 1);
  stepText.textContent = `${Number(timeline.value) + 1} / ${total}`;
  playState.textContent = lastState.mode === "manual" ? "手動" : (lastState.playing ? "再生中" : "一時停止");
  loadedFileName.textContent = lastState.meta.matchFile || "未選択";
  renderGameMarkers();

  const manual=lastState.mode === "manual";
  autoModeBtn.classList.toggle("active",!manual);
  manualModeBtn.classList.toggle("active",manual);
  playBtn.disabled=manual;
  pauseBtn.disabled=manual;

  syncMetaEditorsFromState();
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
  if(dirtyMetaFields.has("matchFile")) matchFileSelect.value = current || "";
  else matchFileSelect.value = lastState.meta.matchFile || current || "";
}

async function fetchPagesManifest(){
  try{
    const u=new URL("./matches/manifest.json",location.href);u.searchParams.set("t",Date.now());
    const r=await fetch(u,{cache:"no-store"});
    return r.ok?await r.json():{};
  }catch{return {};}
}

async function getPagesMatchInfo(file){
  if(!file) return {totalSteps:1,gameStarts:[]};
  const manifest=await fetchPagesManifest();
  const rel=manifest.generated?.[file]||(/\.xg$/i.test(file)?`generated/${file}.json`:file);
  const u=new URL(`./matches/${rel}`,location.href);u.searchParams.set("t",Date.now());
  const r=await fetch(u,{cache:"no-store"});
  if(!r.ok) throw new Error(`棋譜データを取得できません (HTTP ${r.status})`);
  const data=await r.json();
  if(!Array.isArray(data.states)||!data.states.length) throw new Error("棋譜データに再生ステートがありません");
  const gameStarts=[];
  data.states.forEach((state,index)=>{
    if(state && state.phase==="gameStart") gameStarts.push({index,gameNumber:Number(state.gameNumber)||gameStarts.length+1});
  });
  return {totalSteps:data.states.length,gameStarts};
}

async function loadPagesInitialState(){
  if(isLocalRuntime()) return;
  try{const r=await fetch(new URL("./stream-config.json",location.href),{cache:"no-store"});if(r.ok)lastState.meta={...lastState.meta,...await r.json()};}catch{}
  try{const s=localStorage.getItem("matchReplayMeta");if(s)lastState.meta={...lastState.meta,...JSON.parse(s)};}catch{}
  try{const s=localStorage.getItem("matchReplayPlaybackState");if(s)lastState={...lastState,...JSON.parse(s),meta:lastState.meta};}catch{}
  try{const info=await getPagesMatchInfo(lastState.meta.matchFile);lastState.totalSteps=info.totalSteps;lastState.gameStarts=info.gameStarts;lastState.index=Math.min(Number(lastState.index)||0,lastState.totalSteps-1);}catch(error){console.warn(error);lastState.totalSteps=1;lastState.gameStarts=[];lastState.index=0;}
  renderState(lastState);
  if(pageChannel)pageChannel.postMessage({type:"state-request"});
}

function writePagesMeta(meta){
  const revision=`${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  localStorage.setItem("matchReplayMeta",JSON.stringify(meta));
  localStorage.setItem("matchReplayMetaRevision",revision);
  return revision;
}

async function applyMeta(){
  const nextMeta = {
    tournamentTitleLine1: tournamentLine1Input.value.trim(),
    tournamentTitleLine2: tournamentLine2Input.value.trim(),
    themeColor: themeColorInput.value.trim() || "#6B670D",
    designPreset: designPresetSelect.value || "green",
    blackName: blackNameInput.value.trim(),
    whiteName: whiteNameInput.value.trim(),
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
      const info=await getPagesMatchInfo(nextMeta.matchFile);
      lastState.meta={...lastState.meta,...nextMeta};
      lastState.totalSteps=info.totalSteps;
      lastState.gameStarts=info.gameStarts;
      if(nextMeta.matchFile!==oldFile) lastState.index=0;
      else lastState.index=Math.min(lastState.index,lastState.totalSteps-1);
      const revision=writePagesMeta(lastState.meta);
      localStorage.setItem("matchReplayPlaybackState",JSON.stringify({index:lastState.index,totalSteps:lastState.totalSteps,playing:false,speed:3000,mode:lastState.mode||"auto"}));
      if(pageChannel)pageChannel.postMessage({type:"meta",meta:lastState.meta,revision});
      renderState(lastState);
    }

    acceptAppliedMeta();
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

autoModeBtn.addEventListener("click", () => sendCommand("setMode","auto"));
manualModeBtn.addEventListener("click", () => sendCommand("setMode","manual"));
playBtn.addEventListener("click", () => sendCommand("play"));
pauseBtn.addEventListener("click", () => sendCommand("pause"));
prevBtn.addEventListener("click", () => sendCommand("prev"));
nextBtn.addEventListener("click", () => sendCommand("next"));
timeline.addEventListener("input", () => sendCommand("seek", Number(timeline.value)));
applyMetaBtn.addEventListener("click", applyMeta);
refreshMatchesBtn.addEventListener("click", refreshMatches);
designPresetSelect.addEventListener("change", renderDesignPreview);
themeColorInput.addEventListener("input", renderThemeColorPreview);



function installButtonFeedback(){
  document.querySelectorAll("button").forEach(button=>{
    button.addEventListener("pointerdown",event=>{
      if(button.disabled) return;
      button.classList.add("is-pressing");

      const rect=button.getBoundingClientRect();
      const ripple=document.createElement("span");
      ripple.className="button-ripple";
      ripple.style.left=`${event.clientX-rect.left}px`;
      ripple.style.top=`${event.clientY-rect.top}px`;
      button.appendChild(ripple);
      ripple.addEventListener("animationend",()=>ripple.remove(),{once:true});
    });

    const release=()=>button.classList.remove("is-pressing");
    button.addEventListener("pointerup",release);
    button.addEventListener("pointercancel",release);
    button.addEventListener("pointerleave",release);

    button.addEventListener("click",event=>{
      if(button.disabled || event.detail!==0) return;
      const ripple=document.createElement("span");
      ripple.className="button-ripple";
      ripple.style.left="50%";
      ripple.style.top="50%";
      button.appendChild(ripple);
      ripple.addEventListener("animationend",()=>ripple.remove(),{once:true});
    });
  });
}
installButtonFeedback();
renderState(lastState);
renderThemeColorPreview();
loadDesignPresets();
refreshMatches();
loadPagesInitialState();
connect();
