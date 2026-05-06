// LEVEL 1 — THE SAREE CHASE
// Side-scrolling auto-runner. Jump over obstacles, catch the auto-rickshaw
// for a 5-second invincibility blitz, grab the saree at the end.

// Level 1 tunables — adjust these to change feel
const L1_TUNE = {
  W: 880, H: 340,
  GROUND: 290,             // feet position; road extends below this
  MURU_X: 160,
  MURU_SCALE: 0.62,
  // Jump physics
  JUMP_VY: -10.8,
  GRAVITY_NORMAL: 0.55,
  GRAVITY_HOLD:   0.27,
  JUMP_HOLD_FRAMES: 17,
  // Speed
  SPEED_MIN: 4.6,
  SPEED_MAX: 8.4,
  SPEED_RAMP_DIST: 4000,
  // Spacing
  GAP_MIN: 290,
  GAP_MAX: 560,
  // Obstacle queue
  TOTAL_OBSTACLES: 45,
  NUM_AUTOS: 2,
  NUM_COFFEES: 3,            // filter coffee pickups (each gives +1 life)
  // Power-up
  RIDE_FRAMES: 300,
  RIDE_GRACE: 90,
  RIDE_BOARD_RANGE: 220,   // px window where boarding is allowed (rightward)
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
  jumpPress: false,
  jumpHeld:  false,
  downPress: false,    // edge-triggered "board the auto" key
  totalObstacles: 0,
  lastEndline: 0,
  boardPossible: false,   // is there a nearby auto to board right now?
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
    w: 44, h: 30,
    draw(cx, x, by, t) {
      cx.save(); cx.translate(x, by);
      const wob = Math.sin(t * 0.1) * 1;
      const FUR  = '#E8C28A';     // light tan — pops on dark road
      const FUR2 = '#C8965A';     // shadow tone
      const PAW  = '#8B5A2A';
      // Tail (animated)
      cx.strokeStyle = PAW; cx.lineWidth = 3; cx.lineCap = 'round';
      cx.beginPath();
      cx.moveTo(38, -18 + wob);
      cx.quadraticCurveTo(46 + Math.sin(t * 0.2) * 2, -22 + wob, 44, -30 + wob);
      cx.stroke();
      // Body
      ol(cx, () => { cx.beginPath(); rR(cx, 4, -22 + wob, 32, 14, 7); }, FUR, 1.5);
      // Belly highlight
      cx.fillStyle = 'rgba(255,255,255,0.3)';
      cx.fillRect(8, -12 + wob, 24, 3);
      // Head
      ol(cx, () => { cx.beginPath(); cx.arc(4, -20 + wob, 9, 0, Math.PI * 2); }, FUR, 1.5);
      // Snout
      cx.fillStyle = FUR2;
      cx.beginPath(); cx.ellipse(-4, -18 + wob, 5, 3, 0, 0, Math.PI * 2); cx.fill();
      // Brown ears (floppy)
      ol(cx, () => {
        cx.beginPath();
        cx.moveTo(0, -28 + wob); cx.quadraticCurveTo(-4, -22 + wob, -2, -16 + wob);
        cx.lineTo(2, -20 + wob); cx.closePath();
      }, PAW, 1.2);
      ol(cx, () => {
        cx.beginPath();
        cx.moveTo(8, -28 + wob); cx.quadraticCurveTo(12, -22 + wob, 10, -16 + wob);
        cx.lineTo(6, -20 + wob); cx.closePath();
      }, PAW, 1.2);
      // Eye + nose + tongue
      cx.fillStyle = BL;
      cx.beginPath(); cx.arc(0, -20 + wob, 1.3, 0, Math.PI * 2); cx.fill();
      cx.beginPath(); cx.arc(-7, -18 + wob, 1.6, 0, Math.PI * 2); cx.fill();
      cx.fillStyle = '#E91E63';
      cx.fillRect(-9, -16 + wob, 3, 2);
      // Brown patch on body
      cx.fillStyle = PAW;
      cx.beginPath(); cx.ellipse(20, -18 + wob, 5, 4, 0, 0, Math.PI * 2); cx.fill();
      // Legs
      const ls = Math.sin(t * 0.3) * 2;
      cx.fillStyle = FUR2;
      [8, 16, 26, 32].forEach((lx, i) => {
        cx.fillRect(lx, -10, 3, 10 + (i % 2 === 0 ? ls : -ls));
      });
      cx.restore();
    }
  },
  peel: {
    w: 60, h: 18,
    draw(cx, x, by, t) {
      // Two banana peels lying on the road — clear cartoon C-shapes with
      // brown stems on the inner edge and pale cream interiors.
      const FUR  = '#FFE03A';   // bright yellow
      const FUR2 = '#E8B400';   // shadow yellow
      const STEM = '#7A4014';
      const CREAM= '#FFFAEA';

      // Soft ground shadow under both peels
      cx.fillStyle = 'rgba(0,0,0,0.30)';
      cx.beginPath();
      cx.ellipse(x + 30, by - 1, 30, 5, 0, 0, Math.PI * 2);
      cx.fill();

      // Helper: draw one peel half curving in a direction
      // dir = -1 → curls left (stem on right), dir = +1 → curls right (stem on left)
      function peelHalf(cx, cx2, cy, dir) {
        cx.save();
        cx.translate(cx2, cy);
        cx.scale(dir, 1);
        // Outer curl outline
        cx.fillStyle = FUR;
        cx.strokeStyle = BL; cx.lineWidth = 1.8; cx.lineJoin = 'round';
        cx.beginPath();
        cx.moveTo(0, -2);
        cx.bezierCurveTo(8, -10, 22, -6, 26, 4);     // outer curve
        cx.lineTo(22, 6);
        cx.bezierCurveTo(20, 0, 12, -2, 4, 1);       // inner sweep
        cx.bezierCurveTo(2, 1, 0, 0, 0, -2);
        cx.closePath();
        cx.fill(); cx.stroke();
        // Cream inside (showing peeled flesh)
        cx.fillStyle = CREAM;
        cx.beginPath();
        cx.moveTo(3, 0);
        cx.bezierCurveTo(10, -7, 20, -4, 23, 3);
        cx.bezierCurveTo(20, 1, 14, 0, 8, 1);
        cx.bezierCurveTo(5, 1, 4, 0, 3, 0);
        cx.closePath();
        cx.fill();
        // Shadow streak inside curl
        cx.strokeStyle = FUR2; cx.lineWidth = 1.2;
        cx.beginPath();
        cx.moveTo(6, 2); cx.bezierCurveTo(14, -3, 22, 0, 24, 5);
        cx.stroke();
        // Fiber lines
        cx.strokeStyle = 'rgba(170,130,20,0.55)'; cx.lineWidth = 0.7;
        cx.beginPath();
        cx.moveTo(8, -4); cx.lineTo(20, 0);
        cx.moveTo(11, -1); cx.lineTo(20, 3);
        cx.stroke();
        // Stem nub on the inner end
        cx.fillStyle = STEM;
        cx.beginPath();
        cx.ellipse(-1, -1, 3, 2.2, 0, 0, Math.PI * 2);
        cx.fill();
        cx.strokeStyle = BL; cx.lineWidth = 1.2;
        cx.stroke();
        cx.restore();
      }

      // Left peel curls leftwards (stem on the right)
      peelHalf(cx, x + 24, by - 4, -1);
      // Right peel curls rightwards (stem on the left), placed slightly forward
      peelHalf(cx, x + 36, by - 2, +1);
    }
  },
  puddle: {
    w: 80, h: 10,
    draw(cx, x, by, t) {
      // Irregular blob of water sitting flat on the road.
      cx.save();
      cx.translate(x, by);
      // Slight darken on the road around it (wet ring)
      cx.fillStyle = 'rgba(0,0,0,0.18)';
      cx.beginPath();
      cx.moveTo(-2, 0);
      cx.bezierCurveTo(8, -6, 25, -10, 40, -8);
      cx.bezierCurveTo(60, -10, 76, -6, 82, 0);
      cx.bezierCurveTo(70, 6, 50, 7, 30, 6);
      cx.bezierCurveTo(15, 7, 0, 5, -2, 0);
      cx.closePath(); cx.fill();
      // Water blob — irregular outline
      ol(cx, () => {
        cx.beginPath();
        cx.moveTo(2, -1);
        cx.bezierCurveTo(10, -8, 22, -10, 32, -8);
        cx.bezierCurveTo(48, -10, 64, -7, 76, -2);
        cx.bezierCurveTo(72, 4, 56, 5, 40, 4);
        cx.bezierCurveTo(24, 5, 8, 4, 2, -1);
        cx.closePath();
      }, '#3A93C8', 1.5);
      // Highlight streaks
      cx.strokeStyle = 'rgba(255,255,255,0.75)';
      cx.lineWidth = 1.5; cx.lineCap = 'round';
      cx.beginPath(); cx.moveTo(14, -5); cx.bezierCurveTo(22, -6, 30, -5, 36, -3); cx.stroke();
      cx.beginPath(); cx.moveTo(50, -3); cx.bezierCurveTo(58, -4, 64, -3, 68, -1); cx.stroke();
      // Ripple — animated
      cx.strokeStyle = 'rgba(255,255,255,0.35)'; cx.lineWidth = 1;
      const rip = (Math.sin(t * 0.06) + 1) * 0.5;
      cx.beginPath();
      cx.ellipse(40, -2, 18 + rip * 8, 4 + rip * 1.5, 0, 0, Math.PI * 2);
      cx.stroke();
      cx.restore();
    }
  },
  pothole: {
    w: 56, h: 16,
    draw(cx, x, by, t) {
      cx.save();
      cx.translate(x, by);
      // Cracked ring around the hole
      cx.strokeStyle = 'rgba(40,25,10,0.65)';
      cx.lineWidth = 1.2;
      cx.beginPath();
      cx.moveTo(-4, 1); cx.lineTo(4, -3); cx.lineTo(8, 1);
      cx.moveTo(54, 0); cx.lineTo(60, -2); cx.lineTo(62, 1);
      cx.moveTo(20, 4); cx.lineTo(18, 7);
      cx.moveTo(38, 4); cx.lineTo(40, 7);
      cx.stroke();
      // Outer hole (irregular dark shape)
      ol(cx, () => {
        cx.beginPath();
        cx.moveTo(2, 0);
        cx.bezierCurveTo(10, -10, 22, -14, 32, -12);
        cx.bezierCurveTo(46, -14, 54, -10, 56, -4);
        cx.bezierCurveTo(54, 2, 40, 4, 26, 3);
        cx.bezierCurveTo(14, 4, 4, 3, 2, 0);
        cx.closePath();
      }, '#1c0e04', 1.5);
      // Inner blackness
      cx.fillStyle = '#000';
      cx.beginPath();
      cx.moveTo(8, -2);
      cx.bezierCurveTo(14, -10, 26, -12, 36, -10);
      cx.bezierCurveTo(44, -10, 50, -7, 48, -3);
      cx.bezierCurveTo(36, -1, 22, -2, 8, -2);
      cx.closePath();
      cx.fill();
      // Loose pebble
      cx.fillStyle = '#7A5A3A';
      cx.beginPath(); cx.arc(48, 1, 1.5, 0, Math.PI * 2); cx.fill();
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
  w: 90, h: 64,
  draw(cx, x, by, t, riding = false) {
    const pulse = 1 + Math.sin(t * 0.18) * 0.06;
    cx.save();
    cx.translate(x, by);

    // Strong pulsing halo (only when not actively being ridden)
    if (!riding) {
      const r1 = 30, r2 = 80 * pulse;
      const grd = cx.createRadialGradient(40, -30, r1, 40, -30, r2);
      grd.addColorStop(0,    'rgba(255,220,80,0.55)');
      grd.addColorStop(0.55, 'rgba(255,180,40,0.30)');
      grd.addColorStop(1,    'rgba(255,180,40,0)');
      cx.fillStyle = grd;
      cx.beginPath(); cx.arc(40, -30, r2, 0, Math.PI * 2); cx.fill();

      // Outer dashed ring (rotating)
      cx.save(); cx.translate(40, -30); cx.rotate(t * 0.05);
      cx.strokeStyle = 'rgba(255,210,80,0.85)'; cx.lineWidth = 2.5;
      cx.setLineDash([6, 6]);
      cx.beginPath(); cx.arc(0, 0, 50, 0, Math.PI * 2); cx.stroke();
      cx.setLineDash([]);
      cx.restore();
    }

    // Speed-line streaks (left side)
    cx.strokeStyle = 'rgba(255,210,80,0.7)'; cx.lineWidth = 2.5; cx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const yy = -52 + i * 14;
      cx.beginPath();
      cx.moveTo(-18 - i * 4, yy);
      cx.lineTo(-2 - i * 2, yy);
      cx.stroke();
    }

    // Body — yellow
    ol(cx, () => { cx.beginPath(); rR(cx, 6, -56, 78, 40, 10); }, '#F4C430');
    // Green livery stripe
    cx.fillStyle = '#117A65';
    cx.fillRect(6, -38, 78, 6);
    cx.fillStyle = 'rgba(0,0,0,0.25)';
    cx.fillRect(6, -32, 78, 2);

    // Canopy
    ol(cx, () => {
      cx.beginPath();
      cx.moveTo(12, -56); cx.lineTo(80, -56);
      cx.lineTo(74, -68); cx.lineTo(18, -68); cx.closePath();
    }, '#2C2C2C');
    // Canopy trim
    cx.fillStyle = '#F4C430';
    cx.fillRect(14, -58, 64, 2);

    // Front cab (driver area)
    ol(cx, () => { cx.beginPath(); rR(cx, 0, -38, 14, 22, 4); }, '#F4C430');
    cx.fillStyle = '#5DADE2'; cx.fillRect(2, -34, 10, 8);   // windshield

    // Driver silhouette
    cx.fillStyle = SK;
    cx.beginPath(); cx.arc(22, -44, 5, 0, Math.PI * 2); cx.fill();
    cx.fillStyle = BL;
    cx.fillRect(20, -42, 4, 1);    // mustache

    // Plate
    cx.fillStyle = '#fff';
    cx.fillRect(56, -22, 24, 8);
    cx.strokeStyle = BL; cx.lineWidth = 1;
    cx.strokeRect(56, -22, 24, 8);
    cx.fillStyle = BL;
    cx.font = 'bold 7px sans-serif'; cx.textAlign = 'center';
    cx.fillText('TN-09', 68, -16);
    cx.textAlign = 'left';

    // Wheels (spinning)
    [18, 70].forEach(wx => {
      ol(cx, () => { cx.beginPath(); cx.arc(wx, -8, 10, 0, Math.PI * 2); }, '#1a1a1a');
      cx.strokeStyle = '#888'; cx.lineWidth = 1.5;
      for (let a = 0; a < 4; a++) {
        cx.save();
        cx.translate(wx, -8);
        cx.rotate(a * Math.PI / 4 + t * 0.4);
        cx.beginPath(); cx.moveTo(-9, 0); cx.lineTo(9, 0); cx.stroke();
        cx.restore();
      }
      cx.fillStyle = '#888';
      cx.beginPath(); cx.arc(wx, -8, 3, 0, Math.PI * 2); cx.fill();
    });

    // "JUMP!" floating sign — only when it's a free-floating power-up
    if (!riding) {
      const bobUp = Math.sin(t * 0.18) * 3;
      // Speech bubble
      ol(cx, () => {
        cx.beginPath();
        rR(cx, 18, -94 + bobUp, 56, 22, 6);
      }, '#F4C430', 2.5);
      cx.fillStyle = BL; cx.font = 'bold 11px sans-serif'; cx.textAlign = 'center';
      cx.fillText('⚡ JUMP IN!', 46, -79 + bobUp);
      cx.textAlign = 'left';
      // Bubble tail
      cx.fillStyle = '#F4C430';
      cx.beginPath();
      cx.moveTo(40, -72 + bobUp); cx.lineTo(45, -68 + bobUp); cx.lineTo(50, -72 + bobUp);
      cx.closePath(); cx.fill();
      cx.strokeStyle = BL; cx.lineWidth = 2; cx.stroke();
    }
    cx.restore();
  }
};

