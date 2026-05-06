// Mangaatha — main game loop, screen manager, persistence, glue.
const $ = id => document.getElementById(id);
const PROGRESS_KEY = 'mangaatha.save.v2';

// ── Tunables ─────────────────────────────────────────────────────
const STARTING_LIVES   = 10;     // Lives at the start of a fresh adventure
const DIALOGUE_AUTO_MS = 2000;   // Auto-advance gap after a line finishes typing

// ── Persistence ──────────────────────────────────────────────────
function loadSave() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { done: [], lives: STARTING_LIVES };
}
function saveSave() {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify({ done: G.done, lives: G.lives })); } catch {}
}
function clearSave() { try { localStorage.removeItem(PROGRESS_KEY); } catch {} }

// ── State ────────────────────────────────────────────────────────
const persist = loadSave();
const G = {
  screen: 'menu',
  level: 0,
  done: persist.done.slice(),
  lives: persist.lives ?? STARTING_LIVES,
  cutscene: null,
  cutLine: 0,
  cutFrame: 0,
  rafId: null,
  active: null,
  paused: false,
};

// ── Screen manager ───────────────────────────────────────────────
function show(screen) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('show'));
  $('s-' + screen).classList.add('show');
  G.screen = screen;
  // Touch pad only relevant in level 2
  $('touch-pad').classList.toggle('hidden', !(screen === 'game' && G.level === 2));
  cancelAnimationFrame(G.rafId);
  if (screen === 'menu')      enterMenu();
  if (screen === 'family')    enterFamily();
  if (screen === 'cutscene')  enterCutscene();
  if (screen === 'game')      enterGame();
  if (screen === 'fail')      enterFail();
  if (screen === 'end')       enterEnd();
}

// ── Menu ─────────────────────────────────────────────────────────
function enterMenu() {
  const pct = G.done.length * 12.5;
  $('menu-progress').style.width = pct + '%';
  $('menu-progress-pct').textContent = pct;
}

// ── Family showcase ──────────────────────────────────────────────
function enterFamily() {
  const grid = $('family-grid');
  grid.innerHTML = '';
  FAMILY.forEach(m => {
    const card = document.createElement('div');
    card.className = 'fam-card';
    const isDone = G.done.includes(m.id);
    const isUnlocked = m.id <= (G.done.length + 1);
    if (isDone) card.classList.add('done');
    if (!isUnlocked) card.classList.add('locked');
    const status = isDone ? '✅' : (isUnlocked ? '🎯' : '🔒');
    card.innerHTML = `
      <div class="fam-status">${status}</div>
      <canvas width="120" height="170"></canvas>
      <div class="fam-name">${m.name}</div>
      <div class="fam-rel">${m.rel}</div>
    `;
    grid.appendChild(card);
    const cv = card.querySelector('canvas');
    let f = Math.random() * 100;
    function animate() {
      const cx = cv.getContext('2d');
      cx.clearRect(0,0,cv.width, cv.height);
      m.draw(cx, cv.width/2, cv.height - 5, f);
      f += 1;
      card._raf = requestAnimationFrame(animate);
    }
    animate();
    card.addEventListener('click', () => {
      if (!isUnlocked) return;
      $('family-detail').classList.remove('hidden');
      $('family-detail').innerHTML = `
        <h3>${m.name}</h3>
        <div class="rel">${m.rel}</div>
        <div class="wants">"${m.want}"</div>
      `;
    });
  });
  $('family-detail').classList.add('hidden');
}

// ── Cutscene (auto-advances after typing finishes + a 2s gap) ────
let cutTyper = null;
let cutAutoT = null;

function enterCutscene() {
  G.cutFrame = 0;
  G.cutLine = 0;
  showCutLine();
  cutLoop();
}

function cutLoop() {
  G.cutFrame++;
  const scene = SCENES[G.cutscene];
  if (!scene) return;
  const line = scene[G.cutLine];
  if (line) drawCutsceneAvatar($('cut-canvas'), line.who, G.cutFrame);
  G.rafId = requestAnimationFrame(cutLoop);
}

