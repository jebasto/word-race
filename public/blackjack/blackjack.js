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
  maybeShowBanner(oldState);
  updateChipsFromState();

  prevPhase = msg.phase;
}

function detectAnimations(prev) {
  if (!state || !state.players) return;
  for (const p of state.players) {
    const old = prevPlayers[p.id];
    const oldChips = old?.chips;
    const oldBet   = old?.totalBet ?? 0;
    const newBet   = (p.hands || []).reduce((sum, h) => sum + (h.bet || 0), 0);

    // 1) Bet placed (or doubled / split adding chips to pot): chip flies from seat to pot slot.
    if (newBet > oldBet && (state.phase === 'lobby' || state.phase === 'dealing' || state.phase === 'playing')) {
      const delta = newBet - oldBet;
      // Fire 3 chips with cascading delays for a "stack tossed" feel.
      // Target the pot slot (which we render right after this in maybeShowBanner / renderPotSlots).
      // Use a short delay so the slot has time to mount.
      const target = () => potSlotEl(p.id) || $('pot-slots');
      const seat   = seatEl(p.id);
      const labels = chipBreakdown(delta);
      labels.forEach((amt, i) => {
        setTimeout(() => flyChip(seat, target(), '-' + amt, 'bet'), i * 110);
      });
    }

    // 2) Chip-count roller animates from old to new (only if we have an old value)
    if (oldChips != null && oldChips !== p.chips) {
      const chipEl = document.querySelector(`.seat[data-pid="${p.id}"] .seat-chips`);
      if (chipEl) {
        // Set to old immediately to avoid flash, then animate to new
        chipEl.textContent = oldChips.toLocaleString();
        animateNumber(chipEl, oldChips, p.chips, 800);
      }
    }

    // 3) Payout: chips flies from pot slot back to seat + floating +X
    if (state.phase === 'resolution' && oldChips != null && p.chips > oldChips) {
      const delta = p.chips - oldChips;
      const fromEl = potSlotEl(p.id) || $('pot-slots');
      flyChip(fromEl, seatEl(p.id), '+' + delta, 'win');
      popPayout(p.id, '+' + delta, 'gain');
    }

    // 4) Loss / surrender at resolution: chips fly to dealer pile + floater
    if (state.phase === 'resolution' && p.hands?.length) {
      for (let i = 0; i < p.hands.length; i++) {
        const h = p.hands[i];
        const isLoss = (h.result === 'lose' || h.result === 'bust');
        const isSurr = (h.result === 'surrender');
        if (!isLoss && !isSurr) continue;
        const lossKey = `loss-${i}-${h.bet}`;
        if (old?.lossShown?.[lossKey]) continue;
        if (old) old.lossShown = { ...(old.lossShown||{}), [lossKey]: true };

        if (h.result === 'bust') continue;   // bust already animated mid-play
        const slot = potSlotEl(p.id);
        const target = $('dealer-pile');
        const amt = isSurr ? Math.floor(h.bet / 2) : h.bet;   // surrender = lose half
        if (slot && target) {
          const labels = chipBreakdown(amt);
          labels.forEach((a, idx) => setTimeout(() => flyChip(slot, target, '−' + a, 'loss'), idx * 100));
        }
        popPayout(p.id, '-' + amt, 'loss');
      }
    }

    // 5) Surrender during play: also fly chip immediately (half of bet)
    if (state.phase === 'playing' && p.hands?.length) {
      for (let i = 0; i < p.hands.length; i++) {
        const h = p.hands[i];
        if (!h.surrendered) continue;
        const surrKey = `surr-${i}`;
        if (old?.lossShown?.[surrKey]) continue;
        if (old) old.lossShown = { ...(old.lossShown||{}), [surrKey]: true };
        const slot = potSlotEl(p.id);
        const target = $('dealer-pile');
        const amt = Math.floor(h.bet / 2);
        if (slot && target) flyChip(slot, target, '−' + amt, 'loss');
        popPayout(p.id, '-' + amt, 'loss');
      }
    }

    prevPlayers[p.id] = {
      chips: p.chips,
      totalBet: newBet,
      lossShown: prevPlayers[p.id]?.lossShown || {},
    };
  }
}

