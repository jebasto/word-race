// Blackjack — multiplayer client
const $ = id => document.getElementById(id);

// ── Profile / chips ────────────────────────────────────────────────
const profile = Profile.get();
if (!profile.name) location.href = '/';   // need a name; bounce back to hub

// Room code in URL (?r=…); default to "public"
const params  = new URLSearchParams(location.search);
const tableId = (params.get('r') || 'public').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);

$('sit-name').textContent      = profile.name;
$('sit-chips').textContent     = profile.chips.toLocaleString();
$('sit-room-code').textContent = tableId;

// ── WebSocket ──────────────────────────────────────────────────────
const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
const ws      = new WebSocket(`${wsProto}://${location.host}/ws/blackjack?r=${tableId}`);

let state    = null;     // last full state from server
let myId     = null;     // server-assigned table seat id (p1/p2/...)
let seated   = false;
let hasBetThisRound = false;

ws.addEventListener('open', () => {
  // If we're already low on chips, show broke screen up front
  if (profile.chips < 50) showBroke();
});

ws.addEventListener('message', e => {
  const msg = JSON.parse(e.data);
  if (msg.type === 'state')    onState(msg);
  else if (msg.type === 'hello') onState(msg);
  else if (msg.type === 'seated') { seated = true; myId = msg.yourId; }
  else if (msg.type === 'full')   showSitMsg('Table is full — try again in a few seconds.', true);
  else if (msg.type === 'broke')  showBroke();
  else if (msg.type === 'roundend') hasBetThisRound = false;
});

ws.addEventListener('close', () => {
  showSitMsg('Connection lost. Refresh to retry.', true);
});

function send(type, data = {}) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type, ...data }));
}

// ── Sit-down ───────────────────────────────────────────────────────
$('sit-btn').addEventListener('click', () => {
  if (profile.chips < 50) { showBroke(); return; }
  send('sit', { name: profile.name, chips: profile.chips, profileId: profile.id });
  $('sit-btn').disabled = true;
  showSitMsg('Taking a seat…');
});

function showSitMsg(text, bad = false) {
  const el = $('sit-msg');
  el.textContent = text;
  el.classList.toggle('bad', bad);
}

// ── How-to modal ───────────────────────────────────────────────────
$('how-btn').addEventListener('click',   () => $('how-modal').classList.remove('hidden'));
$('how-close').addEventListener('click', () => $('how-modal').classList.add('hidden'));
$('how-modal').addEventListener('click', e => { if (e.target === $('how-modal')) $('how-modal').classList.add('hidden'); });

// ── State sync ─────────────────────────────────────────────────────
let prevPlayers = {};   // pid -> {chips, betSent, hands}
let prevPhase   = null;

function onState(msg) {
  const oldState = state;
  state = msg;
  if (msg.yourId) myId = msg.yourId;

  if (seated && myId) {
    $('sit-screen').classList.add('hidden');
    $('game-screen').classList.remove('hidden');
  }

  render();
  detectAnimations(oldState);
  updateChipsFromState();

  prevPhase = msg.phase;
}

function detectAnimations(prev) {
  if (!state || !state.players) return;
  for (const p of state.players) {
    const old = prevPlayers[p.id];
    const oldChips = old?.chips;
    const oldBet   = old?.firstBet ?? 0;
    const newBet   = (p.hands?.[0]?.bet) || 0;

    // 1) Bet placed: bet went 0 → X. Fly chip from seat to pot.
    if (newBet > oldBet && (state.phase === 'lobby' || state.phase === 'dealing')) {
      flyChip(seatEl(p.id), $('pot-anchor'), '-' + (newBet - oldBet), 'bet');
    }

    // 2) Payout: chips went up during resolution. Fly chip from pot to seat + show +X.
    if (state.phase === 'resolution' && oldChips != null && p.chips > oldChips) {
      const delta = p.chips - oldChips;
      flyChip($('pot-anchor'), seatEl(p.id), '+' + delta, 'win');
      popPayout(p.id, '+' + delta, 'gain');
    }
    // 3) Loss flash: bet > 0 last hand and result = lose/bust → -bet floater
    if (state.phase === 'resolution' && p.hands?.length) {
      for (const h of p.hands) {
        if (h.result === 'lose' || h.result === 'bust') {
          if (!old?.lossShown?.[h.bet]) {
            popPayout(p.id, '-' + h.bet, 'loss');
            old && (old.lossShown = { ...(old.lossShown||{}), [h.bet]: true });
          }
        }
      }
    }

    prevPlayers[p.id] = {
      chips: p.chips,
      firstBet: newBet,
      lossShown: prevPlayers[p.id]?.lossShown || {},
    };
  }
}

