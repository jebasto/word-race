// Word Race — client (multi-room, 2-4 players)

// ── Room code in URL ───────────────────────────────────────────────
function genRoomCode() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = ''; for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}
const params = new URLSearchParams(location.search);
let roomId = (params.get('r') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
if (!roomId) {
  roomId = genRoomCode();
  history.replaceState(null, '', `?r=${roomId}`);
}

const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
const ws = new WebSocket(`${wsProto}://${location.host}/?r=${roomId}`);

// ── State ──────────────────────────────────────────────────────────
let myId        = null;
let grid        = [];
let path        = [];
let lastPath    = [];
let scores      = {};
let players     = {};        // { p1: "Alice", p2: "Bob" }
let playerIds   = [];        // ordered slot list
let connected   = new Set();
let gameActive  = false;
let roomInfo    = null;      // { capacity, joined, isFull, started, roomId }

// ── DOM ────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const joinScreen     = $('join-screen');
const gameScreen     = $('game-screen');
const gameoverScreen = $('gameover-screen');

const nameInput      = $('name-input');
const joinBtn        = $('join-btn');
const waitMsg        = $('wait-msg');
const capBlock       = $('capacity-block');
const roomStatus     = $('room-status');
const roomCodeEl     = $('room-code');
const shareBlock     = $('share-block');
const codeForm       = $('code-form');
const codeInput      = $('code-input');

const timerEl        = $('timer');
const playerRow      = $('player-row');
const gridEl         = $('grid');
const wordDisplay    = $('word-display');
const hintBox        = $('hint-box');
const submitBtn      = $('submit-btn');
const clearBtn       = $('clear-btn');
const wordLog        = $('word-log');

// ── Show room code on join card ────────────────────────────────────
roomCodeEl.textContent  = roomId;
$('share-url').value    = location.href;

$('copy-btn').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    $('copy-btn').textContent = 'Copied!';
    setTimeout(() => $('copy-btn').textContent = 'Copy', 1500);
  } catch { $('share-url').select(); }
});

// Room-code form: navigate to that room
codeForm.addEventListener('submit', e => {
  e.preventDefault();
  const code = codeInput.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  if (!code || code === roomId) return;
  location.search = `?r=${code}`;
});

// ── Join button ────────────────────────────────────────────────────
joinBtn.addEventListener('click', doJoin);
nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') doJoin(); });
nameInput.addEventListener('input', updateJoinEnabled);

function selectedCapacity() {
  const r = document.querySelector('input[name="cap"]:checked');
  return r ? parseInt(r.value, 10) : 2;
}

function updateJoinEnabled() {
  const hasName = nameInput.value.trim().length > 0;
  const blocked = roomInfo && roomInfo.isFull;
  joinBtn.disabled = !hasName || blocked;
}

function doJoin() {
  const name = nameInput.value.trim();
  if (!name || (roomInfo && roomInfo.isFull)) return;
  const payload = { name };
  // Only send capacity if we're the room creator
  if (roomInfo && roomInfo.capacity == null) payload.capacity = selectedCapacity();
  send('join', payload);
  joinBtn.disabled    = true;
  nameInput.disabled  = true;
  capBlock.classList.add('hidden');
  waitMsg.classList.remove('hidden');
  shareBlock.classList.remove('hidden');
}

submitBtn.addEventListener('click', doSubmit);
clearBtn.addEventListener('click', doClear);
$('play-again-btn').addEventListener('click', () => send('newround'));

$('type-form').addEventListener('submit', e => {
  e.preventDefault();
  const input = $('type-input');
  const word = input.value.trim().toUpperCase();
  if (!gameActive || word.length < 3 || !/^[A-Z]+$/.test(word)) return;
  lastPath = [];
  send('submit', { word });
  input.value = '';
});

function doSubmit() {
  if (path.length < 3 || !gameActive) return;
  const word = path.map(i => grid[i]).join('');
  lastPath   = [...path];
  send('submit', { path: [...path], word });
  doClear();
}

function doClear() { path = []; renderPath(); }

// ── WebSocket ──────────────────────────────────────────────────────
function send(type, data = {}) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type, ...data }));
}

ws.addEventListener('message', e => {
  const msg = JSON.parse(e.data);
  (handlers[msg.type] || (() => {}))(msg);
});

ws.addEventListener('close', () => showHint('Connection lost — please refresh.', 'bad'));

