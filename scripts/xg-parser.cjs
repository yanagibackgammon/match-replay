const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const RECORD_SIZE = 2560;
const JOKER_WINRATE_THRESHOLD = 10.0;

function int8(buf, off){ return buf.readInt8(off); }
function uint8(buf, off){ return buf.readUInt8(off); }
function int16(buf, off){ return buf.readInt16LE(off); }
function int32(buf, off){ return buf.readInt32LE(off); }
function uint32(buf, off){ return buf.readUInt32LE(off); }
function float32(buf, off){ return buf.readFloatLE(off); }
function float64(buf, off){ return buf.readDoubleLE(off); }

function readShortString(buf, off, maxLen){
  const len = Math.min(uint8(buf, off), maxLen);
  return buf.subarray(off + 1, off + 1 + len).toString('latin1');
}

function readUtf16Fixed(buf, off, count){
  let end = off;
  for(let i=0;i<count;i++){
    if(buf.readUInt16LE(off + i * 2) === 0) break;
    end = off + (i + 1) * 2;
  }
  if(end <= off) return '';
  return buf.subarray(off, end).toString('utf16le');
}

function delphiDateToIso(days){
  if(!Number.isFinite(days)) return '';
  const epoch = Date.UTC(1899, 11, 30);
  const d = new Date(epoch + days * 86400000);
  if(Number.isNaN(d.getTime())) return '';
  return d.toISOString();
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for(let n=0;n<256;n++){
    let c=n;
    for(let k=0;k<8;k++) c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);
    table[n]=c>>>0;
  }
  return table;
})();

function crc32(buf){
  let c=0xffffffff;
  for(const b of buf) c=CRC32_TABLE[(c^b)&0xff]^(c>>>8);
  return (c^0xffffffff)>>>0;
}

function extractArchive(raw){
  if(raw.length < 8268) throw new Error('XG file is too small');
  const magic = Buffer.from(raw.subarray(0,4)).reverse().toString('ascii');
  const headerVersion = int32(raw, 4);
  const headerSize = int32(raw, 8);
  const thumbnailSize = int32(raw, 20);
  if(magic !== 'HMGR' || headerVersion !== 1) throw new Error('Invalid RichGame header');

  const arcOff = raw.length - 36;
  const archiveCrc = uint32(raw, arcOff);
  const fileCount = int32(raw, arcOff + 4);
  const archiveVersion = int32(raw, arcOff + 8);
  const registrySize = int32(raw, arcOff + 12);
  const archiveSize = int32(raw, arcOff + 16);
  const compressedRegistry = int32(raw, arcOff + 20) !== 0;
  const registryStart = arcOff - registrySize;
  const archiveDataStart = registryStart - archiveSize;
  if(archiveDataStart < headerSize + thumbnailSize - 4) throw new Error('Invalid archive offsets');

  const crcRegion = raw.subarray(archiveDataStart, arcOff);
  if(crc32(crcRegion) !== archiveCrc) throw new Error('XG archive CRC mismatch');

  let registry = raw.subarray(registryStart, arcOff);
  if(compressedRegistry) registry = zlib.inflateSync(registry);

  const files = {};
  for(let i=0;i<fileCount;i++){
    const off = i * 532;
    const name = readShortString(registry, off, 255);
    const originalSize = int32(registry, off + 512);
    const compressedSize = int32(registry, off + 516);
    const start = int32(registry, off + 520);
    const expectedCrc = uint32(registry, off + 524);
    const compressed = uint8(registry, off + 528) === 0;
    const segment = raw.subarray(archiveDataStart + start);
    let out;
    if(compressed){
      out = zlib.inflateSync(segment);
    }else{
      out = segment.subarray(0, compressedSize);
    }
    if(out.length !== originalSize) throw new Error(`Unexpected size for ${name}`);
    if(crc32(out) !== expectedCrc) throw new Error(`CRC mismatch for ${name}`);
    files[name] = out;
  }

  return {files, headerSize, thumbnailSize, archiveVersion};
}

function normalizeStoredPosition(pos){
  const points = Array(25).fill(0);
  for(let p=1;p<=24;p++) points[p] = Number(pos[p] || 0);
  return {
    points,
    blackBar: Math.max(0, Number(pos[25] || 0)),
    whiteBar: Math.max(0, -Number(pos[0] || 0))
  };
}

function normalizeMoveEndPosition(pos, activePlayer){
  if(activePlayer === 1) return normalizeStoredPosition(pos);
  const points = Array(25).fill(0);
  for(let p=1;p<=24;p++) points[25 - p] = -Number(pos[p] || 0);
  return {
    points,
    blackBar: Math.max(0, -Number(pos[0] || 0)),
    whiteBar: Math.max(0, Number(pos[25] || 0))
  };
}