function showCutLine() {
  const scene = SCENES[G.cutscene];
  if (!scene) { advanceCutscene(); return; }
  const line = scene[G.cutLine];
  if (!line) { advanceCutscene(); return; }
  if (line.who === 'muru') $('cut-name').textContent = 'MURU';
  else {
    const m = FAMILY.find(f => f.key === line.who);
    $('cut-name').textContent = m ? m.name.toUpperCase() : line.who.toUpperCase();
  }
  const bubble = $('cut-bubble');
  bubble.textContent = '';
  clearTimers();
  let i = 0;
  cutTyper = setInterval(() => {
    bubble.textContent = line.text.slice(0, ++i);
    if (i >= line.text.length) {
      clearInterval(cutTyper); cutTyper = null;
      // Auto-advance after the gap (or instant on tap/space)
      cutAutoT = setTimeout(() => { cutAutoT = null; nextCutLine(); }, DIALOGUE_AUTO_MS);
    }
  }, 22);
}

function clearTimers() {
  if (cutTyper) { clearInterval(cutTyper); cutTyper = null; }
  if (cutAutoT) { clearTimeout(cutAutoT); cutAutoT = null; }
}

function nextCutLine() {
  // If still typing, complete instantly + start auto-advance
  if (cutTyper) {
    clearInterval(cutTyper); cutTyper = null;
    const scene = SCENES[G.cutscene];
    const line = scene[G.cutLine];
    $('cut-bubble').textContent = line.text;
    cutAutoT = setTimeout(() => { cutAutoT = null; nextCutLine(); }, DIALOGUE_AUTO_MS);
    return;
  }
  if (cutAutoT) { clearTimeout(cutAutoT); cutAutoT = null; }
  G.cutLine++;
  const scene = SCENES[G.cutscene];
  if (!scene || G.cutLine >= scene.length) advanceCutscene();
  else showCutLine();
}

function skipCutscene() {
  clearTimers();
  advanceCutscene();
}
function advanceCutscene() {
  const tag = G.cutscene;
  if (tag.startsWith('pre')) {
    show('game');
  } else if (tag.startsWith('win')) {
    G.done.push(G.level);
    saveSave();
    if (G.level >= 8) { show('end'); return; }
    if (G.level >= 2) {
      // For now only levels 1-2 are built — go to menu after L2
      show('menu');
      return;
    }
    G.level++;
    G.cutscene = 'pre' + G.level;
    show('cutscene');
  } else if (tag.startsWith('fail')) {
    if (G.lives <= 0) { show('fail'); }
    else show('fail');   // shows fail card then either retry or menu
  }
}

// ── Game ─────────────────────────────────────────────────────────
function enterGame() {
  const cv = $('game-canvas');
  if (G.level === 1) {
    cv.width = L1.W; cv.height = L1.H;
    $('hud-level').textContent = 'Level 1 · The Saree Chase';
    G.active = Level1;
  } else if (G.level === 2) {
    cv.width = L2.W; cv.height = L2.H;
    $('hud-level').textContent = 'Level 2 · The Painting Heist';
    G.active = Level2;
  }
  G.active.init(api);
  G.paused = false;
  _lastFrame = 0; _accumulator = 0;
  $('pause-overlay').classList.add('hidden');
  updateLivesHud();
  updateProgressHud();
  $('game-hint').textContent = G.level === 1
    ? 'Tap/Space/↑ to jump — HOLD for higher jump · Catch the auto for a 5s blitz · P to pause'
    : 'Arrow keys / D-pad to move · Stay out of guard vision · P to pause';
  gameLoop();
}

// Fixed-timestep game loop. requestAnimationFrame fires at the display
// refresh rate — 60Hz on most laptops, 90/120Hz on many phones — so without
// this, physics would run 1.5–2× faster on a high-refresh phone. The
// accumulator runs `update` exactly once per 16.67 ms regardless of refresh.
const STEP_MS = 1000 / 60;
const MAX_STEP_PER_FRAME = 5;   // safety cap so a tab returning from background doesn't run 60 updates
let _lastFrame = 0, _accumulator = 0;

function gameLoop(now) {
  G.rafId = requestAnimationFrame(gameLoop);
  if (!_lastFrame) _lastFrame = now || performance.now();
  const t = now || performance.now();
  const dt = Math.min(100, t - _lastFrame);
  _lastFrame = t;
  if (!G.paused) {
    _accumulator += dt;
    let steps = 0;
    while (_accumulator >= STEP_MS && steps < MAX_STEP_PER_FRAME) {
      G.active.update(api);
      _accumulator -= STEP_MS;
      steps++;
    }
    if (_accumulator > STEP_MS) _accumulator = 0;   // catch up if we hit cap
  }
  const cx = $('game-canvas').getContext('2d');
  G.active.render(cx);
  $('hud-status').textContent = G.paused ? 'PAUSED' : G.active.status();
  if (G.level === 1 && Level1.isBoardPossible && !G.paused) {
    $('ride-btn').classList.toggle('hidden', !Level1.isBoardPossible());
  } else {
    $('ride-btn').classList.add('hidden');
  }
}