const handlers = {

  room_info(msg) {
    roomInfo = msg;
    renderRoomStatus();
    updateJoinEnabled();
  },

  init(msg) {
    myId = msg.yourId;
    applyState(msg);
  },

  waiting(msg) {
    players   = msg.players || {};
    playerIds = msg.playerIds || Object.keys(players);
    connected = new Set(msg.connected || playerIds);
    if (roomInfo) {
      roomInfo.capacity = msg.capacity;
      roomInfo.joined   = msg.joined;
      roomInfo.isFull   = msg.joined >= msg.capacity;
    }
    renderRoomStatus();
    waitMsg.textContent = `Waiting for players… (${msg.joined}/${msg.capacity})`;
  },

  start(msg) {
    myId = msg.yourId;
    applyState(msg);
    show(gameScreen);
    hide(joinScreen);
    hide(gameoverScreen);
  },

  tick(msg) { renderTimer(msg.t); },

  claimed(msg) {
    scores = msg.scores;
    renderPlayerRow();
    addLogEntry(msg.word, msg.playerId, msg.name, msg.pts);
    const flashPath = msg.path && msg.path.length ? msg.path : lastPath;
    flashCells(flashPath, 'ok');
    if (msg.playerId === myId) {
      showHint(`✓ +${msg.pts} point${msg.pts !== 1 ? 's' : ''}!`, 'ok');
      bumpPlayerScore(myId);
    } else {
      showHint(`${msg.name} claimed ${msg.word}`, 'warn');
      bumpPlayerScore(msg.playerId);
    }
  },

  result(msg) {
    const text = {
      badpath:   'Invalid path — cells must be adjacent.',
      notongrid: `"${msg.word}" can't be traced on the grid.`,
      notword:   `"${msg.word}" is not a valid word.`,
      taken:     `"${msg.word}" is already claimed!`,
    }[msg.reason] || 'Submission rejected.';
    flashCells(lastPath, 'bad');
    showHint(text, 'bad');
  },

  gameover(msg) {
    gameActive = false;
    scores    = msg.scores;
    players   = msg.players;
    playerIds = msg.playerIds || Object.keys(players);
    renderPlayerRow();
    showGameOver(msg);
  },

  newround(msg) {
    myId = msg.yourId || myId;
    applyState(msg);
    wordLog.innerHTML = '<div class="log-empty">No words claimed yet</div>';
    hide(gameoverScreen);
    show(gameScreen);
    doClear();
  },

  disconnect(msg) {
    connected = new Set(msg.connected || []);
    renderPlayerRow();
    showHint(`${players[msg.playerId] || 'A player'} disconnected.`, 'warn');
  },

  room_full() {
    roomStatus.textContent = 'This room is full. Try a different room code.';
    roomStatus.classList.add('full');
    roomStatus.classList.remove('hidden');
    joinBtn.disabled = true;
    nameInput.disabled = false;
    capBlock.classList.add('hidden');
    waitMsg.classList.add('hidden');
  },

  error(msg) { alert(msg.msg || 'Error'); },
};

// ── Render: room status (capacity selector / waiting / full) ───────
function renderRoomStatus() {
  if (!roomInfo) return;
  const { capacity, joined, isFull, started } = roomInfo;

  if (capacity == null) {
    // Brand new room — let user pick capacity
    capBlock.classList.remove('hidden');
    roomStatus.classList.add('hidden');
    waitMsg.classList.add('hidden');
  } else if (started || isFull) {
    capBlock.classList.add('hidden');
    roomStatus.textContent = isFull && !started ? 'Room is full.' : 'Game is in progress.';
    roomStatus.classList.add('full');
    roomStatus.classList.remove('hidden');
  } else {
    // Existing room with open seats
    capBlock.classList.add('hidden');
    roomStatus.classList.remove('full');
    roomStatus.textContent = `Joining ${joined}/${capacity}-player room.`;
    roomStatus.classList.remove('hidden');
  }
}

// ── State ──────────────────────────────────────────────────────────
function applyState(msg) {
  grid       = msg.grid || [];
  scores     = msg.scores || {};
  players    = msg.players || {};
  playerIds  = msg.playerIds || Object.keys(players);
  connected  = new Set(msg.connected || playerIds);
  gameActive = msg.active || false;

  buildGrid(grid);
  renderPlayerRow();
  renderTimer(msg.timeLeft ?? 120);

  if (msg.claimedOrder?.length) {
    wordLog.innerHTML = '';
    [...msg.claimedOrder].reverse().forEach(w => {
      const c = msg.claimed?.[w];
      if (c) addLogEntry(w, c.playerId, c.name, c.pts);
    });
  }
}

// ── Grid ───────────────────────────────────────────────────────────
function buildGrid(letters) {
  gridEl.innerHTML = '';
  letters.forEach((letter, i) => {
    const cell = document.createElement('div');
    cell.className   = 'cell';
    cell.dataset.i   = i;
    cell.textContent = letter;
    cell.addEventListener('click', () => onCellClick(i));
    gridEl.appendChild(cell);
  });
}

function onCellClick(idx) {
  if (!gameActive) return;
  if (path.at(-1) === idx) { path.pop(); renderPath(); return; }
  if (path.includes(idx)) return;
  if (path.length > 0 && !adjacent(path.at(-1), idx)) return;
  path.push(idx);
  renderPath();
}

function adjacent(a, b) {
  return Math.abs(Math.floor(a / 5) - Math.floor(b / 5)) <= 1 &&
         Math.abs((a % 5) - (b % 5)) <= 1 && a !== b;
}