function seatEl(pid) {
  return document.querySelector(`.seat[data-pid="${pid}"]`) || $('pot-anchor');
}

function flyChip(fromEl, toEl, label, kind) {
  if (!fromEl || !toEl) return;
  const r1 = fromEl.getBoundingClientRect();
  const r2 = toEl.getBoundingClientRect();
  const cx1 = r1.left + r1.width / 2;
  const cy1 = r1.top  + r1.height / 2;
  const cx2 = r2.left + r2.width / 2;
  const cy2 = r2.top  + r2.height / 2;
  const chip = document.createElement('div');
  chip.className = 'flying-chip';
  chip.textContent = label;
  chip.style.left = cx1 + 'px';
  chip.style.top  = cy1 + 'px';
  document.body.appendChild(chip);
  // next frame → animate
  requestAnimationFrame(() => {
    chip.style.transform = `translate(${cx2 - cx1 - r1.width/2 + r1.width/2}px, ${cy2 - cy1}px) scale(0.85)`;
    chip.style.opacity   = '0.4';
  });
  setTimeout(() => chip.remove(), 750);
}

function popPayout(pid, text, cls) {
  const seat = seatEl(pid);
  if (!seat || seat.id === 'pot-anchor') return;
  const pop = document.createElement('div');
  pop.className = 'payout-pop ' + cls;
  pop.textContent = text;
  seat.appendChild(pop);
  setTimeout(() => pop.remove(), 1700);
}

function updateChipsFromState() {
  if (!state || !myId) return;
  const me = (state.players || []).find(p => p.id === myId);
  if (me) {
    Profile.setChips(me.chips);
    $('sit-chips').textContent = me.chips.toLocaleString();
  }
}

// ── Renderers ──────────────────────────────────────────────────────
function render() {
  if (!state) return;
  renderPhaseBar();
  renderDealer();
  renderSeats();
  renderActionPanel();
  renderEventLog();
}

function renderPhaseBar() {
  const labels = {
    idle:        'Waiting for players',
    lobby:       state.phaseDeadline > 0 ? 'Place your bets' : 'Waiting for first bet…',
    dealing:     'Dealing…',
    insurance:   'Insurance offered',
    playing:     'Players playing',
    dealer:      'Dealer drawing',
    resolution:  'Round complete — next in',
  };
  $('phase-label').textContent = labels[state.phase] || state.phase;

  const t = $('phase-timer');
  if (state.phaseDeadline > 0) {
    const left = Math.max(0, Math.ceil(state.phaseDeadline - state.now));
    t.textContent = left + 's';
    t.classList.toggle('urgent', left <= 5 && state.phase !== 'resolution');
  } else {
    t.textContent = '';
    t.classList.remove('urgent');
  }

  const players = state.players || [];
  $('phase-info').textContent = players.length
    ? `${players.length}/${state.maxPlayers} seated`
    : '';
}

function renderDealer() {
  const hand = $('dealer-hand');
  hand.innerHTML = '';
  (state.dealer || []).forEach(c => hand.appendChild(makeCard(c)));

  const tot = $('dealer-total');
  if (state.dealerRevealed) {
    tot.textContent = state.dealerBJ ? 'BJ' : state.dealerTotal;
  } else if (state.dealerTotal != null) {
    tot.textContent = state.dealerTotal + (state.dealerSoft ? ' soft' : '') + ' / ?';
  } else {
    tot.textContent = '';
  }
}

function renderSeats() {
  const seats = $('seats');
  seats.innerHTML = '';

  const playersById = Object.fromEntries((state.players || []).map(p => [p.id, p]));
  // Render slot 1..MAX so empty seats show
  for (let i = 1; i <= state.maxPlayers; i++) {
    const pid = `p${i}`;
    const p   = playersById[pid];
    const div = document.createElement('div');
    div.className = 'seat';
    div.dataset.pid = pid;

    if (!p) {
      div.classList.add('empty');
      div.innerHTML = `<div class="seat-empty">Empty seat</div>`;
      seats.appendChild(div);
      continue;
    }

    if (p.id === myId)              div.classList.add('you');
    if (state.currentPid === p.id)  div.classList.add('active');
    if (p.sitOut)                   div.classList.add('sitout');
    if (p.skipRound)                div.classList.add('sitout');
    if (!p.connected)               div.classList.add('disconnected');

    let html = '';
    if (p.id === myId) html += `<span class="you-tag">YOU</span>`;
    if (p.skipRound)   html += `<span class="insurance-tag">SITTING OUT</span>`;
    else if (p.insurance > 0) html += `<span class="insurance-tag">INS ${p.insurance}</span>`;

    html += `
      <div class="seat-head">
        <span class="seat-name">${esc(p.name)}</span>
        <span class="seat-chips">${p.chips.toLocaleString()}</span>
      </div>
      <div class="seat-hands">${renderPlayerHands(p)}</div>
    `;
    div.innerHTML = html;
    seats.appendChild(div);
  }
}

