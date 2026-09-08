const connectionEl = document.getElementById("connection");
const stepText = document.getElementById("stepText");
const gamePosition = document.getElementById("gamePosition");
const remainingTime = document.getElementById("remainingTime");
const timeline = document.getElementById("timeline");
const pauseBtn = document.getElementById("pauseBtn");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const autoNormalModeBtn = document.getElementById("autoNormalModeBtn");
const autoDoubleModeBtn = document.getElementById("autoDoubleModeBtn");
const autoTripleModeBtn = document.getElementById("autoTripleModeBtn");
const autoSixModeBtn = document.getElementById("autoSixModeBtn");

const tournamentLine1Input = document.getElementById("tournamentLine1Input");
const tournamentLine2Input = document.getElementById("tournamentLine2Input");
const themeColorInput = document.getElementById("themeColorInput");
const themeColorPreview = document.getElementById("themeColorPreview");
const themeColorSwatch = document.getElementById("themeColorSwatch");
const designPresetSelect = document.getElementById("designPresetSelect");
const designPresetPreview = document.getElementById("designPresetPreview");
const designColorEditor = document.getElementById("designColorEditor");
const designColorLabel = document.getElementById("designColorLabel");
const designColorInput = document.getElementById("designColorInput");
const designColorSwatch = document.getElementById("designColorSwatch");
const designColorNoneBtn = document.getElementById("designColorNoneBtn");
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
  speed:6000,
  playbackRate:1,
  mode:"auto",
  gameStarts:[],
  meta:{
    tournamentTitleLine1:"",
    tournamentTitleLine2:"",
    blackName:"",
    whiteName:"",
    blackScore:0,
    whiteScore:0,
    matchFile:"",
    themeColor:"#000000",
    designPreset:"green",
    designOverrides:{}
  }
};
let selectedPlaybackButton="pause";
let selectedPlaybackRate=1;
let timingMatchFile="";
let timingStates=[];
let remainingAnchorMs=0;
let remainingAnchorAt=performance.now();
let remainingCounting=false;

let designPresets=[];
let designOverridesDraft={};
let selectedDesignKey="board.surface";


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
  syncEditorValue(themeColorInput,"themeColor",lastState.meta.themeColor || "#000000");
  renderThemeColorPreview();
  syncEditorValue(blackNameInput,"blackName",lastState.meta.blackName || "");
  syncEditorValue(whiteNameInput,"whiteName",lastState.meta.whiteName || "");
  if(!dirtyMetaFields.has("designOverrides")){
    designOverridesDraft=normalizeDesignOverridesObject(lastState.meta.designOverrides);
  }

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
  const rawValue=String(themeColorInput?.value||"").trim();
  const value=rawValue.toUpperCase();
  const valid=/^#[0-9A-F]{6}$/.test(value);
  if(themeColorSwatch){
    themeColorSwatch.style.background=valid?value:"#FFFFFF";
  }
  if(!themeColorPreview) return;
  themeColorPreview.querySelectorAll(".theme-color-button").forEach(button=>{
    const color=String(button.dataset.color||"").toUpperCase();
    button.style.background=color;
    button.classList.toggle("is-selected",color===value);
  });
}

