// Don — Cross obstacles and rescue your girlfriend from the local rowdy.
//
// Tile chars: . air  X dirt  _ grass-top  E walker (thug)  F fast (lieutenant)
//             B boss (rowdy boss, 3 stomps)  * coin  S spike  R rescue NPC  G goal  P player

const LEVEL = `
..............................................................................................
..............................................................................................
..............................................................................................
.....................*....*..*.................................................*....R.G......
..............................................................................________.......
.........*..*...........__________............____...................____......XXXXXXXX.......
.................................................................................X..X.X......
............E.......E........F.........________E_______........__________B......XX..X.X.......
....P.....________........________......XXXXXXXXXXXXXXXX...___..XXXXXXXXXX___...XX.XX.X.X......
__________XXXXXXXX___..___XXXXXXXX____________________________..____________....X..XX.X.X......
XXXXXXXXXXXXXXXXXXXSSXXXXXXXXXXXXXXSSXXXXXXXXXXXXXXXXXXXXXXSSSXXXXXXXXXXXXXXXSSXXXXXXXXXXXXXXXXX
XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
`;

const $ = id => document.getElementById(id);

const theme = {
  bg(ctx, W, H, camX) {
    // Sunset over a city
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#ff7a3a');
    g.addColorStop(0.5, '#c33a3a');
    g.addColorStop(1, '#3a1a18');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // Sun
    ctx.fillStyle = 'rgba(255,209,102,0.92)';
    ctx.beginPath(); ctx.arc(W*0.78 - camX*0.05, H*0.34, 60, 0, Math.PI*2); ctx.fill();

    // Distant cityscape
    ctx.fillStyle = 'rgba(20,5,5,0.85)';
    const o1 = -camX * 0.18 % 320;
    for (let bx = o1; bx < W + 200; bx += 320) {
      // Apartment buildings
      ctx.fillRect(bx,      H*0.55, 50, H*0.30);
      ctx.fillRect(bx + 60, H*0.50, 60, H*0.35);
      ctx.fillRect(bx + 130, H*0.58, 40, H*0.27);
      ctx.fillRect(bx + 180, H*0.45, 70, H*0.40);
      ctx.fillRect(bx + 260, H*0.52, 50, H*0.33);
      // Lit windows
      ctx.fillStyle = 'rgba(255,209,102,0.6)';
      for (let by = 0; by < 6; by++) {
        if ((bx + by * 13) % 17 === 0) ctx.fillRect(bx + 10, H*0.6 + by*8, 4, 4);
        if ((bx + by * 11) % 13 === 0) ctx.fillRect(bx + 70, H*0.55 + by*8, 4, 4);
      }
      ctx.fillStyle = 'rgba(20,5,5,0.85)';
    }

    // Closer rooftops
    ctx.fillStyle = 'rgba(40,15,10,0.9)';
    const o2 = -camX * 0.4 % 220;
    for (let bx = o2; bx < W + 100; bx += 220) {
      ctx.fillRect(bx, H*0.78, 80, H*0.12);
      ctx.fillRect(bx + 90, H*0.74, 60, H*0.16);
      ctx.fillRect(bx + 160, H*0.80, 50, H*0.10);
    }
  },

  tile(ctx, c, x, y, T) {
    if (c === '_') {
      // Grass top on dirt
      ctx.fillStyle = '#3a1f10'; ctx.fillRect(x, y, T, T);
      ctx.fillStyle = '#5fa848'; ctx.fillRect(x, y, T, 8);
      ctx.fillStyle = '#3a7a30'; ctx.fillRect(x, y + 6, T, 4);
    } else if (c === 'X') {
      // Dirt
      ctx.fillStyle = '#5a3320'; ctx.fillRect(x, y, T, T);
      ctx.fillStyle = '#3a1f10'; ctx.fillRect(x, y + T - 4, T, 4);
      ctx.fillStyle = '#7a4a30';
      ctx.fillRect(x + 4, y + 4, 6, 6);
      ctx.fillRect(x + T - 12, y + T - 14, 6, 6);
    } else if (c === '#') {
      ctx.fillStyle = '#7a3030'; ctx.fillRect(x, y, T, T);
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

  spike(ctx, s) {
    ctx.fillStyle = '#bbb';
    for (let i = 0; i < s.w; i += 8) {
      ctx.beginPath();
      ctx.moveTo(s.x + i,     s.y + s.h);
      ctx.lineTo(s.x + i + 4, s.y);
      ctx.lineTo(s.x + i + 8, s.y + s.h);
      ctx.closePath(); ctx.fill();
    }
  },

  goal(ctx, g, cupTaken, t) {
    // Goal is the rescue spot — small pedestal/lights
    const x = g.x, y = g.y, w = g.w, h = g.h;
    ctx.fillStyle = 'rgba(78,204,163,0.4)';
    ctx.fillRect(x - 6, y - 6, w + 12, h + 12);
    ctx.fillStyle = '#4ecca3';
    ctx.fillRect(x, y + h - 8, w, 8);
    // "SAFE" sign
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px Georgia';
    ctx.textAlign = 'center';
    ctx.fillText('SAFE', x + w/2, y + h*0.5);
  },

  npc(ctx, n, t) {
    // Girlfriend — purple sari, waving
    const wob = Math.sin(t/300) * 2;
    const x = n.x, y = n.y + wob;
    // Body / sari
    ctx.fillStyle = '#a04dc8';
    ctx.fillRect(x + 6, y + 18, 24, 28);
    // Skin face
    ctx.fillStyle = '#e6b88a';
    ctx.fillRect(x + 10, y + 6, 16, 14);
    // Hair (long, dark)
    ctx.fillStyle = '#1a0a05';
    ctx.fillRect(x + 8, y + 4, 20, 5);
    ctx.fillRect(x + 8, y + 4, 4, 18);
    ctx.fillRect(x + 24, y + 4, 4, 18);
    // Bindi
    ctx.fillStyle = '#c33';
    ctx.fillRect(x + 17, y + 8, 2, 2);
    // Eyes
    ctx.fillStyle = '#000';
    ctx.fillRect(x + 13, y + 11, 2, 2);
    ctx.fillRect(x + 21, y + 11, 2, 2);
    // Smile
    ctx.fillStyle = '#7a1f1f';
    ctx.fillRect(x + 15, y + 15, 6, 1);
    // Waving arm (animated)
    const wavePhase = Math.sin(t/200) * 6;
    ctx.fillStyle = '#a04dc8';
    ctx.fillRect(x + 28, y + 12, 4, 8);
    ctx.fillStyle = '#e6b88a';
    ctx.fillRect(x + 28 + wavePhase*0.3, y + 6 + Math.abs(wavePhase)*0.5, 4, 6);
  },

  enemy(ctx, e, t) {
    if (e.kind === 'boss') {
      // BOSS rowdy — bigger, mustache, bandana
      const bob = Math.sin(t/180) * 1.5;
      const x = e.x, y = e.y + bob;
      // Body (dark vest)
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(x + 4, y + 28, e.w - 8, e.h - 36);
      // Skin (bare arms + chest)
      ctx.fillStyle = '#a8744f';
      ctx.fillRect(x + 6, y + 22, e.w - 12, 8);
      // Head
      ctx.fillStyle = '#a8744f';
      ctx.fillRect(x + 8, y + 8, e.w - 16, 16);
      // Red bandana
      ctx.fillStyle = '#c33';
      ctx.fillRect(x + 7, y + 8, e.w - 14, 4);
      ctx.fillStyle = '#7a1f1f';
      ctx.fillRect(x + 7, y + 11, e.w - 14, 1);
      // HUGE mustache
      ctx.fillStyle = '#1a0a05';
      ctx.fillRect(x + 8, y + 18, e.w - 16, 3);
      ctx.fillRect(x + 6, y + 17, 4, 4);
      ctx.fillRect(x + e.w - 10, y + 17, 4, 4);
      // Eyes (angry)
      ctx.fillStyle = '#000';
      const eo = e.vx > 0 ? 2 : -2;
      ctx.fillRect(x + e.w/2 - 6 + eo, y + 14, 3, 3);
      ctx.fillRect(x + e.w/2 + 3 + eo, y + 14, 3, 3);
      // Eyebrows
      ctx.fillStyle = '#1a0a05';
      ctx.fillRect(x + e.w/2 - 7 + eo, y + 13, 4, 1);
      ctx.fillRect(x + e.w/2 + 3 + eo, y + 13, 4, 1);
      // Big knife
      ctx.fillStyle = '#ddd';
      const sx = e.vx > 0 ? x + e.w + 2 : x - 18;
      ctx.fillRect(sx, y + 26, 18, 5);
      ctx.fillStyle = '#7a4a14';
      ctx.fillRect(sx + (e.vx > 0 ? -4 : 18), y + 25, 4, 7);
      // Legs
      const phase = Math.sin(t/130) * 2;
      ctx.fillStyle = '#5a3320';
      ctx.fillRect(x + 8,        y + e.h - 6, 7, 6 + phase);
      ctx.fillRect(x + e.w - 15, y + e.h - 6, 7, 6 - phase);
      // HP indicator
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px Georgia';
      ctx.textAlign = 'center';
      ctx.fillText('HP ' + e.hp, x + e.w/2, y - 4);
    } else if (e.kind === 'fast') {
      // Lieutenant — leather jacket, sunglasses
      const bob = Math.sin(t/100) * 1.5;
      ctx.fillStyle = '#3a1f10';
      ctx.fillRect(e.x + 3, e.y + 12 + bob, e.w - 6, e.h - 16);
      ctx.fillStyle = '#a8744f';
      ctx.fillRect(e.x + 6, e.y + 4 + bob, e.w - 12, 10);
      // Sunglasses
      ctx.fillStyle = '#000';
      ctx.fillRect(e.x + 5, e.y + 8 + bob, e.w - 10, 4);
      // Greasy hair
      ctx.fillStyle = '#1a0a05';
      ctx.fillRect(e.x + 5, e.y + 2 + bob, e.w - 10, 4);
      // Mustache
      ctx.fillStyle = '#1a0a05';
      ctx.fillRect(e.x + 7, e.y + 13 + bob, e.w - 14, 1);
      // Legs
      const phase = Math.sin(t/100) * 2;
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(e.x + 6, e.y + e.h - 4 + bob, 5, 4 + phase);
      ctx.fillRect(e.x + e.w - 11, e.y + e.h - 4 + bob, 5, 4 - phase);
    } else {
      // Walker thug — simple
      const bob = Math.sin(t/150) * 1;
      ctx.fillStyle = '#5a3a18';
      ctx.fillRect(e.x + 4, e.y + 12 + bob, e.w - 8, e.h - 16);
      ctx.fillStyle = '#a8744f';
      ctx.fillRect(e.x + 6, e.y + 4 + bob, e.w - 12, 10);
      // Bald head highlight
      ctx.fillStyle = '#7a4a2a';
      ctx.fillRect(e.x + 8, e.y + 4 + bob, e.w - 16, 2);
      // Mustache
      ctx.fillStyle = '#1a0a05';
      ctx.fillRect(e.x + 7, e.y + 11 + bob, e.w - 14, 2);
      // Eyes
      ctx.fillStyle = '#000';
      const eo = e.vx > 0 ? 2 : -2;
      ctx.fillRect(e.x + e.w/2 - 4 + eo, e.y + 8 + bob, 2, 2);
      ctx.fillRect(e.x + e.w/2 + eo,     e.y + 8 + bob, 2, 2);
      // Legs
      const phase = Math.sin(t/120) * 2;
      ctx.fillStyle = '#3a1f10';
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

    // Dhothi (white, lower body)
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(cx + 3, cy + 28, 9, 16 + legSwing);
    ctx.fillRect(cx + 14, cy + 28, 9, 16 - legSwing);
    // Dhothi gold border
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(cx + 3, cy + 42 + legSwing, 9, 2);
    ctx.fillRect(cx + 14, cy + 42 - legSwing, 9, 2);

    // Body — bright shirt (red)
    ctx.fillStyle = '#c33';
    ctx.fillRect(cx + 2, cy + 14, 22, 16);
    // Open collar V
    ctx.fillStyle = '#a8744f';
    ctx.beginPath();
    ctx.moveTo(cx + 9, cy + 14); ctx.lineTo(cx + 13, cy + 22); ctx.lineTo(cx + 17, cy + 14);
    ctx.closePath(); ctx.fill();
    // Buttons (just a hint)
    ctx.fillStyle = '#7a1f1f';
    ctx.fillRect(cx + 13, cy + 24, 1, 6);

    // Arms (red sleeves)
    ctx.fillStyle = '#c33';
    const armSwing = Math.sin(phase + Math.PI) * 3;
    ctx.fillRect(cx - 1, cy + 16, 4, 12 + armSwing);
    ctx.fillRect(cx + 23, cy + 16, 4, 12 - armSwing);
    // Hands
    ctx.fillStyle = '#a8744f';
    ctx.fillRect(cx - 1, cy + 27 + armSwing, 4, 3);
    ctx.fillRect(cx + 23, cy + 27 - armSwing, 4, 3);

    // Face
    ctx.fillStyle = '#a8744f';
    ctx.fillRect(cx + 4, cy + 3, 18, 13);
    // Hair (slick black)
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(cx + 4, cy + 1, 18, 4);
    ctx.fillRect(cx + 4, cy + 4, 4, 4);
    ctx.fillRect(cx + 18, cy + 4, 4, 4);
    // Hero mustache
    ctx.fillStyle = '#1a0a05';
    ctx.fillRect(cx + 7, cy + 11, 12, 2);
    ctx.fillRect(cx + 5, cy + 10, 3, 3);
    ctx.fillRect(cx + 18, cy + 10, 3, 3);
    // Eyes (focused)
    ctx.fillStyle = '#000';
    if (p.facing > 0) {
      ctx.fillRect(cx + 13, cy + 7, 2, 2);
      ctx.fillRect(cx + 17, cy + 7, 2, 2);
    } else {
      ctx.fillRect(cx + 7,  cy + 7, 2, 2);
      ctx.fillRect(cx + 11, cy + 7, 2, 2);
    }
    // Sunglasses on top of head (hero touch)
    ctx.fillStyle = '#000';
    ctx.fillRect(cx + 6, cy + 5, 14, 1);

    ctx.globalAlpha = 1;
  },
};

// ── Game setup ─────────────────────────────────────────────────────
const game = new Platformer({
  canvas: $('canvas'),
  level: LEVEL,
  theme,
  onScore: s => $('hud-score').textContent = s,
  onLives: l => $('hud-lives').innerHTML = renderHearts(l),
  onWin:   s => showEnd("She's safe!", "You took down the boss and rescued her.", s, '#4ecca3'),
  onLose:  s => showEnd('Game Over', 'The boss got away. Try again!', s, '#ff6584'),
});

// Track if the boss is alive — when defeated, update RESCUE indicator
const updateRescue = () => {
  const bossAlive = game.enemies.some(e => e.kind === 'boss' && e.alive);
  const el = $('hud-rescue');
  if (!bossAlive) { el.textContent = '✓ CLEAR'; el.style.color = '#4ecca3'; }
  else            { el.textContent = '…';        el.style.color = '#ff6584'; }
};
setInterval(updateRescue, 250);

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
  const key = 'don.highscore';
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
