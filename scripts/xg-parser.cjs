const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const RECORD_SIZE = 2560;
const JOKER_EQUITY_THRESHOLD = 0.300;
const JOKER_WINRATE_THRESHOLD = JOKER_EQUITY_THRESHOLD; // legacy export name

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
  const blackBar = Math.max(0, Number(pos[25] || 0));
  const whiteBar = Math.max(0, -Number(pos[0] || 0));
  const blackOnBoard = points.slice(1).reduce((sum,v)=>sum+Math.max(0,Number(v)||0),0) + blackBar;
  const whiteOnBoard = points.slice(1).reduce((sum,v)=>sum+Math.max(0,-(Number(v)||0)),0) + whiteBar;
  return {
    points,
    blackBar,
    whiteBar,
    blackOff: Math.max(0, 15 - blackOnBoard),
    whiteOff: Math.max(0, 15 - whiteOnBoard)
  };
}

function normalizeMoveEndPosition(pos, activePlayer){
  if(activePlayer === 1) return normalizeStoredPosition(pos);
  const points = Array(25).fill(0);
  for(let p=1;p<=24;p++) points[25 - p] = -Number(pos[p] || 0);
  const blackBar = Math.max(0, -Number(pos[0] || 0));
  const whiteBar = Math.max(0, Number(pos[25] || 0));
  const blackOnBoard = points.slice(1).reduce((sum,v)=>sum+Math.max(0,Number(v)||0),0) + blackBar;
  const whiteOnBoard = points.slice(1).reduce((sum,v)=>sum+Math.max(0,-(Number(v)||0)),0) + whiteBar;
  return {
    points,
    blackBar,
    whiteBar,
    blackOff: Math.max(0, 15 - blackOnBoard),
    whiteOff: Math.max(0, 15 - whiteOnBoard)
  };
}

function cloneBoardPosition(position){
  return {
    points: (position?.points || Array(25).fill(0)).slice(),
    blackBar: Number(position?.blackBar || 0),
    whiteBar: Number(position?.whiteBar || 0),
    blackOff: Number(position?.blackOff || 0),
    whiteOff: Number(position?.whiteOff || 0)
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
    }else{
      if(sign === 1) board.blackOff += 1;
      else board.whiteOff += 1;
    }

    segments.push({from,to,source,destination,hit});
  }

  return {position:board,segments};
}

function formatCheckerMove(raw, beforePosition, activePlayer){
  const applied = applyCheckerMove(beforePosition, activePlayer, raw);
  if(!applied.segments.length) return 'Cannot Move';

  // XG式ムーブ表記。
  // - Bar は先頭大文字、bear-off は off。
  // - 同一チェッカーの連続移動は、途中でヒットしていなければ1本にまとめる。
  //   例: 24/20 20/16 -> 24/16、Bar/20 20/15 -> Bar/15。
  // - 途中でヒットした場合は経路を分ける。
  //   例: Bar/21* 21/15*。
  // - 同一路線は (2)(3) のようにまとめ、いずれかがヒットなら * を付ける。
  // 盤面アニメーション用の applied.segments 自体は変更しない。
  const paths=[];
  for(const seg of applied.segments){
    // 同じ地点に到達済みの経路が複数ある場合、XG表記に近づけるため
    // 先に到達した経路を優先する。最初の到達がヒットなら連結しない。
    const firstEnding=paths.find(path=>path.to===seg.from && path.to>=0);
    if(firstEnding && !firstEnding.lastHit){
      firstEnding.to=seg.to;
      firstEnding.hit=Boolean(seg.hit);
      firstEnding.lastHit=Boolean(seg.hit);
      firstEnding.steps+=1;
    }else{
      paths.push({
        from:seg.from,
        to:seg.to,
        hit:Boolean(seg.hit),
        lastHit:Boolean(seg.hit),
        steps:1
      });
    }
  }

  const pointText=value=>{
    if(value===24) return 'Bar';
    if(value<0) return 'off';
    return String(value+1);
  };
  const sourceSortValue=value=>value===24?100:value+1;
  const destinationSortValue=value=>value<0?0:value+1;

  // XGと同様に Bar を最優先し、その後は大きい起点から並べる。
  // 同一起点では大きい着点（短い移動）を先にする。
  paths.sort((a,b)=>{
    const sourceDiff=sourceSortValue(b.from)-sourceSortValue(a.from);
    if(sourceDiff) return sourceDiff;
    const destinationDiff=destinationSortValue(b.to)-destinationSortValue(a.to);
    if(destinationDiff) return destinationDiff;
    return 0;
  });

  const compact=[];
  for(const path of paths){
    const route=`${pointText(path.from)}/${pointText(path.to)}`;
    const last=compact[compact.length-1];
    if(last && last.route===route){
      last.count+=1;
      last.hit=last.hit||path.hit;
    }else{
      compact.push({route,count:1,hit:path.hit});
    }
  }

  return compact.map(item=>`${item.route}${item.hit?'*':''}${item.count>1?`(${item.count})`:''}`).join(' ');
}

function positionKey(position,activePlayer){
  const pts=(position?.points||[]).slice(1,25).join(',');
  return `${activePlayer}|${pts}|${Number(position?.blackBar||0)}|${Number(position?.whiteBar||0)}|${Number(position?.blackOff||0)}|${Number(position?.whiteOff||0)}`;
}

function countChecker(position,player,point){
  const v=Number(position?.points?.[point]||0);
  return player===1?Math.max(0,v):Math.max(0,-v);
}
function barCount(position,player){return player===1?Number(position?.blackBar||0):Number(position?.whiteBar||0);}
function offCount(position,player){return player===1?Number(position?.blackOff||0):Number(position?.whiteOff||0);}
function isBlocked(position,player,point){
  const v=Number(position?.points?.[point]||0);
  return player===1?v<=-2:v>=2;
}
function allInHome(position,player){
  if(barCount(position,player)>0)return false;
  if(player===1){
    for(let p=7;p<=24;p++)if(countChecker(position,player,p)>0)return false;
  }else{
    for(let p=1;p<=18;p++)if(countChecker(position,player,p)>0)return false;
  }
  return true;
}
function hasNoRollOpportunity(position,player){
  // ロール前の盤面だけで、1〜6のどの目が出ても最初の1手を合法に動かせない場合は
  // 「そもそもロール機会がない」状態として扱う。典型例はバー上の駒が
  // 相手の6ポイントクローズアウトで完全に閉じ込められているケース。
  // singleDieMoves はバー優先・ブロック・ベアオフ条件を含むため、
  // クローズアウト以外でも全ての出目で合法手が0なら同じ判定になる。
  return [1,2,3,4,5,6].every(die=>singleDieMoves(position,player,die).length===0);
}

