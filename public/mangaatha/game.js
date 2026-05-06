// Mangaatha — Dave-style adventure: collect the cup, then reach the door.
//
// Tile chars: . air  X brick  _ brick-top  # decorative  E walker  F fast
//             * coin  S spike  C cup  G door (locked until cup taken)  P start

const LEVEL = `
............................................................................................
............................................................................................
.................###.............................................###.....C.................
............................................................................................
.........*..*.................*....................*..*.....___________.....................
............................................................................................
.................________..............____...............E.................................
....P.................................................................________..............
________________........________..E........________________..E.....___________......_______G
XXXXXXXXXXXXXXXX___..___XXXXXXXX____________XXXXXXXXXXXXXXXX___..___XXXXXXXXXXX___..__XXXXXXX
XXXXXXXXXXXXXXXXXXSSXXXXXXXXXXXXXXXXSSXXXXXXXXXXXXXXXXXXXXXXXXSSXXXXXXXXXXXXXXXXSSXXXXXXXXXXX
XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
`;

const $ = id => document.getElementById(id);

const theme = {
  bg(ctx, W, H, camX) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#08182f');
    g.addColorStop(0.5, '#1a3a6f');
    g.addColorStop(1, '#5a4a30');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // Stars
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 60; i++) {
      const sx = ((i * 67 - camX * 0.05) % (W + 200)) - 50;
      const sy = (i * 31) % (H * 0.45);
      const sz = (i % 3) === 0 ? 2 : 1;
      ctx.fillRect(sx, sy, sz, sz);
    }

    // Distant fort silhouettes (parallax)
    ctx.fillStyle = 'rgba(20,10,5,0.85)';
    const o1 = -camX * 0.18 % 320;
    for (let bx = o1; bx < W + 200; bx += 320) {
      ctx.fillRect(bx, H*0.55, 100, H*0.25);
      ctx.fillRect(bx + 30, H*0.48, 40, H*0.32);
      ctx.fillRect(bx + 110, H*0.6, 70, H*0.2);
    }

    // Closer rocks (parallax)
    ctx.fillStyle = 'rgba(40,25,15,0.8)';
    const o2 = -camX * 0.4 % 240;
    for (let bx = o2; bx < W + 100; bx += 240) {
      ctx.beginPath();
      ctx.moveTo(bx, H*0.85);
      ctx.quadraticCurveTo(bx + 60, H*0.7, bx + 140, H*0.85);
      ctx.fill();
    }
  },

  tile(ctx, c, x, y, T) {
    if (c === '_') {
      ctx.fillStyle = '#7a4014'; ctx.fillRect(x, y, T, T);
      ctx.fillStyle = '#5a2a08'; ctx.fillRect(x, y + 6, T, 2);
      ctx.fillStyle = '#5a2a08';
      ctx.fillRect(x, y + T*0.5, T, 2);
      ctx.fillRect(x + T*0.5, y + 8, 2, T*0.5);
      ctx.fillStyle = '#5fa848'; ctx.fillRect(x, y, T, 6);
      ctx.fillStyle = '#3a7a30'; ctx.fillRect(x, y + 4, T, 2);
    } else if (c === 'X') {
      ctx.fillStyle = '#5a3320'; ctx.fillRect(x, y, T, T);
      ctx.strokeStyle = '#3a1f10'; ctx.lineWidth = 2;
      ctx.strokeRect(x, y, T, T);
      ctx.beginPath();
      ctx.moveTo(x, y + T/2); ctx.lineTo(x + T, y + T/2);
      ctx.moveTo(x + T/2, y); ctx.lineTo(x + T/2, y + T/2);
      ctx.moveTo(x + T*0.25, y + T/2); ctx.lineTo(x + T*0.25, y + T);
      ctx.moveTo(x + T*0.75, y + T/2); ctx.lineTo(x + T*0.75, y + T);
      ctx.stroke();
    } else if (c === '#') {
      ctx.fillStyle = '#c08552'; ctx.fillRect(x, y, T, T);
      ctx.strokeStyle = '#7a4a2a'; ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 1, y + 1, T - 2, T - 2);
    }
  },

  coin(ctx, c, t) {
    const wob = Math.sin(t/200) * 2;
    ctx.save();
    ctx.translate(c.x, c.y + wob);
    const sq = Math.abs(Math.sin(t/300)) * 0.6 + 0.4;
    ctx.scale(sq, 1);
    ctx.fillStyle = '#ffd166';
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#aa6a14';
    ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 11px Georgia';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('₹', 0, 1);
    ctx.restore();
  },

  cup(ctx, c, t) {
    const wob = Math.sin(t/250) * 2;
    const x = c.x, y = c.y + wob;
    // Halo
    const grd = ctx.createRadialGradient(x, y, 4, x, y, 32);
    grd.addColorStop(0, 'rgba(255,209,102,0.6)');
    grd.addColorStop(1, 'rgba(255,209,102,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(x - 32, y - 32, 64, 64);
    // Cup body (chalice)
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.moveTo(x - 11, y - 14); ctx.lineTo(x + 11, y - 14);
    ctx.lineTo(x + 8, y + 4); ctx.lineTo(x - 8, y + 4); ctx.closePath();
    ctx.fill();
    // Handles
    ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x - 12, y - 6, 5, Math.PI*0.5, Math.PI*1.5); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + 12, y - 6, 5, Math.PI*1.5, Math.PI*0.5); ctx.stroke();
    // Rim
    ctx.fillStyle = '#aa6a14';
    ctx.fillRect(x - 12, y - 16, 24, 2);
    // Stem + base
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(x - 3, y + 4, 6, 6);
    ctx.fillRect(x - 9, y + 10, 18, 4);
    // Sparkle
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - 6, y - 10, 2, 5);
  },

  spike(ctx, s) {
    ctx.fillStyle = '#bbb';
    for (let i = 0; i < s.w; i += 8) {
      ctx.beginPath();
      ctx.moveTo(s.x + i,     s.y + s.h);
      ctx.lineTo(s.x + i + 4, s.y);
      ctx.lineTo(s.x + i + 8, s.y + s.h);
      ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = '#666'; ctx.lineWidth = 1;
    for (let i = 0; i < s.w; i += 8) {
      ctx.beginPath();
      ctx.moveTo(s.x + i + 4, s.y);
      ctx.lineTo(s.x + i + 4, s.y + s.h);
      ctx.stroke();
    }
  },

  goal(ctx, g, cupTaken, t) {
    const x = g.x, y = g.y, w = g.w, h = g.h;
    // Frame
    ctx.fillStyle = '#5a3a20';
    ctx.fillRect(x - 4, y, w + 8, h);
    // Door (locked = dark, unlocked = bright + glow)
    if (cupTaken) {
      ctx.fillStyle = 'rgba(255,209,102,0.45)';
      ctx.fillRect(x - 8, y - 6, w + 16, h + 12);
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(x, y + 8, w, h - 8);
      // Handle
      ctx.fillStyle = '#7a4014';
      ctx.beginPath(); ctx.arc(x + w*0.78, y + h*0.55, 3, 0, Math.PI*2); ctx.fill();
      // "EXIT" sign
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px Georgia';
      ctx.textAlign = 'center';
      ctx.fillText('EXIT', x + w/2, y + h*0.4);
    } else {
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(x, y + 8, w, h - 8);
      // Padlock
      ctx.fillStyle = '#999';
      ctx.fillRect(x + w*0.3, y + h*0.45, w*0.4, w*0.4);
      ctx.lineWidth = 3; ctx.strokeStyle = '#999';
      ctx.beginPath();
      ctx.arc(x + w*0.5, y + h*0.45, w*0.22, Math.PI, 0);
      ctx.stroke();
      ctx.fillStyle = '#000';
      ctx.fillRect(x + w*0.46, y + h*0.55, w*0.08, w*0.15);
    }
    // Top arch
    ctx.fillStyle = '#7a4a2a';
    ctx.fillRect(x - 4, y, w + 8, 6);
  },

  enemy(ctx, e, t) {
    if (e.kind === 'fast') {
      // Vulture-like fast
      const bob = Math.sin(t/100) * 1.5;
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(e.x + 2, e.y + 8 + bob, e.w - 4, e.h - 12);
      const hx = e.vx > 0 ? e.w - 6 : 6;
      ctx.fillStyle = '#5a5a5a';
      ctx.beginPath(); ctx.arc(e.x + hx, e.y + 8 + bob, 7, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#ffd166';
      const beakX = e.vx > 0 ? e.x + e.w + 2 : e.x - 8;
      ctx.beginPath();
      ctx.moveTo(beakX, e.y + 6 + bob);
      ctx.lineTo(beakX + (e.vx > 0 ? 6 : -6), e.y + 8 + bob);
      ctx.lineTo(beakX, e.y + 10 + bob);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#c33';
      ctx.fillRect(e.x + (e.vx > 0 ? e.w - 6 : 4), e.y + 6 + bob, 2, 2);
    } else {
      // Bandit
      const bob = Math.sin(t/150) * 1;
      ctx.fillStyle = '#3a1f10';
      ctx.fillRect(e.x + 4, e.y + 14 + bob, e.w - 8, e.h - 18);
      ctx.fillStyle = '#a8744f';
      ctx.fillRect(e.x + 6, e.y + 6 + bob, e.w - 12, 10);
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(e.x + 5, e.y + 2 + bob, e.w - 10, 6);
      ctx.beginPath(); ctx.arc(e.x + e.w/2, e.y + 4 + bob, 8, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#c33';
      const eo = e.vx > 0 ? 4 : -4;
      ctx.fillRect(e.x + e.w/2 - 4 + eo, e.y + 10 + bob, 2, 2);
      ctx.fillRect(e.x + e.w/2 + eo,     e.y + 10 + bob, 2, 2);
      ctx.fillStyle = '#ddd';
      const sx = e.vx > 0 ? e.x + e.w : e.x - 4;
      ctx.fillRect(sx, e.y + 16 + bob, 4, 12);
      ctx.fillStyle = '#7a4a14';
      ctx.fillRect(sx - 1, e.y + 28 + bob, 6, 3);
      const phase = Math.sin(t/120) * 2;
      ctx.fillStyle = '#5a3a18';
      ctx.fillRect(e.x + 6, e.y + e.h - 4 + bob, 5, 4 + phase);
      ctx.fillRect(e.x + e.w - 11, e.y + e.h - 4 + bob, 5, 4 - phase);
    }
  },

  player(ctx, p, t) {
    const flicker = (p.hurt > 0 && Math.floor(t/80) % 2 === 0);
    if (flicker) ctx.globalAlpha = 0.45;

    const cx = p.x, cy = p.y;
    const phase = p.walkPhase;
    const legSwing = Math.sin(phase) * 4;

    // Legs (saffron pants)
    ctx.fillStyle = '#d97a14';
    ctx.fillRect(cx + 4, cy + 30, 7, 14 + legSwing);
    ctx.fillRect(cx + 15, cy + 30, 7, 14 - legSwing);
    // Shoes
    ctx.fillStyle = '#3a1f10';
    ctx.fillRect(cx + 3, cy + 42 + legSwing, 9, 3);
    ctx.fillRect(cx + 14, cy + 42 - legSwing, 9, 3);

    // Body — kurta
    ctx.fillStyle = '#2a6a3a';
    ctx.fillRect(cx + 2, cy + 16, 22, 16);
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(cx + 2, cy + 28, 22, 2);
    ctx.fillStyle = '#1a4a2a';
    ctx.fillRect(cx + 13, cy + 16, 1, 12);

    // Arms
    ctx.fillStyle = '#2a6a3a';
    const armSwing = Math.sin(phase + Math.PI) * 3;
    ctx.fillRect(cx - 1, cy + 18, 4, 11 + armSwing);
    ctx.fillRect(cx + 23, cy + 18, 4, 11 - armSwing);
    // Hands
    ctx.fillStyle = '#d49a73';
    ctx.fillRect(cx - 1, cy + 28 + armSwing, 4, 3);
    ctx.fillRect(cx + 23, cy + 28 - armSwing, 4, 3);

    // Face
    ctx.fillStyle = '#d49a73';
    ctx.fillRect(cx + 4, cy + 5, 18, 13);
    // Beard
    ctx.fillStyle = '#1a0a05';
    ctx.fillRect(cx + 5, cy + 14, 16, 4);
    ctx.fillRect(cx + 7, cy + 17, 12, 1);
    // Eyes
    ctx.fillStyle = '#000';
    if (p.facing > 0) {
      ctx.fillRect(cx + 13, cy + 9, 2, 2);
      ctx.fillRect(cx + 18, cy + 9, 2, 2);
    } else {
      ctx.fillRect(cx + 7,  cy + 9, 2, 2);
      ctx.fillRect(cx + 12, cy + 9, 2, 2);
    }

    // Saffron turban (signature)
    ctx.fillStyle = '#ff8c00';
    ctx.beginPath();
    ctx.ellipse(cx + 13, cy + 3, 13, 5, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillRect(cx + 1, cy + 2, 24, 4);
    ctx.fillStyle = '#c46a00';
    ctx.beginPath();
    ctx.ellipse(cx + 13, cy + 3, 13, 1.5, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#ffaa44';
    ctx.fillRect(cx + 4, cy + 1, 10, 1.5);
    ctx.fillStyle = '#c33';
    ctx.beginPath(); ctx.arc(cx + 13, cy + 2, 2, 0, Math.PI*2); ctx.fill();

    ctx.globalAlpha = 1;
  },
};

// ── Game setup ─────────────────────────────────────────────────────
const game = new Platformer({
  canvas: $('canvas'),
  level: LEVEL,
  theme,
  requireCup: true,
  onScore: s => $('hud-score').textContent = s,
  onLives: l => $('hud-lives').innerHTML = renderHearts(l),
  onCup:   taken => {
    const el = $('hud-cup');
    if (taken) { el.textContent = '★ HAVE IT'; el.style.color = '#ffd166'; }
    else       { el.textContent = '—';         el.style.color = '#888'; }
  },
  onWin:   s => showEnd('Vetri!', 'You found the cup and the door.', s, '#4ecca3'),
  onLose:  s => showEnd('Game Over', 'Try again!', s, '#ff6584'),
});
game.start();

function renderHearts(l) {
  const filled = '♥'.repeat(Math.max(0, l));
  const empty  = '♡'.repeat(Math.max(0, 3 - l));
  return `<span style="color:#ff6584">${filled}</span><span style="color:#444">${empty}</span>`;
}
$('hud-lives').innerHTML = renderHearts(3);

document.querySelectorAll('.touch-btn[data-touch]').forEach(b => {
  const k = b.dataset.touch;
  const set = v => { game.touch[k] = v; };
  b.addEventListener('touchstart', e => { e.preventDefault(); set(true); }, { passive: false });
  b.addEventListener('touchend',   e => { e.preventDefault(); set(false); }, { passive: false });
  b.addEventListener('mousedown',  () => set(true));
  b.addEventListener('mouseup',    () => set(false));
  b.addEventListener('mouseleave', () => set(false));
});

function showEnd(title, msg, score, color) {
  $('end-title').textContent = title;
  $('end-msg').textContent   = msg;
  $('end-score').textContent = score;
  const ov = $('overlay'); ov.classList.remove('hidden'); ov.style.color = color;
  const key = 'mangaatha.highscore';
  const high = parseInt(localStorage.getItem(key) || '0', 10);
  if (score > high) {
    localStorage.setItem(key, score);
    $('end-msg').textContent += ' New high score!';
  }
}

$('play-again').addEventListener('click', () => {
  $('overlay').classList.add('hidden');
  game.reset();
  $('hud-lives').innerHTML = renderHearts(3);
});