// Muru in the auto, side profile facing right (towards the road)
function drawMuruRider(cx, x, y, t) {
  const wob = Math.sin(t * 0.3) * 1.5;
  cx.save(); cx.translate(x, y + wob);

  // Lower body / dhoti — shown from passenger seat
  ol(cx, () => { cx.beginPath(); rR(cx, -6, -2, 18, 16, 3); }, '#FFFFF0');
  cx.strokeStyle = '#C8900A'; cx.lineWidth = 1.5;
  cx.beginPath(); cx.moveTo(-6, 12); cx.lineTo(12, 12); cx.stroke();

  // Torso (red shirt) — slight forward lean
  ol(cx, () => {
    cx.beginPath();
    cx.moveTo(-8, -2); cx.lineTo(12, -4);
    cx.lineTo(14, -22); cx.lineTo(-6, -20); cx.closePath();
  }, '#C0392B');
  // Gold chain glint
  cx.strokeStyle = '#F4C430'; cx.lineWidth = 1.5;
  cx.beginPath(); cx.arc(2, -10, 4, 0.2 * Math.PI, 0.8 * Math.PI); cx.stroke();

  // Forward arm gripping the bar
  ol(cx, () => { cx.beginPath(); rR(cx, 8, -16, 18, 4, 2); }, SK);
  ol(cx, () => { cx.beginPath(); cx.arc(28, -14, 3.5, 0, Math.PI * 2); }, SK, 1.2);

  // Head — profile facing right
  ol(cx, () => { cx.beginPath(); cx.arc(2, -28, 11, 0, Math.PI * 2); }, SK);

  // Hair (black, swept back from wind)
  cx.fillStyle = BL;
  cx.beginPath(); cx.arc(2, -32, 11, Math.PI + 0.05, -0.45); cx.fill();
  // Wind streamers
  cx.strokeStyle = BL; cx.lineWidth = 1.6; cx.lineCap = 'round';
  cx.beginPath(); cx.moveTo(-7, -32); cx.quadraticCurveTo(-13, -34, -14, -29); cx.stroke();
  cx.beginPath(); cx.moveTo(-7, -28); cx.quadraticCurveTo(-12, -28, -12, -25); cx.stroke();

  // Sunglasses
  cx.fillStyle = BL;
  cx.fillRect(4, -30, 9, 4);
  cx.strokeStyle = BL; cx.lineWidth = 1;
  cx.beginPath(); cx.moveTo(4, -29); cx.lineTo(0, -29); cx.stroke();

  // Mustache
  cx.fillStyle = BL;
  cx.fillRect(5, -22, 9, 2);
  cx.fillRect(2, -23, 3, 3);   // left curl

  // Smug smile
  cx.strokeStyle = '#7A3A20'; cx.lineWidth = 1.5; cx.lineCap = 'round';
  cx.beginPath(); cx.moveTo(5, -19); cx.lineTo(11, -18); cx.stroke();

  // Ear hint
  ol(cx, () => { cx.beginPath(); cx.arc(-7, -28, 3, 0, Math.PI * 2); }, SK, 1);

  cx.restore();
}