function cloneBoardPosition(position){
  return {
    points: (position?.points || Array(25).fill(0)).slice(),
    blackBar: Number(position?.blackBar || 0),
    whiteBar: Number(position?.whiteBar || 0)
  };
}

function canonicalPointFromMoveIndex(index, activePlayer){
  if(index == null || index < 0) return null;
  if(index === 24) return 'bar';
  return activePlayer === 1 ? index + 1 : 24 - index;
}

function applyCheckerMove(beforePosition, activePlayer, raw){
  const board = cloneBoardPosition(beforePosition);
  const sign = activePlayer === 1 ? 1 : -1;
  const segments = [];

  for(let i=0;i<8;i+=2){
    const from = Number(raw[i]);
    const to = Number(raw[i+1]);
    if(!Number.isFinite(from) || from < 0) break;

    const source = canonicalPointFromMoveIndex(from, activePlayer);
    const destination = to < 0 ? null : canonicalPointFromMoveIndex(to, activePlayer);
    let hit = false;

    if(source === 'bar'){
      if(sign === 1) board.blackBar = Math.max(0, board.blackBar - 1);
      else board.whiteBar = Math.max(0, board.whiteBar - 1);
    }else if(Number.isInteger(source) && source >= 1 && source <= 24){
      board.points[source] -= sign;
    }

    if(destination != null){
      if(sign === 1 && board.points[destination] === -1){
        board.points[destination] = 0;
        board.whiteBar += 1;
        hit = true;
      }else if(sign === -1 && board.points[destination] === 1){
        board.points[destination] = 0;
        board.blackBar += 1;
        hit = true;
      }
      board.points[destination] += sign;
    }

    segments.push({from,to,source,destination,hit});
  }

  return {position:board,segments};
}

function formatCheckerMove(raw, beforePosition, activePlayer){
  const applied = applyCheckerMove(beforePosition, activePlayer, raw);
  if(!applied.segments.length) return 'Dance';

  const rendered = applied.segments.map(seg => {
    const fromText = seg.from === 24 ? 'bar' : String(seg.from + 1);
    const toText = seg.to < 0 ? 'off' : String(seg.to + 1);
    return {route:`${fromText}/${toText}`, hit:seg.hit};
  });

  // Position Drill準拠: 同一ムーブが連続する場合は (2) などにまとめる。
  // ヒットが含まれる場合はルート末尾に * を一度だけ付ける。
  const compact = [];
  for(const item of rendered){
    const last = compact[compact.length - 1];
    if(last && last.route === item.route){
      last.count += 1;
      last.hit = last.hit || item.hit;
    }else{
      compact.push({route:item.route,count:1,hit:item.hit});
    }
  }
  return compact.map(item => `${item.route}${item.hit ? '*' : ''}${item.count > 1 ? `(${item.count})` : ''}`).join(' ');
}

function cubeValueFromCode(code){
  if(!code) return 1;
  return 2 ** Math.abs(code);
}

function cubeOwnerFromCode(code, activePlayer){
  if(!code) return 0;
  const ownerIsActive = code > 0;
  const owner = ownerIsActive ? activePlayer : -activePlayer;
  return owner === 1 ? 'black' : 'white';
}

function readPosition(buf, off){
  const out = [];
  for(let i=0;i<26;i++) out.push(int8(buf, off + i));
  return out;
}

function samePosition(a,b){
  if(!a || !b || a.length !== b.length) return false;
  for(let i=0;i<a.length;i++) if(a[i] !== b[i]) return false;
  return true;
}

function parseBestMoveEngine(rec, base){
  const nMoves = Math.max(0, Math.min(32, int32(rec, base + 64)));
  const posBase = base + 68;
  const moveBase = base + 900;
  const evalBase = base + 1284;
  const candidates = [];
  for(let i=0;i<nMoves;i++){
    const pos = readPosition(rec, posBase + i * 26);
    const moveRaw = [];
    for(let j=0;j<8;j++) moveRaw.push(int8(rec, moveBase + i*8 + j));
    const result = [];
    for(let j=0;j<7;j++) result.push(float32(rec, evalBase + i*28 + j*4));
    candidates.push({
      pos,
      moveRaw,
      move: '',
      result,
      winRate: result[3] * 100,
      equity: result[6]
    });
  }
  return {nMoves, candidates};
}

