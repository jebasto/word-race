// LEVEL 1 — THE SAREE CHASE
// Side-scrolling auto-runner. Jump over obstacles, catch the auto-rickshaw
// for a 5-second invincibility blitz, grab the saree at the end.

// Level 1 tunables — adjust these to change feel
const L1_TUNE = {
  W: 880, H: 320,
  GROUND: 260,
  MURU_X: 160,
  // Jump physics
  JUMP_VY: -10.5,           // initial impulse
  GRAVITY_NORMAL: 0.55,     // gravity when not holding jump
  GRAVITY_HOLD:   0.28,     // gravity while jump held (during ascent)
  JUMP_HOLD_FRAMES: 16,     // up to N frames of reduced gravity
  // Speed
  SPEED_MIN: 2.4,
  SPEED_MAX: 4.4,
  SPEED_RAMP_DIST: 6500,    // distance to reach max speed
  // Spacing
  GAP_MIN: 280,
  GAP_MAX: 540,
  // Obstacle queue
  TOTAL_OBSTACLES: 45,
};

const L1 = {
  W: L1_TUNE.W, H: L1_TUNE.H,
  GROUND: L1_TUNE.GROUND,
  MURU_X: L1_TUNE.MURU_X,

  frame: 0,
  speed: L1_TUNE.SPEED_MIN,
  speedTarget: L1_TUNE.SPEED_MIN,
  distance: 0,
  state: 'idle',
  muru: {
    y: L1_TUNE.GROUND, vy: 0,
    jumping: false, jumpHoldT: 0,
    riding: false, ridingT: 0,
  },
  obstacles: [],
  queue: [],
  spawnedCount: 0,
  nextSpawnX: L1_TUNE.W + 80,
  hitCooldown: 0,
  saree: null,
  bg: { far: 0, mid: 0, near: 0, ground: 0 },
  particles: [],
  jumpPress: false,    // edge-triggered: set true once on press
  jumpHeld:  false,    // continuous hold state
  totalObstacles: 0,
  lastEndline: 0,
};

