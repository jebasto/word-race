// Mariappa — desi side-scroller (Level 1)
//
// Tile chars: . air  X brick  _ brick-top  # question-block
//             E walker (cow)  F fast (mosquito)
//             * rupee/coin  S spike  G flag goal  P player start
const LEVEL = `
..........................................................................
..........................................................................
..........................................................................
.........................###.............................................
.........*.*.*..........................................*..*.............
.................________......................________............____.
....P.....................................E............................G
________________........________..E........________________..E.....______X
XXXXXXXXXXXXXXXX___..___XXXXXXXX____________XXXXXXXXXXXXXXXX___..___XXXXXX
XXXXXXXXXXXXXXXXXXSSXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXSSXXXXXXXXXX
XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
`;

const $ = id => document.getElementById(id);

const theme = {
  bg(ctx, W, H, camX) {
    // Sky gradient
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#7ad0ff');
    g.addColorStop(1, '#3a8fbf');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // Clouds (parallax)
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    const co = -camX * 0.2 % 320;
    for (let bx = co; bx < W + 200; bx += 320) {
      ctx.beginPath(); ctx.ellipse(bx + 50, H*0.18, 28, 10, 0, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(bx + 75, H*0.15, 22, 9,  0, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(bx + 200, H*0.25, 35, 11, 0, 0, Math.PI*2); ctx.fill();
    }

    // Distant hills (parallax)
    ctx.fillStyle = 'rgba(58,143,90,0.6)';
    const ho = -camX * 0.4 % 300;
    for (let bx = ho; bx < W + 150; bx += 300) {
      ctx.beginPath();
      ctx.moveTo(bx, H*0.78);
      ctx.quadraticCurveTo(bx + 75, H*0.42, bx + 150, H*0.78);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(bx + 120, H*0.78);
      ctx.quadraticCurveTo(bx + 180, H*0.55, bx + 240, H*0.78);
      ctx.fill();
    }
  },

  tile(ctx, c, x, y, T) {
    if (c === '_') {
      // Top brick (with grass)
      ctx.fillStyle = '#a64b14'; ctx.fillRect(x, y, T, T);
      ctx.strokeStyle = '#5a2308'; ctx.lineWidth = 2;
      ctx.strokeRect(x, y, T, T);
      ctx.fillStyle = '#5fa848'; ctx.fillRect(x, y, T, 6);
      ctx.fillStyle = '#3a7a30'; ctx.fillRect(x, y+4, T, 3);
    } else if (c === 'X') {
      // Brick
      ctx.fillStyle = '#a64b14'; ctx.fillRect(x, y, T, T);
      ctx.strokeStyle = '#5a2308'; ctx.lineWidth = 2;
      // Brick pattern
      ctx.strokeRect(x, y, T, T);
      ctx.beginPath();
      ctx.moveTo(x, y + T/2); ctx.lineTo(x + T, y + T/2);
      ctx.moveTo(x + T/2, y); ctx.lineTo(x + T/2, y + T/2);
      ctx.moveTo(x + T*0.25, y + T/2); ctx.lineTo(x + T*0.25, y + T);
      ctx.moveTo(x + T*0.75, y + T/2); ctx.lineTo(x + T*0.75, y + T);
      ctx.stroke();
    } else if (c === '#') {
      // Question block
      ctx.fillStyle = '#f4a532'; ctx.fillRect(x, y, T, T);
      ctx.strokeStyle = '#aa6a14'; ctx.lineWidth = 3;
      ctx.strokeRect(x+1, y+1, T-2, T-2);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 22px Georgia';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('?', x + T/2, y + T/2 + 1);
      ctx.fillStyle = '#5a3300';
      ctx.fillText('?', x + T/2 - 1, y + T/2);
    }
  },

  coin(ctx, c, t) {
    // Rupee — green diamond with ₹
    const wob = Math.sin(t/200) * 2;
    ctx.save();
    ctx.translate(c.x, c.y + wob);
    ctx.fillStyle = '#0a8030';
    ctx.beginPath();
    ctx.moveTo(0, -12); ctx.lineTo(11, 0); ctx.lineTo(0, 12); ctx.lineTo(-11, 0);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px Georgia';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('₹', 0, 0);
    ctx.restore();
  },

  spike(ctx, s) {
    ctx.fillStyle = '#444';
    for (let i = 0; i < s.w; i += 8) {
      ctx.beginPath();
      ctx.moveTo(s.x + i, s.y + s.h);
      ctx.lineTo(s.x + i + 4, s.y);
      ctx.lineTo(s.x + i + 8, s.y + s.h);
      ctx.closePath(); ctx.fill();
    }
  },

  goal(ctx, g) {
    // Tricolor flag on a pole
    const poleX = g.x + g.w/2;
    ctx.fillStyle = '#5a3a18';
    ctx.fillRect(poleX - 2, g.y, 4, g.h);
    // Gold ball top
    ctx.fillStyle = '#ffd166';
    ctx.beginPath(); ctx.arc(poleX, g.y, 6, 0, Math.PI*2); ctx.fill();
    // Tricolor flag
    const fx = poleX, fy = g.y + 8;
    ctx.fillStyle = '#ff9933'; ctx.fillRect(fx, fy, 36, 10);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(fx, fy + 10, 36, 10);
    ctx.fillStyle = '#138808'; ctx.fillRect(fx, fy + 20, 36, 10);
    // Ashoka chakra
    ctx.strokeStyle = '#000080';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(fx + 18, fy + 15, 4, 0, Math.PI*2);
    ctx.stroke();
  },

  enemy(ctx, e, t) {
    if (e.kind === 'fast') {
      // Mosquito — small dark insect with rapid wings
      const wob = Math.sin(t/60) * 3;
      ctx.fillStyle = '#3a3a3a';
      ctx.beginPath(); ctx.ellipse(e.x + e.w/2, e.y + 16 + wob, 10, 7, 0, 0, Math.PI*2); ctx.fill();
      // Wings
      ctx.fillStyle = 'rgba(220,220,220,0.65)';
      const wphase = (Math.sin(t/30) + 1) / 2;
      ctx.beginPath(); ctx.ellipse(e.x + e.w/2 - 6, e.y + 12 + wob, 6, 3 + wphase*2, -0.3, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(e.x + e.w/2 + 6, e.y + 12 + wob, 6, 3 + wphase*2,  0.3, 0, Math.PI*2); ctx.fill();
      // Eye
      ctx.fillStyle = '#c33';
      ctx.fillRect(e.x + (e.vx > 0 ? e.w/2 + 4 : e.w/2 - 6), e.y + 14 + wob, 2, 2);
    } else {
      // Cow — white body with brown patches
      const bob = Math.sin(t/150) * 1.5;
      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(e.x + 2, e.y + 8 + bob, e.w - 4, e.h - 12);
      ctx.fillStyle = '#5a3320';
      ctx.fillRect(e.x + 6, e.y + 12 + bob, 6, 6);
      ctx.fillRect(e.x + e.w - 14, e.y + 16 + bob, 6, 5);
      // Head
      const hx = e.vx > 0 ? e.w - 4 : -2;
      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(e.x + hx, e.y + 4 + bob, 12, 14);
      // Horns
      ctx.fillStyle = '#fff';
      ctx.fillRect(e.x + hx + 2, e.y + 1 + bob, 2, 4);
      ctx.fillRect(e.x + hx + 8, e.y + 1 + bob, 2, 4);
      // Eye + nose
      ctx.fillStyle = '#000';
      ctx.fillRect(e.x + hx + 4, e.y + 8 + bob, 2, 2);
      ctx.fillStyle = '#c33';
      ctx.fillRect(e.x + hx + 4, e.y + 14 + bob, 4, 2);
      // Legs (running anim)
      const phase = Math.sin(t/100) * 2;
      ctx.fillStyle = '#3a1f10';
      ctx.fillRect(e.x + 4, e.y + e.h - 4 + bob, 4, 4 + phase);
      ctx.fillRect(e.x + e.w - 8, e.y + e.h - 4 + bob, 4, 4 - phase);
    }
  },

  player(ctx, p, t) {
    const flicker = (p.hurt > 0 && Math.floor(t/60) % 2 === 0);
    if (flicker) ctx.globalAlpha = 0.4;
    // Dhoti (white, lower)
    const phase = Math.abs(p.vx) > 0.3 ? Math.sin(t/80) * 3 : 0;
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(p.x + 2, p.y + 24, 8, 14 + phase);
    ctx.fillRect(p.x + 14, p.y + 24, 8, 14 - phase);
    // Red shirt
    ctx.fillStyle = '#c33';
    ctx.fillRect(p.x + 2, p.y + 12, 20, 14);
    // Yellow sash
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(p.x + 2, p.y + 23, 20, 2);
    // Skin (face)
    ctx.fillStyle = '#d49a73';
    ctx.fillRect(p.x + 4, p.y + 4, 16, 10);
    // Red cap
    ctx.fillStyle = '#c33';
    ctx.fillRect(p.x + 4, p.y, 16, 5);
    ctx.fillRect(p.x + 2, p.y + 4, 20, 2);
    // Mustache (signature!)
    ctx.fillStyle = '#1a0a05';
    ctx.fillRect(p.x + 6, p.y + 11, 12, 2);
    // Eyes
    ctx.fillStyle = '#000';
    if (p.facing > 0) {
      ctx.fillRect(p.x + 12, p.y + 8, 2, 2);
      ctx.fillRect(p.x + 16, p.y + 8, 2, 2);
    } else {
      ctx.fillRect(p.x + 6, p.y + 8, 2, 2);
      ctx.fillRect(p.x + 10, p.y + 8, 2, 2);
    }
    ctx.globalAlpha = 1;
  },
};

const game = new Platformer({
  canvas: $('canvas'),
  level: LEVEL,
  theme,
  onScore: s => $('hud-score').textContent = s,
  onLives: l => $('hud-lives').textContent = '❤'.repeat(Math.max(0, l)) + '🖤'.repeat(Math.max(0, 3-l)),
  onWin: s => showEnd('Vetri!', 'You hoisted the flag.', s, '#4ecca3'),
  onLose: s => showEnd('Game Over', 'The cows had other plans!', s, '#ff6584'),
});
game.start();

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
  const key = 'mariappa.highscore';
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