function parseDoubleEngine(rec, base){
  const result = [];
  const resultDouble = [];
  for(let i=0;i<7;i++) result.push(float32(rec, base + 60 + i*4));
  for(let i=0;i<7;i++) resultDouble.push(float32(rec, base + 104 + i*4));
  return {
    level: int32(rec, base + 28),
    cube: int32(rec, base + 40),
    cubePos: int32(rec, base + 44),
    flagDouble: int16(rec, base + 56),
    result,
    equityNoDouble: float32(rec, base + 88),
    equityDoubleTake: float32(rec, base + 92),
    equityDrop: float32(rec, base + 96),
    resultDouble
  };
}

function blackRateFromActive(activePlayer, activeRate){
  if(!Number.isFinite(activeRate)) return null;
  return activePlayer === 1 ? activeRate : 100 - activeRate;
}

function clampRate(v){ return Math.max(0, Math.min(100, v)); }

function parseHeaderMatch(rec){
  const version = int32(rec, 552);
  const ansi1 = readShortString(rec, 9, 40);
  const ansi2 = readShortString(rec, 50, 40);
  const matchLength = int32(rec, 92);
  const date = delphiDateToIso(float64(rec, 128));
  let event = '';
  let player1 = ansi1;
  let player2 = ansi2;
  let location = '';
  let round = '';
  if(version >= 24){
    event = readUtf16Fixed(rec, 622, 129);
    player1 = readUtf16Fixed(rec, 880, 129) || ansi1;
    player2 = readUtf16Fixed(rec, 1138, 129) || ansi2;
    location = readUtf16Fixed(rec, 1396, 129);
    round = readUtf16Fixed(rec, 1654, 129);
  }
  return {version, matchLength, date, event, player1, player2, location, round};
}

function parseGameHeader(rec, version){
  const score1 = int32(rec, 12);
  const score2 = int32(rec, 16);
  const crawford = uint8(rec, 20) !== 0;
  const pos = readPosition(rec, 21);
  const gameNumber = int32(rec, 48);
  const autoDoubles = version >= 26 ? int32(rec, 64) : 0;
  return {score1, score2, crawford, pos, gameNumber, autoDoubles};
}

function parseMove(rec, version){
  const positionI = readPosition(rec, 9);
  const positionEnd = readPosition(rec, 35);
  const activePlayer = int32(rec, 64);
  const moveRaw = [];
  for(let i=0;i<8;i++) moveRaw.push(int32(rec, 68 + i*4));
  const dice = [int32(rec,100), int32(rec,104)];
  const cubeCode = int32(rec,108);
  const best = parseBestMoveEngine(rec,124);
  const errMove = float64(rec,2312);
  const errLuck = float64(rec,2320);
  const initEq = float64(rec,2336);
  let playedIndex = best.candidates.findIndex(c => samePosition(c.pos, positionEnd));
  if(playedIndex < 0) playedIndex = 0;

  // PositionI / Cube.Position are always treated as the canonical board.
  // PositionEnd uses XG's active-player orientation for player -1, so the
  // replay board is rebuilt from the actual move sequence instead of trusting
  // the raw end-position orientation.
  const beforePosition = normalizeStoredPosition(positionI);
  const applied = applyCheckerMove(beforePosition, activePlayer, moveRaw);
  const expectedEnd = normalizeMoveEndPosition(positionEnd, activePlayer);
  const move = formatCheckerMove(moveRaw, beforePosition, activePlayer);

  const isDance = !applied.segments.length;
  for(const candidate of best.candidates){
    if(isDance && samePosition(candidate.pos, positionEnd)){
      candidate.move = 'Dance';
    }else{
      candidate.move = formatCheckerMove(candidate.moveRaw, beforePosition, activePlayer);
    }
  }

  return {
    positionI,positionEnd,activePlayer,moveRaw,move,dice,cubeCode,best,playedIndex,
    errMove,errLuck,initEq,beforePosition,afterPosition:applied.position,expectedEnd
  };
}

function parseCube(rec){
  const activePlayer = int32(rec,12);
  const doubleAction = int32(rec,16);
  const take = int32(rec,20);
  const beaver = int32(rec,24);
  const raccoon = int32(rec,28);
  const cubeCode = int32(rec,32);
  const position = readPosition(rec,36);
  const analysis = parseDoubleEngine(rec,64);
  const errCube = float64(rec,200);
  const errTake = float64(rec,216);
  return {activePlayer,doubleAction,take,beaver,raccoon,cubeCode,position,analysis,errCube,errTake};
}