function renderPlayerHands(p) {
  if (!p.hands.length || (p.hands.length === 1 && !p.hands[0].cards.length && p.hands[0].bet === 0)) {
    if (p.sitOut) return `<div class="seat-empty">Sitting out</div>`;
    if (state.phase === 'lobby') return `<div class="seat-empty">Waiting…</div>`;
    return '';
  }
  return p.hands.map((h, idx) => {
    const isCurrent = state.currentPid === p.id && state.currentHandIdx === idx;
    let cards = '';
    h.cards.forEach(c => { cards += makeCard(c).outerHTML; });
    let result = '';
    if (h.result) {
      const text = { win: 'WIN', bj: 'BLACKJACK', push: 'PUSH', lose: 'LOSE', bust: 'BUST', surrender: 'SURRENDER' }[h.result];
      result = `<span class="hand-result ${h.result}">${text}</span>`;
    }
    const totalBlock = h.cards.length ? `
      <div class="meta-block total">
        <div class="meta-label">TOTAL</div>
        <div class="meta-value ${h.isBlackjack ? 'total-bj' : ''}">${h.total}${h.soft ? '<span class="total-soft">soft</span>' : ''}</div>
      </div>` : '';
    const betBlock = h.bet > 0 ? `
      <div class="meta-block bet">
        <div class="meta-label">BET</div>
        <div class="meta-value">${h.bet}</div>
      </div>` : '';
    return `
      <div class="seat-hand ${isCurrent ? 'current' : ''}" data-pid="${p.id}" data-handidx="${idx}">
        <div class="seat-hand-cards">${cards}</div>
        <div class="hand-meta">${betBlock}${totalBlock}</div>
        ${result}
      </div>
    `;
  }).join('');
}

function makeCard(c) {
  const div = document.createElement('div');
  div.className = 'card';
  if (c.r === '?') {
    div.classList.add('back');
    return div;
  }
  const isRed = c.s === 'H' || c.s === 'D';
  div.classList.add(isRed ? 'red' : 'black');
  const sym = { S: '♠', H: '♥', D: '♦', C: '♣' }[c.s] || c.s;
  div.innerHTML = `
    <div class="card-corner tl"><span class="card-corner-rank">${c.r}</span><span class="card-corner-suit">${sym}</span></div>
    <div class="card-mid">${sym}</div>
    <div class="card-corner br"><span class="card-corner-rank">${c.r}</span><span class="card-corner-suit">${sym}</span></div>
  `;
  return div;
}

// ── Action panel ───────────────────────────────────────────────────
function renderActionPanel() {
  const me = (state.players || []).find(p => p.id === myId);

  $('bet-ui').classList.add('hidden');
  $('ins-ui').classList.add('hidden');
  $('actions-ui').classList.add('hidden');
  $('idle-msg').textContent = '';

  if (!me) {
    $('idle-msg').textContent = state.phase === 'idle'
      ? 'Take a seat to play.'
      : 'Watching… you can take a seat between rounds.';
    return;
  }

  // Lobby/betting phase
  if (state.phase === 'lobby') {
    if (me.hands.length && me.hands[0].bet > 0) {
      $('idle-msg').textContent = `Bet placed: ${me.hands[0].bet}. Waiting for others…`;
    } else {
      renderBetUI(me);
    }
    return;
  }

  // Insurance phase
  if (state.phase === 'insurance') {
    const decided = me.insurance > 0 || me.hands.length === 0 || me.hands[0].finished;
    if (decided) {
      $('idle-msg').textContent = me.insurance > 0
        ? `Insurance: ${me.insurance}. Waiting for dealer…`
        : 'Waiting for dealer to peek…';
    } else {
      $('ins-ui').classList.remove('hidden');
    }
    return;
  }

  // Playing phase — only the active player can act
  if (state.phase === 'playing') {
    if (state.currentPid === myId) {
      $('actions-ui').classList.remove('hidden');
      configureActionButtons(me);
    } else if (me.sitOut) {
      $('idle-msg').textContent = 'Sitting out this round.';
    } else {
      $('idle-msg').textContent = 'Waiting for your turn…';
    }
    return;
  }

  if (state.phase === 'dealer')      $('idle-msg').textContent = 'Dealer playing…';
  else if (state.phase === 'resolution') $('idle-msg').textContent = 'Hand complete.';
  else if (state.phase === 'idle')   $('idle-msg').textContent = 'Waiting for the next round to begin…';
  else                                $('idle-msg').textContent = '';
}

