// Word Race — client

const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
const ws = new WebSocket(`${wsProto}://${location.host}`);

let myId       = null;
let grid       = [];
let path       = [];       // current cell-index path being built
let lastPath   = [];       // path of last submitted word (for flash animation)
let scores     = {};
let players    = {};
let gameActive = false;

// ── DOM refs ──────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const joinScreen     = $('join-screen');
const gameScreen     = $('game-screen');
const gameoverScreen = $('gameover-screen');
const nameInput      = $('name-input');
const joinBtn        = $('join-btn');
const waitMsg        = $('wait-msg');
const timerEl        = $('timer');
const leftPlayer     = $('left-player');
const rightPlayer    = $('right-player');
const leftName       = $('left-name');
const rightName      = $('right-name');
const leftScore      = $('left-score');
const rightScore     = $('right-score');
const gridEl         = $('grid');
const wordDisplay    = $('word-display');
const hintBox        = $('hint-box');
const submitBtn      = $('submit-btn');
const clearBtn       = $('clear-btn');
const wordLog        = $('word-log');

// ── User actions ─────────────────────────────────────────────────────────
joinBtn.addEventListener('click', doJoin);
nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') doJoin(); });
submitBtn.addEventListener('click', doSubmit);
clearBtn.addEventListener('click', doClear);
$('play-again-btn').addEventListener('click', () => send('newround'));

$('type-form').addEventListener('submit', e => {
  e.preventDefault();
  const input = $('type-input');
  const word = input.value.trim().toUpperCase();
  if (!gameActive || word.length < 3 || !/^[A-Z]+$/.test(word)) return;
  lastPath = [];                              // server will return the path it found
  send('submit', { word });                    // no `path` → server searches the grid
  input.value = '';
});

function doJoin() {
  const name = nameInput.value.trim() || 'Player';
  send('join', { name });
  joinBtn.disabled   = true;
  nameInput.disabled = true;
  waitMsg.classList.remove('hidden');
}

function doSubmit() {
  if (path.length < 3 || !gameActive) return;
  const word = path.map(i => grid[i]).join('');
  lastPath   = [...path];
  send('submit', { path: [...path], word });
  doClear();
}

function doClear() {
  path = [];
  renderPath();
}

// ── WebSocket ─────────────────────────────────────────────────────────────
function send(type, data = {}) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type, ...data }));
}

ws.addEventListener('message', e => {
  const msg = JSON.parse(e.data);
  (handlers[msg.type] || (() => {}))(msg);
});

ws.addEventListener('close', () => showHint('Connection lost — please refresh the page.', 'bad'));