// Filter coffee pickup (+1 life): steel tumbler in a dabarah, steaming
function drawCoffee(cx, x, y, t) {
  const float = Math.sin(t * 0.06) * 4;
  const pulse = 1 + Math.sin(t * 0.13) * 0.06;
  cx.save();
  cx.translate(x, y + float);

  // Outer glow
  const grd = cx.createRadialGradient(0, 0, 4, 0, 0, 44 * pulse);
  grd.addColorStop(0,   'rgba(244,196,48,0.55)');
  grd.addColorStop(0.6, 'rgba(255,140,40,0.22)');
  grd.addColorStop(1,   'rgba(255,140,40,0)');
  cx.fillStyle = grd;
  cx.fillRect(-44, -44, 88, 88);

  // Steam rising — three wavy plumes
  cx.strokeStyle = 'rgba(255,255,255,0.85)';
  cx.lineWidth = 2.2; cx.lineCap = 'round';
  const sw = Math.sin(t * 0.12) * 3;
  for (let i = -1; i <= 1; i++) {
    cx.beginPath();
    cx.moveTo(i * 7 + sw * 0.5, -22);
    cx.bezierCurveTo(i * 7 - 4 + sw, -28, i * 7 + 4 + sw, -34, i * 7 + sw * 1.5, -42);
    cx.stroke();
  }

  cx.scale(pulse, pulse);

  // Tumbler — slightly tapered steel, bigger than original
  ol(cx, () => {
    cx.beginPath();
    cx.moveTo(-13, -22);
    cx.bezierCurveTo(-13, -22, -13, -22, -13, -22);
    cx.lineTo(13, -22);
    cx.lineTo(11, 6);
    cx.lineTo(-11, 6);
    cx.closePath();
  }, '#D8D8D8', 1.8);

  // Coffee fill (dark brown band at the top with a foam crema)
  cx.fillStyle = '#3a1a06';
  cx.fillRect(-12, -22, 24, 5);
  // Foam — wavy white top
  cx.fillStyle = '#fff';
  cx.beginPath();
  cx.moveTo(-12, -19);
  cx.bezierCurveTo(-7, -22, -2, -18, 3, -21);
  cx.bezierCurveTo(7, -19, 10, -21, 12, -19);
  cx.lineTo(12, -16);
  cx.lineTo(-12, -16);
  cx.closePath();
  cx.fill();

  // Steel ridges (horizontal lines)
  cx.strokeStyle = 'rgba(120,120,120,0.7)';
  cx.lineWidth = 1;
  cx.beginPath();
  cx.moveTo(-12, -10); cx.lineTo(12, -10);
  cx.moveTo(-12, -2);  cx.lineTo(12, -2);
  cx.stroke();
  // Highlight stripe
  cx.fillStyle = 'rgba(255,255,255,0.45)';
  cx.fillRect(-9, -20, 2, 24);

  // Dabarah (steel saucer below the tumbler)
  ol(cx, () => {
    cx.beginPath();
    cx.moveTo(-18, 6);
    cx.lineTo(18, 6);
    cx.lineTo(14, 16);
    cx.lineTo(-14, 16);
    cx.closePath();
  }, '#B8B8B8', 1.8);
  cx.fillStyle = '#888';
  cx.fillRect(-15, 7, 30, 2);
  cx.fillStyle = 'rgba(255,255,255,0.4)';
  cx.fillRect(-12, 9, 4, 1);

  cx.scale(1 / pulse, 1 / pulse);

  // "+1" pill below
  ol(cx, () => { cx.beginPath(); rR(cx, -16, 22, 32, 14, 7); }, '#E91E63', 1.5);
  cx.fillStyle = '#fff';
  cx.font = 'bold 10px sans-serif'; cx.textAlign = 'center';
  cx.fillText('+1 LIFE', 0, 32);
  cx.textAlign = 'left';

  cx.restore();

  // Orbiting sparkles
  for (let i = 0; i < 4; i++) {
    const a = (t * 0.06 + i * Math.PI / 2);
    cx.fillStyle = 'rgba(255,255,200,0.85)';
    cx.beginPath();
    cx.arc(x + Math.cos(a) * 32, y + Math.sin(a) * 22 + float, 1.6, 0, Math.PI * 2);
    cx.fill();
  }
}