// Obstacle definitions — each draw fn takes (cx, x, baseY, frame)
const OB_TYPES = {
  cart: {
    w: 60, h: 66,
    draw(cx, x, by, t) {
      // Hand cart with vegetables
      cx.save(); cx.translate(x, by);
      // Body
      ol(cx, () => { cx.beginPath(); rR(cx, 0, -50, 60, 30, 4); }, '#A0522D');
      ol(cx, () => { cx.beginPath(); rR(cx, 4, -64, 52, 16, 3); }, '#8B4513');
      // Vegetables (tomatoes, onions)
      [[10,-58,'#C0392B'],[20,-60,'#C0392B'],[30,-58,'#7B341E'],[42,-60,'#C0392B'],[50,-58,'#7B341E']].forEach(([cx2,cy,c])=>{
        cx.fillStyle=c; cx.beginPath(); cx.arc(cx2, cy, 4, 0, Math.PI*2); cx.fill();
      });
      // Wheels
      ol(cx, () => { cx.beginPath(); cx.arc(12, -10, 10, 0, Math.PI*2); }, '#1a1a1a');
      cx.fillStyle = '#888'; cx.beginPath(); cx.arc(12, -10, 4, 0, Math.PI*2); cx.fill();
      cx.strokeStyle = '#888'; cx.lineWidth = 1.5;
      for (let a = 0; a < 4; a++) { cx.save(); cx.translate(12,-10); cx.rotate(a*Math.PI/4 + t*0.04); cx.beginPath(); cx.moveTo(-9,0); cx.lineTo(9,0); cx.stroke(); cx.restore(); }
      ol(cx, () => { cx.beginPath(); cx.arc(48, -10, 10, 0, Math.PI*2); }, '#1a1a1a');
      cx.fillStyle = '#888'; cx.beginPath(); cx.arc(48, -10, 4, 0, Math.PI*2); cx.fill();
      // Handle
      cx.strokeStyle = '#5D3A1A'; cx.lineWidth = 3;
      cx.beginPath(); cx.moveTo(60, -45); cx.lineTo(72, -55); cx.stroke();
      cx.restore();
    }
  },
  cow: {
    w: 70, h: 50,
    draw(cx, x, by, t) {
      cx.save(); cx.translate(x, by);
      const wob = Math.sin(t * 0.05) * 1;
      // Body (white with brown patches)
      ol(cx, () => { cx.beginPath(); rR(cx, 4, -42 + wob, 56, 28, 8); }, '#F5F5F5');
      cx.fillStyle = '#8B4513';
      cx.beginPath(); cx.ellipse(20, -28 + wob, 8, 6, 0, 0, Math.PI*2); cx.fill();
      cx.beginPath(); cx.ellipse(40, -34 + wob, 7, 5, 0, 0, Math.PI*2); cx.fill();
      // Hump
      ol(cx, () => { cx.beginPath(); cx.arc(36, -42 + wob, 9, Math.PI, 2*Math.PI); }, '#F5F5F5');
      // Head
      ol(cx, () => { cx.beginPath(); rR(cx, 0, -38 + wob, 18, 16, 5); }, '#F5F5F5');
      // Horns
      cx.fillStyle = '#FFFFE0';
      cx.beginPath(); cx.moveTo(2, -38 + wob); cx.lineTo(-3, -46 + wob); cx.lineTo(5, -42 + wob); cx.closePath(); cx.fill();
      cx.beginPath(); cx.moveTo(15, -38 + wob); cx.lineTo(20, -46 + wob); cx.lineTo(13, -42 + wob); cx.closePath(); cx.fill();
      // Eye
      cx.fillStyle = BL; cx.beginPath(); cx.arc(6, -32 + wob, 1.5, 0, Math.PI*2); cx.fill();
      // Nose
      cx.fillStyle = '#FFB0B0'; cx.beginPath(); cx.ellipse(2, -25 + wob, 4, 3, 0, 0, Math.PI*2); cx.fill();
      cx.fillStyle = BL; cx.beginPath(); cx.arc(0, -25 + wob, 0.8, 0, Math.PI*2); cx.arc(4, -25 + wob, 0.8, 0, Math.PI*2); cx.fill();
      // Legs
      cx.fillStyle = '#F5F5F5'; cx.strokeStyle = BL; cx.lineWidth = 1.5;
      [10, 22, 38, 50].forEach(lx => {
        rR(cx, lx, -16, 4, 16, 1); cx.beginPath(); rR(cx, lx, -16, 4, 16, 1); cx.fill(); cx.stroke();
      });
      // Tail
      cx.strokeStyle = '#5D3A1A'; cx.lineWidth = 2;
      cx.beginPath(); cx.moveTo(60, -32 + wob); cx.quadraticCurveTo(70, -28 + wob, 68, -16 + wob); cx.stroke();
      cx.restore();
    }
  },
  dog: {
    w: 40, h: 30,
    draw(cx, x, by, t) {
      cx.save(); cx.translate(x, by);
      const wob = Math.sin(t * 0.1) * 1;
      // Body
      ol(cx, () => { cx.beginPath(); rR(cx, 4, -22 + wob, 30, 14, 6); }, '#A0522D');
      // Head
      ol(cx, () => { cx.beginPath(); cx.arc(2, -20 + wob, 8, 0, Math.PI*2); }, '#A0522D');
      // Ear
      ol(cx, () => { cx.beginPath(); cx.moveTo(-2, -28 + wob); cx.lineTo(-6, -22 + wob); cx.lineTo(0, -20 + wob); cx.closePath(); }, '#5D3A1A');
      // Eye
      cx.fillStyle = BL; cx.beginPath(); cx.arc(-2, -20 + wob, 1.2, 0, Math.PI*2); cx.fill();
      // Nose
      cx.fillStyle = BL; cx.beginPath(); cx.arc(-7, -18 + wob, 1.5, 0, Math.PI*2); cx.fill();
      // Tail
      cx.strokeStyle = '#5D3A1A'; cx.lineWidth = 2.5; cx.lineCap = 'round';
      cx.beginPath(); cx.moveTo(34, -18 + wob); cx.quadraticCurveTo(40 + Math.sin(t*0.2)*2, -22 + wob, 38, -28 + wob); cx.stroke();
      // Legs
      cx.fillStyle = '#A0522D';
      const ls = Math.sin(t*0.3) * 2;
      [8, 16, 24, 30].forEach((lx, i) => {
        cx.fillRect(lx, -10, 3, 10 + (i%2===0 ? ls : -ls));
      });
      cx.restore();
    }
  },
  peel: {
    w: 30, h: 14,
    draw(cx, x, by, t) {
      cx.save(); cx.translate(x, by);
      ol(cx, () => {
        cx.beginPath();
        cx.moveTo(0, -2);
        cx.bezierCurveTo(8, -14, 22, -14, 30, -2);
        cx.bezierCurveTo(28, 0, 22, -8, 16, -8);
        cx.bezierCurveTo(8, -8, 4, 0, 0, -2);
        cx.closePath();
      }, '#FFD700');
      // Highlight
      cx.strokeStyle = 'rgba(255,255,180,0.7)'; cx.lineWidth = 1;
      cx.beginPath(); cx.moveTo(8, -8); cx.bezierCurveTo(14, -10, 20, -10, 24, -6); cx.stroke();
      cx.restore();
    }
  },
  puddle: {
    w: 60, h: 10,
    draw(cx, x, by, t) {
      cx.save(); cx.translate(x, by);
      ol(cx, () => { cx.beginPath(); cx.ellipse(30, -3, 30, 6, 0, 0, Math.PI*2); }, '#5DADE2');
      cx.strokeStyle = 'rgba(255,255,255,0.5)'; cx.lineWidth = 1;
      cx.beginPath(); cx.moveTo(15, -4); cx.lineTo(25, -4); cx.moveTo(35, -2); cx.lineTo(42, -2); cx.stroke();
      cx.restore();
    }
  },
  pothole: {
    w: 50, h: 16,
    draw(cx, x, by, t) {
      cx.save(); cx.translate(x, by);
      ol(cx, () => { cx.beginPath(); cx.ellipse(25, -3, 25, 6, 0, 0, Math.PI*2); }, '#1a1a1a');
      cx.strokeStyle = '#3a2810'; cx.lineWidth = 1.5;
      cx.beginPath();
      cx.moveTo(-2, -2); cx.lineTo(8, -1);
      cx.moveTo(50, -2); cx.lineTo(58, -1);
      cx.stroke();
      cx.restore();
    }
  },
  idli: {
    w: 64, h: 64,
    draw(cx, x, by, t) {
      cx.save(); cx.translate(x, by);
      // Steamer cart (taller)
      ol(cx, () => { cx.beginPath(); rR(cx, 0, -40, 64, 26, 4); }, '#F4A460');
      // Steamer pot
      ol(cx, () => { cx.beginPath(); rR(cx, 12, -58, 40, 20, 5); }, '#C0C0C0');
      ol(cx, () => { cx.beginPath(); cx.ellipse(32, -58, 22, 4, 0, 0, Math.PI*2); }, '#A8A8A8', 1.5);
      // Steam wisps
      cx.strokeStyle = 'rgba(255,255,255,0.8)'; cx.lineWidth = 2; cx.lineCap = 'round';
      const sw = Math.sin(t * 0.1);
      cx.beginPath(); cx.moveTo(20 + sw*2, -64); cx.quadraticCurveTo(18, -72, 22, -78); cx.stroke();
      cx.beginPath(); cx.moveTo(32 + sw*2, -66); cx.quadraticCurveTo(35, -75, 30, -82); cx.stroke();
      cx.beginPath(); cx.moveTo(44 + sw*2, -64); cx.quadraticCurveTo(46, -72, 42, -78); cx.stroke();
      // Wheels
      ol(cx, () => { cx.beginPath(); cx.arc(14, -10, 8, 0, Math.PI*2); }, '#1a1a1a');
      ol(cx, () => { cx.beginPath(); cx.arc(50, -10, 8, 0, Math.PI*2); }, '#1a1a1a');
      cx.restore();
    }
  },
  parkedAuto: {
    w: 70, h: 56,
    draw(cx, x, by, t) {
      cx.save(); cx.translate(x, by);
      // Body — yellow with green stripe
      ol(cx, () => { cx.beginPath(); rR(cx, 4, -50, 60, 30, 6); }, '#F4C430');
      cx.fillStyle = '#117A65'; cx.fillRect(4, -34, 60, 4);
      // Canopy
      ol(cx, () => {
        cx.beginPath(); cx.moveTo(8, -50); cx.lineTo(58, -50);
        cx.lineTo(56, -56); cx.lineTo(10, -56); cx.closePath();
      }, '#2C2C2C');
      // Front
      ol(cx, () => { cx.beginPath(); rR(cx, 0, -34, 12, 18, 3); }, '#F4C430');
      // Wheels
      ol(cx, () => { cx.beginPath(); cx.arc(14, -10, 9, 0, Math.PI*2); }, '#1a1a1a');
      ol(cx, () => { cx.beginPath(); cx.arc(54, -10, 9, 0, Math.PI*2); }, '#1a1a1a');
      cx.fillStyle = '#888'; cx.beginPath(); cx.arc(14,-10,3,0,Math.PI*2); cx.arc(54,-10,3,0,Math.PI*2); cx.fill();
      // "PARKED" tag
      cx.fillStyle = BL; cx.font = 'bold 8px sans-serif'; cx.textAlign = 'center';
      cx.fillText('TN-09', 34, -42); cx.textAlign = 'left';
      cx.restore();
    }
  },
  person: {
    w: 28, h: 56,
    draw(cx, x, by, t) {
      cx.save(); cx.translate(x + 14, by);
      const bob = Math.sin(t * 0.06) * 1;
      // Lungi
      ol(cx, () => { cx.beginPath(); rR(cx, -8, -22 + bob, 16, 22, 3); }, '#0E6655');
      // Shirt
      ol(cx, () => { cx.beginPath(); rR(cx, -10, -42 + bob, 20, 22, 4); }, '#5DADE2');
      // Head
      ol(cx, () => { cx.beginPath(); cx.arc(0, -50 + bob, 9, 0, Math.PI*2); }, SK);
      // Hair
      cx.fillStyle = BL; cx.beginPath(); cx.arc(0, -55 + bob, 8, Math.PI + .2, -.2); cx.fill();
      // Eyes
      cx.fillStyle = BL; cx.beginPath(); cx.arc(-3, -50 + bob, 1, 0, Math.PI*2); cx.arc(3, -50 + bob, 1, 0, Math.PI*2); cx.fill();
      cx.restore();
    }
  },
};

