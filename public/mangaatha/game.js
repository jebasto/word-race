// Mangaatha — main game loop, screen manager, persistence, glue.
const $ = id => document.getElementById(id);
const PROGRESS_KEY = 'mangaatha.save.v1';

// ── Persistence ──────────────────────────────────────────────────
function loadSave() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { done: [], lives: 3 };
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
  lives: persist.lives ?? 3,
  cutscene: null,
  cutLine: 0,
  cutFrame: 0,
  rafId: null,
  active: null,   // current Level1/Level2 object
  hint: '',
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

// ── Cutscene ─────────────────────────────────────────────────────
let cutTyper = null;
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
  if (line) {
    drawCutsceneAvatar($('cut-canvas'), line.who, G.cutFrame);
  }
  G.rafId = requestAnimationFrame(cutLoop);
}
function showCutLine() {
  const scene = SCENES[G.cutscene];
  if (!scene) { advanceCutscene(); return; }
  const line = scene[G.cutLine];
  if (!line) { advanceCutscene(); return; }
  // Name
  if (line.who === 'muru') $('cut-name').textContent = 'MURU';
  else {
    const m = FAMILY.find(f => f.key === line.who);
    $('cut-name').textContent = m ? m.name.toUpperCase() : line.who.toUpperCase();
  }
  // Typewriter
  const bubble = $('cut-bubble');
  bubble.textContent = '';
  if (cutTyper) clearInterval(cutTyper);
  let i = 0;
  cutTyper = setInterval(() => {
    bubble.textContent = line.text.slice(0, ++i);
    if (i >= line.text.length) clearInterval(cutTyper);
  }, 22);
}
function nextCutLine() {
  // If still typing, complete instantly
  if (cutTyper) {
    clearInterval(cutTyper);
    const scene = SCENES[G.cutscene];
    const line = scene[G.cutLine];
    $('cut-bubble').textContent = line.text;
    cutTyper = null;
    return;
  }
  G.cutLine++;
  const scene = SCENES[G.cutscene];
  if (G.cutLine >= scene.length) advanceCutscene();
  else showCutLine();
}
function skipCutscene() {
  if (cutTyper) clearInterval(cutTyper);
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
  updateLivesHud();
  updateProgressHud();
  $('game-hint').textContent = G.level === 1
    ? 'Tap / Space / ↑ to jump · Catch the auto for a 5-second blitz'
    : 'Arrow keys / D-pad to move · Stay out of guard vision · Grab the painting';
  gameLoop();
}

function gameLoop() {
  G.active.update(api);
  const cx = $('game-canvas').getContext('2d');
  G.active.render(cx);
  $('hud-status').textContent = G.active.status();
  G.rafId = requestAnimationFrame(gameLoop);
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
  lose() {
    G.lives = Math.max(0, G.lives - 1);
    saveSave();
    cancelAnimationFrame(G.rafId);
    G.cutscene = 'fail' + G.level;
    setTimeout(() => show('fail'), 400);
  },
};

function updateLivesHud() {
  $('hud-lives').textContent = '❤️'.repeat(G.lives) + '🖤'.repeat(Math.max(0, 3 - G.lives));
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
  if (act === 'start')  startAdventure();
  if (act === 'family') show('family');
  if (act === 'menu')   show('menu');
  if (act === 'reset')  { G.done = []; G.lives = 3; G.level = 0; clearSave(); show('menu'); }
  if (act === 'retry')  retryLevel();
});

function startAdventure() {
  // Resume from where we left off
  G.lives = G.lives ?? 3;
  if (G.lives <= 0) G.lives = 3;
  G.level = G.done.length + 1;
  if (G.level > 8) { show('end'); return; }
  if (G.level > 2) { alert('Levels 3+ coming soon — only L1 and L2 are built!'); return; }
  G.cutscene = 'pre' + G.level;
  show('cutscene');
}

function retryLevel() {
  if (G.lives <= 0) { G.lives = 3; saveSave(); }
  G.cutscene = 'pre' + G.level;
  show('cutscene');
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
  if (G.level === 1) {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault(); Level1.jump();
    }
  } else if (G.level === 2) {
    const map = { ArrowUp:'up', KeyW:'up', ArrowDown:'down', KeyS:'down',
                  ArrowLeft:'left', KeyA:'left', ArrowRight:'right', KeyD:'right' };
    if (map[e.code]) { e.preventDefault(); Level2.setDir(map[e.code], true); }
  }
});
window.addEventListener('keyup', e => {
  if (G.screen !== 'game' || G.level !== 2) return;
  const map = { ArrowUp:'up', KeyW:'up', ArrowDown:'down', KeyS:'down',
                ArrowLeft:'left', KeyA:'left', ArrowRight:'right', KeyD:'right' };
  if (map[e.code]) Level2.setDir(map[e.code], false);
});

// Touch / click on game canvas (Level 1 jump)
$('game-canvas').addEventListener('pointerdown', () => {
  if (G.screen === 'game' && G.level === 1) Level1.jump();
});

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
