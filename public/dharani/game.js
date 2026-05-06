// Dharani — Tamil Nadu themed platformer (Level 1)
//
// Tile chars: . air  X dirt  _ grass  E walker  F fast walker
//             * coconut  S spike  G temple goal  P player start
const LEVEL = `
..........................................................................
..........................................................................
..........................................................................
..........................................................................
.........*..*..*..........................................*..*...........
..........................________..............____....................
....P............................................................______G
__________..............E.....___............E........F...______________X
XXXXXXXXXX_______...__________________...______________________..._______X
XXXXXXXXXXXXXXXXX..XXXXXXXXXXXXXXXXXXX..XXXXXXXXXXXXXXXXXXXXXXX..XXXXXXXXX
XXXXXXXXXXXXXXXXXSSXXXXXXXXXXXXXXXXXXXSSXXXXXXXXXXXXXXXXXXXXXXXSSXXXXXXXXX
XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
`;

const $ = id => document.getElementById(id);

const theme = {
  bg(ctx, W, H, camX) {
    // Sky gradient (sunset)
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#ffb347');
    g.addColorStop(0.55, '#e94e3a');
    g.addColorStop(1, '#5a1f1c');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // Sun
    ctx.fillStyle = 'rgba(255,209,102,0.92)';
    ctx.beginPath(); ctx.arc(W*0.78 - camX*0.05, H*0.34, 60, 0, Math.PI*2); ctx.fill();

    // Distant temple silhouettes (parallax)
    ctx.fillStyle = 'rgba(58,24,24,0.85)';
    const offset = -camX * 0.18 % 360;
    for (let bx = offset; bx < W + 200; bx += 360) {
      // gopuram
      ctx.fillRect(bx + 30, H*0.55, 80, H*0.25);
      ctx.beginPath(); ctx.moveTo(bx+30, H*0.55); ctx.lineTo(bx+70, H*0.40); ctx.lineTo(bx+110, H*0.55); ctx.closePath(); ctx.fill();
      ctx.fillRect(bx + 130, H*0.62, 50, H*0.18);
      ctx.beginPath(); ctx.moveTo(bx+130, H*0.62); ctx.lineTo(bx+155, H*0.52); ctx.lineTo(bx+180, H*0.62); ctx.closePath(); ctx.fill();
    }

    // Coconut palms (parallax)
    const palmOffset = -camX * 0.35 % 280;
    for (let bx = palmOffset; bx < W + 80; bx += 280) {
      this._palm(ctx, bx + 50, H*0.78);
    }
  },

  _palm(ctx, x, baseY) {
    ctx.fillStyle = '#3a1f10';
    ctx.fillRect(x, baseY - 90, 6, 90);
    ctx.fillStyle = '#1f5a2a';
    for (let i = 0; i < 6; i++) {
      ctx.save();
      ctx.translate(x+3, baseY-90);
      ctx.rotate((i - 2.5) * 0.4);
      ctx.beginPath(); ctx.ellipse(0, -8, 26, 6, 0, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#5a3a18';
    ctx.beginPath(); ctx.arc(x-2, baseY-86, 4, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(x+8, baseY-84, 4, 0, Math.PI*2); ctx.fill();
  },

  tile(ctx, c, x, y, T) {
    if (c === '_') {            // grass
      ctx.fillStyle = '#3a1f10'; ctx.fillRect(x, y, T, T);
      ctx.fillStyle = '#5fa848'; ctx.fillRect(x, y, T, 8);
      ctx.fillStyle = '#3a7a30'; ctx.fillRect(x, y+6, T, 4);
    } else if (c === 'X') {     // dirt/rock
      ctx.fillStyle = '#5a3320'; ctx.fillRect(x, y, T, T);
      ctx.fillStyle = '#3a1f10'; ctx.fillRect(x, y+T-4, T, 4);
      ctx.fillStyle = '#7a4a30'; ctx.fillRect(x+4, y+4, 6, 6);
      ctx.fillStyle = '#7a4a30'; ctx.fillRect(x+T-12, y+T-14, 6, 6);
    } else if (c === '#') {
      ctx.fillStyle = '#7a3030'; ctx.fillRect(x, y, T, T);
    }
  },

  coin(ctx, c, t) {
    // Coconut — brown circle
    const wob = Math.sin(t/200) * 2;
    ctx.fillStyle = '#7a4014';
    ctx.beginPath(); ctx.arc(c.x, c.y + wob, 12, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#3a1f10';
    ctx.beginPath(); ctx.arc(c.x-3, c.y-3 + wob, 1.5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(c.x+3, c.y-3 + wob, 1.5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(c.x, c.y+1 + wob, 1.5, 0, Math.PI*2); ctx.fill();
  },

  spike(ctx, s) {
    ctx.fillStyle = '#aaa';
    for (let i = 0; i < s.w; i += 8) {
      ctx.beginPath();
      ctx.moveTo(s.x + i, s.y + s.h);
      ctx.lineTo(s.x + i + 4, s.y);
      ctx.lineTo(s.x + i + 8, s.y + s.h);
      ctx.closePath(); ctx.fill();
    }
  },

  goal(ctx, g) {
    // Temple gopuram (multi-tier pyramid with kalasam)
    const x = g.x, y = g.y, w = g.w, h = g.h;
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(x-4, y + h - 30, w + 8, 30);
    ctx.fillStyle = '#9c2418';
    ctx.fillRect(x-2, y + h - 60, w + 4, 30);
    ctx.fillStyle = '#7d2117';
    ctx.fillRect(x, y + h - 88, w, 28);
    ctx.fillStyle = '#5e190f';
    ctx.fillRect(x+4, y + h - 110, w-8, 22);
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(x + w/2 - 2, y + h - 122, 4, 14);
    ctx.beginPath(); ctx.arc(x + w/2, y + h - 124, 5, 0, Math.PI*2); ctx.fill();
    // Door
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(x + w/2 - 8, y + h - 26, 16, 26);
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(x + w/2 - 1, y + h - 14, 2, 4);
  },

  enemy(ctx, e, t) {
    if (e.kind === 'fast') {
      // Lion — yellow body with mane
      const bob = Math.sin(t/120) * 1.5;
      ctx.fillStyle = '#c47a14';
      ctx.fillRect(e.x, e.y + 4 + bob, e.w, e.h - 4);
      // Mane
      ctx.fillStyle = '#7a4014';
      ctx.beginPath(); ctx.arc(e.x + (e.vx > 0 ? e.w - 8 : 8), e.y + 8 + bob, 12, 0, Math.PI*2); ctx.fill();
      // Eyes
      ctx.fillStyle = '#000';
      const fx = e.vx > 0 ? e.w - 10 : 10;
      ctx.fillRect(e.x + fx, e.y + 6 + bob, 2, 3);
      ctx.fillRect(e.x + fx + 4, e.y + 6 + bob, 2, 3);
    } else {
      // Cobra/snake — green coiled body
      const wob = Math.sin(t/180) * 2;
      ctx.fillStyle = '#2a7a3a';
      ctx.fillRect(e.x + 2, e.y + e.h - 14, e.w - 4, 10);
      // Head (raises up)
      ctx.beginPath();
      ctx.arc(e.x + (e.vx > 0 ? e.w - 6 : 6), e.y + 8 + wob, 8, 0, Math.PI*2);
      ctx.fillStyle = '#3a9a4a';
      ctx.fill();
      // Eye + tongue
      ctx.fillStyle = '#000';
      const ex = e.vx > 0 ? e.w - 4 : 4;
      ctx.fillRect(e.x + ex, e.y + 6 + wob, 2, 2);
      ctx.fillStyle = '#c33';
      ctx.fillRect(e.x + (e.vx > 0 ? e.w + 2 : -4), e.y + 10 + wob, 4, 1);
    }
  },

  player(ctx, p, t) {
    // Dharani — boy in white dhoti with brown skin
    const flicker = (p.hurt > 0 && Math.floor(t/60) % 2 === 0);
    if (flicker) { ctx.globalAlpha = 0.4; }
    // Legs (running anim)
    const phase = Math.abs(p.vx) > 0.3 ? Math.sin(t/80) * 3 : 0;
    ctx.fillStyle = '#f5f5f5';   // dhoti
    ctx.fillRect(p.x + 2, p.y + 22, 8, 14 + phase);
    ctx.fillRect(p.x + 14, p.y + 22, 8, 14 - phase);
    // Body (red shirt)
    ctx.fillStyle = '#c33';
    ctx.fillRect(p.x + 2, p.y + 12, 20, 12);
    // Head
    ctx.fillStyle = '#d49a73';
    ctx.fillRect(p.x + 4, p.y, 16, 14);
    // Hair
    ctx.fillStyle = '#1a0a05';
    ctx.fillRect(p.x + 4, p.y, 16, 3);
    ctx.fillRect(p.x + 4, p.y + 2, 4, 3);
    ctx.fillRect(p.x + 16, p.y + 2, 4, 3);
    // Eyes
    ctx.fillStyle = '#000';
    if (p.facing > 0) {
      ctx.fillRect(p.x + 12, p.y + 6, 2, 2);
      ctx.fillRect(p.x + 16, p.y + 6, 2, 2);
    } else {
      ctx.fillRect(p.x + 6, p.y + 6, 2, 2);
      ctx.fillRect(p.x + 10, p.y + 6, 2, 2);
    }
    // Smile
    ctx.fillStyle = '#5a1f10';
    ctx.fillRect(p.x + 9, p.y + 10, 6, 1);
    ctx.globalAlpha = 1;
  },
};

// ── Game setup ────────────────────────────────────────────────────
const game = new Platformer({
  canvas: $('canvas'),
  level: LEVEL,
  theme,
  onScore: s => $('hud-score').textContent = s,
  onLives: l => $('hud-lives').textContent = '❤'.repeat(Math.max(0, l)) + '🖤'.repeat(Math.max(0, 3-l)),
  onWin: s => showEnd('Level Complete!', 'You reached the temple.', s, '#4ecca3'),
  onLose: s => showEnd('Game Over', 'The dust beat you. Try again!', s, '#ff6584'),
});
game.start();

// Touch controls
document.querySelectorAll('.touch-btn[data-touch]').forEach(b => {
  const k = b.dataset.touch;
  const set = v => { game.touch[k] = v; };
  b.addEventListener('touchstart', e => { e.preventDefault(); set(true); }, { passive: false });
  b.addEventListener('touchend',   e => { e.preventDefault(); set(false); }, { passive: false });
  b.addEventListener('mousedown',  () => set(true));
  b.addEventListener('mouseup',    () => set(false));
  b.addEventListener('mouseleave', () => set(false));
});

// End-of-game overlay
function showEnd(title, msg, score, color) {
  $('end-title').textContent = title;
  $('end-msg').textContent   = msg;
  $('end-score').textContent = score;
  const ov = $('overlay'); ov.classList.remove('hidden'); ov.style.color = color;
  // Save high score
  const key = 'dharani.highscore';
  const high = parseInt(localStorage.getItem(key) || '0', 10);
  if (score > high) {
    localStorage.setItem(key, score);
    $('end-msg').textContent += ' New high score!';
  }
}

$('play-again').addEventListener('click', () => {
  $('overlay').classList.add('hidden');
  game.reset();
});