function setPaused(on) {
  G.paused = on;
  $('pause-overlay').classList.toggle('hidden', !on);
  if (on) $('ride-btn').classList.add('hidden');
  // Release keyboard inputs so movement doesn't keep building up
  if (on && G.level === 2) {
    Level2.setDir('up', false); Level2.setDir('down', false);
    Level2.setDir('left', false); Level2.setDir('right', false);
  }
  if (on && G.level === 1) {
    Level1.jumpHold(false);
  }
}

// API for levels to call back
const api = {
  toast(msg) { $('hud-status').textContent = msg; },
  lifeLost() {
    G.lives = Math.max(0, G.lives - 1);
    updateLivesHud();
    saveSave();
    flashHit();
    if (G.lives <= 0) {
      // Out of lives → fail current level
      cancelAnimationFrame(G.rafId);
      G.cutscene = 'fail' + G.level;
      // Show fail screen with character quote
      setTimeout(() => show('fail'), 600);
    }
  },
  win() {
    cancelAnimationFrame(G.rafId);
    G.cutscene = 'win' + G.level;
    show('cutscene');
  },
  gainLife() {
    G.lives = Math.min(99, G.lives + 1);
    updateLivesHud();
    saveSave();
  },
  lose() {
    G.lives = Math.max(0, G.lives - 1);
    saveSave();
    cancelAnimationFrame(G.rafId);
    G.cutscene = 'fail' + G.level;
    setTimeout(() => show('fail'), 400);
  },
};

function updateLivesHud() {
  // Compact for >=4 lives so the HUD doesn't get cluttered with the new 10-life default
  $('hud-lives').textContent = G.lives <= 3
    ? '❤️'.repeat(Math.max(0, G.lives)) + '🖤'.repeat(Math.max(0, 3 - G.lives))
    : `× ${G.lives}`;
}
function updateProgressHud() {
  $('hud-progress').style.width = (G.done.length * 12.5) + '%';
}

function flashHit() {
  const wrap = $('canvas-wrap');
  wrap.classList.remove('hit'); void wrap.offsetWidth;
  wrap.classList.add('hit');
  setTimeout(() => wrap.classList.remove('hit'), 420);
}

// ── Fail screen ──────────────────────────────────────────────────
function enterFail() {
  const scene = SCENES['fail' + G.level];
  if (scene && scene[0]) $('fail-quote').textContent = scene[0].text;
  $('fail-title').textContent = G.lives <= 0 ? 'Game Over!' : 'Aiyyo! Try again!';
}

// ── End screen ───────────────────────────────────────────────────
function enterEnd() {
  const row = $('kalyanam-row');
  row.innerHTML = '';
  FAMILY.slice(0, 8).forEach(m => {
    const cv = document.createElement('canvas');
    cv.width = 80; cv.height = 110;
    row.appendChild(cv);
    let f = Math.random() * 100;
    function tick() {
      const cx = cv.getContext('2d');
      cx.clearRect(0,0,cv.width, cv.height);
      m.draw(cx, cv.width/2, cv.height - 4, f);
      f++;
      requestAnimationFrame(tick);
    }
    tick();
  });
  // Reset save so they can play again
}

// ── Wire events ──────────────────────────────────────────────────
document.addEventListener('click', e => {
  const a = e.target.closest('[data-action]');
  if (!a) return;
  const act = a.dataset.action;
  if (act === 'start')      startAdventure();
  if (act === 'family')     show('family');
  if (act === 'menu')       show('menu');
  if (act === 'reset')      { G.done = []; G.lives = STARTING_LIVES; G.level = 0; clearSave(); show('menu'); }
  if (act === 'retry')      retryLevel();
  if (act === 'jumplevel')  jumpToLevel(parseInt(a.dataset.level, 10));
});

// Skip the story and drop straight into a level — top up lives so the player
// can actually try it. Levels 3+ aren't built yet so we no-op those.
function jumpToLevel(n) {
  if (!Number.isFinite(n) || n < 1 || n > 8) return;
  if (n > 2) { alert('Level ' + n + ' isn\'t built yet — only L1 and L2 are playable.'); return; }
  if (G.lives < 3) { G.lives = STARTING_LIVES; saveSave(); }
  G.level = n;
  show('game');
}

