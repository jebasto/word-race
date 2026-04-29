const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const https = require('https');
const WebSocket = require('ws');

// ---------------------------------------------------------------------------
// Letter pool — weighted toward common English letters
// ---------------------------------------------------------------------------
const POOL = [
  ...Array(12).fill('E'), ...Array(9).fill('T'),  ...Array(8).fill('A'),
  ...Array(7).fill('O'),  ...Array(7).fill('I'),  ...Array(7).fill('N'),
  ...Array(6).fill('S'),  ...Array(6).fill('R'),  ...Array(5).fill('H'),
  ...Array(4).fill('L'),  ...Array(4).fill('D'),  ...Array(3).fill('C'),
  ...Array(3).fill('U'),  ...Array(3).fill('M'),  ...Array(2).fill('W'),
  ...Array(2).fill('F'),  ...Array(2).fill('G'),  ...Array(2).fill('Y'),
  ...Array(2).fill('P'),  ...Array(2).fill('B'),  ...Array(1).fill('V'),
  ...Array(1).fill('K'),
];

function generateGrid() {
  const g = [];
  for (let i = 0; i < 25; i++) g.push(POOL[Math.floor(Math.random() * POOL.length)]);
  return g;
}

// ---------------------------------------------------------------------------
// Game logic helpers
// ---------------------------------------------------------------------------
function adjacent(a, b) {
  return Math.abs(Math.floor(a / 5) - Math.floor(b / 5)) <= 1 &&
         Math.abs((a % 5)           - (b % 5))           <= 1 &&
         a !== b;
}

function validPath(p) {
  if (!Array.isArray(p) || p.length < 3) return false;
  const seen = new Set();
  for (let i = 0; i < p.length; i++) {
    if (typeof p[i] !== 'number' || p[i] < 0 || p[i] > 24) return false;
    if (seen.has(p[i])) return false;
    seen.add(p[i]);
    if (i > 0 && !adjacent(p[i - 1], p[i])) return false;
  }
  return true;
}

function scoreWord(word) {
  const n = word.length;
  if (n <= 3) return 1;
  if (n === 4) return 2;
  if (n === 5) return 4;
  if (n === 6) return 6;
  return 10;
}