// Power-up: moving auto-rickshaw to "catch"
const POWERUP_AUTO = {
  w: 80, h: 60,
  draw(cx, x, by, t) {
    cx.save(); cx.translate(x, by);
    // Speed lines around it
    cx.strokeStyle = 'rgba(244,196,48,0.5)'; cx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      cx.beginPath();
      const yy = -30 - i * 10;
      cx.moveTo(-10 - i * 6, yy); cx.lineTo(0 - i * 4, yy);
      cx.stroke();
    }
    // Body
    ol(cx, () => { cx.beginPath(); rR(cx, 4, -54, 70, 36, 8); }, '#F4C430');
    cx.fillStyle = '#117A65'; cx.fillRect(4, -36, 70, 5);
    // Canopy
    ol(cx, () => {
      cx.beginPath(); cx.moveTo(10, -54); cx.lineTo(70, -54);
      cx.lineTo(66, -64); cx.lineTo(14, -64); cx.closePath();
    }, '#2C2C2C');
    // Driver visible
    ol(cx, () => { cx.beginPath(); cx.arc(20, -42, 5, 0, Math.PI*2); }, SK, 1);
    // Front
    ol(cx, () => { cx.beginPath(); rR(cx, 0, -36, 10, 20, 3); }, '#F4C430');
    cx.fillStyle = '#fff'; cx.fillRect(2, -32, 6, 4);
    // Wheels (spinning effect)
    [16, 60].forEach(wx => {
      ol(cx, () => { cx.beginPath(); cx.arc(wx, -8, 10, 0, Math.PI*2); }, '#1a1a1a');
      cx.strokeStyle = '#888'; cx.lineWidth = 1.5;
      for (let a = 0; a < 4; a++) {
        cx.save(); cx.translate(wx,-8); cx.rotate(a*Math.PI/4 + t*0.3);
        cx.beginPath(); cx.moveTo(-9,0); cx.lineTo(9,0); cx.stroke();
        cx.restore();
      }
    });
    // "RIDE ME!" sign
    cx.fillStyle = BL; cx.fillRect(20, -76, 50, 14);
    cx.fillStyle = '#F4C430'; cx.font = 'bold 9px sans-serif'; cx.textAlign = 'center';
    cx.fillText('RIDE ME!', 45, -66); cx.textAlign = 'left';
    cx.restore();
  }
};