function isNoContact(position){
  // Player 1 moves 24 -> 1, Player 2 moves 1 -> 24.
  // バー上に駒がなく、Player 1 の最後尾が Player 2 の最後尾を完全に通過したらノーコンタクト。
  if(barCount(position,1)>0||barCount(position,-1)>0)return false;
  let blackBack=0;
  let whiteBack=25;
  for(let p=1;p<=24;p++){
    if(countChecker(position,1,p)>0)blackBack=Math.max(blackBack,p);
    if(countChecker(position,-1,p)>0)whiteBack=Math.min(whiteBack,p);
  }
  if(blackBack===0||whiteBack===25)return true;
  return blackBack<whiteBack;
}
function canBearOffFrom(position,player,point,die){
  if(!allInHome(position,player))return false;
  if(player===1){
    if(point===die)return true;
    if(point>die)return false;
    for(let p=point+1;p<=6;p++)if(countChecker(position,player,p)>0)return false;
    return true;
  }
  const distance=25-point;
  if(distance===die)return true;
  if(distance>die)return false;
  for(let p=19;p<point;p++)if(countChecker(position,player,p)>0)return false;
  return true;
}
function applyGeneratedMove(position,player,source,destination){
  const board=cloneBoardPosition(position),sign=player===1?1:-1;
  if(source==='bar'){
    if(player===1)board.blackBar=Math.max(0,board.blackBar-1);else board.whiteBar=Math.max(0,board.whiteBar-1);
  }else board.points[source]-=sign;
  if(destination==='off'){
    if(player===1)board.blackOff+=1;else board.whiteOff+=1;
    return board;
  }
  if(player===1&&board.points[destination]===-1){board.points[destination]=0;board.whiteBar+=1;}
  else if(player===-1&&board.points[destination]===1){board.points[destination]=0;board.blackBar+=1;}
  board.points[destination]+=sign;
  return board;
}
function singleDieMoves(position,player,die){
  const out=[];
  const bar=barCount(position,player);
  if(bar>0){
    const destination=player===1?25-die:die;
    if(destination>=1&&destination<=24&&!isBlocked(position,player,destination))out.push(applyGeneratedMove(position,player,'bar',destination));
    return out;
  }
  for(let p=1;p<=24;p++){
    if(countChecker(position,player,p)<=0)continue;
    const destination=player===1?p-die:p+die;
    if(destination>=1&&destination<=24){
      if(!isBlocked(position,player,destination))out.push(applyGeneratedMove(position,player,p,destination));
    }else if(canBearOffFrom(position,player,p,die))out.push(applyGeneratedMove(position,player,p,'off'));
  }
  return out;
}
function generatedPositionKey(position){return `${(position.points||[]).slice(1,25).join(',')}|${position.blackBar}|${position.whiteBar}|${position.blackOff}|${position.whiteOff}`;}
function generateRollPositions(position,player,d1,d2){
  const orders=d1===d2?[[d1,d1,d1,d1]]:[[d1,d2],[d2,d1]];
  const terminals=[];
  for(const dice of orders){
    const walk=(board,idx,used)=>{
      if(idx>=dice.length){terminals.push({position:board,used:[...used]});return;}
      const die=dice[idx],moves=singleDieMoves(board,player,die);
      if(!moves.length){walk(board,idx+1,used);return;}
      for(const next of moves)walk(next,idx+1,[...used,die]);
    };
    walk(cloneBoardPosition(position),0,[]);
  }
  let maxUsed=0;for(const t of terminals)maxUsed=Math.max(maxUsed,t.used.length);
  let filtered=terminals.filter(t=>t.used.length===maxUsed);
  if(d1!==d2&&maxUsed===1){
    const high=Math.max(d1,d2);
    if(filtered.some(t=>t.used[0]===high))filtered=filtered.filter(t=>t.used[0]===high);
  }
  const unique=new Map();
  for(const t of filtered){const key=generatedPositionKey(t.position);if(!unique.has(key))unique.set(key,t.position);}
  return unique.size?[...unique.values()]:[cloneBoardPosition(position)];
}
function pipCount(position,player){
  let total=barCount(position,player)*25;
  for(let p=1;p<=24;p++){
    const n=countChecker(position,player,p);
    total+=n*(player===1?p:25-p);
  }
  return total;
}
function madeHomePoints(position,player){
  let n=0;
  if(player===1){for(let p=1;p<=6;p++)if(countChecker(position,player,p)>=2)n++;}
  else{for(let p=19;p<=24;p++)if(countChecker(position,player,p)>=2)n++;}
  return n;
}
function blotCount(position,player){let n=0;for(let p=1;p<=24;p++)if(countChecker(position,player,p)===1)n++;return n;}