function startAdventure() {
  if (!Number.isFinite(G.lives) || G.lives <= 0) G.lives = STARTING_LIVES;
  G.level = G.done.length + 1;
  if (G.level > 8) { show('end'); return; }
  if (G.level > 2) { alert('Levels 3+ coming soon — only L1 and L2 are built!'); return; }
  G.cutscene = 'pre' + G.level;
  show('cutscene');
}

function retryLevel() {
  if (G.lives <= 0) { G.lives = STARTING_LIVES; saveSave(); }
  // Skip the intro cutscene — straight back into action
  show('game');
}

$('cut-next').addEventListener('click', nextCutLine);
$('cut-skip').addEventListener('click', skipCutscene);

// Keyboard
window.addEventListener('keydown', e => {
  if (G.screen === 'cutscene') {
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); nextCutLine(); }
    if (e.code === 'Escape') skipCutscene();
    return;
  }
  if (G.screen !== 'game') return;

  // Pause toggle (P or Escape)
  if (e.code === 'KeyP' || e.code === 'Escape') {
    e.preventDefault(); setPaused(!G.paused); return;
  }
  if (G.paused) return;

  if (G.level === 1) {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      if (!e.repeat) Level1.jumpPress();
      Level1.jumpHold(true);
    } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      e.preventDefault();
      if (!e.repeat) Level1.boardPress();
    }
  } else if (G.level === 2) {
    const map = { ArrowUp:'up', KeyW:'up', ArrowDown:'down', KeyS:'down',
                  ArrowLeft:'left', KeyA:'left', ArrowRight:'right', KeyD:'right' };
    if (map[e.code]) { e.preventDefault(); Level2.setDir(map[e.code], true); }
  }
});
window.addEventListener('keyup', e => {
  if (G.screen !== 'game') return;
  if (G.level === 1) {
    if (['Space','ArrowUp','KeyW'].includes(e.code)) Level1.jumpHold(false);
  } else if (G.level === 2) {
    const map = { ArrowUp:'up', KeyW:'up', ArrowDown:'down', KeyS:'down',
                  ArrowLeft:'left', KeyA:'left', ArrowRight:'right', KeyD:'right' };
    if (map[e.code]) Level2.setDir(map[e.code], false);
  }
});

// Touch / click on game canvas (Level 1 — jump press + hold-to-go-higher)
$('game-canvas').addEventListener('pointerdown', e => {
  if (G.screen !== 'game' || G.level !== 1 || G.paused) return;
  Level1.jumpPress();
  Level1.jumpHold(true);
});
$('game-canvas').addEventListener('pointerup',     () => { if (G.level === 1) Level1.jumpHold(false); });
$('game-canvas').addEventListener('pointerleave',  () => { if (G.level === 1) Level1.jumpHold(false); });
$('game-canvas').addEventListener('pointercancel', () => { if (G.level === 1) Level1.jumpHold(false); });

// Pause button + click-to-resume on the overlay
$('pause-btn').addEventListener('click',     () => setPaused(true));
$('resume-btn').addEventListener('click',    () => setPaused(false));
$('pause-overlay').addEventListener('click', e => { if (e.target === $('pause-overlay')) setPaused(false); });

// RIDE button (Level 1 mobile / desktop alternative to the DOWN key)
const rideBtn = $('ride-btn');
function boardFromButton(e) {
  e.preventDefault();
  e.stopPropagation();
  if (G.level === 1 && !G.paused) Level1.boardPress();
}
rideBtn.addEventListener('pointerdown', boardFromButton);
rideBtn.addEventListener('touchstart',  boardFromButton, { passive: false });
rideBtn.addEventListener('click',       boardFromButton);

// Touch pad (Level 2)
document.querySelectorAll('.dpad-btn').forEach(b => {
  const dir = b.dataset.dir;
  const set = on => { if (G.level === 2) Level2.setDir(dir, on); };
  b.addEventListener('touchstart', e => { e.preventDefault(); set(true); }, { passive: false });
  b.addEventListener('touchend',   e => { e.preventDefault(); set(false); }, { passive: false });
  b.addEventListener('mousedown',  () => set(true));
  b.addEventListener('mouseup',    () => set(false));
  b.addEventListener('mouseleave', () => set(false));
});

// Boot
show('menu');