// Break a bet into 1-3 visible chips so the toss looks substantial
function chipBreakdown(amount) {
  if (amount <= 50)   return [amount];
  if (amount <= 200)  return [Math.floor(amount/2), Math.ceil(amount/2)];
  return [Math.floor(amount/3), Math.floor(amount/3), amount - 2*Math.floor(amount/3)];
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
  renderPotSlots();
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

// Persistent pot slots on the dealer felt
function renderPotSlots() {
  const slotsEl = $('pot-slots');
  // Build a map of slots we want to display
  const want = new Map();   // pid -> totalBet
  for (const p of state.players || []) {
    if (p.skipRound) continue;
    let total = 0;
    for (const h of p.hands || []) {
      // Hands that have already lost (bust / surrender) — chips have moved to dealer
      const lostAlready = (h.finished && (h.total > 21)) || h.surrendered
                         || h.result === 'bust' || h.result === 'lose' || h.result === 'surrender';
      if (lostAlready) continue;
      total += h.bet || 0;
    }
    if (total > 0) {
      want.set(p.id, { name: p.name, total });
    }
  }

  // Hide pot slots entirely once round resolves and we're back at lobby with no bets
  if (state.phase === 'lobby' && want.size === 0) {
    slotsEl.innerHTML = '';
    return;
  }

  // Diff against current DOM
  const have = new Set();
  [...slotsEl.children].forEach(el => have.add(el.dataset.pid));

  // Add new
  for (const [pid, info] of want.entries()) {
    let el = slotsEl.querySelector(`.pot-slot[data-pid="${pid}"]`);
    if (!el) {
      el = document.createElement('div');
      el.className = 'pot-slot' + (pid === myId ? ' you' : '');
      el.dataset.pid = pid;
      el.innerHTML = `
        <div class="pot-chip">${info.total >= 1000 ? '1K' : info.total}</div>
        <div class="pot-name">${esc(info.name)}</div>
        <div class="pot-amount" data-amt>${info.total}</div>
      `;
      slotsEl.appendChild(el);
    } else {
      const amtEl = el.querySelector('[data-amt]');
      const cur = parseInt(amtEl.textContent, 10) || 0;
      if (cur !== info.total) animateNumber(amtEl, cur, info.total, 600);
      el.querySelector('.pot-chip').textContent = info.total >= 1000 ? '1K' : info.total;
    }
  }

  // Remove gone (with fade)
  [...slotsEl.children].forEach(el => {
    const pid = el.dataset.pid;
    if (!want.has(pid) && !el.classList.contains('fading')) {
      el.classList.add('fading');
      setTimeout(() => el.remove(), 600);
    }
  });
}

function potSlotEl(pid) {
  return document.querySelector(`.pot-slot[data-pid="${pid}"]`);
}

// ── Banners (turn change / Blackjack / bust) ──────────────────────
let lastBannerKey  = '';
let bannerTimer    = null;
let announcedBJs   = new Set();
let announcedBusts = new Set();
let dealerSkipShown = false;

function showBanner(text, kind = 'normal') {
  const el = $('banner');
  el.textContent = text;
  el.className = 'banner ' + kind;
  el.classList.remove('hidden');
  // Force animation restart
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  if (bannerTimer) clearTimeout(bannerTimer);
  const ms = kind === 'bj' ? 2700 : 2100;
  bannerTimer = setTimeout(() => el.classList.add('hidden'), ms);
}

function maybeShowBanner(prev) {
  if (!state) return;

  // Blackjack at deal-time: show as soon as we see a BJ hand and haven't announced it
  if (state.phase === 'dealing' || state.phase === 'playing' || state.phase === 'insurance') {
    for (const p of state.players || []) {
      for (const h of p.hands || []) {
        if (h.isBlackjack && h.cards.length === 2) {
          const key = `bj-${p.id}-${h.cards.length}`;
          if (!announcedBJs.has(key)) {
            announcedBJs.add(key);
            showBanner(`${p.name.toUpperCase()} — BLACKJACK!`, 'bj');
            return;   // one banner at a time
          }
        }
      }
    }
  }

  // Bust announcement (during playing phase, fires the moment a hand busts)
  if (state.phase === 'playing' || state.phase === 'dealing') {
    for (const p of state.players || []) {
      for (let i = 0; i < (p.hands || []).length; i++) {
        const h = p.hands[i];
        if (h.finished && h.total > 21) {
          const key = `bust-${p.id}-${i}-${h.cards.length}`;
          if (!announcedBusts.has(key)) {
            announcedBusts.add(key);
            const who = p.id === myId ? 'YOU' : p.name.toUpperCase();
            showBanner(`${who} BUSTED!`, 'dealer');
            // Send chip flying to dealer's pile
            const slot = potSlotEl(p.id);
            const target = $('dealer-pile');
            if (slot && target) {
              const labels = chipBreakdown(h.bet);
              labels.forEach((amt, idx) => {
                setTimeout(() => flyChip(slot, target, '−' + amt, 'loss'), idx * 100);
              });
            }
          }
        }
      }
    }
  }

  // Player turn change
  if (state.phase === 'playing' && state.currentPid) {
    const key = `turn-${state.currentPid}-${state.currentHandIdx}`;
    if (key !== lastBannerKey) {
      lastBannerKey = key;
      const p = (state.players || []).find(x => x.id === state.currentPid);
      if (p) {
        const text = p.id === myId ? 'YOUR TURN' : `${p.name.toUpperCase()}'S TURN`;
        showBanner(text);
      }
    }
    return;
  }

  // Dealer turn  — skipped if all players busted
  if (state.phase === 'dealer') {
    if (state.dealerSkipped && !dealerSkipShown) {
      dealerSkipShown = true;
      showBanner('DEALER STANDS — ALL PLAYERS BUSTED', 'dealer');
      lastBannerKey = 'dealer-skipped';
    } else if (!state.dealerSkipped) {
      const key = 'dealer-turn';
      if (key !== lastBannerKey) {
        lastBannerKey = key;
        showBanner("DEALER'S TURN", 'dealer');
      }
    }
    return;
  }

  // Reset banner key when round resets
  if (state.phase === 'lobby') {
    lastBannerKey   = '';
    dealerSkipShown = false;
    announcedBJs.clear();
    announcedBusts.clear();
  }
}

// ── Animated chip-count roller ─────────────────────────────────────
function animateNumber(el, from, to, duration = 700) {
  const start = performance.now();
  const delta = to - from;
  const tick  = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);   // ease-out
    el.textContent = Math.round(from + delta * eased).toLocaleString();
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
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
    const busted = h.finished && h.total > 21;
    return `
      <div class="seat-hand ${isCurrent ? 'current' : ''} ${busted ? 'busted' : ''}" data-pid="${p.id}" data-handidx="${idx}">
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
  $('bet-confirm').classList.add('hidden');
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
      renderBetConfirm(me);
    } else if (me.sitOutToggle) {
      renderBetUI(me);   // let them un-toggle sit-out
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

function renderBetConfirm(me) {
  $('bet-confirm').classList.remove('hidden');
  const myBet = me.hands?.[0]?.bet || 0;
  $('bet-confirm-amount').textContent = myBet.toLocaleString();

  // Status: who else hasn't bet yet?
  const pending = (state.players || []).filter(p =>
    p.id !== me.id && !p.skipRound && !(p.hands?.[0]?.bet > 0)
  );
  const status = $('bet-confirm-status');
  if (pending.length === 0) {
    status.textContent = 'All bets in — dealing…';
    status.classList.add('everyone');
  } else if (pending.length === 1) {
    status.textContent = `Waiting on ${pending[0].name}…`;
    status.classList.remove('everyone');
  } else {
    status.textContent = `Waiting on ${pending.length} other players…`;
    status.classList.remove('everyone');
  }

  // Timer
  const t = $('bet-confirm-timer');
  if (state.phaseDeadline > 0) {
    const left = Math.max(0, Math.ceil(state.phaseDeadline - state.now));
    t.textContent = left + 's';
    t.classList.toggle('urgent', left <= 5);
  } else {
    t.textContent = '–';
    t.classList.remove('urgent');
  }
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

// Tick local timer between server updates (phase bar + bet-confirm)
setInterval(() => {
  if (!state) return;
  state.now = (state.now || 0) + 0.5;
  renderPhaseBar();
  // Update the bet-confirm countdown if it's visible
  if (!$('bet-confirm').classList.contains('hidden') && state.phaseDeadline > 0) {
    const left = Math.max(0, Math.ceil(state.phaseDeadline - state.now));
    const t = $('bet-confirm-timer');
    t.textContent = left + 's';
    t.classList.toggle('urgent', left <= 5);
  }
}, 500);

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