// Backgammon Ace風シチュエーション判定。
// 実際に記録されたロール／着手だけを対象とし、予測候補からは発火させない。
const ACHIEVEMENT_LABELS={
  fullPrime:'フルプライム',
  semiPrime:'セミプライム',
  closeOut:'クローズアウト',
  backgame:'バックゲーム',
  anchor3:'3アンカーバックゲーム',
  anchor4:'4アンカーバックゲーム',
  anchor5:'5アンカーバックゲーム',
  doubleHit:'ダブルヒット',
  tripleHit:'トリプルヒット',
  quadrupleHit:'クアドラプルヒット',
  hitAndCover:'ヒット・アンド・カバー',
  bananaSplit:'バナナスプリット',
  loversLeap:'ラバーズリープ',
  candlesticks:'キャンドルスティックス',
  dance66:'66ダンス',
  blitz55:'55ブリッツ'
};
function achievement(id){return {id,label:ACHIEVEMENT_LABELS[id]||id};}
function relativePointToCanonical(player,relativePoint){return player===1?relativePoint:25-relativePoint;}
function relativeCheckerCount(position,player,relativePoint){
  return countChecker(position,player,relativePointToCanonical(player,relativePoint));
}
function isMadeRelativePoint(position,player,relativePoint){return relativeCheckerCount(position,player,relativePoint)>=2;}
function hasConsecutiveMadePoints(position,player,length){
  let run=0;
  for(let relative=1;relative<=24;relative++){
    if(isMadeRelativePoint(position,player,relative)){
      run+=1;
      if(run>=length)return true;
    }else run=0;
  }
  return false;
}
function hasTrappingPrime(position,player,length){
  // セミ／フルプライムは「そのプライムの後ろ」に相手駒が1枚以上いる時だけ成立。
  // player の相対座標では、相手は 1 -> 24 方向へ進むため、
  // プライム開始点より小さい側（またはバー上）が「後ろ」にあたる。
  let run=0,runStart=0;
  for(let relative=1;relative<=24;relative++){
    if(isMadeRelativePoint(position,player,relative)){
      if(run===0)runStart=relative;
      run+=1;
      if(run>=length){
        if(barCount(position,-player)>0)return true;
        for(let behindRelative=1;behindRelative<runStart;behindRelative++){
          const canonical=relativePointToCanonical(player,behindRelative);
          if(countChecker(position,-player,canonical)>0)return true;
        }
      }
    }else{
      run=0;
      runStart=0;
    }
  }
  return false;
}
function isCloseOutPosition(position,player){
  if(barCount(position,-player)<=0)return false;
  for(let relative=1;relative<=6;relative++)if(!isMadeRelativePoint(position,player,relative))return false;
  return true;
}
function opponentHomeAnchorCount(position,player){
  let anchors=0;
  for(let relative=19;relative<=24;relative++)if(isMadeRelativePoint(position,player,relative))anchors+=1;
  return anchors;
}
function isBackgamePosition(position,player){
  return opponentHomeAnchorCount(position,player)>=2 && (pipCount(position,player)-pipCount(position,-player))>=30;
}
function candlestickPointCount(position,player){
  let towers=0;
  for(let relative=1;relative<=24;relative++)if(relativeCheckerCount(position,player,relative)>=6)towers+=1;
  return towers;
}
function isCandlesticksPosition(position,player){return candlestickPointCount(position,player)>=2;}
function ownHomeCanonicalPoint(player,point){
  if(!Number.isInteger(point))return false;
  return player===1 ? point>=1&&point<=6 : point>=19&&point<=24;
}
function hitAndCoverOccurred(beforePosition,afterPosition,player,segments){
  const hits=(segments||[]).map((seg,index)=>({seg,index})).filter(item=>item.seg?.hit && Number.isInteger(item.seg?.destination));
  for(const {seg:hitSeg,index} of hits){
    for(let j=index+1;j<(segments||[]).length;j++){
      const next=segments[j];
      if(next?.source!==hitSeg.destination || !Number.isInteger(next?.destination))continue;
      // ヒットした同じ駒を続けて動かし、着手前に1枚だった自駒をカバー。
      if(countChecker(beforePosition,player,next.destination)===1 && countChecker(afterPosition,player,next.destination)>=2)return true;
    }
  }
  return false;
}
function bananaSplitOccurred(beforePosition,afterPosition,player,segments){
  const list=Array.isArray(segments)?segments:[];
  if(!list.some(seg=>seg?.hit))return false;

  // Backgammon Aceの定義に合わせ、
  // 「自分のインナーボードのメイドポイントを壊したその駒」が
  // 自分のインナーボード内でルースヒットし、結果として
  // 元ポイントとヒット先の2か所がブロットになる場合だけ成立。
  for(let i=0;i<list.length;i++){
    const first=list[i];
    const origin=first?.source;
    if(!Number.isInteger(origin) || !ownHomeCanonicalPoint(player,origin))continue;
    if(countChecker(beforePosition,player,origin)<2)continue;
    if(countChecker(afterPosition,player,origin)!==1)continue;

    let previousDestination=null;
    for(let j=i;j<list.length;j++){
      const seg=list[j];
      if(j===i){
        if(seg?.source!==origin)break;
      }else{
        if(seg?.source!==previousDestination)break;
      }
      previousDestination=seg?.destination;
      if(!seg?.hit || !Number.isInteger(seg.destination))continue;
      if(!ownHomeCanonicalPoint(player,seg.destination))continue;
      if(countChecker(afterPosition,player,seg.destination)!==1)continue;
      return true;
    }
  }
  return false;
}
function isLoversLeap(dice,move,moveNumber){
  if(moveNumber!==1 || !Array.isArray(dice))return false;
  const sorted=dice.map(Number).sort((a,b)=>a-b);
  return sorted[0]===5 && sorted[1]===6 && /(?:^|\s)24\/13(?:\s|$|\*)/.test(String(move||''));
}
function is66Dance(beforePosition,player,dice,segments){
  if(barCount(beforePosition,player)<=0 || !Array.isArray(dice) || Number(dice[0])!==6 || Number(dice[1])!==6)return false;
  // 66ダンスは、相手インナーで「6ポイントだけ」がブロックされている場合に限定。
  // 1〜5はエンター可能で、6だけエンター不能であることを確認する。
  const sixBlocked=singleDieMoves(beforePosition,player,6).length===0;
  const oneToFiveOpen=[1,2,3,4,5].every(die=>singleDieMoves(beforePosition,player,die).length>0);
  return sixBlocked && oneToFiveOpen && !(segments||[]).length;
}
function pointOnRelativePoint(beforePosition,afterPosition,player,segments,relativePoint){
  const point=relativePointToCanonical(player,relativePoint);
  const hit=(segments||[]).some(seg=>seg?.hit && seg?.destination===point);
  return hit
    && countChecker(beforePosition,-player,point)===1
    && !isMadeRelativePoint(beforePosition,player,relativePoint)
    && isMadeRelativePoint(afterPosition,player,relativePoint);
}
function is55Blitz(beforePosition,afterPosition,player,dice,playerTurnNumber,segments){
  if(playerTurnNumber!==2 && playerTurnNumber!==3)return false;
  if(!Array.isArray(dice) || Number(dice[0])!==5 || Number(dice[1])!==5)return false;
  // Backgammon Aceの55 BLITZは、各プレイヤー自身の2手目または3手目の55で、
  // 1ポイントと3ポイントの両方を「ポイントオン（ヒットしつつポイントを作る）」して成立。
  return pointOnRelativePoint(beforePosition,afterPosition,player,segments,1)
    && pointOnRelativePoint(beforePosition,afterPosition,player,segments,3);
}
function detectAchievements({beforePosition,afterPosition,player,dice,segments,move,moveNumber,playerTurnNumber}){
  const out=[];
  const push=id=>out.push(achievement(id));

  const semiBefore=hasConsecutiveMadePoints(beforePosition,player,5) && hasTrappingPrime(beforePosition,player,5);
  const semiAfter=hasConsecutiveMadePoints(afterPosition,player,5) && hasTrappingPrime(afterPosition,player,5);
  const fullBefore=hasConsecutiveMadePoints(beforePosition,player,6) && hasTrappingPrime(beforePosition,player,6);
  const fullAfter=hasConsecutiveMadePoints(afterPosition,player,6) && hasTrappingPrime(afterPosition,player,6);
  const closeOutBefore=isCloseOutPosition(beforePosition,player);
  const closeOutAfter=isCloseOutPosition(afterPosition,player);
  // プライム系は上位互換を1件だけ表示:
  // クローズアウト > フルプライム > セミプライム
  if(!closeOutBefore&&closeOutAfter)push('closeOut');
  else if(!fullBefore&&fullAfter)push('fullPrime');
  else if(!semiBefore&&semiAfter)push('semiPrime');

  const anchorsBefore=opponentHomeAnchorCount(beforePosition,player);
  const anchorsAfter=opponentHomeAnchorCount(afterPosition,player);
  const backgameBefore=isBackgamePosition(beforePosition,player);
  const backgameAfter=isBackgamePosition(afterPosition,player);
  // アンカー系も、そのロールで新たに成立した最上位だけを表示:
  // 5アンカー > 4アンカー > 3アンカー > バックゲーム
  if(anchorsBefore<5&&anchorsAfter>=5)push('anchor5');
  else if(anchorsBefore<4&&anchorsAfter>=4)push('anchor4');
  else if(anchorsBefore<3&&anchorsAfter>=3)push('anchor3');
  else if(!backgameBefore&&backgameAfter)push('backgame');

  const hitCount=(segments||[]).reduce((sum,seg)=>sum+(seg?.hit?1:0),0);
  if(hitCount>=4)push('quadrupleHit');
  else if(hitCount===3)push('tripleHit');
  else if(hitCount===2)push('doubleHit');
  if(hitAndCoverOccurred(beforePosition,afterPosition,player,segments))push('hitAndCover');
  if(bananaSplitOccurred(beforePosition,afterPosition,player,segments))push('bananaSplit');
  if(isLoversLeap(dice,move,moveNumber))push('loversLeap');
  if(!isCandlesticksPosition(beforePosition,player)&&isCandlesticksPosition(afterPosition,player))push('candlesticks');
  if(is66Dance(beforePosition,player,dice,segments))push('dance66');
  if(is55Blitz(beforePosition,afterPosition,player,dice,playerTurnNumber,segments))push('blitz55');
  return out;
}
function staticEquityProxy(position,player){
  const opp=-player;
  const pipAdv=pipCount(position,opp)-pipCount(position,player);
  const offAdv=offCount(position,player)-offCount(position,opp);
  const barAdv=barCount(position,opp)-barCount(position,player);
  const homeAdv=madeHomePoints(position,player)-madeHomePoints(position,opp);
  const blotAdv=blotCount(position,opp)-blotCount(position,player);
  return 0.008*pipAdv+0.10*offAdv+0.16*barAdv+0.03*homeAdv+0.02*blotAdv;
}
function contextOutcomeEquity(context,player){
  const blackW=Number(context?.winRate?.black),whiteW=Number(context?.winRate?.white);
  if(!Number.isFinite(blackW)||!Number.isFinite(whiteW))return NaN;
  const activeW=(player===1?blackW:whiteW)/100;
  const activeG=Number(player===1?context?.gammonRate?.black:context?.gammonRate?.white)||0;
  const oppG=Number(player===1?context?.gammonRate?.white:context?.gammonRate?.black)||0;
  const activeBG=Number(player===1?context?.backgammonRate?.black:context?.backgammonRate?.white)||0;
  const oppBG=Number(player===1?context?.backgammonRate?.white:context?.backgammonRate?.black)||0;
  return (2*activeW-1)+(activeG+activeBG-oppG-oppBG)/100;
}
function terminalPointValue(position,winner){
  const loser=-winner;
  if(offCount(position,winner)<15)return null;
  if(offCount(position,loser)>0)return 1;
  let loserInWinnersHome=barCount(position,loser)>0;
  if(!loserInWinnersHome){
    if(winner===1){for(let p=1;p<=6;p++)if(countChecker(position,loser,p)>0){loserInWinnersHome=true;break;}}
    else{for(let p=19;p<=24;p++)if(countChecker(position,loser,p)>0){loserInWinnersHome=true;break;}}
  }
  return loserInWinnersHome?3:2;
}
function hitExposure(position,victim){
  const attacker=-victim,beforeBar=barCount(position,victim);
  let hitFaces=0;
  for(let die=1;die<=6;die++){
    const moves=singleDieMoves(position,attacker,die);
    if(moves.some(next=>barCount(next,victim)>beforeBar))hitFaces++;
  }
  const miss=(6-hitFaces)/6;
  return {hitFaces,probability:1-miss*miss,blots:blotCount(position,victim)};
}
function postRollEquityProxy(position,player,basePosition,context){
  const terminal=terminalPointValue(position,player);
  if(terminal!==null)return terminal;
  const opp=-player;
  const baseEq=contextOutcomeEquity(context,player);
  if(!Number.isFinite(baseEq))return staticEquityProxy(position,player);
  const baseExposure=hitExposure(basePosition,player);
  const nextExposure=hitExposure(position,player);
  const pipGain=pipCount(basePosition,player)-pipCount(position,player);
  const offGain=offCount(position,player)-offCount(basePosition,player);
  const oppBarGain=barCount(position,opp)-barCount(basePosition,opp);
  const ownBarReduction=barCount(basePosition,player)-barCount(position,player);
  const homeGain=madeHomePoints(position,player)-madeHomePoints(basePosition,player);
  const activeG=(Number(player===1?context?.gammonRate?.black:context?.gammonRate?.white)||0)/100;
  const oppG=(Number(player===1?context?.gammonRate?.white:context?.gammonRate?.black)||0)/100;
  const activeBG=(Number(player===1?context?.backgammonRate?.black:context?.backgammonRate?.white)||0)/100;
  const oppBG=(Number(player===1?context?.backgammonRate?.white:context?.backgammonRate?.black)||0)/100;
  const outcomeLeverage=Math.min(1,activeG+oppG+activeBG+oppBG);
  const exposureWeight=0.35+0.65*outcomeLeverage;
  return baseEq
    +0.006*pipGain
    +0.04*offGain
    +0.10*oppBarGain
    +0.10*ownBarReduction
    +0.03*homeGain
    -exposureWeight*(nextExposure.probability-baseExposure.probability)
    -0.05*(nextExposure.blots-baseExposure.blots);
}
const jokerRollCache=new Map();
const FACE_ALERT_MIN_DIFF_POINTS=8;
const FACE_ALERT_MIN_GAP_POINTS=3;
const FACE_CHANCE_MIN_WINRATE=30;
const FACE_PINCH_MAX_WINRATE=70;
function clampPercent(value){return Math.max(0,Math.min(100,Number(value)||0));}
function activeWinRateFromContext(context,player){
  const value=Number(player===1?context?.winRate?.black:context?.winRate?.white);
  return Number.isFinite(value)?clampPercent(value):50;
}
function faceRelatedRolls(face){
  const rolls=[];
  for(let other=1;other<=6;other++)rolls.push([Math.max(face,other),Math.min(face,other)]);
  return rolls;
}
function isOutcomeLockedForJoker(context){
  const black=Number(context?.winRate?.black);
  const white=Number(context?.winRate?.white);
  const blackG=Math.abs(Number(context?.gammonRate?.black)||0);
  const whiteG=Math.abs(Number(context?.gammonRate?.white)||0);
  const winLocked=(Number.isFinite(black)&&Number.isFinite(white)) && (black>=99.95||black<=0.05||white>=99.95||white<=0.05);
  const gammonFlat=blackG<0.05&&whiteG<0.05;
  return winLocked&&gammonFlat;
}
function analyzeJokerRolls(position,activePlayer,context=null){
  // 「良い出目が多い」ではなく、1〜6の各面を含む11/36通りの平均を比較する。
  // チャンス／ピンチは最大1面ずつだけ表示し、単に「超悪い→少し悪い」になる面は
  // チャンス扱いしないよう、推定勝率の絶対条件も併用する。
  if(isOutcomeLockedForJoker(context)){
    return {joker:[],antiJoker:[],jokerFace:null,antiJokerFace:null,averageEquityProxy:null,source:'xg-outcome-locked'};
  }
  const contextKey=context?`${Number(context?.winRate?.black??NaN).toFixed(3)}|${Number(context?.gammonRate?.black??0).toFixed(3)}|${Number(context?.gammonRate?.white??0).toFixed(3)}|${Number(context?.backgammonRate?.black??0).toFixed(3)}|${Number(context?.backgammonRate?.white??0).toFixed(3)}`:'na';
  const key=`${positionKey(position,activePlayer)}|${contextKey}|face-v1`;
  if(jokerRollCache.has(key))return jokerRollCache.get(key);

  const rolls=[];
  let weighted=0,totalWeight=0;
  for(let hi=1;hi<=6;hi++)for(let lo=1;lo<=hi;lo++){
    const positions=generateRollPositions(position,activePlayer,hi,lo);
    let best=-Infinity;
    for(const next of positions)best=Math.max(best,postRollEquityProxy(next,activePlayer,position,context));
    if(!Number.isFinite(best))best=postRollEquityProxy(position,activePlayer,position,context);
    const weight=hi===lo?1:2;
    rolls.push({dice:[hi,lo],equity:best,weight});weighted+=best*weight;totalWeight+=weight;
  }
  const average=totalWeight?weighted/totalWeight:postRollEquityProxy(position,activePlayer,position,context);
  const activeWinRate=activeWinRateFromContext(context,activePlayer);
  const byKey=new Map(rolls.map(r=>[rollKey(r.dice),r]));
  const faceStats=[];
  for(let face=1;face<=6;face++){
    const related=faceRelatedRolls(face).map(d=>byKey.get(rollKey(d))).filter(Boolean);
    const faceWeight=related.reduce((sum,r)=>sum+r.weight,0);
    const faceAverage=faceWeight?related.reduce((sum,r)=>sum+r.equity*r.weight,0)/faceWeight:average;
    const diffPoints=(faceAverage-average)*50;
    const estimatedWinRate=clampPercent(activeWinRate+diffPoints);
    faceStats.push({face,averageEquity:faceAverage,diffPoints,estimatedWinRate});
  }
  const bestOrder=[...faceStats].sort((a,b)=>b.averageEquity-a.averageEquity||b.face-a.face);
  const worstOrder=[...faceStats].sort((a,b)=>a.averageEquity-b.averageEquity||b.face-a.face);
  const best=bestOrder[0],secondBest=bestOrder[1];
  const worst=worstOrder[0],secondWorst=worstOrder[1];
  const bestGapPoints=(best.averageEquity-secondBest.averageEquity)*50;
  const worstGapPoints=(secondWorst.averageEquity-worst.averageEquity)*50;

  const jokerFace=(best.diffPoints>=FACE_ALERT_MIN_DIFF_POINTS && bestGapPoints>=FACE_ALERT_MIN_GAP_POINTS && best.estimatedWinRate>=FACE_CHANCE_MIN_WINRATE)?best.face:null;
  const antiJokerFace=(-worst.diffPoints>=FACE_ALERT_MIN_DIFF_POINTS && worstGapPoints>=FACE_ALERT_MIN_GAP_POINTS && worst.estimatedWinRate<=FACE_PINCH_MAX_WINRATE)?worst.face:null;
  const joker=jokerFace?faceRelatedRolls(jokerFace):[];
  const antiJoker=antiJokerFace?faceRelatedRolls(antiJokerFace):[];
  const rollLuckByKey={};
  for(const r of rolls)rollLuckByKey[rollKey(r.dice)]=(r.equity-average)*50;

  const result={
    joker,antiJoker,jokerFace,antiJokerFace,
    averageEquityProxy:average,
    averageWinRateProxy:activeWinRate,
    faceStats:faceStats.map(v=>({face:v.face,diffPoints:Number(v.diffPoints.toFixed(3)),estimatedWinRate:Number(v.estimatedWinRate.toFixed(3))})),
    rollLuckByKey,
    thresholds:{minDiffPoints:FACE_ALERT_MIN_DIFF_POINTS,minGapPoints:FACE_ALERT_MIN_GAP_POINTS,chanceMinWinRate:FACE_CHANCE_MIN_WINRATE,pinchMaxWinRate:FACE_PINCH_MAX_WINRATE},
    source:'single-face-roll-evaluator'
  };
  jokerRollCache.set(key,result);return result;
}
function rollKey(dice){if(!Array.isArray(dice)||dice.length<2)return'';const a=Number(dice[0]),b=Number(dice[1]);return `${Math.max(a,b)}-${Math.min(a,b)}`;}
function classifyRollLuck(analysis,dice){
  const key=rollKey(dice);if(!key)return null;
  const face1=Number(dice?.[0]),face2=Number(dice?.[1]);
  const chanceFace=Number(analysis?.jokerFace)||null;
  const pinchFace=Number(analysis?.antiJokerFace)||null;
  if(chanceFace||pinchFace){
    const hasChance=Boolean(chanceFace&&(face1===chanceFace||face2===chanceFace));
    const hasPinch=Boolean(pinchFace&&(face1===pinchFace||face2===pinchFace));
    if(hasChance&&!hasPinch)return'joker';
    if(hasPinch&&!hasChance)return'antiJoker';
    if(hasChance&&hasPinch){
      const pairDiff=Number(analysis?.rollLuckByKey?.[key]);
      if(Number.isFinite(pairDiff)&&pairDiff>0)return'joker';
      if(Number.isFinite(pairDiff)&&pairDiff<0)return'antiJoker';
    }
    return null;
  }
  // 古い生成データとの互換性。
  if((analysis?.joker||[]).some(d=>rollKey(d)===key))return'joker';
  if((analysis?.antiJoker||[]).some(d=>rollKey(d)===key))return'antiJoker';
  return null;
}
function classifyActualRollLuck(errLuck){
  // 盤面上のチャンス／ピンチは、事前予測ではなくXGが記録した実際の
  // ロール・ラック（その出目のエクイティが平均的な出目からどれだけ
  // 上下したか）で判定する。候補エリアの1〜6面予測とは独立させる。
  const equityDelta=Number(errLuck);
  if(!Number.isFinite(equityDelta))return null;
  if(equityDelta>=JOKER_EQUITY_THRESHOLD)return'joker';
  if(equityDelta<=-JOKER_EQUITY_THRESHOLD)return'antiJoker';
  return null;
}
function hasRollAlerts(analysis){
  return Boolean(analysis?.jokerFace || analysis?.antiJokerFace || (analysis?.joker||[]).length || (analysis?.antiJoker||[]).length);
}
function shouldShowPreRoll(analysis,upcomingDice=null){
  return hasRollAlerts(analysis) || Boolean(classifyRollLuck(analysis,upcomingDice));
}
function cubeValueFromCode(code){
  if(!code) return 1;
  return 2 ** Math.abs(code);
}