// Saree token at the end
function drawSaree(cx, x, y, t) {
  cx.save(); cx.translate(x, y);
  const float = Math.sin(t * 0.05) * 4;
  // Halo
  const grd = cx.createRadialGradient(0, float, 5, 0, float, 50);
  grd.addColorStop(0, 'rgba(244,196,48,0.7)');
  grd.addColorStop(1, 'rgba(244,196,48,0)');
  cx.fillStyle = grd;
  cx.beginPath(); cx.arc(0, float, 50, 0, Math.PI*2); cx.fill();
  // Saree fabric (peacock blue with gold border)
  cx.save(); cx.translate(0, float); cx.rotate(Math.sin(t*0.04)*0.05);
  ol(cx, () => {
    cx.beginPath();
    cx.moveTo(-30, -25); cx.bezierCurveTo(-30, 0, -20, 25, 0, 25);
    cx.bezierCurveTo(20, 25, 30, 0, 30, -25); cx.lineTo(-30, -25); cx.closePath();
  }, '#1A6B8C');
  // Gold border
  cx.strokeStyle = '#F4C430'; cx.lineWidth = 4;
  cx.beginPath(); cx.moveTo(-30, -25); cx.bezierCurveTo(-30, 0, -20, 25, 0, 25);
  cx.bezierCurveTo(20, 25, 30, 0, 30, -25); cx.stroke();
  // Peacock pattern
  cx.fillStyle = '#0E6655';
  [[-15,-10],[0,-5],[15,-12],[-8,8],[10,10]].forEach(([px,py])=>{
    cx.beginPath(); cx.ellipse(px, py, 4, 2, 0, 0, Math.PI*2); cx.fill();
  });
  cx.restore();
  // Sparkles
  for (let i = 0; i < 4; i++) {
    const sa = (t * 0.05 + i * Math.PI / 2) % (Math.PI * 2);
    const sx = Math.cos(sa) * 35;
    const sy = Math.sin(sa) * 25 + float;
    cx.fillStyle = 'rgba(255,255,200,0.9)';
    cx.beginPath(); cx.arc(sx, sy, 2.5, 0, Math.PI*2); cx.fill();
  }
  cx.restore();
}

// ── Background palette ───────────────────────────────────────────
const SHOPS = [
  { sign:'SAREE KING',     base:'#C0392B', acc:'#FFD700', text:'#FFFFFF' },
  { sign:'NALLI SILKS',    base:'#1A6B8C', acc:'#FFD700', text:'#FFFFFF' },
  { sign:'POTHYS',         base:'#117A65', acc:'#FFD700', text:'#FFFFFF' },
  { sign:'AANANDH STORES', base:'#F4C430', acc:'#8B0000', text:'#1A1A1A' },
  { sign:'CHENNAI SILKS',  base:'#7B341E', acc:'#FFD700', text:'#FFFFFF' },
  { sign:'KUMARAN STORES', base:'#922B21', acc:'#FFD700', text:'#FFFFFF' },
];