function renderBetUI(me) {
  $('bet-ui').classList.remove('hidden');
  const sittingOut = !!me.sitOutToggle;
  const presets = document.querySelectorAll('.bet-presets button');
  presets.forEach(b => {
    const amt = b.dataset.amt;
    const v = amt === 'all' ? me.chips : parseInt(amt, 10);
    b.disabled = sittingOut || me.chips < (amt === 'all' ? state.minBet : v) || v < state.minBet;
  });
  $('bet-place').disabled = sittingOut;
  $('bet-custom-input').disabled = sittingOut;
  $('bet-summary').textContent = sittingOut
    ? 'Sit-out is on. Toggle off to bet.'
    : `Min bet ${state.minBet}. You have ${me.chips} chips.`;
  const inp = $('bet-custom-input');
  inp.min = state.minBet; inp.max = me.chips;
  $('sitout-toggle').checked = sittingOut;
}

function configureActionButtons(me) {
  const hand = me.hands[me.currentHand];
  if (!hand) return;
  const canDouble    = hand.cards.length === 2 && !hand.surrendered && me.chips >= hand.bet;
  const canSplit     = hand.cards.length === 2 && !hand.isSplit && me.chips >= hand.bet
                        && (hand.cards[0].r === hand.cards[1].r ||
                            (['10','J','Q','K'].includes(hand.cards[0].r) && ['10','J','Q','K'].includes(hand.cards[1].r)))
                        && me.hands.length < 4;
  const canSurrender = hand.cards.length === 2 && !hand.doubled && !hand.isSplit;

  document.querySelectorAll('.act-btn').forEach(b => {
    const a = b.dataset.act;
    b.disabled = (a === 'double' && !canDouble) ||
                 (a === 'split'  && !canSplit) ||
                 (a === 'surrender' && !canSurrender);
  });
}

// Bet handlers
document.querySelectorAll('.bet-presets button').forEach(b => {
  b.addEventListener('click', () => {
    const me = (state?.players || []).find(p => p.id === myId);
    if (!me) return;
    const amt = b.dataset.amt;
    const v = amt === 'all' ? me.chips : parseInt(amt, 10);
    placeBet(v);
  });
});

$('bet-place').addEventListener('click', () => {
  const v = parseInt($('bet-custom-input').value, 10);
  if (Number.isFinite(v)) placeBet(v);
});
$('bet-custom-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); $('bet-place').click(); }
});

function placeBet(v) {
  if (!Number.isFinite(v) || v < (state?.minBet || 50)) return;
  send('bet', { amount: v });
  hasBetThisRound = true;
}

// Action handlers
document.querySelectorAll('.act-btn').forEach(b => {
  b.addEventListener('click', () => {
    if (b.disabled) return;
    send('action', { action: b.dataset.act });
  });
});

// Insurance
$('ins-yes').addEventListener('click', () => send('insurance', { take: true }));
$('ins-no').addEventListener('click',  () => send('insurance', { take: false }));

// Sit-out toggle
$('sitout-toggle').addEventListener('change', e => {
  send('sitout', { on: e.target.checked });
});

// ── Event log ──────────────────────────────────────────────────────
let lastLogged = '';
function renderEventLog() {
  if (!state.lastAction || state.lastAction === lastLogged) return;
  lastLogged = state.lastAction;
  const log = $('event-log');
  const div = document.createElement('div');
  div.className = 'ev';
  div.textContent = state.lastAction;
  log.appendChild(div);
  while (log.children.length > 30) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
}

// ── Broke screen ───────────────────────────────────────────────────
function showBroke() {
  $('broke-screen').classList.remove('hidden');
}
$('refill-btn').addEventListener('click', () => {
  Profile.setChips(1000);
  location.reload();
});

// Tick the timer locally between server updates
setInterval(() => {
  if (!state) return;
  state.now = (state.now || 0) + 0.5;
  renderPhaseBar();
}, 500);

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