// Floating "Press ⬇" prompt above an approaching auto
function drawBoardPrompt(cx, x, y, t) {
  const bob = Math.sin(t * 0.18) * 3;
  cx.save();
  cx.translate(x, y + bob);
  // Glow
  const grd = cx.createRadialGradient(0, 0, 4, 0, 0, 50);
  grd.addColorStop(0, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  cx.fillStyle = grd; cx.fillRect(-50, -30, 100, 60);
  // Pill background
  ol(cx, () => { cx.beginPath(); rR(cx, -52, -18, 104, 32, 16); }, '#1A1A1A', 2.5);
  cx.fillStyle = '#F4C430';
  cx.fillRect(-50, -16, 100, 4);
  // Down-arrow chevron
  cx.fillStyle = '#F4C430';
  cx.beginPath();
  cx.moveTo(-32, -8); cx.lineTo(-20, -8); cx.lineTo(-26, 4); cx.closePath();
  cx.fill();
  cx.strokeStyle = BL; cx.lineWidth = 1.5; cx.stroke();
  // Text
  cx.fillStyle = '#fff';
  cx.font = 'bold 13px sans-serif';
  cx.textAlign = 'left';
  cx.fillText('PRESS  ⬇', -14, 4);
  cx.restore();
}

// Saree token at the end — a flowing, draped Kanjivaram fabric
function drawSaree(cx, x, y, t) {
  cx.save(); cx.translate(x, y);
  const float = Math.sin(t * 0.05) * 6;
  const wave  = (k) => Math.sin(t * 0.05 + k) * 4;

  // Outer halo
  const halo = cx.createRadialGradient(0, float, 6, 0, float, 110);
  halo.addColorStop(0,    'rgba(255,220,80,0.65)');
  halo.addColorStop(0.55, 'rgba(255,180,40,0.25)');
  halo.addColorStop(1,    'rgba(255,180,40,0)');
  cx.fillStyle = halo;
  cx.beginPath(); cx.arc(0, float, 110, 0, Math.PI * 2); cx.fill();

  cx.save(); cx.translate(0, float); cx.rotate(Math.sin(t * 0.03) * 0.04);

  // Main saree body — peacock blue, with rippled top + bottom edges (flowing)
  cx.fillStyle = '#1A6B8C';
  cx.strokeStyle = BL; cx.lineWidth = 2; cx.lineJoin = 'round';
  cx.beginPath();
  cx.moveTo(-65, -30 + wave(0));
  cx.bezierCurveTo(-40, -32 + wave(0.7), -10, -26 + wave(1.2), 20, -32 + wave(1.7));
  cx.bezierCurveTo(40, -34 + wave(2.2), 60, -28 + wave(2.7), 65, -22);
  cx.lineTo(65, 14);
  cx.bezierCurveTo(50, 18 + wave(0.4), 25, 14 + wave(1), -10, 18 + wave(1.6));
  cx.bezierCurveTo(-30, 20 + wave(2.1), -55, 16 + wave(2.6), -65, 12);
  cx.closePath();
  cx.fill(); cx.stroke();

  // Inner sheen — vertical pleats
  cx.strokeStyle = 'rgba(255,255,255,0.18)';
  cx.lineWidth = 1.2;
  for (let i = -55; i <= 55; i += 8) {
    cx.beginPath();
    cx.moveTo(i, -28 + wave(i * 0.05));
    cx.lineTo(i + 2, 12 + wave(i * 0.05 + 1));
    cx.stroke();
  }

  // Gold zari border along top
  cx.strokeStyle = '#F4C430'; cx.lineWidth = 3;
  cx.beginPath();
  cx.moveTo(-65, -28 + wave(0));
  cx.bezierCurveTo(-40, -30 + wave(0.7), -10, -24 + wave(1.2), 20, -30 + wave(1.7));
  cx.bezierCurveTo(40, -32 + wave(2.2), 60, -26 + wave(2.7), 65, -20);
  cx.stroke();

  // Pallu (richly bordered bottom section)
  cx.fillStyle = '#0E6655';
  cx.beginPath();
  cx.moveTo(-65, 4);
  cx.bezierCurveTo(-30, 6 + wave(1.2), 20, 4 + wave(1.8), 65, 4);
  cx.lineTo(65, 14);
  cx.bezierCurveTo(50, 18 + wave(0.4), 25, 14 + wave(1), -10, 18 + wave(1.6));
  cx.bezierCurveTo(-30, 20 + wave(2.1), -55, 16 + wave(2.6), -65, 12);
  cx.closePath();
  cx.fill();
  cx.strokeStyle = BL; cx.lineWidth = 2; cx.stroke();
  // Gold trim under pallu
  cx.strokeStyle = '#F4C430'; cx.lineWidth = 2.5;
  cx.beginPath();
  cx.moveTo(-65, 14);
  cx.bezierCurveTo(-30, 18 + wave(1.6), 20, 14 + wave(2.2), 65, 14);
  cx.stroke();

  // Peacock-feather motifs across the pallu
  for (let i = -3; i <= 3; i++) {
    const px = i * 18;
    const py = 10;
    // Eye of feather
    cx.fillStyle = '#F4C430';
    cx.beginPath(); cx.ellipse(px, py, 5, 7, 0, 0, Math.PI * 2); cx.fill();
    cx.fillStyle = '#1A6B8C';
    cx.beginPath(); cx.ellipse(px, py, 3.2, 4.5, 0, 0, Math.PI * 2); cx.fill();
    cx.fillStyle = '#0E6655';
    cx.beginPath(); cx.ellipse(px, py, 1.6, 2.5, 0, 0, Math.PI * 2); cx.fill();
    cx.fillStyle = '#F4C430';
    cx.beginPath(); cx.arc(px, py - 1, 0.8, 0, Math.PI * 2); cx.fill();
  }

  // Floral motifs scattered across the body (gold)
  cx.fillStyle = '#F4C430';
  [[-50, -18], [-25, -12], [0, -16], [25, -10], [50, -16], [-35, -4], [10, -3], [40, -6]].forEach(([fx, fy]) => {
    for (let p = 0; p < 6; p++) {
      const a = (p / 6) * Math.PI * 2;
      cx.beginPath();
      cx.ellipse(fx + Math.cos(a) * 3, fy + Math.sin(a) * 3, 1.2, 2, a, 0, Math.PI * 2);
      cx.fill();
    }
    cx.fillStyle = '#FFE680';
    cx.beginPath(); cx.arc(fx, fy, 1.3, 0, Math.PI * 2); cx.fill();
    cx.fillStyle = '#F4C430';
  });

  cx.restore();

  // Sparkles orbiting the saree
  for (let i = 0; i < 8; i++) {
    const sa = (t * 0.04 + i * Math.PI / 4) % (Math.PI * 2);
    const sx = Math.cos(sa) * 80;
    const sy = Math.sin(sa) * 35 + float;
    const sz = 1.5 + Math.sin(t * 0.1 + i) * 1;
    cx.fillStyle = 'rgba(255,255,200,0.9)';
    cx.beginPath();
    cx.moveTo(sx, sy - sz);
    cx.lineTo(sx + sz, sy);
    cx.lineTo(sx, sy + sz);
    cx.lineTo(sx - sz, sy);
    cx.closePath();
    cx.fill();
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

  // Sidewalk above the road. Shops sit on the sidewalk top.
  // Layout (bottom to top):
  //   road:     GROUND - 32 → H        (visible road extends up well above feet)
  //   curb:     GROUND - 36 → GROUND - 32  (dark seam)
  //   sidewalk: GROUND - 56 → GROUND - 36  (cream stone)
  //   shops:    sit on sidewalk top (GROUND - 56)
  const SIDEWALK_TOP = L1.GROUND - 56;
  const ROAD_TOP     = L1.GROUND - 32;

  // Mid shops anchored to sidewalk top
  const midOff = -L1.bg.mid;
  for (let bx = midOff % 280, idx = Math.floor(L1.bg.mid / 280); bx < W + 50; bx += 280, idx++) {
    const shop = SHOPS[Math.abs(idx) % SHOPS.length];
    drawShop(cx, bx, SIDEWALK_TOP - 130, 130, shop, frame);
    drawLamp(cx, bx + 256, SIDEWALK_TOP);
  }

  // Sidewalk
  cx.fillStyle = '#9A7A5A';
  cx.fillRect(0, SIDEWALK_TOP, W, 20);
  // Sidewalk seam lines
  cx.strokeStyle = 'rgba(60,40,20,0.35)'; cx.lineWidth = 1;
  const swOff = -L1.bg.mid;
  for (let sx = swOff % 70; sx < W + 50; sx += 70) {
    cx.beginPath(); cx.moveTo(sx, SIDEWALK_TOP); cx.lineTo(sx, ROAD_TOP); cx.stroke();
  }

  // Curb (dark band)
  cx.fillStyle = '#3A2618';
  cx.fillRect(0, ROAD_TOP - 4, W, 4);
  cx.fillStyle = '#1F1208';
  cx.fillRect(0, ROAD_TOP, W, 3);

  // Road surface — extends well above obstacles' feet
  cx.fillStyle = '#3D2614';
  cx.fillRect(0, ROAD_TOP, W, H - ROAD_TOP);

  // Asphalt mottling (large patches)
  const lineOff = -L1.bg.ground;
  cx.fillStyle = 'rgba(80,55,30,0.35)';
  for (let i = 0; i < 6; i++) {
    const sx = ((i * 167 + lineOff * 0.7) % (W + 80)) - 40;
    const sy = ROAD_TOP + 8 + (i * 41) % (H - ROAD_TOP - 16);
    cx.beginPath(); cx.ellipse(sx, sy, 30 + (i * 7) % 18, 6, 0, 0, Math.PI * 2); cx.fill();
  }
  // Gravel speckles
  cx.fillStyle = 'rgba(150,120,80,0.25)';
  for (let i = 0; i < 36; i++) {
    const sx = ((i * 73 + lineOff) % (W + 40));
    const sy = ROAD_TOP + 8 + (i * 17) % (H - ROAD_TOP - 12);
    cx.fillRect(sx, sy, 1.5, 1.5);
  }
  // Subtle dashed center line — well below the feet
  cx.fillStyle = 'rgba(244,196,48,0.28)';
  for (let gx = lineOff % 130; gx < W + 50; gx += 130) {
    cx.fillRect(gx, L1.GROUND + 38, 22, 2);
  }
}

// Drop shadow drawn under each grounded obstacle (called from render)
function drawObstacleShadow(cx, x, baseY, w) {
  cx.fillStyle = 'rgba(0,0,0,0.32)';
  cx.beginPath();
  cx.ellipse(x + w / 2, baseY - 1, w * 0.46, 4, 0, 0, Math.PI * 2);
  cx.fill();
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
  // Insert auto power-ups (NUM_AUTOS) roughly evenly distributed
  const autoSpots = [];
  for (let i = 0; i < L1_TUNE.NUM_AUTOS; i++) {
    autoSpots.push(8 + Math.floor((q.length / L1_TUNE.NUM_AUTOS) * (i + 0.5)) + Math.floor(Math.random()*4-2));
  }
  autoSpots.sort((a,b) => a-b).forEach((idx, i) => {
    q.splice(idx + i, 0, '__auto__');
  });
  // Insert filter-coffee pickups
  const coffeeSpots = [];
  for (let i = 0; i < L1_TUNE.NUM_COFFEES; i++) {
    coffeeSpots.push(5 + Math.floor((q.length / L1_TUNE.NUM_COFFEES) * (i + 0.4)) + Math.floor(Math.random()*5-2));
  }
  coffeeSpots.sort((a,b) => a-b).forEach((idx, i) => {
    q.splice(idx + i, 0, '__coffee__');
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
    // Continuously clear the landing zone for the final ride frames so no
    // obstacle can sneak in between checks. Also push next-spawn far back.
    if (L1.muru.ridingT <= 45) {
      L1.obstacles.forEach(o => {
        if (o.kind !== 'auto' && o.kind !== 'coffee' && !o.flying
            && o.x > L1.MURU_X - 60 && o.x < L1.MURU_X + 240) {
          o.flying = true;
          o.fvx = 6 + Math.random() * 6;
          o.fvy = -11 - Math.random() * 4;
          o.rotV = (Math.random() - 0.5) * 0.45;
          for (let i = 0; i < 6; i++) {
            L1.particles.push({
              x: o.x + o.w / 2, y: o.baseY - o.h / 2,
              vx: 3 + Math.random() * 6, vy: -4 - Math.random() * 5,
              life: 30, color: i % 2 ? '#F4C430' : '#fff'
            });
          }
        }
      });
      L1.nextSpawnX = Math.max(L1.nextSpawnX, L1.W + 280);
    }
    if (L1.muru.ridingT <= 0) {
      L1.muru.riding = false;
      L1.hitCooldown = L1_TUNE.RIDE_GRACE;   // grace frames after dismount
    }
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

  // Spawn obstacles / pickups
  if (L1.queue.length > 0 && L1.nextSpawnX <= L1.W + 60) {
    const type = L1.queue.shift();
    if (type === '__auto__') {
      L1.obstacles.push({
        kind: 'auto', x: L1.W + 50,
        w: POWERUP_AUTO.w, h: POWERUP_AUTO.h,
        baseY: L1.GROUND,
        flying: false, dy: 0, fvx: 0, fvy: 0, rot: 0, rotV: 0,
      });
    } else if (type === '__coffee__') {
      L1.obstacles.push({
        kind: 'coffee', x: L1.W + 50,
        w: 50, h: 56,
        baseY: L1.GROUND,
        // Floating mid-air, varying height. Reachable with a held jump.
        floatY: L1.GROUND - 95 - Math.random() * 30,
        flying: false, dy: 0, fvx: 0, fvy: 0, rot: 0, rotV: 0,
      });
    } else {
      const def = OB_TYPES[type];
      L1.spawnedCount++;
      L1.obstacles.push({
        kind: type, x: L1.W + 50,
        w: def.w, h: def.h,
        baseY: L1.GROUND,
        flying: false, dy: 0, fvx: 0, fvy: 0, rot: 0, rotV: 0,
      });
    }
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

  // Move obstacles + saree left (or fly away if smashed)
  L1.obstacles.forEach(o => {
    if (o.flying) {
      o.x  += o.fvx;
      o.dy += o.fvy;
      o.fvy += 0.45;
      o.rot += o.rotV;
    } else {
      o.x -= L1.speed;
    }
  });
  if (L1.saree) L1.saree.x -= L1.speed;

  // Despawn off-screen (horizontally or fallen way below)
  L1.obstacles = L1.obstacles.filter(o => o.x + o.w > -100 && o.x < L1.W + 400 && o.dy < L1.H + 200);

  // Cooldown
  if (L1.hitCooldown > 0) L1.hitCooldown--;

  // Collisions — collision box matches the scaled Muru sprite
  const sc = L1_TUNE.MURU_SCALE;
  const muruBox = {
    x: L1.MURU_X - 14 * sc,
    y: L1.muru.y - 60 * sc,
    w: 28 * sc,
    h: 60 * sc,
  };

  // Detect "boarding possible" — any approaching auto in window?
  L1.boardPossible = false;
  if (!L1.muru.riding) {
    for (const o of L1.obstacles) {
      if (o.kind !== 'auto' || o.flying) continue;
      if (o.x > L1.MURU_X - 80 && o.x < L1.MURU_X + L1_TUNE.RIDE_BOARD_RANGE) {
        L1.boardPossible = true;
        break;
      }
    }
  }

  // Process explicit DOWN-press to board
  if (L1.downPress && L1.boardPossible && !L1.muru.riding) {
    const auto = L1.obstacles.find(o =>
      o.kind === 'auto' && !o.flying &&
      o.x > L1.MURU_X - 80 && o.x < L1.MURU_X + L1_TUNE.RIDE_BOARD_RANGE
    );
    if (auto) {
      L1.muru.riding  = true;
      L1.muru.ridingT = L1_TUNE.RIDE_FRAMES;
      auto.x = -500;
      for (let i = 0; i < 18; i++) {
        L1.particles.push({
          x: L1.MURU_X, y: L1.muru.y - 30,
          vx: (Math.random() - 0.5) * 8, vy: -3 - Math.random() * 5,
          life: 40 + Math.random() * 20, color: i % 2 ? '#F4C430' : '#fff'
        });
      }
      api.toast('⚡ AUTO BOOST! Blitz mode!');
    }
  }
  L1.downPress = false;

  for (const o of L1.obstacles) {
    if (o.flying) continue;
    const obBox = (o.kind === 'coffee')
      ? { x: o.x + 6, y: o.floatY - 26, w: o.w - 12, h: o.h - 6 }
      : { x: o.x, y: o.baseY - o.h, w: o.w, h: o.h };
    if (!boxOverlap(muruBox, obBox)) continue;

    if (o.kind === 'auto') {
      // No more auto-board on touch; user must press DOWN.
      // Pass through the auto harmlessly.
      continue;
    }
    if (o.kind === 'coffee') {
      api.gainLife();
      o.x = -500;
      for (let i = 0; i < 14; i++) {
        L1.particles.push({
          x: L1.MURU_X, y: L1.muru.y - 40,
          vx: (Math.random() - 0.5) * 6, vy: -2 - Math.random() * 4,
          life: 35, color: i % 2 ? '#7A4014' : '#fff'   // coffee + steam
        });
      }
      api.toast('☕ +1 LIFE — Filter Kaapi!');
      continue;
    }
    if (L1.muru.riding) {
      // Smash: launch obstacle into the air
      o.flying = true;
      o.fvx = 6 + Math.random() * 6;
      o.fvy = -11 - Math.random() * 4;
      o.rotV = (Math.random() - 0.5) * 0.45;
      for (let i = 0; i < 12; i++) {
        L1.particles.push({
          x: o.x + o.w / 2, y: o.baseY - o.h / 2,
          vx: 3 + Math.random() * 7, vy: -4 - Math.random() * 5,
          life: 35, color: i % 2 ? '#F4C430' : '#fff'
        });
      }
      continue;
    }
    if (L1.hitCooldown <= 0) {
      api.lifeLost();
      L1.hitCooldown = 90;
      L1.muru.vy = -8;
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

  // Obstacles — draw shadow first, then body
  for (const o of L1.obstacles) {
    if (o.flying) {
      cx.save();
      cx.translate(o.x + o.w / 2, o.baseY - o.h / 2 + o.dy);
      cx.rotate(o.rot);
      cx.translate(-o.x - o.w / 2, -o.baseY + o.h / 2);
      OB_TYPES[o.kind] && OB_TYPES[o.kind].draw(cx, o.x, o.baseY, L1.frame);
      cx.restore();
      continue;
    }
    if (o.kind === 'auto') {
      drawObstacleShadow(cx, o.x, o.baseY, o.w);
      POWERUP_AUTO.draw(cx, o.x, o.baseY, L1.frame);
    } else if (o.kind === 'coffee') {
      drawCoffee(cx, o.x + o.w / 2, o.floatY, L1.frame);
    } else {
      drawObstacleShadow(cx, o.x, o.baseY, o.w);
      OB_TYPES[o.kind].draw(cx, o.x, o.baseY, L1.frame);
    }
  }

  // Boarding prompt above the auto when DOWN can board
  if (L1.boardPossible && !L1.muru.riding) {
    const auto = L1.obstacles.find(o => o.kind === 'auto' && !o.flying
      && o.x > L1.MURU_X - 80 && o.x < L1.MURU_X + L1_TUNE.RIDE_BOARD_RANGE);
    if (auto) drawBoardPrompt(cx, auto.x + auto.w / 2, auto.baseY - 78, L1.frame);
  }

  // Saree
  if (L1.saree && !L1.saree.taken) drawSaree(cx, L1.saree.x, L1.saree.y, L1.frame);

  // Muru — riding or running
  if (L1.muru.riding) {
    const ax = L1.MURU_X - 36;
    const ay = L1.GROUND + Math.sin(L1.frame * 0.3) * 2;
    POWERUP_AUTO.draw(cx, ax, ay, L1.frame, true);
    // Rider, side profile, facing the road (right)
    drawMuruRider(cx, L1.MURU_X + 14, ay - 20, L1.frame);
  } else {
    const flicker = L1.hitCooldown > 0 && Math.floor(L1.frame / 6) % 2 === 0;
    if (flicker) cx.globalAlpha = 0.4;
    cx.save();
    cx.translate(L1.MURU_X, L1.muru.y);
    cx.scale(L1_TUNE.MURU_SCALE, L1_TUNE.MURU_SCALE);
    drawMuru(cx, 0, 0, L1.frame, !L1.muru.jumping);
    cx.restore();
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
  boardPress() {
    if (L1.state === 'running') L1.downPress = true;
  },
  isBoardPossible() { return L1.boardPossible; },
  update(api) { updateL1(api || this.api); },
  render(cx)  { renderL1(cx); },
  reset()     { resetL1(); },
};
window.Level1 = Level1;