// Render one shop front at (bx, baseY..baseY+H) with proper signage, awnings, displays
function drawShop(cx, bx, by, H, shop, frame) {
  const w = 240, top = by;
  // Shop body
  cx.fillStyle = '#FFF8E0';   // cream wall
  cx.fillRect(bx, top + 30, w, H - 30);
  // Granite base
  cx.fillStyle = '#3A2A1A';
  cx.fillRect(bx, top + H - 14, w, 14);
  cx.fillStyle = '#5A4A3A';
  cx.fillRect(bx, top + H - 14, w, 3);

  // Header signboard
  cx.fillStyle = shop.base;
  cx.fillRect(bx, top, w, 36);
  // Gold trim
  cx.fillStyle = shop.acc;
  cx.fillRect(bx, top + 32, w, 4);
  cx.fillRect(bx, top - 2, w, 3);
  // Shop name
  cx.fillStyle = shop.text;
  cx.font = 'bold 18px Georgia, serif';
  cx.textAlign = 'center';
  cx.fillText(shop.sign, bx + w/2, top + 22);
  // Tamil-look subtitle (decorative)
  cx.fillStyle = shop.acc;
  cx.font = 'bold 9px sans-serif';
  cx.fillText('★ ESTD 1962 ★', bx + w/2, top + 32);
  cx.textAlign = 'left';

  // Striped awning under signboard
  for (let i = 0; i < 12; i++) {
    cx.fillStyle = (i % 2 === 0) ? shop.base : '#FFFFFF';
    cx.beginPath();
    cx.moveTo(bx + i * 20, top + 36);
    cx.lineTo(bx + i * 20 + 10, top + 50);
    cx.lineTo(bx + i * 20 + 20, top + 36);
    cx.closePath();
    cx.fill();
  }

  // Display windows with sarees on mannequins
  const winY = top + 56;
  const winH = H - 56 - 22;
  // Left window
  cx.fillStyle = '#3A2A1A';
  cx.fillRect(bx + 12, winY, 80, winH);
  cx.fillStyle = '#FFF8E0';
  cx.fillRect(bx + 16, winY + 4, 72, winH - 8);
  // Mannequin saree (random colour from palette)
  const sareeColors = ['#1A6B8C', '#8B0000', '#117A65', '#F4C430', '#922B21'];
  const sc1 = sareeColors[(Math.floor(bx/240) + 0) % sareeColors.length];
  cx.fillStyle = sc1;
  cx.beginPath();
  cx.moveTo(bx + 30, winY + 10);
  cx.lineTo(bx + 78, winY + 10);
  cx.lineTo(bx + 76, winY + winH - 14);
  cx.lineTo(bx + 32, winY + winH - 14);
  cx.closePath();
  cx.fill();
  cx.strokeStyle = '#FFD700'; cx.lineWidth = 2;
  cx.beginPath(); cx.moveTo(bx + 30, winY + 14); cx.lineTo(bx + 78, winY + 14); cx.stroke();
  // Mannequin head
  cx.fillStyle = '#C8956C';
  cx.beginPath(); cx.arc(bx + 54, winY + 8, 6, 0, Math.PI * 2); cx.fill();

  // Door
  cx.fillStyle = '#3A2A1A';
  cx.fillRect(bx + 100, winY, 40, winH);
  cx.fillStyle = shop.base;
  cx.fillRect(bx + 104, winY + 4, 32, winH - 4);
  // Door panels
  cx.strokeStyle = shop.acc; cx.lineWidth = 1;
  cx.strokeRect(bx + 108, winY + 8, 24, 18);
  cx.strokeRect(bx + 108, winY + 30, 24, 18);
  // Handle
  cx.fillStyle = shop.acc;
  cx.beginPath(); cx.arc(bx + 130, winY + winH/2, 1.5, 0, Math.PI * 2); cx.fill();

  // Right window
  cx.fillStyle = '#3A2A1A';
  cx.fillRect(bx + 148, winY, 80, winH);
  cx.fillStyle = '#FFF8E0';
  cx.fillRect(bx + 152, winY + 4, 72, winH - 8);
  const sc2 = sareeColors[(Math.floor(bx/240) + 2) % sareeColors.length];
  cx.fillStyle = sc2;
  cx.beginPath();
  cx.moveTo(bx + 166, winY + 10);
  cx.lineTo(bx + 214, winY + 10);
  cx.lineTo(bx + 212, winY + winH - 14);
  cx.lineTo(bx + 168, winY + winH - 14);
  cx.closePath();
  cx.fill();
  cx.strokeStyle = '#FFD700'; cx.lineWidth = 2;
  cx.beginPath(); cx.moveTo(bx + 166, winY + 14); cx.lineTo(bx + 214, winY + 14); cx.stroke();
  cx.fillStyle = '#C8956C';
  cx.beginPath(); cx.arc(bx + 190, winY + 8, 6, 0, Math.PI * 2); cx.fill();

  // String lights along top of awning
  const lightOff = (frame * 0.04) % 1;
  for (let i = 0; i < 8; i++) {
    const lx = bx + 20 + i * 26;
    cx.fillStyle = (Math.floor(i + frame * 0.05) % 2 === 0) ? '#FFD700' : '#FFFFFF';
    cx.beginPath(); cx.arc(lx, top + 52, 2, 0, Math.PI * 2); cx.fill();
  }
}

// Lamp post between shops
function drawLamp(cx, bx, baseY) {
  cx.fillStyle = '#1A1A1A';
  cx.fillRect(bx - 2, baseY - 110, 4, 110);
  cx.fillStyle = '#3A2A1A';
  cx.fillRect(bx - 6, baseY - 5, 12, 5);
  // Lamp head
  cx.fillStyle = '#FFD700';
  cx.beginPath(); cx.arc(bx, baseY - 110, 6, 0, Math.PI * 2); cx.fill();
  cx.strokeStyle = '#1A1A1A'; cx.lineWidth = 2;
  cx.beginPath(); cx.arc(bx, baseY - 110, 6, 0, Math.PI * 2); cx.stroke();
  // Glow
  cx.fillStyle = 'rgba(255,215,0,0.18)';
  cx.beginPath(); cx.arc(bx, baseY - 110, 18, 0, Math.PI * 2); cx.fill();
}