function cubeOwnerFromCode(code){
  if(!code) return 0;
  // XG stores cube ownership absolutely: positive = Player 1 / black,
  // negative = Player 2 / white. It must never flip just because the turn changes.
  return code > 0 ? 'black' : 'white';
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
      gammonRate: result[4] * 100,
      opponentGammonRate: result[1] * 100,
      backgammonRate: result[5] * 100,
      opponentBackgammonRate: result[0] * 100,
      equity: result[6]
    });
  }
  const unused = int8(rec, base + 2180);
  return {nMoves, candidates, unused};
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
  const invalidM = int32(rec,2480);
  let playedIndex = best.candidates.findIndex(c => samePosition(c.pos, positionEnd));
  if(playedIndex < 0) playedIndex = 0;

  // PositionI / Cube.Position are always treated as the canonical board.
  // PositionEnd uses XG's active-player orientation for player -1, so the
  // replay board is rebuilt from the actual move sequence instead of trusting
  // the raw end-position orientation.
  const beforePosition = normalizeStoredPosition(positionI);
  // XG の棋譜表記で「41: ???」のようになるレコードは、
  // サイコロを振った直後にムーブせずリザインしたケース。
  // moveRaw が全て 0 かつ errMove が -1000 の特殊値になる。
  const isResignationRoll = moveRaw.every(v => v === 0) && Number(errMove) <= -999;
  const applied = isResignationRoll
    ? {position:cloneBoardPosition(beforePosition),segments:[]}
    : applyCheckerMove(beforePosition, activePlayer, moveRaw);
  const expectedEnd = normalizeMoveEndPosition(positionEnd, activePlayer);
  const move = isResignationRoll ? 'Resign' : formatCheckerMove(moveRaw, beforePosition, activePlayer);

  const isDance = !isResignationRoll && !applied.segments.length;
  for(const candidate of best.candidates){
    if(isDance && samePosition(candidate.pos, positionEnd)){
      candidate.move = 'Cannot Move';
    }else{
      candidate.move = formatCheckerMove(candidate.moveRaw, beforePosition, activePlayer);
    }
  }

  return {
    positionI,positionEnd,activePlayer,moveRaw,move,dice,cubeCode,best,playedIndex,
    errMove,errLuck,initEq,invalidM,beforePosition,afterPosition:applied.position,appliedSegments:applied.segments,expectedEnd,
    isResignationRoll
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
  const isValid = int32(rec,260);
  return {activePlayer,doubleAction,take,beaver,raccoon,cubeCode,position,analysis,errCube,errTake,isValid};
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

function stateGammonRate(activePlayer, activeGammonRate, opponentGammonRate, fallback={black:0,white:0}){
  const active=Number(activeGammonRate),opponent=Number(opponentGammonRate);
  if(!Number.isFinite(active)||!Number.isFinite(opponent)){
    return {black:clampRate(fallback?.black??0),white:clampRate(fallback?.white??0)};
  }
  return activePlayer===1
    ? {black:clampRate(active),white:clampRate(opponent)}
    : {black:clampRate(opponent),white:clampRate(active)};
}
function gammonRateFromResult(activePlayer,result,fallback){
  if(!Array.isArray(result)||result.length<5) return stateGammonRate(activePlayer,NaN,NaN,fallback);
  // XG TResult: [lose BG, lose G, lose total, win total, win G, win BG, equity].
  // win G / lose G already include backgammon outcomes, so use indices 4 / 1 directly.
  return stateGammonRate(activePlayer,Number(result[4])*100,Number(result[1])*100,fallback);
}
function stateBackgammonRate(activePlayer, activeBackgammonRate, opponentBackgammonRate, fallback={black:0,white:0}){
  const active=Number(activeBackgammonRate),opponent=Number(opponentBackgammonRate);
  if(!Number.isFinite(active)||!Number.isFinite(opponent)){
    return {black:clampRate(fallback?.black??0),white:clampRate(fallback?.white??0)};
  }
  return activePlayer===1
    ? {black:clampRate(active),white:clampRate(opponent)}
    : {black:clampRate(opponent),white:clampRate(active)};
}
function backgammonRateFromResult(activePlayer,result,fallback){
  if(!Array.isArray(result)||result.length<6) return stateBackgammonRate(activePlayer,NaN,NaN,fallback);
  // XG TResult: index 5 = active player's BG win rate, index 0 = opponent's BG win rate.
  return stateBackgammonRate(activePlayer,Number(result[5])*100,Number(result[0])*100,fallback);
}

function buildTimeline(parsed, sourceFile){
  const states = [];
  let gameNumber = 0;
  let score = [0,0];
  let lastBlackRate = 50;
  let lastGammonRate = {black:0,white:0};
  let lastBackgammonRate = {black:0,white:0};
  let lastPosition = null;
  let lastCube = {value:1,owner:0};
  let gameHasCheckerMove = false;
  let gameRollCount = 0;
  let gamePlayerTurnCount = {black:0,white:0};
  let pendingResignation = null;
  let matchIntroPushed = false;
  const prStats = {
    black:{error:0,decisions:0},
    white:{error:0,decisions:0}
  };
  const validDecisionError = value => Number.isFinite(Number(value)) && Math.abs(Number(value)) < 999;
  const playerKey = activePlayer => activePlayer === 1 ? 'black' : 'white';
  const snapshotPR = () => ({
    black:prStats.black.decisions ? prStats.black.error / prStats.black.decisions * 500 : 0,
    white:prStats.white.decisions ? prStats.white.error / prStats.white.decisions * 500 : 0,
    decisions:{black:prStats.black.decisions,white:prStats.white.decisions}
  });
  const addPrDecision = (activePlayer,error,counts=true) => {
    if(!counts || !validDecisionError(error)) return;
    const key=playerKey(activePlayer);
    prStats[key].error += Math.abs(Number(error));
    prStats[key].decisions += 1;
  };
  const cubeOfferCounts = r => {
    if(r.isValid && r.isValid !== 0) return false;
    if(!validDecisionError(r.errCube)) return false;
    const nd=Number(r.analysis?.equityNoDouble),dt=Number(r.analysis?.equityDoubleTake),dp=Number(r.analysis?.equityDrop);
    if(![nd,dt,dp].every(Number.isFinite)) return false;
    const doubled=Math.min(dt,dp);
    if(Math.abs(nd-doubled)<0.001) return false;
    if(nd-doubled>=0.200) return false;
    return true;
  };
  const takePassCounts = r => {
    if(r.isValid && r.isValid !== 0) return false;
    if(!validDecisionError(r.errTake)) return false;
    const dt=Number(r.analysis?.equityDoubleTake),dp=Number(r.analysis?.equityDrop);
    return Number.isFinite(dt)&&Number.isFinite(dp)&&Math.abs(dt-dp)>=0.001;
  };
  const pushState = state => states.push({...state,backgammonRate:state.backgammonRate??{...lastBackgammonRate},pr:snapshotPR()});

  const recs = parsed.records;
  for(let i=0;i<recs.length;i++){
    const r = recs[i];
    if(r.type === 'gameHeader'){
      gameNumber = r.gameNumber;
      score = [r.score1,r.score2];
      lastPosition = normalizeStoredPosition(r.pos);
      lastCube = {value: 2 ** Math.max(0,r.autoDoubles || 0), owner:0};
      lastBlackRate = 50;
      lastGammonRate = {black:0,white:0};
      lastBackgammonRate = {black:0,white:0};
      gameHasCheckerMove = false;
      gameRollCount = 0;
      gamePlayerTurnCount = {black:0,white:0};
      pendingResignation = null;
      if(!matchIntroPushed){
        matchIntroPushed = true;
        pushState({
          phase:'matchStart', gameNumber, score:[...score], activePlayer:0,
          position:lastPosition, dice:null, cube:lastCube,
          winRate:{black:lastBlackRate,white:100-lastBlackRate},
          gammonRate:{...lastGammonRate},
          analysis:{type:'none'}, historyEvent:null
        });
      }
      pushState({
        phase:'gameStart', gameNumber, score:[...score], activePlayer:0,
        position:lastPosition, dice:null, cube:lastCube,
        winRate:{black:lastBlackRate,white:100-lastBlackRate},
        gammonRate:{...lastGammonRate},
        analysis:{type:'none'}, historyEvent:null
      });
      continue;
    }

    if(r.type === 'cube'){
      const position = normalizeStoredPosition(r.position);
      const activeRate = r.analysis && r.analysis.result ? r.analysis.result[3] * 100 : null;
      let winRate = stateWinRate(r.activePlayer, activeRate, lastBlackRate);
      let gammonRate = gammonRateFromResult(r.activePlayer,r.analysis?.result,lastGammonRate);
      let backgammonRate = backgammonRateFromResult(r.activePlayer,r.analysis?.result,lastBackgammonRate);
      if(r.analysis.result.every(v => v === 0)){
        winRate = {black:lastBlackRate,white:100-lastBlackRate};
        gammonRate = {...lastGammonRate};
        backgammonRate = {...lastBackgammonRate};
      }
      const cube = {value:cubeValueFromCode(r.cubeCode),owner:cubeOwnerFromCode(r.cubeCode)};

      if(r.doubleAction === 1){
        const doubler=r.activePlayer===1?'black':'white';
        const responder=doubler==='black'?'white':'black';
        const responderActive=-r.activePlayer;
        const offeredValue=Math.max(2,(Number(cube.value)||1)*2);
        const pairId=`cube-${gameNumber}-${r.index}`;

        const nd=Number(r.analysis.equityNoDouble);
        const dt=Number(r.analysis.equityDoubleTake);
        const dp=Number(r.analysis.equityDrop);
        const doubledEq=Math.min(dt,dp);
        const offerBest=Math.max(nd,doubledEq);
        const offerCandidates=[
          {move:'Double',equity:doubledEq,error:doubledEq-offerBest},
          {move:'No Double',equity:nd,error:nd-offerBest}
        ];

        // Doubleした場合も、まず候補を未選択で表示し、その次に実際のDoubleを選択する。
        pushState({
          phase:'cubeOffer',gameNumber,score:[...score],activePlayer:r.activePlayer,
          position,dice:null,cube,winRate,gammonRate,backgammonRate,
          analysis:{type:'moves',candidates:offerCandidates},historyEvent:null
        });
        addPrDecision(r.activePlayer,r.errCube,cubeOfferCounts(r));
        pushState({
          phase:'cubeOfferSelect',gameNumber,score:[...score],activePlayer:r.activePlayer,
          position,dice:null,cube,winRate,gammonRate,backgammonRate,
          analysis:{type:'moves',candidates:offerCandidates,playedIndex:0},
          historyEvent:{player:doubler,dice:null,move:'Double',error:-Math.abs(Number(r.errCube)||0),kind:'cube',cubeValue:offeredValue,pairId}
        });

        // Take / Pass candidates are shown once without a selection, then the actual response is selected.
        const responseBest=Math.min(dt,dp);
        const responseCandidates=[
          {move:'Take',equity:dt,error:-(dt-responseBest)},
          {move:'Pass',equity:dp,error:-(dp-responseBest)}
        ];
        pushState({
          phase:'cubeResponse',gameNumber,score:[...score],activePlayer:responderActive,
          position,dice:null,cube,winRate,gammonRate,backgammonRate,
          analysis:{type:'moves',candidates:responseCandidates},historyEvent:null
        });

        const responseIndex=r.take===1||r.take===2?0:1;
        const responseMove=responseIndex===0?'Take':'Pass';
        const cubeAfter=responseMove==='Take'?{value:offeredValue,owner:responder}:cube;
        addPrDecision(responderActive,r.errTake,takePassCounts(r));
        pushState({
          phase:'cubeResponseSelect',gameNumber,score:[...score],activePlayer:responderActive,
          position,dice:null,cube:cubeAfter,winRate,gammonRate,backgammonRate,
          analysis:{type:'moves',candidates:responseCandidates,playedIndex:responseIndex},
          historyEvent:{player:responder,dice:null,move:responseMove,error:-Math.abs(Number(r.errTake)||0),kind:'cubeResponse',cubeValue:offeredValue,pairId}
        });
        lastCube=cubeAfter;
      }else{
        const nd=Number(r.analysis.equityNoDouble);
        const dt=Number(r.analysis.equityDoubleTake);
        const dp=Number(r.analysis.equityDrop);
        const doubledEq=Math.min(dt,dp);
        const offerBest=Math.max(nd,doubledEq);
        const offerCandidates=[
          {move:'Double',equity:doubledEq,error:doubledEq-offerBest},
          {move:'No Double',equity:nd,error:nd-offerBest}
        ];
        const missedDouble=Number.isFinite(nd)&&Number.isFinite(doubledEq)&&doubledEq>nd+0.000001;

        // 最善手がDoubleなのにNo Doubleを選んだ場合は、ロール前にキューブ判断を2段階表示する。
        if(missedDouble){
          const player=r.activePlayer===1?'black':'white';
          const offeredValue=Math.max(2,(Number(cube.value)||1)*2);
          const pairId=`cube-nd-${gameNumber}-${r.index}`;
          pushState({
            phase:'cubeOffer',gameNumber,score:[...score],activePlayer:r.activePlayer,
            position,dice:null,cube,winRate,gammonRate,backgammonRate,
            analysis:{type:'moves',candidates:offerCandidates},historyEvent:null
          });
          addPrDecision(r.activePlayer,r.errCube,cubeOfferCounts(r));
          const noDoubleError=-Math.abs(Number(r.errCube)||Math.max(0,doubledEq-nd));
          const isHistoryError=Math.abs(noDoubleError)>=0.020;
          pushState({
            phase:'cubeOfferSelect',gameNumber,score:[...score],activePlayer:r.activePlayer,
            position,dice:null,cube,winRate,gammonRate,backgammonRate,
            analysis:{type:'moves',candidates:offerCandidates,playedIndex:1},
            historyEvent:isHistoryError?{player,dice:null,move:'No Double',error:noDoubleError,kind:'cube',cubeValue:offeredValue,pairId}:null
          });
        }else{
          // 通常のNo Double判断は従来どおり表示せず、PRのみ選択時点として反映する。
          addPrDecision(r.activePlayer,r.errCube,cubeOfferCounts(r));
        }

        // ロール前のチャンス／ピンチ予測は廃止。
        // 推測ベースの preRoll 状態は生成せず、実際のロールへ直接進む。
        lastCube = cube;
      }
      lastPosition = position;
      lastBlackRate = winRate.black;
      lastGammonRate = {...gammonRate};
      lastBackgammonRate = {...backgammonRate};
      continue;
    }

    if(r.type === 'move'){
      const played = r.best.candidates[r.playedIndex] || r.best.candidates[0] || null;
      const best = r.best.candidates[0] || played || null;
      const selectedWinRate = stateWinRate(r.activePlayer,played ? played.winRate : null,lastBlackRate);
      const bestWinRate = stateWinRate(r.activePlayer,best ? best.winRate : null,lastBlackRate);
      const selectedGammonRate = played
        ? stateGammonRate(r.activePlayer,played.gammonRate,played.opponentGammonRate,lastGammonRate)
        : {...lastGammonRate};
      const bestGammonRate = best
        ? stateGammonRate(r.activePlayer,best.gammonRate,best.opponentGammonRate,lastGammonRate)
        : {...lastGammonRate};
      const selectedBackgammonRate = played
        ? stateBackgammonRate(r.activePlayer,played.backgammonRate,played.opponentBackgammonRate,lastBackgammonRate)
        : {...lastBackgammonRate};
      const bestBackgammonRate = best
        ? stateBackgammonRate(r.activePlayer,best.backgammonRate,best.opponentBackgammonRate,lastBackgammonRate)
        : {...lastBackgammonRate};
      const beforePosition = r.beforePosition || normalizeStoredPosition(r.positionI);
      const afterPosition = r.afterPosition || applyCheckerMove(beforePosition,r.activePlayer,r.moveRaw).position;
      const candidates = r.best.candidates.map(c => ({
        move:c.move,
        equity:c.equity,
        error:c.equity - (r.best.candidates[0]?.equity ?? c.equity),
        winRate:c.winRate,
        gammonRate:c.gammonRate,
        opponentGammonRate:c.opponentGammonRate,
        backgammonRate:c.backgammonRate,
        opponentBackgammonRate:c.opponentBackgammonRate,
        // 候補手ごとのムーブ後盤面もJSONへ保持し、配信側だけで完結させる。
        position:applyCheckerMove(beforePosition,r.activePlayer,c.moveRaw).position
      }));
      // 選択手では、候補側の推定盤面ではなく棋譜に実際に適用した盤面を表示する。
      const selectedPosition = afterPosition;
      const cube = {value:cubeValueFromCode(r.cubeCode),owner:cubeOwnerFromCode(r.cubeCode)};
      const diceMuted = r.isResignationRoll
        ? false
        : (r.move === 'Cannot Move' || r.move === 'Dance' || !(Array.isArray(r.appliedSegments) && r.appliedSegments.length));
      const noContact = isNoContact(beforePosition);
      const noRollOpportunity = !r.isResignationRoll && hasNoRollOpportunity(beforePosition,r.activePlayer);
      const turnKey=r.activePlayer===1?'black':'white';
      const playerTurnNumber=(gamePlayerTurnCount[turnKey]||0)+1;
      gamePlayerTurnCount[turnKey]=playerTurnNumber;

      // 盤面だけで「どの出目でも合法手が0」と確定している場合は、ロール自体を行わない。
      // ロール・候補手・着手の各シーケンスを生成せず、履歴へ Cannot Move だけを記録する。
      if(noRollOpportunity){
        pushState({
          phase:'cannotMoveNoRoll',gameNumber,score:[...score],activePlayer:r.activePlayer,
          position:beforePosition,dice:null,cube,
          winRate:{black:lastBlackRate,white:100-lastBlackRate},gammonRate:{...lastGammonRate},backgammonRate:{...lastBackgammonRate},
          luckKind:null,diceMuted:true,analysis:{type:'none'},
          historyEvent:{player:r.activePlayer===1?'black':'white',dice:null,move:'Cannot Move',error:0,kind:'noRoll'},
          noRollOpportunity:true
        });
        lastPosition=beforePosition;
        lastCube=cube;
        continue;
      }

      const moveNumber=gameRollCount+1;
      const achievements=r.isResignationRoll ? [] : detectAchievements({
        beforePosition,afterPosition,player:r.activePlayer,dice:r.dice,segments:r.appliedSegments||[],move:r.move,moveNumber,playerTurnNumber
      });

      // ロール前のチャンス／ピンチ予測は廃止。
      // 盤面上の光り方だけを、実際のXGエクイティ（errLuck）で判定する。
      const isOpeningMove=!gameHasCheckerMove;
      const luckKind=classifyActualRollLuck(r.errLuck);
      const preRollBlackRate=Number(lastBlackRate);
      const preRollWhiteRate=100-preRollBlackRate;
      const postRollBlackRate=Number(bestWinRate.black);
      const postRollWhiteRate=Number(bestWinRate.white);

      // ロール演出は「実際のXGエクイティ（errLuck）」を基準に判定する。
      // 盤面サイコロのチャンス／ピンチ影と同じ基準を使い、演出の整合を保つ。
      // activePlayer===1 は black（選手1）、それ以外は white（選手2）。
      const rollerPreRate=r.activePlayer===1 ? preRollBlackRate : preRollWhiteRate;
      const rollerPostRate=r.activePlayer===1 ? postRollBlackRate : postRollWhiteRate;

      // 大逆転のみ、視聴者に直感的な演出として従来どおり勝率基準を維持する。
      const isBigComeback=Number.isFinite(rollerPreRate) && Number.isFinite(rollerPostRate)
        && rollerPreRate<=30 && rollerPostRate>=70;
      // ナイスロール／バッドロール、および盤面サイコロの光り方は、
      // XGが記録した実際のロール・ラック（errLuck）で統一する。
      const isNiceRoll=luckKind==='joker' && !isBigComeback;
      const isBadRoll=luckKind==='antiJoker';
      const rollNotice=isBigComeback?'comeback':(isNiceRoll?'nice':(isBadRoll?'bad':null));

      if(isBigComeback){
        pushState({
          phase:'bigComebackIntro',gameNumber,score:[...score],activePlayer:r.activePlayer,
          position:beforePosition,dice:null,cube,
          winRate:{black:lastBlackRate,white:100-lastBlackRate},gammonRate:{...lastGammonRate},backgammonRate:{...lastBackgammonRate},luckKind:null,diceMuted,
          analysis:{type:'none'},historyEvent:null,
          bigComeback:true,rollNotice:'comeback'
        });
      }

      // 「???: ロール後リザイン」は、ロールだけを盤面に表示し、
      // 候補手・着手は生成しない。リザイン表示は直後の gameEnd で行う。
      if(r.isResignationRoll){
        pendingResignation={
          player:r.activePlayer===1?'black':'white',
          activePlayer:r.activePlayer,
          dice:Array.isArray(r.dice)?[...r.dice]:null
        };
        pushState({
          phase:'roll',gameNumber,score:[...score],activePlayer:r.activePlayer,
          position:beforePosition,dice:r.dice,cube,
          winRate:bestWinRate,gammonRate:bestGammonRate,backgammonRate:bestBackgammonRate,luckKind,diceMuted:false,
          analysis:{type:'none'},historyEvent:null,
          resignationRoll:true,bigComeback:isBigComeback,rollNotice,achievements:[]
        });
        lastPosition=beforePosition;
        lastCube=cube;
        lastBlackRate=bestWinRate.black;
        lastGammonRate={...bestGammonRate};
        lastBackgammonRate={...bestBackgammonRate};
        gameRollCount += 1;
        continue;
      }

      const cannotMove = r.move === 'Cannot Move' || r.move === 'Dance';
      if(noContact){
        // ノーコンタクト後は「ロール・候補手表示・着手」を1つの5秒シーケンスに統合する。
        // 候補手は省略せず、実際に選択された手を選択済みで表示する。
        addPrDecision(r.activePlayer,r.errMove,r.invalidM===0 && r.best.unused!==1);
        pushState({
          phase:'roll',gameNumber,score:[...score],activePlayer:r.activePlayer,
          position:selectedPosition,dice:r.dice,cube,
          winRate:selectedWinRate,gammonRate:selectedGammonRate,backgammonRate:selectedBackgammonRate,luckKind,diceMuted,
          analysis:{type:'moves',candidates,playedIndex:r.playedIndex},
          moveAnimation:{beforePosition,segments:r.appliedSegments||[]},
          historyEvent:{player:r.activePlayer===1?'black':'white',dice:r.dice,move:r.move,error:r.errMove,kind:'move'},
          noContactCombined:true,bigComeback:isBigComeback,rollNotice,achievements
        });
      }else if(cannotMove){
        // Cannot Move はロール表示と候補選択を同一シーケンスにする。
        // ロールが出た瞬間に選択済み候補・履歴・PRまで同時に反映する。
        addPrDecision(r.activePlayer,r.errMove,r.invalidM===0 && r.best.unused!==1);
        pushState({
          phase:'roll',gameNumber,score:[...score],activePlayer:r.activePlayer,
          position:selectedPosition,dice:r.dice,cube,
          winRate:selectedWinRate,gammonRate:selectedGammonRate,backgammonRate:selectedBackgammonRate,luckKind,diceMuted,
          analysis:{type:'moves',candidates,playedIndex:r.playedIndex},
          moveAnimation:{beforePosition,segments:r.appliedSegments||[]},
          historyEvent:{player:r.activePlayer===1?'black':'white',dice:r.dice,move:r.move,error:r.errMove,kind:'move'},
          forcedMove:true,bigComeback:isBigComeback,rollNotice,achievements
        });
      }else{
        pushState({
          phase:'roll',gameNumber,score:[...score],activePlayer:r.activePlayer,
          position:beforePosition,dice:r.dice,cube,
          winRate:bestWinRate,gammonRate:bestGammonRate,backgammonRate:bestBackgammonRate,luckKind,diceMuted,
          analysis:isOpeningMove?{type:'jokers',joker:[],antiJoker:[],openingRoll:true}:{type:'none'},historyEvent:null,
          bigComeback:isBigComeback,rollNotice,achievements
        });
        // 候補表示シーケンスを省略する条件：
        // 1) 候補が1手だけ
        // 2) すべての候補に equity error <= -0.020（エラー／ブランダー）が存在しない
        // ※ best は error=0。-0.020ちょうどは「エラーあり」扱いなので省略しない。
        const allCandidatesHaveNoErrorOrBlunder = candidates.length > 1 && candidates.every(c => {
          const error=Number(c.error);
          return Number.isFinite(error) && error > -0.020;
        });
        const forcedMove = candidates.length <= 1 || allCandidatesHaveNoErrorOrBlunder;
        if(forcedMove){
          // 候補表示を省略する場合も、着手シーケンス上では候補一覧を表示し、
          // 実際の選択手を選択済みで見せる。
          addPrDecision(r.activePlayer,r.errMove,r.invalidM===0 && r.best.unused!==1);
          pushState({
            phase:'candidates',gameNumber,score:[...score],activePlayer:r.activePlayer,
            position:selectedPosition,dice:r.dice,cube,winRate:selectedWinRate,gammonRate:selectedGammonRate,backgammonRate:selectedBackgammonRate,luckKind,diceMuted,
            analysis:{type:'moves',candidates,playedIndex:r.playedIndex},
            moveAnimation:{beforePosition,segments:r.appliedSegments||[]},
            historyEvent:{player:r.activePlayer===1?'black':'white',dice:r.dice,move:r.move,error:r.errMove,kind:'move'},
            forcedMove:true,autoSelectedNoErrorCandidate:allCandidatesHaveNoErrorOrBlunder,rollNotice
          });
        }else{
        pushState({
          phase:'candidates',gameNumber,score:[...score],activePlayer:r.activePlayer,
          position:beforePosition,dice:r.dice,cube,winRate:bestWinRate,gammonRate:bestGammonRate,backgammonRate:bestBackgammonRate,luckKind,diceMuted,
          analysis:{type:'moves',candidates},historyEvent:null,rollNotice
        });
        // 通常手は候補表示ではPRを変えず、実際の手を選択した瞬間に反映する。
        addPrDecision(r.activePlayer,r.errMove,r.invalidM===0 && r.best.unused!==1);
        pushState({
          phase:'analysis',gameNumber,score:[...score],activePlayer:r.activePlayer,
          position:selectedPosition,dice:r.dice,cube,winRate:selectedWinRate,gammonRate:selectedGammonRate,backgammonRate:selectedBackgammonRate,luckKind,diceMuted,
          analysis:{type:'moves',candidates,playedIndex:r.playedIndex},
          // 配信側でムーブ前→ムーブ後を順番に0.5秒ずつアニメーションするため、
          // 実棋譜の移動区間をそのまま保持する。外部ファイル参照は不要。
          moveAnimation:{beforePosition,segments:r.appliedSegments||[]},
          historyEvent:{player:r.activePlayer===1?'black':'white',dice:r.dice,move:r.move,error:r.errMove,kind:'move'},
          rollNotice
        });
        }
      }
      gameRollCount += 1;
      gameHasCheckerMove = true;
      lastPosition = afterPosition;
      lastCube = cube;
      lastBlackRate = selectedWinRate.black;
      lastGammonRate = {...selectedGammonRate};
      lastBackgammonRate = {...selectedBackgammonRate};
      continue;
    }

    if(r.type === 'gameFooter'){
      const beforeScore=[...score];
      const rawAfterScore=[r.score1,r.score2];
      const winner=r.winner===1?'black':(r.winner===-1?'white':null);
      const rawPoints=Math.max(0,Number(r.pointsWon)||0);
      const resignation=pendingResignation;
      const matchLength=Math.max(0,Number(parsed.match?.matchLength)||0);
      const winnerIndex=winner==='black'?0:(winner==='white'?1:-1);
      const rawMatchFinished=matchLength>0 && (rawAfterScore[0]>=matchLength || rawAfterScore[1]>=matchLength);
      // 最終ゲームのリザインでそのままマッチが終了した場合は「マッチリザイン」として扱う。
      // 表示上の加点は通常のゲーム得点ではなく、ゴールまでの残り点数にする。
      const isMatchResignation=Boolean(resignation&&winner&&rawMatchFinished&&winnerIndex>=0);
      const remainingToGoal=isMatchResignation?Math.max(0,matchLength-Number(beforeScore[winnerIndex]||0)):0;
      const points=isMatchResignation?remainingToGoal:rawPoints;
      const afterScore=[...rawAfterScore];
      if(isMatchResignation&&winnerIndex>=0)afterScore[winnerIndex]=matchLength;
      pushState({
        phase:'gameEnd',gameNumber,score:[...beforeScore],activePlayer:0,
        position:lastPosition,dice:null,cube:lastCube,
        winRate:{black:lastBlackRate,white:100-lastBlackRate},gammonRate:{...lastGammonRate},analysis:{type:'none'},
        historyEvent:resignation?{player:resignation.player,dice:resignation.dice,move:'Resign',error:0,kind:'resign'}:null,
        scoreDelta:winner&&points?{winner,points}:null,
        resignation:resignation?{player:resignation.player}:null,
        matchResignation:isMatchResignation
      });
      pendingResignation=null;
      score=afterScore;
      pushState({
        phase:'scoreUpdate',gameNumber,score:[...score],activePlayer:0,
        position:lastPosition,dice:null,cube:lastCube,
        winRate:{black:lastBlackRate,white:100-lastBlackRate},gammonRate:{...lastGammonRate},analysis:{type:'none'},historyEvent:null,
        matchResignation:isMatchResignation
      });
      const matchFinished=matchLength>0 && (afterScore[0]>=matchLength || afterScore[1]>=matchLength);
      if(matchFinished){
        const matchWinner=afterScore[0]>=matchLength?'black':'white';
        pushState({
          phase:'matchEnd',gameNumber,score:[...score],activePlayer:0,
          position:lastPosition,dice:null,cube:lastCube,
          winRate:{black:lastBlackRate,white:100-lastBlackRate},gammonRate:{...lastGammonRate},analysis:{type:'none'},historyEvent:null,
          matchWinner,matchResignation:isMatchResignation
        });
      }
    }
  }

  return {
    schemaVersion:17,
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

module.exports = {parseXgBuffer,parseXgFile,JOKER_WINRATE_THRESHOLD,JOKER_EQUITY_THRESHOLD};