function renderPath() {
  [...gridEl.children].forEach((cell, i) => {
    cell.classList.remove('selected');
    cell.querySelector('.badge')?.remove();
    const pos = path.indexOf(i);
    if (pos !== -1) {
      cell.classList.add('selected');
      const badge = document.createElement('span');
      badge.className   = 'badge';
      badge.textContent = pos + 1;
      cell.appendChild(badge);
    }
  });
  const word = path.map(i => grid[i]).join('');
  wordDisplay.textContent = word || '_ _ _';
  submitBtn.disabled      = word.length < 3;
  if (!word) clearHint();
}

function flashCells(indices, type) {
  if (!indices?.length) return;
  indices.forEach(idx => {
    const cell = gridEl.children[idx];
    if (!cell) return;
    cell.classList.remove('flash-ok', 'flash-bad');
    void cell.offsetWidth;
    cell.classList.add(type === 'ok' ? 'flash-ok' : 'flash-bad');
    setTimeout(() => cell.classList.remove('flash-ok', 'flash-bad'), 600);
  });
}

// ── Player row ─────────────────────────────────────────────────────
function playerColorVar(pid) {
  const map = { p1: '--p1', p2: '--p2', p3: '--p3', p4: '--p4' };
  return `var(${map[pid] || '--accent'})`;
}

function renderPlayerRow() {
  playerRow.innerHTML = '';
  // Show your card first, then the rest in slot order
  const ordered = [myId, ...playerIds.filter(id => id !== myId)].filter(id => id && players[id] != null);
  ordered.forEach(pid => {
    const card = document.createElement('div');
    card.className = 'player-card' + (pid === myId ? ' you' : '') + (connected.has(pid) ? '' : ' disconnected');
    card.dataset.player = pid;
    card.style.setProperty('--player-color', playerColorVar(pid));
    card.innerHTML = `
      <div class="pname">${escHtml(players[pid])}${pid === myId ? '<span class="you-tag">YOU</span>' : ''}</div>
      <div class="pscore" data-pid="${pid}">${scores[pid] ?? 0}</div>
    `;
    playerRow.appendChild(card);
  });
}

function bumpPlayerScore(pid) {
  const el = playerRow.querySelector(`.pscore[data-pid="${pid}"]`);
  if (!el) return;
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
  setTimeout(() => el.classList.remove('bump'), 400);
}

// ── Timer ──────────────────────────────────────────────────────────
function renderTimer(t) {
  const m = Math.floor(t / 60);
  const s = t % 60;
  timerEl.textContent = `${m}:${String(s).padStart(2, '0')}`;
  timerEl.classList.toggle('low', t <= 15);
}

// ── Hint ───────────────────────────────────────────────────────────
let hintTimeout;
function showHint(text, type) {
  hintBox.textContent = text;
  hintBox.className   = `hint-box ${type}`;
  clearTimeout(hintTimeout);
  hintTimeout = setTimeout(clearHint, 2600);
}
function clearHint() { hintBox.textContent = ''; hintBox.className = 'hint-box'; }

// ── Word log ───────────────────────────────────────────────────────
function addLogEntry(word, playerId, name, pts) {
  const entry = document.createElement('div');
  entry.className = `log-entry${playerId === myId ? ' by-me' : ''}`;
  entry.style.setProperty('--player-color', playerColorVar(playerId));
  entry.innerHTML = `
    <span class="log-word">${escHtml(word)}</span>
    <span class="log-pts">+${pts}</span>
    <span class="log-who">${escHtml(name)} · ${pts} pt${pts !== 1 ? 's' : ''}</span>
  `;
  const empty = wordLog.querySelector('.log-empty');
  if (empty) empty.remove();
  wordLog.insertBefore(entry, wordLog.firstChild);
}

// ── Game over ──────────────────────────────────────────────────────
function showGameOver({ scores: sc, players: pl, playerIds: ids, winner }) {
  let emoji, headline;
  if (winner === 'tie') {
    emoji = '🤝';
    headline = "It's a Tie!";
  } else if (winner === myId) {
    emoji = '🏆';
    headline = 'You Win!';
  } else if (winner) {
    emoji = '🎯';
    headline = `${pl[winner]} Wins!`;
  } else {
    emoji = '⏱';
    headline = 'Game Over';
  }
  $('result-emoji').textContent    = emoji;
  $('result-headline').textContent = headline;

  const sorted = (ids || Object.keys(pl)).slice().sort((a, b) => (sc[b] || 0) - (sc[a] || 0));
  $('result-scores').innerHTML = sorted.map(id => `
    <div class="result-row${id === winner ? ' winner' : ''}" style="--player-color: ${playerColorVar(id)};">
      <span class="rname">${escHtml(pl[id])}${id === myId ? ' <small>(you)</small>' : ''}</span>
      <span class="rpts">${sc[id] || 0} pts</span>
    </div>
  `).join('');

  show(gameoverScreen);
}

// ── Util ───────────────────────────────────────────────────────────
function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