// Backgrounds
function drawL1Bg(cx, W, H, frame) {
  // Sky gradient — late afternoon
  const sky = cx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0,    '#FFD580');
  sky.addColorStop(0.45, '#FFE5A0');
  sky.addColorStop(0.85, '#FFEEC0');
  sky.addColorStop(1,    '#F4C460');
  cx.fillStyle = sky; cx.fillRect(0, 0, W, H);

  // Distant temple gopuram silhouette + buildings (parallax slow)
  const farOff = -L1.bg.far;
  for (let bx = farOff % 360, idx = Math.floor(L1.bg.far / 360); bx < W + 50; bx += 360, idx++) {
    cx.fillStyle = 'rgba(80,40,20,0.45)';
    // Temple
    cx.fillRect(bx + 30, H - 180, 80, 100);
    cx.beginPath();
    cx.moveTo(bx + 30, H - 180); cx.lineTo(bx + 70, H - 230); cx.lineTo(bx + 110, H - 180);
    cx.fill();
    // Smaller spires
    cx.fillRect(bx + 130, H - 160, 50, 80);
    cx.beginPath();
    cx.moveTo(bx + 130, H - 160); cx.lineTo(bx + 155, H - 200); cx.lineTo(bx + 180, H - 160);
    cx.fill();
    // Apartment block
    cx.fillRect(bx + 200, H - 180, 90, 100);
    // Tiny windows
    cx.fillStyle = 'rgba(255,200,100,0.5)';
    for (let wy = 0; wy < 5; wy++) {
      for (let wx = 0; wx < 4; wx++) {
        if ((wx + wy + idx) % 3 !== 0)
          cx.fillRect(bx + 210 + wx * 18, H - 170 + wy * 16, 6, 8);
      }
    }
  }

  // Sky birds
  for (let i = 0; i < 5; i++) {
    const bx = ((i * 173 - L1.bg.far * 0.4) % (W + 60)) - 30;
    const by = 30 + (i * 23) % 60;
    cx.strokeStyle = 'rgba(50,30,20,0.55)'; cx.lineWidth = 1.5;
    cx.beginPath();
    cx.moveTo(bx, by); cx.quadraticCurveTo(bx + 4, by - 3, bx + 8, by);
    cx.moveTo(bx + 8, by); cx.quadraticCurveTo(bx + 12, by - 3, bx + 16, by);
    cx.stroke();
  }

  // Mid: Power lines + tall lamp posts (slower parallax)
  const midSlowOff = -L1.bg.far * 1.3;
  cx.strokeStyle = 'rgba(40,20,10,0.45)'; cx.lineWidth = 1;
  cx.beginPath();
  cx.moveTo(0, H - 200); cx.lineTo(W, H - 200);
  cx.moveTo(0, H - 196); cx.lineTo(W, H - 196);
  cx.stroke();

  // Mid shops (parallax medium)
  const midOff = -L1.bg.mid;
  for (let bx = midOff % 280, idx = Math.floor(L1.bg.mid / 280); bx < W + 50; bx += 280, idx++) {
    const shop = SHOPS[Math.abs(idx) % SHOPS.length];
    drawShop(cx, bx, H - 178, 130, shop, frame);
    // Lamp post in gap
    drawLamp(cx, bx + 256, H - 48);
  }

  // Foreground sidewalk strip (parallax matches ground)
  cx.fillStyle = '#9A7A5A';
  cx.fillRect(0, L1.GROUND - 22, W, 18);
  cx.fillStyle = '#7A5A3A';
  cx.fillRect(0, L1.GROUND - 4, W, 4);

  // Ground (street)
  cx.fillStyle = '#5A3A1A';
  cx.fillRect(0, L1.GROUND + 4, W, H - L1.GROUND - 4);
  cx.fillStyle = '#3A2010';
  cx.fillRect(0, L1.GROUND + 4, W, 4);
  // Center yellow lane line — moving
  const lineOff = -L1.bg.ground;
  cx.fillStyle = '#FFD700';
  for (let gx = lineOff % 80; gx < W + 50; gx += 80) {
    cx.fillRect(gx, L1.GROUND + 30, 36, 4);
  }
  // Ground tile seams
  cx.strokeStyle = 'rgba(0,0,0,0.25)'; cx.lineWidth = 1;
  for (let gx = lineOff % 60; gx < W + 50; gx += 60) {
    cx.beginPath(); cx.moveTo(gx, L1.GROUND + 8); cx.lineTo(gx, H); cx.stroke();
  }
}

// ── Generation ────────────────────────────────────────────────────
function generateL1Queue() {
  const types = ['cart', 'cow', 'dog', 'peel', 'puddle', 'pothole', 'idli', 'parkedAuto', 'person'];
  const weights = [3, 3, 4, 4, 3, 3, 2, 2, 3];   // weighted random
  const pool = [];
  types.forEach((t, i) => { for (let k = 0; k < weights[i]; k++) pool.push(t); });
  const q = [];
  // Avoid back-to-back same type, also avoid two big tall obstacles in a row
  const big = new Set(['cart', 'cow', 'idli', 'parkedAuto']);
  for (let i = 0; i < L1_TUNE.TOTAL_OBSTACLES; i++) {
    let pick, tries = 0;
    do {
      pick = pool[Math.floor(Math.random() * pool.length)];
      tries++;
    } while (tries < 8 && q.length && (
      q[q.length - 1] === pick ||
      (big.has(pick) && big.has(q[q.length - 1]))
    ));
    q.push(pick);
  }
  // Ramp difficulty: first 8 obstacles biased to small (peel/dog/puddle/pothole)
  for (let i = 0; i < 8; i++) {
    if (big.has(q[i])) q[i] = ['peel','dog','puddle','pothole'][Math.floor(Math.random()*4)];
  }
  // Insert 3 auto power-ups roughly evenly
  [12, 24, 36].forEach((idx, i) => {
    const jitter = Math.floor(Math.random() * 4) - 2;
    q.splice(idx + i + jitter, 0, '__auto__');
  });
  return q;
}