function dictCheck(word) {
  return new Promise(resolve => {
    const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`;
    const req = https.get(url, { timeout: 6000 }, res => {
      let body = '';
      res.on('data', d => (body += d));
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve(Array.isArray(json) && json.length > 0 && typeof json[0].word === 'string');
        } catch { resolve(false); }
      });
    });
    req.on('error',   () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
function freshState(keepPlayers = null) {
  const players = keepPlayers ? { ...keepPlayers } : {};
  const scores  = Object.fromEntries(Object.keys(players).map(id => [id, 0]));
  return { grid: generateGrid(), players, scores, claimed: {}, claimedOrder: [],
           timeLeft: 120, active: false, started: false, winner: null };
}

let state      = freshState();
let timerHandle = null;
const sockets  = new Map(); // ws -> playerId

// ---------------------------------------------------------------------------
// Messaging helpers
// ---------------------------------------------------------------------------
function send(ws, msg) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}
function broadcast(msg) {
  for (const [ws] of sockets) send(ws, msg);
}
function sendTo(playerId, msg) {
  for (const [ws, pid] of sockets) if (pid === playerId) send(ws, msg);
}

function snapshot(forId) {
  return {
    grid: state.grid, players: state.players, scores: state.scores,
    claimed: state.claimed, claimedOrder: state.claimedOrder,
    timeLeft: state.timeLeft, active: state.active, started: state.started,
    winner: state.winner, yourId: forId,
  };
}

// ---------------------------------------------------------------------------
// Timer / round management
// ---------------------------------------------------------------------------
function startTimer() {
  if (timerHandle) clearInterval(timerHandle);
  timerHandle = setInterval(() => {
    state.timeLeft--;
    broadcast({ type: 'tick', t: state.timeLeft });
    if (state.timeLeft <= 0) endGame();
  }, 1000);
}

function endGame() {
  if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
  state.active = false;
  const ids = Object.keys(state.scores);
  let winner = null;
  if (ids.length === 2) {
    const [a, b] = ids;
    if      (state.scores[a] > state.scores[b]) winner = a;
    else if (state.scores[b] > state.scores[a]) winner = b;
    else                                         winner = 'tie';
  }
  state.winner = winner;
  broadcast({ type: 'gameover', scores: state.scores, players: state.players, winner });
}

function newRound() {
  if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
  state = freshState(state.players);
  state.active  = true;
  state.started = true;
  startTimer();
  for (const [ws, pid] of sockets) send(ws, { type: 'newround', ...snapshot(pid) });
}

// ---------------------------------------------------------------------------
// HTTP server — serve /public
// ---------------------------------------------------------------------------
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };

const server = http.createServer((req, res) => {
  const fp = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'text/plain' });
    res.end(data);
  });
});

// ---------------------------------------------------------------------------
// WebSocket server
// ---------------------------------------------------------------------------
const wss = new WebSocket.Server({ server });

wss.on('connection', ws => {
  if (sockets.size >= 2) {
    send(ws, { type: 'error', msg: 'Game is full (max 2 players). Try refreshing later.' });
    ws.close();
    return;
  }

  const playerId = sockets.size === 0 ? 'p1' : 'p2';
  sockets.set(ws, playerId);

  ws.on('message', async raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // ---- JOIN ----
    if (msg.type === 'join') {
      const name = String(msg.name || `Player ${playerId === 'p1' ? 1 : 2}`).trim().slice(0, 20) || 'Player';
      state.players[playerId] = name;
      state.scores[playerId]  = state.scores[playerId] ?? 0;

      send(ws, { type: 'init', ...snapshot(playerId) });

      if (sockets.size === 2 && Object.keys(state.players).length === 2) {
        state.active  = true;
        state.started = true;
        for (const [w, pid] of sockets) send(w, { type: 'start', ...snapshot(pid) });
        startTimer();
      } else {
        broadcast({ type: 'waiting', players: state.players });
      }
    }

    // ---- SUBMIT ----
    if (msg.type === 'submit') {
      if (!state.active) return;
      const wpath = msg.path;
      const word  = typeof msg.word === 'string' ? msg.word.toUpperCase() : '';

      if (!validPath(wpath)) {
        sendTo(playerId, { type: 'result', ok: false, reason: 'badpath', word }); return;
      }
      if (wpath.map(i => state.grid[i]).join('') !== word) {
        sendTo(playerId, { type: 'result', ok: false, reason: 'badpath', word }); return;
      }
      if (state.claimed[word]) {
        sendTo(playerId, { type: 'result', ok: false, reason: 'taken', word }); return;
      }

      const valid = await dictCheck(word);

      if (!valid) {
        sendTo(playerId, { type: 'result', ok: false, reason: 'notword', word }); return;
      }
      // Double-check after async gap (race condition guard)
      if (state.claimed[word]) {
        sendTo(playerId, { type: 'result', ok: false, reason: 'taken', word }); return;
      }

      const pts = scoreWord(word);
      state.scores[playerId]  = (state.scores[playerId] || 0) + pts;
      state.claimed[word]     = { playerId, name: state.players[playerId], pts };
      state.claimedOrder.push(word);

      broadcast({
        type: 'claimed', word, playerId,
        name: state.players[playerId], pts, scores: state.scores,
      });
    }

    // ---- NEW ROUND ----
    if (msg.type === 'newround') newRound();
  });

  ws.on('close', () => {
    sockets.delete(ws);
    delete state.players[playerId];
    delete state.scores[playerId];
    if (timerHandle) { clearInterval(timerHandle); timerHandle = null; state.active = false; }
    broadcast({ type: 'disconnect', playerId, players: state.players });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Word Race  →  http://localhost:${PORT}`));