function parseFooterGame(rec){
  return {
    score1:int32(rec,12),
    score2:int32(rec,16),
    crawfordNext:uint8(rec,20)!==0,
    winner:int32(rec,24),
    pointsWon:int32(rec,28),
    termination:int32(rec,32)
  };
}

function parseGameRecords(gameBuf){
  if(gameBuf.length % RECORD_SIZE !== 0) throw new Error('Unexpected temp.xg record length');
  const records = [];
  let version = -1;
  let match = null;
  for(let off=0, index=0; off<gameBuf.length; off+=RECORD_SIZE,index++){
    const rec = gameBuf.subarray(off, off + RECORD_SIZE);
    const type = uint8(rec,8);
    if(type === 0){
      const data = parseHeaderMatch(rec);
      version = data.version;
      match = data;
      records.push({type:'matchHeader', index, ...data});
    }else if(type === 1){
      records.push({type:'gameHeader', index, ...parseGameHeader(rec,version)});
    }else if(type === 2){
      records.push({type:'cube', index, ...parseCube(rec)});
    }else if(type === 3){
      records.push({type:'move', index, ...parseMove(rec,version)});
    }else if(type === 4){
      records.push({type:'gameFooter', index, ...parseFooterGame(rec)});
    }else if(type === 5){
      records.push({type:'matchFooter', index, score1:int32(rec,12), score2:int32(rec,16), winner:int32(rec,20)});
    }
  }
  if(!match) throw new Error('Match header not found');
  return {match, records};
}

function stateWinRate(activePlayer, activeRate, fallbackBlack){
  const b = blackRateFromActive(activePlayer, activeRate);
  const black = Number.isFinite(b) ? clampRate(b) : clampRate(fallbackBlack ?? 50);
  return {black, white:100-black};
}