function resetL1() {
  L1.frame = 0;
  L1.speed = L1_TUNE.SPEED_MIN;
  L1.speedTarget = L1_TUNE.SPEED_MIN;
  L1.distance = 0;
  L1.state = 'running';
  L1.muru.y = L1.GROUND;
  L1.muru.vy = 0;
  L1.muru.jumping = false;
  L1.muru.jumpHoldT = 0;
  L1.muru.riding = false;
  L1.muru.ridingT = 0;
  L1.obstacles = [];
  L1.queue = generateL1Queue();
  L1.totalObstacles = L1.queue.filter(q => q !== '__auto__').length;
  L1.spawnedCount = 0;
  L1.nextSpawnX = L1.W + 80;
  L1.hitCooldown = 0;
  L1.saree = null;
  L1.bg = { far: 0, mid: 0, near: 0, ground: 0 };
  L1.particles = [];
  L1.jumpPress = false;
  L1.jumpHeld  = false;
  L1.lastEndline = 0;
}

// ── Update ────────────────────────────────────────────────────────
function updateL1(api) {
  if (L1.state !== 'running') return;
  L1.frame++;

  // Speed ramp from MIN → MAX
  const ramp = Math.min(1, L1.distance / L1_TUNE.SPEED_RAMP_DIST);
  L1.speedTarget = L1_TUNE.SPEED_MIN + (L1_TUNE.SPEED_MAX - L1_TUNE.SPEED_MIN) * ramp;
  const targetNow = L1.muru.riding ? 9.0 : L1.speedTarget;
  L1.speed += (targetNow - L1.speed) * 0.04;
  L1.distance += L1.speed;

  // Background parallax
  L1.bg.far    += L1.speed * 0.18;
  L1.bg.mid    += L1.speed * 0.45;
  L1.bg.near   += L1.speed * 0.85;
  L1.bg.ground += L1.speed;

  // Muru physics (variable jump height)
  if (L1.muru.riding) {
    L1.muru.ridingT--;
    L1.muru.y = L1.GROUND;
    L1.muru.vy = 0;
    if (L1.muru.ridingT <= 0) L1.muru.riding = false;
  } else {
    // Edge-triggered jump start
    if (L1.jumpPress && !L1.muru.jumping) {
      L1.muru.vy = L1_TUNE.JUMP_VY;
      L1.muru.jumping = true;
      L1.muru.jumpHoldT = 0;
    }
    L1.jumpPress = false;

    // Reduced gravity while jump is HELD and we're ascending — variable jump height
    let g = L1_TUNE.GRAVITY_NORMAL;
    if (L1.muru.jumping
        && L1.jumpHeld
        && L1.muru.jumpHoldT < L1_TUNE.JUMP_HOLD_FRAMES
        && L1.muru.vy < 0) {
      g = L1_TUNE.GRAVITY_HOLD;
      L1.muru.jumpHoldT++;
    }
    L1.muru.vy += g;
    L1.muru.y += L1.muru.vy;
    if (L1.muru.y >= L1.GROUND) {
      L1.muru.y = L1.GROUND;
      L1.muru.vy = 0;
      L1.muru.jumping = false;
      L1.muru.jumpHoldT = 0;
    }
  }

  // Spawn obstacles
  if (L1.queue.length > 0 && L1.nextSpawnX <= L1.W + 60) {
    const type = L1.queue.shift();
    if (type === '__auto__') {
      L1.obstacles.push({
        kind: 'auto', x: L1.W + 50,
        w: POWERUP_AUTO.w, h: POWERUP_AUTO.h,
        baseY: L1.GROUND
      });
    } else {
      const def = OB_TYPES[type];
      L1.spawnedCount++;
      L1.obstacles.push({
        kind: type, x: L1.W + 50,
        w: def.w, h: def.h,
        baseY: L1.GROUND
      });
    }
    // Random gap (wider so variable-height jumps land cleanly)
    L1.nextSpawnX = L1.W + 50 + L1_TUNE.GAP_MIN + Math.random() * (L1_TUNE.GAP_MAX - L1_TUNE.GAP_MIN);
  } else {
    L1.nextSpawnX -= L1.speed;
  }

  // Spawn saree once all obstacles dispatched + last cleared
  if (!L1.saree && L1.queue.length === 0) {
    if (L1.lastEndline === 0) L1.lastEndline = L1.distance + 500;
    if (L1.distance >= L1.lastEndline) {
      L1.saree = { x: L1.W + 60, y: L1.GROUND - 80, taken: false };
    }
  }

  // Move obstacles + saree left
  L1.obstacles.forEach(o => o.x -= L1.speed);
  if (L1.saree) L1.saree.x -= L1.speed;

  // Despawn off-screen
  L1.obstacles = L1.obstacles.filter(o => o.x + o.w > -50);

  // Cooldown
  if (L1.hitCooldown > 0) L1.hitCooldown--;

  // Collisions
  const muruBox = { x: L1.MURU_X - 14, y: L1.muru.y - 60, w: 28, h: 60 };

  for (const o of L1.obstacles) {
    const obBox = { x: o.x, y: o.baseY - o.h, w: o.w, h: o.h };
    if (boxOverlap(muruBox, obBox)) {
      if (o.kind === 'auto') {
        // Catch auto power-up
        if (!L1.muru.riding) {
          L1.muru.riding = true;
          L1.muru.ridingT = 300;   // 5s @60fps
          // Sparkle particles
          for (let i = 0; i < 14; i++) {
            L1.particles.push({
              x: L1.MURU_X, y: L1.muru.y - 30,
              vx: (Math.random() - 0.5) * 6, vy: -2 - Math.random() * 4,
              life: 30 + Math.random() * 20, color: '#F4C430'
            });
          }
          api.toast('AUTO BOOST! 5 seconds invincible!');
          o.x = -200;   // remove
        }
      } else if (L1.muru.riding) {
        // Ride blitz — destroy obstacle
        for (let i = 0; i < 8; i++) {
          L1.particles.push({
            x: o.x + o.w/2, y: o.baseY - o.h/2,
            vx: 2 + Math.random() * 4, vy: -2 - Math.random() * 4,
            life: 25, color: '#fff'
          });
        }
        o.x = -200;
      } else if (L1.hitCooldown <= 0) {
        // Take a hit
        api.lifeLost();
        L1.hitCooldown = 90;   // 1.5s invuln
        // Knockback
        L1.muru.vy = -8;
      }
    }
  }

  // Saree pickup
  if (L1.saree && !L1.saree.taken) {
    const sBox = { x: L1.saree.x - 30, y: L1.saree.y - 30, w: 60, h: 60 };
    if (boxOverlap(muruBox, sBox)) {
      L1.saree.taken = true;
      L1.state = 'won';
      // Big sparkle
      for (let i = 0; i < 30; i++) {
        L1.particles.push({
          x: L1.saree.x, y: L1.saree.y,
          vx: (Math.random() - 0.5) * 10, vy: -3 - Math.random() * 6,
          life: 50, color: i % 2 ? '#F4C430' : '#1A6B8C'
        });
      }
      setTimeout(() => api.win(), 800);
    }
  }

  // Update particles
  L1.particles.forEach(p => {
    p.x += p.vx; p.y += p.vy; p.vy += 0.3; p.life--;
  });
  L1.particles = L1.particles.filter(p => p.life > 0);
}

function boxOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// ── Render ────────────────────────────────────────────────────────
function renderL1(cx) {
  const W = L1.W, H = L1.H;
  cx.clearRect(0, 0, W, H);
  drawL1Bg(cx, W, H, L1.frame);

  // Speed lines during boost
  if (L1.muru.riding) {
    cx.strokeStyle = 'rgba(244,196,48,0.6)'; cx.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const sy = (L1.frame * 6 + i * 22) % H;
      cx.beginPath(); cx.moveTo(0, sy); cx.lineTo(40, sy); cx.stroke();
    }
  }

  // Obstacles
  for (const o of L1.obstacles) {
    if (o.kind === 'auto') POWERUP_AUTO.draw(cx, o.x, o.baseY, L1.frame);
    else                    OB_TYPES[o.kind].draw(cx, o.x, o.baseY, L1.frame);
  }

  // Saree
  if (L1.saree && !L1.saree.taken) drawSaree(cx, L1.saree.x, L1.saree.y, L1.frame);

  // Muru — riding or running
  if (L1.muru.riding) {
    // Auto rickshaw drawn under Muru
    POWERUP_AUTO.draw(cx, L1.MURU_X - 30, L1.GROUND + Math.sin(L1.frame*0.3)*2, L1.frame);
    drawMuru(cx, L1.MURU_X + 10, L1.GROUND - 22, L1.frame, false);
  } else {
    const flicker = L1.hitCooldown > 0 && Math.floor(L1.frame / 6) % 2 === 0;
    if (flicker) cx.globalAlpha = 0.4;
    drawMuru(cx, L1.MURU_X, L1.muru.y, L1.frame, !L1.muru.jumping);
    cx.globalAlpha = 1;
  }

  // Particles
  L1.particles.forEach(p => {
    cx.fillStyle = p.color;
    cx.globalAlpha = Math.min(1, p.life / 30);
    cx.fillRect(p.x - 2, p.y - 2, 4, 4);
  });
  cx.globalAlpha = 1;

  // Boost timer ring
  if (L1.muru.riding) {
    const pct = L1.muru.ridingT / 300;
    cx.strokeStyle = '#F4C430'; cx.lineWidth = 4;
    cx.beginPath();
    cx.arc(L1.W - 30, 30, 14, -Math.PI/2, -Math.PI/2 + Math.PI * 2 * pct);
    cx.stroke();
    cx.fillStyle = BL; cx.font = 'bold 11px sans-serif'; cx.textAlign = 'center';
    cx.fillText(Math.ceil(L1.muru.ridingT / 60), L1.W - 30, 34);
    cx.textAlign = 'left';
  }
}

// ── Public API ────────────────────────────────────────────────────
const Level1 = {
  init(api) {
    resetL1();
    this.api = api;
  },
  status() {
    const cleared = Math.min(L1.totalObstacles, L1.spawnedCount - L1.obstacles.filter(o => o.kind !== 'auto').length);
    return `${L1.spawnedCount}/${L1.totalObstacles} obstacles · ${L1.muru.riding ? '⚡ BOOST' : 'GO!'}`;
  },
  jumpPress() {
    if (L1.state === 'running' && !L1.muru.riding) L1.jumpPress = true;
  },
  jumpHold(on) {
    L1.jumpHeld = !!on;
    if (on) this.jumpPress();
  },
  update(api) { updateL1(api || this.api); },
  render(cx)  { renderL1(cx); },
  reset()     { resetL1(); },
};
window.Level1 = Level1;