const handlers = {

  init(msg) {
    myId = msg.yourId;
    applyState(msg);
  },

  waiting(msg) {
    players = msg.players || {};
    updateScoreboard();
  },

  start(msg) {
    myId = msg.yourId;
    applyState(msg);
    show(gameScreen);
    hide(joinScreen);
    hide(gameoverScreen);
  },

  tick(msg) {
    renderTimer(msg.t);
  },

  claimed(msg) {
    scores = msg.scores;
    updateScoreboard();
    addLogEntry(msg.word, msg.playerId, msg.name, msg.pts);
    const flashPath = msg.path && msg.path.length ? msg.path : lastPath;
    if (msg.playerId === myId) {
      flashCells(flashPath, 'ok');
      showHint(`✓ +${msg.pts} point${msg.pts !== 1 ? 's' : ''}!`, 'ok');
      bumpScore('left');
    } else {
      flashCells(flashPath, 'ok');
      showHint(`${msg.name} claimed ${msg.word}`, 'warn');
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
    scores  = msg.scores;
    players = msg.players;
    updateScoreboard();
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

  disconnect() {
    gameActive = false;
    showHint('The other player disconnected.', 'bad');
  },

  error(msg) {
    alert(msg.msg);
  },
};

// ── State application ─────────────────────────────────────────────────────
function applyState(msg) {
  grid       = msg.grid       || [];
  scores     = msg.scores     || {};
  players    = msg.players    || {};
  gameActive = msg.active     || false;

  buildGrid(grid);
  updateScoreboard();
  renderTimer(msg.timeLeft ?? 120);

  if (msg.claimedOrder?.length) {
    wordLog.innerHTML = '';
    [...msg.claimedOrder].reverse().forEach(w => {
      const c = msg.claimed?.[w];
      if (c) addLogEntry(w, c.playerId, c.name, c.pts);
    });
  }
}

// ── Grid ─────────────────────────────────────────────────────────────────
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

  // Tap the last selected cell again → deselect it
  if (path.at(-1) === idx) {
    path.pop();
    renderPath();
    return;
  }

  // Already in path (not last) → ignore
  if (path.includes(idx)) return;

  // Must touch the previous cell in one of 8 directions
  if (path.length > 0 && !adjacent(path.at(-1), idx)) return;

  path.push(idx);
  renderPath();
}

function adjacent(a, b) {
  return Math.abs(Math.floor(a / 5) - Math.floor(b / 5)) <= 1 &&
         Math.abs((a % 5)           - (b % 5))           <= 1 &&
         a !== b;
}

function renderPath() {
  // Rebuild cell states
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
  submitBtn.disabled = word.length < 3;
  if (!word) clearHint();
}

function flashCells(indices, type) {
  if (!indices?.length) return;
  indices.forEach(idx => {
    const cell = gridEl.children[idx];
    if (!cell) return;
    cell.classList.remove('flash-ok', 'flash-bad');
    void cell.offsetWidth; // force reflow so animation restarts
    cell.classList.add(type === 'ok' ? 'flash-ok' : 'flash-bad');
    setTimeout(() => cell.classList.remove('flash-ok', 'flash-bad'), 600);
  });
}

// ── Scoreboard ───────────────────────────────────────────────────────────
function updateScoreboard() {
  // Always show the local player on the left
  const opId = Object.keys(players).find(id => id !== myId);

  if (myId && players[myId] != null) {
    leftName.innerHTML  = `${escHtml(players[myId])}<span class="you-tag">(you)</span>`;
    leftScore.textContent = scores[myId] ?? 0;
    leftPlayer.classList.add('you');
  }

  if (opId && players[opId] != null) {
    rightName.textContent  = players[opId];
    rightScore.textContent = scores[opId] ?? 0;
    rightPlayer.classList.remove('you');
  }
}

function bumpScore(side) {
  const el = side === 'left' ? leftScore : rightScore;
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
  setTimeout(() => el.classList.remove('bump'), 400);
}

// ── Timer ─────────────────────────────────────────────────────────────────
function renderTimer(t) {
  const m = Math.floor(t / 60);
  const s = t % 60;
  timerEl.textContent = `${m}:${String(s).padStart(2, '0')}`;
  timerEl.classList.toggle('low', t <= 15);
}

// ── Hint ──────────────────────────────────────────────────────────────────
let hintTimeout;
function showHint(text, type) {
  hintBox.textContent = text;
  hintBox.className   = `hint-box ${type}`;
  clearTimeout(hintTimeout);
  hintTimeout = setTimeout(clearHint, 2600);
}
function clearHint() {
  hintBox.textContent = '';
  hintBox.className   = 'hint-box';
}

// ── Word log ──────────────────────────────────────────────────────────────
function addLogEntry(word, playerId, name, pts) {
  const entry = document.createElement('div');
  entry.className = `log-entry ${playerId === myId ? 'by-me' : 'by-them'}`;
  entry.innerHTML = `
    <span class="log-word">${escHtml(word)}</span>
    <span class="log-pts">+${pts}</span>
    <span class="log-who">${escHtml(name)} · ${pts} pt${pts !== 1 ? 's' : ''}</span>
  `;
  const empty = wordLog.querySelector('.log-empty');
  if (empty) empty.remove();
  wordLog.insertBefore(entry, wordLog.firstChild);
}

// ── Game over ─────────────────────────────────────────────────────────────
function showGameOver({ scores: sc, players: pl, winner }) {
  let emoji, headline;

  if (winner === 'tie') {
    emoji    = '🤝';
    headline = "It's a Tie!";
  } else if (winner === myId) {
    emoji    = '🏆';
    headline = 'You Win!';
  } else if (winner) {
    emoji    = '🎯';
    headline = `${pl[winner]} Wins!`;
  } else {
    emoji    = '⏱';
    headline = 'Game Over';
  }

  $('result-emoji').textContent    = emoji;
  $('result-headline').textContent = headline;

  const sorted = Object.keys(pl).sort((a, b) => (sc[b] || 0) - (sc[a] || 0));
  $('result-scores').innerHTML = sorted.map(id => `
    <div class="result-row ${id === winner ? 'winner' : ''}">
      <span class="rname">${escHtml(pl[id])}${id === myId ? ' <small>(you)</small>' : ''}</span>
      <span class="rpts">${sc[id] || 0} pts</span>
    </div>
  `).join('');

  show(gameoverScreen);
}

// ── Utility ───────────────────────────────────────────────────────────────
function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