function buildTimeline(parsed, sourceFile){
  const states = [];
  let gameNumber = 0;
  let score = [0,0];
  let lastBlackRate = 50;
  let lastPosition = null;
  let lastCube = {value:1,owner:0};

  const recs = parsed.records;
  for(let i=0;i<recs.length;i++){
    const r = recs[i];
    if(r.type === 'gameHeader'){
      gameNumber = r.gameNumber;
      score = [r.score1,r.score2];
      lastPosition = normalizeStoredPosition(r.pos);
      lastCube = {value: 2 ** Math.max(0,r.autoDoubles || 0), owner:0};
      lastBlackRate = 50;
      states.push({
        phase:'gameStart', gameNumber, score:[...score], activePlayer:0,
        position:lastPosition, dice:null, cube:lastCube,
        winRate:{black:lastBlackRate,white:100-lastBlackRate},
        analysis:{type:'none'}, historyEvent:null
      });
      continue;
    }

    if(r.type === 'cube'){
      const position = normalizeStoredPosition(r.position);
      const activeRate = r.analysis && r.analysis.result ? r.analysis.result[3] * 100 : null;
      let winRate = stateWinRate(r.activePlayer, activeRate, lastBlackRate);
      if(r.analysis.result.every(v => v === 0)) winRate = {black:lastBlackRate,white:100-lastBlackRate};
      const cube = {value:cubeValueFromCode(r.cubeCode),owner:cubeOwnerFromCode(r.cubeCode,r.activePlayer)};

      if(r.doubleAction === 1){
        const action = r.take === 1 ? 'Double / Take' : (r.take === 0 ? 'Double / Pass' : 'Double');
        const candidates = [
          {move:'Double / Take', equity:r.analysis.equityDoubleTake},
          {move:'No Double', equity:r.analysis.equityNoDouble},
          {move:'Double / Pass', equity:r.analysis.equityDrop}
        ].sort((a,b)=>b.equity-a.equity);
        const bestEq = candidates[0]?.equity ?? 0;
        for(const c of candidates) c.error = c.equity - bestEq;
        states.push({
          phase:'cube',gameNumber,score:[...score],activePlayer:r.activePlayer,
          position,dice:null,cube,winRate,
          analysis:{type:'moves',candidates},
          historyEvent:{player:r.activePlayer===1?'black':'white',dice:null,move:action,error:r.errCube,kind:'cube'}
        });
      }else{
        // Pre-roll state. Peek at the upcoming move to classify the actual roll as joker/anti-joker.
        const next = recs[i+1];
        const joker = [];
        const antiJoker = [];
        if(next && next.type === 'move' && next.activePlayer === r.activePlayer && next.best.candidates.length){
          const played = next.best.candidates[next.playedIndex] || next.best.candidates[0];
          const before = r.analysis.result[3] * 100;
          const after = played.winRate;
          if(Number.isFinite(before) && Number.isFinite(after) && before > 0){
            const delta = after - before;
            if(delta >= JOKER_WINRATE_THRESHOLD) joker.push(next.dice);
            if(delta <= -JOKER_WINRATE_THRESHOLD) antiJoker.push(next.dice);
          }
        }
        states.push({
          phase:'preRoll',gameNumber,score:[...score],activePlayer:r.activePlayer,
          position,dice:null,cube,winRate,
          analysis:{type:'jokers',joker,antiJoker,thresholdWinRatePoints:JOKER_WINRATE_THRESHOLD},
          historyEvent:null
        });
      }
      lastPosition = position;
      lastCube = cube;
      lastBlackRate = winRate.black;
      continue;
    }

    if(r.type === 'move'){
      const played = r.best.candidates[r.playedIndex] || r.best.candidates[0] || null;
      const activeRate = played ? played.winRate : null;
      const winRate = stateWinRate(r.activePlayer,activeRate,lastBlackRate);
      const candidates = r.best.candidates.slice(0,10).map(c => ({
        move:c.move,
        equity:c.equity,
        error:c.equity - (r.best.candidates[0]?.equity ?? c.equity),
        winRate:c.winRate
      }));
      const beforePosition = r.beforePosition || normalizeStoredPosition(r.positionI);
      const afterPosition = r.afterPosition || applyCheckerMove(beforePosition,r.activePlayer,r.moveRaw).position;
      const cube = {value:cubeValueFromCode(r.cubeCode),owner:cubeOwnerFromCode(r.cubeCode,r.activePlayer)};

      // Every checker play is presented as four fixed broadcast beats:
      // joker -> roll -> analysis -> move. If the XG stream did not contain
      // a pre-roll cube record, add an empty joker beat so the cadence stays fixed.
      const previous = states[states.length - 1];
      if(!(previous && previous.phase === 'preRoll' && previous.gameNumber === gameNumber && previous.activePlayer === r.activePlayer)){
        states.push({
          phase:'preRoll',gameNumber,score:[...score],activePlayer:r.activePlayer,
          position:beforePosition,dice:null,cube,winRate:{black:lastBlackRate,white:100-lastBlackRate},
          analysis:{type:'jokers',joker:[],antiJoker:[],thresholdWinRatePoints:JOKER_WINRATE_THRESHOLD},
          historyEvent:null
        });
      }

      states.push({
        phase:'roll',gameNumber,score:[...score],activePlayer:r.activePlayer,
        position:beforePosition,dice:r.dice,cube,winRate,
        analysis:{type:'none'},historyEvent:null
      });
      states.push({
        phase:'analysis',gameNumber,score:[...score],activePlayer:r.activePlayer,
        position:beforePosition,dice:r.dice,cube,winRate,
        analysis:{type:'moves',candidates,playedIndex:r.playedIndex},historyEvent:null
      });
      states.push({
        phase:'move',gameNumber,score:[...score],activePlayer:r.activePlayer,
        position:afterPosition,dice:r.dice,cube,winRate,
        analysis:{type:'none'},
        historyEvent:{player:r.activePlayer===1?'black':'white',dice:r.dice,move:r.move,error:r.errMove,kind:'move'}
      });
      lastPosition = afterPosition;
      lastCube = cube;
      lastBlackRate = winRate.black;
      continue;
    }

    if(r.type === 'gameFooter'){
      score = [r.score1,r.score2];
      states.push({
        phase:'gameEnd',gameNumber,score:[...score],activePlayer:0,
        position:lastPosition,dice:null,cube:lastCube,
        winRate:{black:lastBlackRate,white:100-lastBlackRate},analysis:{type:'none'},historyEvent:null
      });
    }
  }

  return {
    schemaVersion:2,
    sourceFile,
    generatedAt:new Date().toISOString(),
    match:{...parsed.match, blackSourcePlayer:parsed.match.player1, whiteSourcePlayer:parsed.match.player2},
    states
  };
}

function parseXgBuffer(raw, sourceFile='match.xg'){
  const arc = extractArchive(raw);
  const game = arc.files['temp.xg'];
  if(!game) throw new Error('temp.xg not found in XG archive');
  const parsed = parseGameRecords(game);
  return buildTimeline(parsed,sourceFile);
}

function parseXgFile(filename){
  return parseXgBuffer(fs.readFileSync(filename), path.basename(filename));
}

module.exports = {parseXgBuffer,parseXgFile,JOKER_WINRATE_THRESHOLD};
