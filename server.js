const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer, WebSocket } = require("ws");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;

const MIME = {
  ".html":"text/html; charset=utf-8",
  ".css":"text/css; charset=utf-8",
  ".js":"application/javascript; charset=utf-8",
  ".json":"application/json; charset=utf-8",
  ".svg":"image/svg+xml",
  ".png":"image/png",
  ".jpg":"image/jpeg",
  ".jpeg":"image/jpeg",
  ".xg":"application/octet-stream"
};

function safePath(urlPath){
  const requested = decodeURIComponent((urlPath || "/").split("?")[0]);
  const normalized = requested === "/" ? "/index.html" : requested;
  const filePath = path.resolve(ROOT, "." + normalized);
  if(!filePath.startsWith(ROOT)) return null;
  return filePath;
}

const server = http.createServer((req, res) => {
  const filePath = safePath(req.url);
  if(!filePath){
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.stat(filePath, (statError, stat) => {
    if(statError || !stat.isFile()){
      res.writeHead(404);
      res.end("Not Found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control":"no-store"
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

const wss = new WebSocketServer({server, path:"/ws"});

let state = {
  index:0,
  totalSteps:6,
  playing:false,
  speed:1500
};

let timer = null;

function broadcastState(){
  const payload = JSON.stringify({type:"state", ...state});
  for(const client of wss.clients){
    if(client.readyState === WebSocket.OPEN){
      client.send(payload);
    }
  }
}

function stopTimer(){
  if(timer){
    clearInterval(timer);
    timer = null;
  }
}

function startTimer(){
  stopTimer();
  if(!state.playing) return;

  timer = setInterval(() => {
    const lastIndex = Math.max(0, state.totalSteps - 1);

    if(state.index >= lastIndex){
      state.index = lastIndex;
      state.playing = false;
      stopTimer();
      broadcastState();
      return;
    }

    state.index += 1;
    broadcastState();
  }, state.speed);
}

function setIndex(index){
  const lastIndex = Math.max(0, state.totalSteps - 1);
  state.index = Math.max(0, Math.min(lastIndex, Number(index) || 0));
}

function handleCommand(message){
  switch(message.command){
    case "play":
      state.playing = true;
      startTimer();
      break;

    case "pause":
      state.playing = false;
      stopTimer();
      break;

    case "prev":
      state.playing = false;
      stopTimer();
      setIndex(state.index - 1);
      break;

    case "next":
      state.playing = false;
      stopTimer();
      setIndex(state.index + 1);
      break;

    case "seek":
      state.playing = false;
      stopTimer();
      setIndex(message.value);
      break;

    case "speed":
      state.speed = Math.max(200, Number(message.value) || 1500);
      if(state.playing) startTimer();
      break;
  }

  broadcastState();
}

wss.on("connection", socket => {
  socket.send(JSON.stringify({type:"state", ...state}));

  socket.on("message", data => {
    try{
      const message = JSON.parse(data.toString());

      if(message.type === "hello" && message.role === "display"){
        const totalSteps = Number(message.totalSteps);
        if(Number.isFinite(totalSteps) && totalSteps > 0){
          state.totalSteps = Math.floor(totalSteps);
          setIndex(state.index);
          broadcastState();
        }
        return;
      }

      if(message.type === "command"){
        handleCommand(message);
      }
    }catch(error){
      console.error("Invalid message:", error);
    }
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Match Replay server: http://localhost:${PORT}/`);
  console.log(`Control panel:       http://localhost:${PORT}/control.html`);
});