const JBS_THEME_BY_TITLE=[
  // 「日本」は協会名等にも入り得るため、固有タイトルを優先して最後に判定する。
  {keywords:["盤聖戦","盤聖"],color:"#6B0D2F"},
  {keywords:["名人戦","名人"],color:"#6B670D"},
  {keywords:["王位戦","王位"],color:"#0D6B2F"},
  {keywords:["賽王戦","賽王"],color:"#0D236B"},
  {keywords:["棋聖戦","棋聖"],color:"#6B230D"},
  {keywords:["女王戦","女王"],color:"#6B0D5B"},
  {keywords:["新鋭戦","新鋭"],color:"#0D676B"},
  {keywords:["日本選手権","日本"],color:"#3C3C3C"}
];
function decodeMatchFilenameForTheme(filename){
  return String(filename||"").replace(/#U([0-9a-fA-F]{4})/g,(_,hex)=>String.fromCharCode(parseInt(hex,16)));
}
function autoMetaFromStructuredMatchFilename(filename){
  const decoded=decodeMatchFilenameForTheme(filename).split(/[\/]/).pop()||"";
  const match=decoded.match(/^(\d{8})_([^_\-]+)-([^_]+)_([^_]+)\.xg$/i);
  if(!match)return null;
  const [,dateRaw,player1Raw,player2Raw,titleRaw]=match;
  const yyyy=dateRaw.slice(0,4),mm=dateRaw.slice(4,6),dd=dateRaw.slice(6,8);
  const title=String(titleRaw||"").trim();
  return {
    tournamentTitleLine1:title.startsWith("JBS")?title:`JBS${title}`,
    tournamentTitleLine2:`${yyyy}-${mm}-${dd}`,
    blackName:String(player1Raw||"").trim(),
    whiteName:String(player2Raw||"").trim()
  };
}
function applyAutoMetaFromMatchFile(filename){
  const parsed=autoMetaFromStructuredMatchFilename(filename);
  if(!parsed)return false;
  const entries=[
    [tournamentLine1Input,"tournamentTitleLine1",parsed.tournamentTitleLine1],
    [tournamentLine2Input,"tournamentTitleLine2",parsed.tournamentTitleLine2],
    [blackNameInput,"blackName",parsed.blackName],
    [whiteNameInput,"whiteName",parsed.whiteName]
  ];
  entries.forEach(([input,key,value])=>{
    if(input)input.value=value;
    dirtyMetaFields.add(key);
  });
  lastState.meta={...lastState.meta,...parsed};
  return true;
}
function autoThemeColorForMatchFile(filename){
  const decoded=decodeMatchFilenameForTheme(filename);
  const rule=JBS_THEME_BY_TITLE.find(item=>item.keywords.some(keyword=>decoded.includes(keyword)));
  return rule?.color||null;
}
function applyAutoThemeFromMatchFile(filename){
  const color=autoThemeColorForMatchFile(filename);
  if(!color||!themeColorInput)return false;
  themeColorInput.value=color;
  dirtyMetaFields.add("themeColor");
  renderThemeColorPreview();
  return true;
}

function clearMatchTextEditors(){
  const keys=["tournamentTitleLine1","tournamentTitleLine2","blackName","whiteName"];
  const editors=[tournamentLine1Input,tournamentLine2Input,blackNameInput,whiteNameInput];
  keys.forEach(key=>dirtyMetaFields.delete(key));
  editors.forEach(editor=>{if(editor) editor.value="";});
  lastState.meta={...lastState.meta,tournamentTitleLine1:"",tournamentTitleLine2:"",blackName:"",whiteName:""};
}

function getPreviewTextColor(hex){
  const value=String(hex||"").trim();
  if(!/^#[0-9a-fA-F]{6}$/.test(value)) return "#111";
  const r=parseInt(value.slice(1,3),16);
  const g=parseInt(value.slice(3,5),16);
  const b=parseInt(value.slice(5,7),16);
  const luminance=(0.299*r + 0.587*g + 0.114*b) / 255;
  return luminance > 0.68 ? "#111" : "#fff";
}

const DESIGN_ITEMS=[
  {key:"board.surface",label:"盤面"},
  {key:"board.frame",label:"盤枠"},
  {key:"board.pointLight",label:"升１"},
  {key:"board.pointDark",label:"升２"},
  {key:"board.pointBorder",label:"升枠"},
  {key:"checkers.player1",label:"駒１"},
  {key:"checkers.player2",label:"駒２"},
  {key:"checkers.border",label:"駒枠"}
];
function normalizeDesignOverridesObject(value){
  if(!value||typeof value!=="object"||Array.isArray(value)) return {};
  const out={};
  for(const item of DESIGN_ITEMS){
    if(!Object.prototype.hasOwnProperty.call(value,item.key)) continue;
    const raw=value[item.key];
    if(raw===null||String(raw).trim().toLowerCase()==="none"||String(raw).trim().toLowerCase()==="transparent"||String(raw).trim()==="") out[item.key]=null;
    else if(/^#[0-9a-fA-F]{6}$/.test(String(raw).trim())) out[item.key]=String(raw).trim().toUpperCase();
  }
  return out;
}
function getNestedDesignValue(preset,key){
  return key.split(".").reduce((obj,part)=>obj?.[part],preset);
}
function normalizePreviewColor(value,fallback){
  if(value===undefined) value=fallback;
  if(value===null) return "";
  const raw=String(value??"").trim();
  if(!raw) return "";
  const lower=raw.toLowerCase();
  if(lower==="none"||lower==="transparent") return "";
  return raw;
}
function effectiveDesignValue(preset,key){
  if(Object.prototype.hasOwnProperty.call(designOverridesDraft,key)) return designOverridesDraft[key];
  const boardFrame=preset?.board?.frame;
  const fallback={
    "board.surface":boardFrame,
    "board.frame":"#111111",
    "board.pointLight":boardFrame,
    "board.pointDark":boardFrame,
    "board.pointBorder":boardFrame,
    "checkers.player1":boardFrame,
    "checkers.player2":boardFrame,
    "checkers.border":boardFrame
  }[key];
  const base=getNestedDesignValue(preset,key);
  const normalized=normalizePreviewColor(base,fallback);
  return normalized||null;
}
function syncDesignColorEditor(){
  const preset=designPresets.find(p=>p.id===designPresetSelect.value)||designPresets[0];
  const item=DESIGN_ITEMS.find(x=>x.key===selectedDesignKey)||DESIGN_ITEMS[0];
  if(!preset||!item) return;
  const value=effectiveDesignValue(preset,item.key);
  if(designColorLabel) designColorLabel.textContent=item.label;
  if(designColorInput) designColorInput.value=value||"";
  if(designColorSwatch){
    designColorSwatch.classList.toggle("is-none",!value);
    designColorSwatch.style.background=value||"";
  }
  designColorEditor?.classList.remove("is-invalid");
}
function closeDesignColorEditor(){
  designColorEditor?.classList.remove("is-open");
}
function positionDesignColorEditor(anchor){
  if(!designColorEditor||!anchor) return;
  designColorEditor.classList.add("is-open");
  const rect=anchor.getBoundingClientRect();
  const popupRect=designColorEditor.getBoundingClientRect();
  const gap=5;
  let left=rect.left + rect.width/2 - popupRect.width/2;
  left=Math.max(6,Math.min(left,window.innerWidth-popupRect.width-6));
  let top=rect.bottom+gap;
  if(top+popupRect.height>window.innerHeight-6){
    top=Math.max(6,rect.top-popupRect.height-gap);
  }
  designColorEditor.style.left=`${Math.round(left)}px`;
  designColorEditor.style.top=`${Math.round(top)}px`;
}
function openDesignColorEditor(anchor){
  syncDesignColorEditor();
  positionDesignColorEditor(anchor);
  requestAnimationFrame(()=>{
    designColorInput?.focus();
    designColorInput?.select();
  });
}
function renderDesignPreview(){
  const preset=designPresets.find(p=>p.id===designPresetSelect.value)||designPresets[0];
  if(!preset){designPresetPreview.innerHTML="";return;}
  designPresetPreview.innerHTML=DESIGN_ITEMS.map(item=>{
    const color=effectiveDesignValue(preset,item.key);
    const hasColor=Boolean(color);
    const textColor=hasColor?getPreviewTextColor(color):"#111";
    const cls=`design-preview-chip${hasColor?"":" is-none"}${item.key===selectedDesignKey?" is-editing":""}`;
    const style=hasColor?`background:${color};color:${textColor}`:`color:${textColor}`;
    return `<button type="button" class="${cls}" data-design-key="${item.key}" style="${style}" aria-pressed="${item.key===selectedDesignKey?"true":"false"}">${item.label}</button>`;
  }).join("");
  syncDesignColorEditor();
}
function setSelectedDesignColor(value){
  if(!selectedDesignKey) return;
  if(value===null){
    designOverridesDraft[selectedDesignKey]=null;
  }else{
    const raw=String(value||"").trim();
    if(!/^#[0-9a-fA-F]{6}$/.test(raw)){
      designColorEditor?.classList.add("is-invalid");
      return;
    }
    designOverridesDraft[selectedDesignKey]=raw.toUpperCase();
  }
  dirtyMetaFields.add("designOverrides");
  designColorEditor?.classList.remove("is-invalid");
  renderDesignPreview();
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
    designPresets=[{id:"green",name:"グリーン",checkers:{player1:"#17382C",player2:"#F7F0DE",border:"#173327"},winRate:{player1:"#17382C",player2:"#F7F0DE"},board:{surface:"#CDBB91",frame:"#173327",pointLight:"#F2E6C6",pointDark:"#3E705B",pointBorder:"#173327",bar:"#284F3D"}}];
  }
  renderDesignOptions();
}



function cacheTimingStates(file, states){
  timingMatchFile=String(file||"");
  timingStates=Array.isArray(states)?states:[];
}

function normalizedPlaybackRate(value){
  const rate=Number(value);
  return [1,2,3,6].includes(rate)?rate:1;
}

function playbackRateForRemaining(){
  if(lastState.playing&&lastState.mode==="auto") return normalizedPlaybackRate(lastState.playbackRate);
  return normalizedPlaybackRate(selectedPlaybackRate);
}

function timingDelayForState(state, rate=1){
  const safeRate=normalizedPlaybackRate(rate);
  const sequenceMs=6000/safeRate;
  const checkerMoveMs=500/safeRate;
  if(!state) return sequenceMs;
  if(["gameEnd","matchStart","matchEnd","bigComebackIntro","preRoll","cubeOffer","cubeOfferSelect","cubeResponse","cubeResponseSelect"].includes(state.phase)) return sequenceMs;
  const segments=Array.isArray(state?.moveAnimation?.segments)?state.moveAnimation.segments:[];
  const hitCount=segments.reduce((n,segment)=>n+(segment?.hit?1:0),0);
  const animationMs=segments.length?(segments.length+hitCount)*checkerMoveMs+250/safeRate:0;
  if(state.phase==="roll"&&state.noContactCombined) return Math.max(sequenceMs,animationMs);
  if(state.phase==="roll") return sequenceMs;
  if(state.phase==="analysis"||(state.phase==="candidates"&&state.forcedMove)) return Math.max(sequenceMs,animationMs);
  if(state.phase==="candidates") return sequenceMs;
  if(segments.length) return Math.max(sequenceMs,animationMs);
  return sequenceMs;
}

function calculateRemainingMs(){
  const total=Math.max(1,Number(lastState.totalSteps)||1);
  const current=Math.max(0,Math.min(total-1,Number(lastState.index)||0));
  const rate=playbackRateForRemaining();
  if(!String(lastState.meta?.matchFile||"").trim()) return 0;
  if(timingMatchFile===String(lastState.meta.matchFile||"")&&timingStates.length){
    let ms=0;
    const end=Math.min(total,timingStates.length);
    for(let i=current;i<end;i++) ms+=timingDelayForState(timingStates[i],rate);
    return ms;
  }
  return Math.max(0,total-current)*6000/rate;
}

function formatRemainingTime(ms){
  const totalSeconds=Math.max(0,Math.ceil((Number(ms)||0)/1000));
  const minutes=Math.floor(totalSeconds/60);
  const seconds=totalSeconds%60;
  return `${minutes}:${String(seconds).padStart(2,"0")}`;
}

function updateRemainingTimeDisplay(){
  if(!remainingTime) return;
  let ms=remainingAnchorMs;
  if(remainingCounting) ms=Math.max(0,ms-(performance.now()-remainingAnchorAt));
  remainingTime.textContent=formatRemainingTime(ms);
}

function resetRemainingTimeAnchor(){
  remainingAnchorMs=calculateRemainingMs();
  remainingAnchorAt=performance.now();
  remainingCounting=Boolean(lastState.playing&&lastState.mode==="auto");
  updateRemainingTimeDisplay();
}

async function ensureTimingStates(file){
  const target=String(file||"");
  if(!target){
    cacheTimingStates("",[]);
    resetRemainingTimeAnchor();
    return;
  }
  if(timingMatchFile===target&&timingStates.length) return;
  try{
    if(isLocalRuntime()) await getLocalMatchInfo(target);
    else await getPagesMatchInfo(target);
    resetRemainingTimeAnchor();
  }catch(error){
    console.warn("Failed to load timing states",error);
  }
}

function renderGameMarkers(){
  const total=Math.max(1,Number(lastState.totalSteps)||1);
  const starts=Array.isArray(lastState.gameStarts)?lastState.gameStarts:[];
  gameMarkers.innerHTML=starts.map((g,i)=>{
    const idx=Math.max(0,Math.min(total-1,Number(g.index)||0));
    const pct=total<=1?0:(idx/(total-1))*100;
    const edgeClass=pct<=0.5?" first":(pct>=99.5?" last":"");
    const gameNumber=Number(g.gameNumber)||i+1;
    return `<span class="game-marker${edgeClass}" style="left:${pct}%" data-index="${idx}" title="Game ${gameNumber}へ移動" role="button" tabindex="0" aria-label="Game ${gameNumber}へ移動"><span class="game-marker-number">${gameNumber}</span><span class="game-marker-caret">▼</span></span>`;
  }).join("");
}

function renderState(state){
  lastState = {...lastState, ...state};
  lastState.playbackRate = normalizedPlaybackRate(lastState.playbackRate);
  lastState.speed = 6000/lastState.playbackRate;
  lastState.meta = {...(lastState.meta || {}), ...((state && state.meta) || {})};
  if(!String(lastState.meta.matchFile||"").trim()){
    lastState.meta={...lastState.meta,tournamentTitleLine1:"",tournamentTitleLine2:"",blackName:"",whiteName:""};
    ["tournamentTitleLine1","tournamentTitleLine2","blackName","whiteName"].forEach(key=>dirtyMetaFields.delete(key));
  }

  const total = Math.max(1, lastState.totalSteps || 1);
  timeline.max = total - 1;
  timeline.value = Math.min(lastState.index || 0, total - 1);
  stepText.textContent = `${Number(timeline.value) + 1} / ${total}`;
  const starts = Array.isArray(lastState.gameStarts) ? lastState.gameStarts : [];
  const currentIndex = Number(timeline.value) || 0;
  let currentGame = 0;
  starts.forEach((g, i) => {
    if((Number(g.index) || 0) <= currentIndex) currentGame = Number(g.gameNumber) || (i + 1);
  });
  if(!currentGame && starts.length) currentGame = Number(starts[0].gameNumber) || 1;
  gamePosition.textContent = starts.length ? `${currentGame} / ${starts.length}` : `0 / 0`;
  resetRemainingTimeAnchor();
  ensureTimingStates(lastState.meta.matchFile);
  loadedFileName.textContent = lastState.meta.matchFile || "未選択";
  renderGameMarkers();

  const manual=lastState.mode === "manual";
  if(lastState.playing && !manual){
    selectedPlaybackRate=normalizedPlaybackRate(lastState.playbackRate);
    selectedPlaybackButton=`auto${selectedPlaybackRate}`;
  }else if(!manual){
    selectedPlaybackButton="pause";
  }
  const activeButton={auto1:autoNormalModeBtn,auto2:autoDoubleModeBtn,auto3:autoTripleModeBtn,auto6:autoSixModeBtn,prev:prevBtn,next:nextBtn,pause:pauseBtn}[selectedPlaybackButton]||pauseBtn;
  [autoNormalModeBtn,autoDoubleModeBtn,autoTripleModeBtn,autoSixModeBtn,prevBtn,nextBtn,pauseBtn].forEach(button=>button.classList.toggle("active",button===activeButton));

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

function extractMatchInfo(data,file=""){
  if(!Array.isArray(data?.states)||!data.states.length) throw new Error("棋譜データに再生ステートがありません");
  const gameStarts=[];
  data.states.forEach((state,index)=>{
    if(state && state.phase==="gameStart") gameStarts.push({index,gameNumber:Number(state.gameNumber)||gameStarts.length+1});
  });
  const match=data.match||{};
  const blackName=String(match.blackSourcePlayer||match.player1||"").trim();
  const whiteName=String(match.whiteSourcePlayer||match.player2||"").trim();
  if(file) cacheTimingStates(file,data.states);
  return {totalSteps:data.states.length,gameStarts,blackName,whiteName};
}

async function getLocalMatchInfo(file){
  if(!file) return {totalSteps:1,gameStarts:[],blackName:"",whiteName:""};
  const u=new URL("/api/match",location.href);
  u.searchParams.set("file",file);
  u.searchParams.set("t",Date.now());
  const r=await fetch(u,{cache:"no-store"});
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.error||`棋譜データを取得できません (HTTP ${r.status})`);
  return extractMatchInfo(data,file);
}

async function getPagesMatchInfo(file){
  if(!file) return {totalSteps:1,gameStarts:[],blackName:"",whiteName:""};
  const manifest=await fetchPagesManifest();
  const rel=manifest.generated?.[file]||(/\.xg$/i.test(file)?`generated/${file}.json`:file);
  const u=new URL(`./matches/${rel}`,location.href);u.searchParams.set("t",Date.now());
  const r=await fetch(u,{cache:"no-store"});
  if(!r.ok) throw new Error(`棋譜データを取得できません (HTTP ${r.status})`);
  const data=await r.json();
  return extractMatchInfo(data,file);
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
    themeColor: themeColorInput.value.trim() || "#000000",
    designPreset: designPresetSelect.value || "green",
    designOverrides: normalizeDesignOverridesObject(designOverridesDraft),
    blackName: blackNameInput.value.trim(),
    whiteName: whiteNameInput.value.trim(),
    matchFile: matchFileSelect.value
  };
  if(!nextMeta.matchFile){
    nextMeta.tournamentTitleLine1="";
    nextMeta.tournamentTitleLine2="";
    nextMeta.blackName="";
    nextMeta.whiteName="";
  }
  const oldFile=lastState.meta.matchFile||"";
  const fileChanged=nextMeta.matchFile!==oldFile;

  const originalText = applyMetaBtn.textContent;
  applyMetaBtn.disabled = true;
  applyMetaBtn.textContent = "反映中…";

  try{
    // 別の棋譜を初めて読み込む時だけ、棋譜内の選手名を初期値として採用する。
    // 同じ棋譜への再反映では入力中の名前を維持する。
    let matchInfo=null;
    if(fileChanged && nextMeta.matchFile){
      matchInfo=isLocalRuntime()?await getLocalMatchInfo(nextMeta.matchFile):await getPagesMatchInfo(nextMeta.matchFile);
      const filenameMeta=autoMetaFromStructuredMatchFilename(nextMeta.matchFile);
      // 規定ファイル名なら選択時に入力欄へ自動セット済み。ここでは手動修正を上書きしない。
      // 規定外ファイルだけ、棋譜内部の選手名を従来どおり初期値として利用する。
      if(!filenameMeta){
        if(matchInfo.blackName) nextMeta.blackName=matchInfo.blackName;
        if(matchInfo.whiteName) nextMeta.whiteName=matchInfo.whiteName;
      }
    }

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
      const info=matchInfo||await getPagesMatchInfo(nextMeta.matchFile);
      lastState.meta={...lastState.meta,...nextMeta};
      lastState.totalSteps=info.totalSteps;
      lastState.gameStarts=info.gameStarts;
      if(fileChanged) lastState.index=0;
      else lastState.index=Math.min(lastState.index,lastState.totalSteps-1);
      const revision=writePagesMeta(lastState.meta);
      localStorage.setItem("matchReplayPlaybackState",JSON.stringify({index:lastState.index,totalSteps:lastState.totalSteps,playing:false,speed:6000/normalizedPlaybackRate(lastState.playbackRate),playbackRate:normalizedPlaybackRate(lastState.playbackRate),mode:lastState.mode||"auto"}));
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
    connectionEl.hidden = true;
    return;
  }

  connectionEl.hidden = false;
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

function setPlaybackSelection(selection){
  selectedPlaybackButton=selection;
  const activeButton={auto1:autoNormalModeBtn,auto2:autoDoubleModeBtn,auto3:autoTripleModeBtn,auto6:autoSixModeBtn,prev:prevBtn,next:nextBtn,pause:pauseBtn}[selection]||pauseBtn;
  [autoNormalModeBtn,autoDoubleModeBtn,autoTripleModeBtn,autoSixModeBtn,prevBtn,nextBtn,pauseBtn].forEach(button=>button.classList.toggle("active",button===activeButton));
}
function startAutoPlayback(rate){
  selectedPlaybackRate=normalizedPlaybackRate(rate);
  setPlaybackSelection(`auto${selectedPlaybackRate}`);
  sendCommand("setMode","auto");
  sendCommand("speed",selectedPlaybackRate);
  sendCommand("play");
}
function manualStep(direction){
  setPlaybackSelection(direction);
  sendCommand("setMode","manual");
  sendCommand(direction);
}
autoNormalModeBtn.addEventListener("click", () => startAutoPlayback(1));
autoDoubleModeBtn.addEventListener("click", () => startAutoPlayback(2));
autoTripleModeBtn.addEventListener("click", () => startAutoPlayback(3));
autoSixModeBtn.addEventListener("click", () => startAutoPlayback(6));
pauseBtn.addEventListener("click", () => {setPlaybackSelection("pause");sendCommand("pause");});
prevBtn.addEventListener("click", () => manualStep("prev"));
nextBtn.addEventListener("click", () => manualStep("next"));
function jumpToGameMarker(marker){
  if(!marker)return;
  const targetIndex=Number(marker.dataset.index);
  if(!Number.isFinite(targetIndex))return;
  timeline.value=String(targetIndex);
  sendCommand("seek",targetIndex);
}
gameMarkers.addEventListener("click",event=>jumpToGameMarker(event.target.closest(".game-marker")));
gameMarkers.addEventListener("keydown",event=>{
  if(event.key!=="Enter"&&event.key!==" ")return;
  const marker=event.target.closest(".game-marker");
  if(!marker)return;
  event.preventDefault();
  jumpToGameMarker(marker);
});

timeline.addEventListener("input", () => sendCommand("seek", Number(timeline.value)));
applyMetaBtn.addEventListener("click", applyMeta);
refreshMatchesBtn.addEventListener("click", refreshMatches);
designPresetSelect.addEventListener("change",()=>{
  closeDesignColorEditor();
  designOverridesDraft={};
  dirtyMetaFields.add("designPreset");
  dirtyMetaFields.add("designOverrides");
  renderDesignPreview();
});
designPresetPreview?.addEventListener("click",event=>{
  const chip=event.target.closest("[data-design-key]");
  if(!chip) return;
  selectedDesignKey=chip.dataset.designKey||selectedDesignKey;
  renderDesignPreview();
  const currentChip=designPresetPreview.querySelector(`[data-design-key="${selectedDesignKey}"]`);
  openDesignColorEditor(currentChip||chip);
});
designColorInput?.addEventListener("input",()=>{
  const raw=designColorInput.value.trim();
  if(/^#[0-9a-fA-F]{6}$/.test(raw)) setSelectedDesignColor(raw);
  else designColorEditor?.classList.toggle("is-invalid",raw.length>=7);
});
designColorInput?.addEventListener("change",()=>{
  const raw=designColorInput.value.trim();
  if(!raw) return;
  setSelectedDesignColor(raw);
});
designColorNoneBtn?.addEventListener("click",()=>setSelectedDesignColor(null));
document.addEventListener("pointerdown",event=>{
  if(!designColorEditor?.classList.contains("is-open")) return;
  if(designColorEditor.contains(event.target)) return;
  if(event.target.closest?.("[data-design-key]")) return;
  closeDesignColorEditor();
});
document.addEventListener("keydown",event=>{
  if(event.key==="Escape"){closeDesignColorEditor();return;}
  if(event.ctrlKey||event.metaKey||event.altKey)return;
  const target=event.target;
  if(target&&/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))return;
  const key=event.key;
  if(key==="1"){event.preventDefault();startAutoPlayback(1);return;}
  if(key==="2"){event.preventDefault();startAutoPlayback(2);return;}
  if(key==="3"){event.preventDefault();startAutoPlayback(3);return;}
  if(key==="6"){event.preventDefault();startAutoPlayback(6);return;}
  if(key==="ArrowLeft"){event.preventDefault();manualStep("prev");return;}
  if(key==="ArrowRight"){event.preventDefault();manualStep("next");return;}
  if(key===" "||event.code==="Space"){
    event.preventDefault();
    setPlaybackSelection("pause");
    sendCommand("pause");
  }
});
window.addEventListener("resize",closeDesignColorEditor);
window.addEventListener("scroll",closeDesignColorEditor,true);
themeColorInput.addEventListener("input", renderThemeColorPreview);
themeColorPreview?.querySelectorAll(".theme-color-button").forEach(button=>{
  button.addEventListener("click",()=>{
    themeColorInput.value=String(button.dataset.color||"").toUpperCase();
    dirtyMetaFields.add("themeColor");
    renderThemeColorPreview();
  });
});
matchFileSelect.addEventListener("change",()=>{
  if(matchFileSelect.value){
    applyAutoMetaFromMatchFile(matchFileSelect.value);
    applyAutoThemeFromMatchFile(matchFileSelect.value);
    return;
  }
  clearMatchTextEditors();
});



function installButtonFeedback(){
  document.querySelectorAll("button:not(.theme-color-button)").forEach(button=>{
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
setInterval(updateRemainingTimeDisplay,250);
renderState(lastState);
renderThemeColorPreview();
loadDesignPresets();
refreshMatches();
loadPagesInitialState();
connect();
