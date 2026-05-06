// ── Mangaatha character draw library ──────────────────────────────
// All draw functions take (cx, x, y, t) where x/y is the FEET position
// (character drawn upward from there) and t is a frame counter.
const SK = '#C8956C';
const BL = '#1a1a1a';

function rR(cx, x, y, w, h, r = 4) {
  if (cx.roundRect) cx.roundRect(x, y, w, h, r);
  else cx.rect(x, y, w, h);
}

function ol(cx, fn, fc, sw = 2) {
  cx.fillStyle = fc;
  cx.strokeStyle = BL;
  cx.lineWidth = sw;
  cx.lineJoin = 'round';
  cx.lineCap = 'round';
  fn();
  cx.fill();
  cx.stroke();
}

function sha(cx) {
  cx.fillStyle = 'rgba(0,0,0,.08)';
  cx.beginPath();
  cx.ellipse(0, 4, 16, 4, 0, 0, Math.PI * 2);
  cx.fill();
}

function eys(cx, lx, rx, y, sz = 7) {
  [lx, rx].forEach(ex => {
    ol(cx, () => { cx.beginPath(); cx.ellipse(ex, y, sz, sz + 1, 0, 0, Math.PI * 2); }, '#fff', 1.5);
  });
  cx.fillStyle = '#2C1503';
  cx.beginPath(); cx.arc(lx, y, sz - 2, 0, Math.PI * 2); cx.arc(rx, y, sz - 2, 0, Math.PI * 2); cx.fill();
  cx.fillStyle = BL;
  cx.beginPath(); cx.arc(lx, y, sz - 4, 0, Math.PI * 2); cx.arc(rx, y, sz - 4, 0, Math.PI * 2); cx.fill();
  cx.fillStyle = '#fff';
  cx.beginPath(); cx.arc(lx + 2, y - 2, 1.5, 0, Math.PI * 2); cx.arc(rx + 2, y - 2, 1.5, 0, Math.PI * 2); cx.fill();
}

function nos(cx, x, y) {
  cx.strokeStyle = '#A07050'; cx.lineWidth = 1.5;
  cx.beginPath();
  cx.moveTo(x - 3, y - 4); cx.quadraticCurveTo(x - 6, y, x - 2, y);
  cx.moveTo(x + 3, y - 4); cx.quadraticCurveTo(x + 6, y, x + 2, y);
  cx.stroke();
}

function bnd(cx, x, y) {
  cx.fillStyle = '#E62020';
  cx.beginPath(); cx.arc(x, y, 3.2, 0, Math.PI * 2); cx.fill();
}

function mst(cx, x, y) {
  cx.fillStyle = BL;
  [[-4, .12], [4, -.12]].forEach(([mx, rot]) => {
    cx.save(); cx.translate(x + mx, y); cx.rotate(rot); cx.beginPath();
    if (mx < 0) { cx.moveTo(0, 0); cx.bezierCurveTo(-8, -1, -12, 6, -8, 9); cx.bezierCurveTo(-4, 11, 0, 7, 0, 0); }
    else        { cx.moveTo(0, 0); cx.bezierCurveTo(8, -1, 12, 6, 8, 9);   cx.bezierCurveTo(4, 11, 0, 7, 0, 0); }
    cx.fill(); cx.restore();
  });
}

function smil(cx, x, y, open = false) {
  cx.strokeStyle = '#7A3A20'; cx.lineWidth = 2; cx.lineCap = 'round';
  cx.beginPath(); cx.arc(x, y, 9, .12 * Math.PI, .88 * Math.PI); cx.stroke();
  if (open) { cx.fillStyle = '#fff'; cx.beginPath(); cx.arc(x, y + 3, 5, 0, Math.PI); cx.fill(); }
}

function bgls(cx, ax, ys, b, cols) {
  ys.forEach((y, i) => {
    cx.strokeStyle = cols ? cols[i % cols.length] : '#F4C430';
    cx.lineWidth = 2.2;
    cx.beginPath(); cx.arc(ax, y + b, 6.5, 0, Math.PI * 2); cx.stroke();
  });
}

// ── MURU ───────────────────────────────────────────────────────────
function drawMuru(cx, x, y, t, run = false) {
  const bob = run ? 0 : Math.sin(t * .06) * 2;
  const la  = run ? Math.sin(t * .26) * 24 : 0;
  const aa  = run ? Math.sin(t * .26 + Math.PI) * 28 : 0;

  cx.save(); cx.translate(x, y);
  cx.fillStyle = 'rgba(0,0,0,.08)';
  cx.beginPath(); cx.ellipse(0, 5, 22, 5, 0, 0, Math.PI * 2); cx.fill();

  // Legs
  [[-10, la], [10, -la]].forEach(([lx, ang]) => {
    cx.save(); cx.translate(lx, -20 + bob); cx.rotate(ang * Math.PI / 180);
    ol(cx, () => { cx.beginPath(); rR(cx, -6, 0, 12, 30, 3); }, '#D4A017');
    ol(cx, () => { cx.beginPath(); cx.ellipse(0, 31, 9, 4, 0, 0, Math.PI * 2); }, '#7A3B10');
    cx.restore();
  });

  // Dhoti
  ol(cx, () => {
    cx.beginPath();
    cx.moveTo(-22, -26 + bob); cx.lineTo(22, -26 + bob);
    cx.lineTo(20, -10 + bob);  cx.lineTo(-20, -10 + bob); cx.closePath();
  }, '#FFFFF0');
  cx.strokeStyle = '#C8900A'; cx.lineWidth = 2.5;
  cx.beginPath(); cx.moveTo(-20, -10 + bob); cx.lineTo(20, -10 + bob); cx.stroke();

  // Shirt
  ol(cx, () => { cx.beginPath(); rR(cx, -20, -64 + bob, 40, 40, 6); }, '#C0392B');
  cx.strokeStyle = 'rgba(150,20,20,.3)'; cx.lineWidth = 1.5;
  cx.beginPath(); cx.moveTo(-20, -52 + bob); cx.lineTo(20, -52 + bob); cx.stroke();
  cx.beginPath(); cx.moveTo(-20, -43 + bob); cx.lineTo(20, -43 + bob); cx.stroke();

  // Collar
  ol(cx, () => {
    cx.beginPath(); cx.moveTo(-9, -64 + bob); cx.lineTo(0, -56 + bob); cx.lineTo(9, -64 + bob);
    cx.lineTo(11, -64 + bob); cx.lineTo(0, -51 + bob); cx.lineTo(-11, -64 + bob); cx.closePath();
  }, '#E8E8E8', 1.5);

  // Belly
  cx.strokeStyle = 'rgba(140,15,15,.15)'; cx.lineWidth = 2;
  cx.beginPath(); cx.arc(2, -40 + bob, 13, .2 * Math.PI, .8 * Math.PI); cx.stroke();

  // Gold chain
  cx.strokeStyle = '#F4C430'; cx.lineWidth = 2.5;
  cx.beginPath(); cx.arc(0, -50 + bob, 12, .18 * Math.PI, .82 * Math.PI); cx.stroke();
  cx.fillStyle = '#F4C430'; cx.beginPath(); cx.arc(0, -39 + bob, 3, 0, Math.PI * 2); cx.fill();

  // Arms
  [[-20, aa + 15], [20, -aa - 15]].forEach(([ax, ang]) => {
    cx.save(); cx.translate(ax, -58 + bob); cx.rotate(ang * Math.PI / 180);
    ol(cx, () => { cx.beginPath(); rR(cx, -5, 0, 10, 28, 5); }, SK);
    ol(cx, () => { cx.beginPath(); cx.arc(ang > 0 ? 4 : -4, 29, 6, 0, Math.PI * 2); }, SK);
    cx.restore();
  });

  // Head
  ol(cx, () => { cx.beginPath(); cx.arc(0, -96 + bob, 30, 0, Math.PI * 2); }, SK);

  // Ears
  ol(cx, () => { cx.beginPath(); cx.arc(-29, -96 + bob, 8, 0, Math.PI * 2); }, SK, 1.5);
  ol(cx, () => { cx.beginPath(); cx.arc(29, -96 + bob, 8, 0, Math.PI * 2);  }, SK, 1.5);
  cx.fillStyle = '#AA7040';
  cx.beginPath(); cx.arc(-29, -96 + bob, 4.5, 0, Math.PI * 2); cx.arc(29, -96 + bob, 4.5, 0, Math.PI * 2); cx.fill();

  // Hair
  ol(cx, () => { cx.beginPath(); cx.arc(0, -103 + bob, 28, Math.PI + .15, -.15); }, BL);
  cx.strokeStyle = '#3d3d3d'; cx.lineWidth = 1.5;
  cx.beginPath(); cx.arc(-6, -112 + bob, 14, Math.PI + .4, Math.PI + .9); cx.stroke();

  // Eyebrows
  cx.strokeStyle = BL; cx.lineWidth = 3; cx.lineCap = 'round';
  cx.beginPath();
  cx.moveTo(-21, -109 + bob); cx.quadraticCurveTo(-13, -113 + bob, -7, -108 + bob);
  cx.moveTo(7, -108 + bob);   cx.quadraticCurveTo(13, -113 + bob, 21, -109 + bob);
  cx.stroke();

  eys(cx, -13, 13, -97 + bob);
  nos(cx, 0, -86 + bob);
  mst(cx, 0, -79 + bob);

  cx.strokeStyle = '#7A3A20'; cx.lineWidth = 2; cx.lineCap = 'round';
  cx.beginPath(); cx.arc(0, -70 + bob, 9, .1 * Math.PI, .9 * Math.PI); cx.stroke();
  cx.fillStyle = '#fff'; cx.beginPath(); cx.arc(0, -65 + bob, 5, 0, Math.PI); cx.fill();

  cx.restore();
}

// ── PAARVATHI MAMI ─────────────────────────────────────────────────
function drawMami(cx, x, y, t) {
  const b = Math.sin(t * .06) * 1.5; cx.save(); cx.translate(x, y);
  sha(cx);
  cx.fillStyle = SK; cx.beginPath(); cx.ellipse(-7, 2, 7, 4, 0, 0, Math.PI * 2); cx.ellipse(7, 2, 7, 4, 0, 0, Math.PI * 2); cx.fill();
  ol(cx, () => { cx.beginPath(); cx.moveTo(-20, -55 + b); cx.lineTo(20, -55 + b); cx.lineTo(22, 2 + b); cx.lineTo(-22, 2 + b); cx.closePath(); }, '#8B0000');
  cx.strokeStyle = '#F4C430'; cx.lineWidth = 2.5; cx.beginPath(); cx.moveTo(-22, -2 + b); cx.lineTo(22, -2 + b); cx.stroke();
  cx.fillStyle = 'rgba(100,0,0,.65)'; cx.beginPath(); cx.moveTo(-20, -53 + b); cx.lineTo(-28, -40 + b); cx.lineTo(-18, -22 + b); cx.lineTo(-8, -38 + b); cx.closePath(); cx.fill();
  ol(cx, () => { cx.beginPath(); rR(cx, -16, -73 + b, 32, 20, 4); }, '#A00000', 1.5);
  ol(cx, () => { cx.beginPath(); rR(cx, -28, -70 + b, 12, 24, 6); }, SK, 1.5);
  ol(cx, () => { cx.beginPath(); rR(cx, 18, -70 + b, 12, 24, 6); },  SK, 1.5);
  bgls(cx, -22, [-60, -53], b);
  ol(cx, () => { cx.beginPath(); cx.arc(0, -95 + b, 27, 0, Math.PI * 2); }, SK);
  cx.fillStyle = '#888'; cx.beginPath(); cx.arc(0, -103 + b, 25, Math.PI + .2, -0.2); cx.fill();
  ol(cx, () => { cx.beginPath(); cx.arc(0, -128 + b, 12, 0, Math.PI * 2); }, '#888', 1.5);
  cx.fillStyle = '#FFD700'; cx.beginPath(); cx.arc(-4, -135 + b, 4, 0, Math.PI * 2); cx.fill();
  cx.fillStyle = '#FF4500'; cx.beginPath(); cx.arc(-4, -135 + b, 2, 0, Math.PI * 2); cx.fill();
  bnd(cx, 0, -105 + b);
  cx.strokeStyle = '#222'; cx.lineWidth = 2.5; cx.lineCap = 'round';
  cx.beginPath(); cx.moveTo(-16, -109 + b); cx.lineTo(-4, -107 + b); cx.moveTo(4, -107 + b); cx.lineTo(16, -109 + b); cx.stroke();
  eys(cx, -11, 11, -98 + b); nos(cx, 0, -90 + b);
  cx.strokeStyle = '#7A3A20'; cx.lineWidth = 2; cx.lineCap = 'round';
  cx.beginPath(); cx.moveTo(-7, -80 + b); cx.quadraticCurveTo(0, -79 + b, 7, -80 + b); cx.stroke();
  cx.restore();
}

// ── GOVINDARAJAN MAMA ──────────────────────────────────────────────
function drawGovindarajan(cx, x, y, t) {
  const b = Math.sin(t * .06) * 1.5; cx.save(); cx.translate(x, y);
  sha(cx);
  cx.fillStyle = '#5D3A1A'; cx.fillRect(-12, -1, 11, 4); cx.fillRect(3, -1, 11, 4);
  ol(cx, () => { cx.beginPath(); cx.moveTo(-17, -58 + b); cx.lineTo(17, -58 + b); cx.lineTo(19, 0 + b); cx.lineTo(-19, 0 + b); cx.closePath(); }, '#FFFFF0');
  cx.strokeStyle = '#4A235A'; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(-19, -2 + b); cx.lineTo(19, -2 + b); cx.stroke();
  ol(cx, () => { cx.beginPath(); rR(cx, -18, -78 + b, 36, 22, 4); }, '#6C3483');
  cx.fillStyle = '#E8E8E8'; [0, 8, 16].forEach(d => { cx.beginPath(); cx.arc(0, -72 + d + b, 1.5, 0, Math.PI * 2); cx.fill(); });
  ol(cx, () => { cx.beginPath(); rR(cx, -26, -74 + b, 10, 26, 5); }, '#6C3483');
  ol(cx, () => { cx.beginPath(); rR(cx, 18, -74 + b, 10, 26, 5); },  '#6C3483');
  ol(cx, () => { cx.beginPath(); rR(cx, -26, -50 + b, 10, 10, 3); }, SK, 1.5);
  ol(cx, () => { cx.beginPath(); rR(cx, 18, -50 + b, 10, 10, 3); },  SK, 1.5);
  ol(cx, () => { cx.beginPath(); cx.arc(0, -95 + b, 27, 0, Math.PI * 2); }, SK);
  cx.fillStyle = '#555'; cx.beginPath(); cx.arc(0, -103 + b, 26, Math.PI + .55, -0.55); cx.fill();
  cx.strokeStyle = 'rgba(255,255,255,.22)'; cx.lineWidth = 3; cx.lineCap = 'round';
  cx.beginPath(); cx.arc(-5, -114 + b, 9, -.55, -.1); cx.stroke();
  cx.strokeStyle = '#333'; cx.lineWidth = 2.5; cx.lineCap = 'round';
  cx.beginPath(); cx.moveTo(-17, -108 + b); cx.quadraticCurveTo(-10, -112 + b, -5, -108 + b); cx.moveTo(5, -108 + b); cx.quadraticCurveTo(10, -112 + b, 17, -108 + b); cx.stroke();
  cx.strokeStyle = '#444'; cx.lineWidth = 2;
  cx.beginPath(); cx.arc(-11, -98 + b, 8, 0, Math.PI * 2); cx.stroke();
  cx.beginPath(); cx.arc(11, -98 + b, 8, 0, Math.PI * 2); cx.stroke();
  cx.beginPath(); cx.moveTo(-3, -98 + b); cx.lineTo(3, -98 + b); cx.stroke();
  cx.beginPath(); cx.moveTo(-19, -98 + b); cx.lineTo(-24, -96 + b); cx.moveTo(19, -98 + b); cx.lineTo(24, -96 + b); cx.stroke();
  cx.fillStyle = '#2C1503'; cx.beginPath(); cx.arc(-11, -98 + b, 4, 0, Math.PI * 2); cx.arc(11, -98 + b, 4, 0, Math.PI * 2); cx.fill();
  cx.fillStyle = BL; cx.beginPath(); cx.arc(-11, -98 + b, 2.5, 0, Math.PI * 2); cx.arc(11, -98 + b, 2.5, 0, Math.PI * 2); cx.fill();
  cx.fillStyle = '#fff'; cx.beginPath(); cx.arc(-9, -100 + b, 1.2, 0, Math.PI * 2); cx.arc(13, -100 + b, 1.2, 0, Math.PI * 2); cx.fill();
  nos(cx, 0, -90 + b);
  cx.strokeStyle = '#888'; cx.lineWidth = 2; cx.lineCap = 'round'; cx.beginPath(); cx.moveTo(-10, -81 + b); cx.quadraticCurveTo(0, -79 + b, 10, -81 + b); cx.stroke();
  cx.strokeStyle = '#7A3A20'; cx.lineWidth = 2; cx.lineCap = 'round'; cx.beginPath(); cx.moveTo(-6, -73 + b); cx.quadraticCurveTo(0, -75 + b, 6, -73 + b); cx.stroke();
  cx.restore();
}

// ── SOUNDARYA AKKA ─────────────────────────────────────────────────
function drawSoundarya(cx, x, y, t) {
  const b = Math.sin(t * .06) * 1.8; cx.save(); cx.translate(x, y);
  sha(cx);
  cx.fillStyle = '#8B4513'; cx.beginPath(); cx.ellipse(-7, 2, 7, 4, 0, 0, Math.PI * 2); cx.ellipse(7, 2, 7, 4, 0, 0, Math.PI * 2); cx.fill();
  ol(cx, () => { cx.beginPath(); rR(cx, -14, -55 + b, 12, 55, 4); }, '#117A65');
  ol(cx, () => { cx.beginPath(); rR(cx, 4, -55 + b, 12, 55, 4); }, '#117A65');
  ol(cx, () => { cx.beginPath(); rR(cx, -20, -80 + b, 40, 28, 6); }, '#D35400');
  cx.strokeStyle = 'rgba(180,50,0,.35)'; cx.lineWidth = 1;
  for (let i = 0; i < 3; i++) { cx.beginPath(); cx.moveTo(-18, -72 + i * 8 + b); cx.lineTo(18, -72 + i * 8 + b); cx.stroke(); }
  cx.fillStyle = 'rgba(231,76,60,.6)'; cx.beginPath(); cx.moveTo(-20, -70 + b); cx.lineTo(-30, -56 + b); cx.lineTo(-20, -42 + b); cx.lineTo(-10, -54 + b); cx.closePath(); cx.fill();
  ol(cx, () => { cx.beginPath(); rR(cx, -28, -76 + b, 10, 24, 5); }, SK, 1.5);
  ol(cx, () => { cx.beginPath(); rR(cx, 20, -76 + b, 10, 24, 5); }, SK, 1.5);
  bgls(cx, 25, [-62, -56], b);
  ol(cx, () => { cx.beginPath(); cx.arc(0, -95 + b, 27, 0, Math.PI * 2); }, SK);
  cx.fillStyle = BL; cx.beginPath(); cx.arc(0, -103 + b, 26, Math.PI + .1, -0.1); cx.fill();
  cx.beginPath(); cx.moveTo(-26, -103 + b); cx.lineTo(-32, -58 + b); cx.lineTo(-22, -58 + b); cx.lineTo(-20, -103 + b); cx.closePath(); cx.fill();
  cx.beginPath(); cx.moveTo(24, -99 + b); cx.bezierCurveTo(36, -88 + b, 38, -68 + b, 30, -52 + b); cx.lineTo(24, -54 + b); cx.bezierCurveTo(28, -68 + b, 26, -86 + b, 18, -97 + b); cx.closePath(); cx.fill();
  cx.fillStyle = '#E74C3C'; cx.beginPath(); cx.arc(22, -100 + b, 4, 0, Math.PI * 2); cx.fill();
  bnd(cx, 0, -106 + b);
  cx.strokeStyle = '#333'; cx.lineWidth = 2.5; cx.lineCap = 'round';
  cx.beginPath(); cx.moveTo(-16, -109 + b); cx.quadraticCurveTo(-9, -113 + b, -3, -110 + b); cx.moveTo(3, -110 + b); cx.quadraticCurveTo(9, -113 + b, 16, -109 + b); cx.stroke();
  eys(cx, -11, 11, -98 + b); nos(cx, 0, -90 + b); smil(cx, 0, -81 + b, true);
  cx.restore();
}

// ── PAATI ──────────────────────────────────────────────────────────
function drawPaati(cx, x, y, t) {
  const b = Math.sin(t * .06) * 1.2; cx.save(); cx.translate(x, y + 5);
  sha(cx);
  cx.fillStyle = SK; cx.beginPath(); cx.ellipse(-5, 2, 5, 3, 0, 0, Math.PI * 2); cx.ellipse(5, 2, 5, 3, 0, 0, Math.PI * 2); cx.fill();
  ol(cx, () => { cx.beginPath(); cx.moveTo(-15, -48 + b); cx.lineTo(15, -48 + b); cx.lineTo(17, 2 + b); cx.lineTo(-17, 2 + b); cx.closePath(); }, '#F8F8F0');
  cx.strokeStyle = '#F4C430'; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(-17, -2 + b); cx.lineTo(17, -2 + b); cx.stroke();
  cx.fillStyle = 'rgba(200,200,195,.6)'; cx.beginPath(); cx.moveTo(-15, -46 + b); cx.lineTo(-21, -36 + b); cx.lineTo(-13, -20 + b); cx.lineTo(-6, -32 + b); cx.closePath(); cx.fill();
  ol(cx, () => { cx.beginPath(); rR(cx, -12, -62 + b, 24, 16, 4); }, '#E0E0DA', 1.5);
  ol(cx, () => { cx.beginPath(); rR(cx, -21, -60 + b, 10, 20, 5); }, SK, 1.5);
  ol(cx, () => { cx.beginPath(); rR(cx, 13, -60 + b, 10, 20, 5); },  SK, 1.5);
  cx.strokeStyle = '#8B4513'; cx.lineWidth = 4; cx.lineCap = 'round'; cx.beginPath(); cx.moveTo(18, -54 + b); cx.lineTo(20, 6 + b); cx.stroke();
  cx.strokeStyle = '#8B4513'; cx.lineWidth = 3; cx.beginPath(); cx.arc(22, -54 + b, 4, -Math.PI, -.15 * Math.PI, true); cx.stroke();
  ol(cx, () => { cx.beginPath(); cx.arc(0, -86 + b, 23, 0, Math.PI * 2); }, SK);
  cx.fillStyle = '#E0E0E0'; cx.beginPath(); cx.arc(0, -94 + b, 21, Math.PI + .25, -0.25); cx.fill();
  ol(cx, () => { cx.beginPath(); cx.arc(0, -112 + b, 10, 0, Math.PI * 2); }, '#D8D8D8', 1.5);
  bnd(cx, 0, -96 + b);
  cx.strokeStyle = '#888'; cx.lineWidth = 2; cx.lineCap = 'round';
  cx.beginPath(); cx.moveTo(-12, -99 + b); cx.quadraticCurveTo(-7, -102 + b, -2, -99 + b); cx.moveTo(2, -99 + b); cx.quadraticCurveTo(7, -102 + b, 12, -99 + b); cx.stroke();
  cx.strokeStyle = '#666'; cx.lineWidth = 2;
  cx.beginPath(); cx.arc(-8, -89 + b, 7, 0, Math.PI * 2); cx.stroke(); cx.beginPath(); cx.arc(8, -89 + b, 7, 0, Math.PI * 2); cx.stroke();
  cx.beginPath(); cx.moveTo(-1, -89 + b); cx.lineTo(1, -89 + b); cx.stroke();
  cx.beginPath(); cx.moveTo(-15, -89 + b); cx.lineTo(-19, -88 + b); cx.moveTo(15, -89 + b); cx.lineTo(19, -88 + b); cx.stroke();
  cx.fillStyle = '#2C1503'; cx.beginPath(); cx.arc(-8, -89 + b, 4, 0, Math.PI * 2); cx.arc(8, -89 + b, 4, 0, Math.PI * 2); cx.fill();
  cx.fillStyle = BL; cx.beginPath(); cx.arc(-8, -89 + b, 2.5, 0, Math.PI * 2); cx.arc(8, -89 + b, 2.5, 0, Math.PI * 2); cx.fill();
  cx.fillStyle = '#fff'; cx.beginPath(); cx.arc(-6, -91 + b, 1.2, 0, Math.PI * 2); cx.arc(10, -91 + b, 1.2, 0, Math.PI * 2); cx.fill();
  nos(cx, 0, -81 + b);
  cx.strokeStyle = 'rgba(150,100,60,.3)'; cx.lineWidth = 1; cx.beginPath(); cx.moveTo(-8, -93 + b); cx.quadraticCurveTo(0, -94 + b, 8, -93 + b); cx.stroke();
  cx.strokeStyle = '#7A3A20'; cx.lineWidth = 2; cx.lineCap = 'round'; cx.beginPath(); cx.arc(0, -74 + b, 7, .15 * Math.PI, .85 * Math.PI); cx.stroke();
  cx.restore();
}

// ── THATHA ─────────────────────────────────────────────────────────
function drawThatha(cx, x, y, t) {
  const b = Math.sin(t * .06) * 1.5; cx.save(); cx.translate(x, y);
  sha(cx);
  cx.fillStyle = '#8B4513'; cx.fillRect(-11, -1, 10, 4); cx.fillRect(3, -1, 10, 4);
  ol(cx, () => { cx.beginPath(); cx.moveTo(-17, -60 + b); cx.lineTo(17, -60 + b); cx.lineTo(19, 0 + b); cx.lineTo(-19, 0 + b); cx.closePath(); }, '#FFFFF0');
  cx.strokeStyle = '#1A5276'; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(-19, -2 + b); cx.lineTo(19, -2 + b); cx.stroke();
  ol(cx, () => { cx.beginPath(); rR(cx, -16, -80 + b, 32, 22, 4); }, '#F5F5F5');
  cx.fillStyle = '#ddd'; [0, 8].forEach(d => { cx.beginPath(); cx.arc(0, -74 + d + b, 1.5, 0, Math.PI * 2); cx.fill(); });
  ol(cx, () => { cx.beginPath(); rR(cx, -24, -76 + b, 9, 26, 5); }, '#F5F5F5');
  ol(cx, () => { cx.beginPath(); rR(cx, 17, -76 + b, 9, 26, 5); }, '#F5F5F5');
  ol(cx, () => { cx.beginPath(); cx.arc(24, -70 + b, 8, 0, Math.PI * 2); }, SK, 1.5);
  ol(cx, () => { cx.beginPath(); cx.arc(0, -95 + b, 26, 0, Math.PI * 2); }, SK);
  ol(cx, () => { cx.beginPath(); cx.arc(-29, -95 + b, 11, 0, Math.PI * 2); }, SK, 1.5);
  ol(cx, () => { cx.beginPath(); cx.arc(30, -95 + b, 11, 0, Math.PI * 2); }, SK, 1.5);
  cx.strokeStyle = '#A07050'; cx.lineWidth = 1;
  cx.beginPath(); cx.arc(-29, -95 + b, 6, -.5 * Math.PI, .5 * Math.PI); cx.stroke();
  cx.beginPath(); cx.arc(30, -95 + b, 6, -.5 * Math.PI, .5 * Math.PI); cx.stroke();
  cx.fillStyle = '#F4C430'; cx.beginPath(); cx.arc(38, -89 + b, 4, 0, Math.PI * 2); cx.fill();
  cx.strokeStyle = '#DAA520'; cx.lineWidth = 1.5; cx.beginPath(); cx.moveTo(36, -85 + b); cx.lineTo(34, -79 + b); cx.stroke();
  cx.fillStyle = '#E8E8E8';
  cx.beginPath(); cx.arc(-18, -103 + b, 8, 0, Math.PI * 2); cx.fill();
  cx.beginPath(); cx.arc(18, -103 + b, 8, 0, Math.PI * 2); cx.fill();
  cx.beginPath(); cx.arc(0, -105 + b, 7, 0, Math.PI * 2); cx.fill();
  cx.strokeStyle = '#DDD'; cx.lineWidth = 3; cx.lineCap = 'round';
  cx.beginPath(); cx.moveTo(-17, -107 + b); cx.quadraticCurveTo(-10, -111 + b, -4, -107 + b); cx.moveTo(4, -107 + b); cx.quadraticCurveTo(10, -111 + b, 17, -107 + b); cx.stroke();
  cx.strokeStyle = '#2C1503'; cx.lineWidth = 2; cx.lineCap = 'round';
  cx.beginPath(); cx.moveTo(-15, -98 + b); cx.quadraticCurveTo(-9, -95 + b, -4, -98 + b); cx.moveTo(4, -98 + b); cx.quadraticCurveTo(9, -95 + b, 15, -98 + b); cx.stroke();
  cx.fillStyle = '#2C1503'; cx.beginPath(); cx.arc(-10, -97 + b, 2, 0, Math.PI * 2); cx.arc(10, -97 + b, 2, 0, Math.PI * 2); cx.fill();
  nos(cx, 0, -88 + b);
  cx.strokeStyle = '#CCC'; cx.lineWidth = 2; cx.lineCap = 'round'; cx.beginPath(); cx.moveTo(-10, -80 + b); cx.quadraticCurveTo(0, -78 + b, 10, -80 + b); cx.stroke();
  cx.strokeStyle = '#7A3A20'; cx.lineWidth = 2; cx.lineCap = 'round'; cx.beginPath(); cx.moveTo(-6, -71 + b); cx.quadraticCurveTo(0, -73 + b, 6, -71 + b); cx.stroke();
  cx.restore();
}

// ── CHELLAPANDI ────────────────────────────────────────────────────
function drawChellapandi(cx, x, y, t) {
  const b = Math.sin(t * .06) * 1.5; cx.save(); cx.translate(x, y);
  sha(cx);
  cx.fillStyle = '#222'; cx.fillRect(-13, -2, 12, 5); cx.fillRect(3, -2, 12, 5);
  cx.fillStyle = '#fff'; cx.fillRect(-12, -1, 10, 2); cx.fillRect(4, -1, 10, 2);
  ol(cx, () => { cx.beginPath(); rR(cx, -15, -55 + b, 13, 55, 3); }, '#0E6655');
  ol(cx, () => { cx.beginPath(); rR(cx, 4, -55 + b, 13, 55, 3); }, '#0E6655');
  ol(cx, () => { cx.beginPath(); rR(cx, -22, -90 + b, 44, 38, 5); }, '#148F77');
  cx.strokeStyle = 'rgba(0,80,60,.4)'; cx.lineWidth = 1.5;
  cx.beginPath(); cx.moveTo(-10, -88 + b); cx.lineTo(-10, -54 + b); cx.moveTo(10, -88 + b); cx.lineTo(10, -54 + b); cx.stroke();
  ol(cx, () => { cx.beginPath(); rR(cx, -34, -88 + b, 14, 36, 7); }, SK);
  ol(cx, () => { cx.beginPath(); rR(cx, 22, -88 + b, 14, 36, 7); }, SK);
  cx.strokeStyle = 'rgba(180,120,60,.3)'; cx.lineWidth = 1;
  cx.beginPath(); cx.arc(-27, -74 + b, 8, .8 * Math.PI, 1.6 * Math.PI); cx.stroke();
  cx.beginPath(); cx.arc(29, -74 + b, 8, .4 * Math.PI, 1.2 * Math.PI, true); cx.stroke();
  ol(cx, () => { cx.beginPath(); cx.arc(0, -96 + b, 29, 0, Math.PI * 2); }, SK);
  cx.fillStyle = BL; cx.beginPath(); cx.arc(0, -105 + b, 28, Math.PI + .12, -0.12); cx.fill();
  cx.beginPath(); cx.arc(-25, -100 + b, 10, Math.PI * .35, Math.PI * .85); cx.fill();
  cx.beginPath(); cx.arc(25, -100 + b, 10, Math.PI * .15, Math.PI * .65); cx.fill();
  cx.strokeStyle = BL; cx.lineWidth = 4; cx.lineCap = 'round';
  cx.beginPath(); cx.moveTo(-18, -111 + b); cx.lineTo(-5, -107 + b); cx.moveTo(5, -107 + b); cx.lineTo(18, -111 + b); cx.stroke();
  eys(cx, -11, 11, -99 + b); nos(cx, 0, -91 + b); mst(cx, 0, -83 + b);
  cx.strokeStyle = '#7A3A20'; cx.lineWidth = 2.5; cx.lineCap = 'round';
  cx.beginPath(); cx.moveTo(-8, -75 + b); cx.quadraticCurveTo(-2, -73 + b, 0, -74 + b); cx.stroke();
  cx.restore();
}

// ── KANIMOZHI ──────────────────────────────────────────────────────
function drawKanimozhi(cx, x, y, t) {
  const b = Math.sin(t * .06) * 2; cx.save(); cx.translate(x, y);
  sha(cx);
  cx.fillStyle = '#fff'; cx.fillRect(-11, -2, 10, 5); cx.fillRect(3, -2, 10, 5);
  cx.fillStyle = '#E91E63'; cx.fillRect(-11, -2, 10, 2); cx.fillRect(3, -2, 10, 2);
  ol(cx, () => { cx.beginPath(); rR(cx, -13, -56 + b, 11, 56, 3); }, '#1A237E');
  ol(cx, () => { cx.beginPath(); rR(cx, 4, -56 + b, 11, 56, 3); }, '#1A237E');
  ol(cx, () => { cx.beginPath(); rR(cx, -18, -81 + b, 36, 27, 6); }, '#E91E63');
  cx.strokeStyle = 'rgba(255,255,255,.4)'; cx.lineWidth = 1.5; cx.beginPath(); cx.arc(0, -73 + b, 10, Math.PI * 1.1, Math.PI * 1.9); cx.stroke();
  ol(cx, () => { cx.beginPath(); rR(cx, -26, -77 + b, 10, 26, 5); }, SK, 1.5);
  ol(cx, () => { cx.beginPath(); rR(cx, 18, -77 + b, 10, 26, 5); }, SK, 1.5);
  ol(cx, () => { cx.beginPath(); rR(cx, 16, -62 + b, 16, 24, 3); }, '#222');
  cx.fillStyle = '#5DADE2'; cx.beginPath(); rR(cx, 18, -60 + b, 12, 16, 2); cx.fill();
  cx.fillStyle = '#F4C430'; cx.font = '8px sans-serif'; cx.textAlign = 'center'; cx.fillText('♥', 24, -50 + b); cx.textAlign = 'left';
  cx.fillStyle = '#F4C430'; cx.beginPath(); cx.arc(-30, -94 + b, 4, 0, Math.PI * 2); cx.arc(30, -94 + b, 4, 0, Math.PI * 2); cx.fill();
  cx.fillStyle = '#E91E63'; cx.beginPath(); cx.arc(-30, -88 + b, 3, 0, Math.PI * 2); cx.arc(30, -88 + b, 3, 0, Math.PI * 2); cx.fill();
  ol(cx, () => { cx.beginPath(); cx.arc(0, -95 + b, 27, 0, Math.PI * 2); }, SK);
  cx.fillStyle = BL; cx.beginPath(); cx.arc(0, -104 + b, 26, Math.PI + .1, -0.1); cx.fill();
  cx.beginPath(); cx.moveTo(-26, -104 + b); cx.lineTo(-32, -58 + b); cx.lineTo(-22, -60 + b); cx.lineTo(-20, -104 + b); cx.closePath(); cx.fill();
  cx.strokeStyle = 'rgba(255,200,50,.65)'; cx.lineWidth = 2; cx.lineCap = 'round';
  cx.beginPath(); cx.moveTo(-10, -126 + b); cx.quadraticCurveTo(-6, -108 + b, -4, -98 + b); cx.stroke();
  bnd(cx, 0, -105 + b);
  cx.strokeStyle = BL; cx.lineWidth = 2.5; cx.lineCap = 'round';
  cx.beginPath(); cx.moveTo(-17, -110 + b); cx.quadraticCurveTo(-10, -114 + b, -4, -110 + b); cx.moveTo(4, -110 + b); cx.quadraticCurveTo(10, -114 + b, 17, -110 + b); cx.stroke();
  eys(cx, -11, 11, -98 + b);
  cx.strokeStyle = BL; cx.lineWidth = 1.5;
  [-17, -11, -5, 5, 11, 17].forEach(lx => { cx.beginPath(); cx.moveTo(lx, -104 + b); cx.lineTo(lx + (lx < 0 ? -1 : 1), -108 + b); cx.stroke(); });
  nos(cx, 0, -90 + b); smil(cx, 0, -81 + b, true);
  cx.restore();
}

// ── MEENAKSHI ──────────────────────────────────────────────────────
function drawMeenakshi(cx, x, y, t) {
  const b = Math.sin(t * .06) * 2; cx.save(); cx.translate(x, y);
  sha(cx);
  cx.fillStyle = SK; cx.beginPath(); cx.ellipse(-7, 2, 7, 4, 0, 0, Math.PI * 2); cx.ellipse(7, 2, 7, 4, 0, 0, Math.PI * 2); cx.fill();
  cx.strokeStyle = '#F4C430'; cx.lineWidth = 2; cx.beginPath(); cx.arc(-7, 0, 9, 0, Math.PI * 2); cx.stroke(); cx.beginPath(); cx.arc(7, 0, 9, 0, Math.PI * 2); cx.stroke();
  ol(cx, () => { cx.beginPath(); cx.moveTo(-20, -58 + b); cx.lineTo(20, -58 + b); cx.lineTo(22, 2 + b); cx.lineTo(-22, 2 + b); cx.closePath(); }, '#1E8449');
  cx.strokeStyle = '#F4C430'; cx.lineWidth = 3; cx.beginPath(); cx.moveTo(-22, -2 + b); cx.lineTo(22, -2 + b); cx.stroke();
  cx.strokeStyle = '#F4C430'; cx.lineWidth = 1.5; cx.beginPath(); cx.moveTo(-22, -8 + b); cx.lineTo(22, -8 + b); cx.stroke();
  cx.fillStyle = 'rgba(20,100,50,.65)'; cx.beginPath(); cx.moveTo(-20, -56 + b); cx.lineTo(-28, -42 + b); cx.lineTo(-18, -20 + b); cx.lineTo(-8, -36 + b); cx.closePath(); cx.fill();
  cx.strokeStyle = 'rgba(244,196,48,.4)'; cx.lineWidth = 1;
  for (let i = -14; i < 20; i += 5) { cx.beginPath(); cx.moveTo(i, -58 + b); cx.lineTo(i - 1, 2 + b); cx.stroke(); }
  ol(cx, () => { cx.beginPath(); rR(cx, -16, -76 + b, 32, 20, 4); }, '#B7950B', 1.5);
  ol(cx, () => { cx.beginPath(); rR(cx, -28, -72 + b, 12, 24, 6); }, SK, 1.5);
  ol(cx, () => { cx.beginPath(); rR(cx, 18, -72 + b, 12, 24, 6); },  SK, 1.5);
  bgls(cx, -22, [-64, -57, -50], b, ['#F4C430', '#F4C430', '#1E8449']);
  cx.strokeStyle = '#F4C430'; cx.lineWidth = 2; cx.beginPath(); cx.arc(0, -58 + b, 13, .2 * Math.PI, .8 * Math.PI); cx.stroke();
  cx.fillStyle = '#F4C430'; cx.beginPath(); cx.arc(0, -47 + b, 3, 0, Math.PI * 2); cx.fill();
  ol(cx, () => { cx.beginPath(); cx.arc(0, -96 + b, 27, 0, Math.PI * 2); }, SK);
  cx.fillStyle = BL; cx.beginPath(); cx.arc(0, -104 + b, 26, Math.PI + .08, -0.08); cx.fill();
  cx.beginPath(); cx.moveTo(-25, -104 + b); cx.bezierCurveTo(-36, -88 + b, -36, -62 + b, -26, -48 + b); cx.lineTo(-20, -50 + b); cx.bezierCurveTo(-28, -64 + b, -28, -88 + b, -19, -104 + b); cx.closePath(); cx.fill();
  [[0, -128], [8, -130], [16, -124], [24, -118], [-8, -124]].forEach(([fx, fy]) => {
    cx.fillStyle = '#fff'; cx.beginPath(); cx.arc(fx, fy + b, 4, 0, Math.PI * 2); cx.fill();
    cx.strokeStyle = 'rgba(0,0,0,.2)'; cx.lineWidth = .5; cx.beginPath(); cx.arc(fx, fy + b, 4, 0, Math.PI * 2); cx.stroke();
    cx.fillStyle = '#F4C430'; cx.beginPath(); cx.arc(fx, fy + b, 2, 0, Math.PI * 2); cx.fill();
  });
  cx.fillStyle = '#F4C430'; cx.beginPath(); cx.arc(0, -120 + b, 3, 0, Math.PI * 2); cx.fill();
  cx.strokeStyle = '#F4C430'; cx.lineWidth = 1.5; cx.beginPath(); cx.moveTo(0, -117 + b); cx.lineTo(0, -107 + b); cx.stroke();
  bnd(cx, 0, -107 + b);
  cx.fillStyle = '#F4C430'; cx.beginPath(); cx.arc(-30, -95 + b, 4, 0, Math.PI * 2); cx.arc(30, -95 + b, 4, 0, Math.PI * 2); cx.fill();
  cx.fillStyle = '#1E8449'; cx.beginPath(); cx.arc(-30, -89 + b, 3, 0, Math.PI * 2); cx.arc(30, -89 + b, 3, 0, Math.PI * 2); cx.fill();
  cx.strokeStyle = '#333'; cx.lineWidth = 2.5; cx.lineCap = 'round';
  cx.beginPath(); cx.moveTo(-17, -110 + b); cx.quadraticCurveTo(-10, -114 + b, -4, -110 + b); cx.moveTo(4, -110 + b); cx.quadraticCurveTo(10, -114 + b, 17, -110 + b); cx.stroke();
  [-13, 13].forEach(ex => { ol(cx, () => { cx.beginPath(); cx.ellipse(ex, -99 + b, 8, 10, 0, 0, Math.PI * 2); }, '#fff', 1.5); });
  cx.fillStyle = '#2C1503'; cx.beginPath(); cx.arc(-13, -99 + b, 6, 0, Math.PI * 2); cx.arc(13, -99 + b, 6, 0, Math.PI * 2); cx.fill();
  cx.fillStyle = BL; cx.beginPath(); cx.arc(-13, -99 + b, 4, 0, Math.PI * 2); cx.arc(13, -99 + b, 4, 0, Math.PI * 2); cx.fill();
  cx.fillStyle = '#fff'; cx.beginPath(); cx.arc(-11, -102 + b, 2, 0, Math.PI * 2); cx.arc(15, -102 + b, 2, 0, Math.PI * 2); cx.fill();
  cx.strokeStyle = BL; cx.lineWidth = 2; cx.lineCap = 'round';
  cx.beginPath(); cx.arc(-13, -99 + b, 9, Math.PI + .3, -0.3); cx.stroke();
  cx.beginPath(); cx.arc(13, -99 + b, 9, Math.PI + .3, -0.3); cx.stroke();
  nos(cx, 0, -91 + b);
  cx.strokeStyle = '#7A3A20'; cx.lineWidth = 2; cx.lineCap = 'round'; cx.beginPath(); cx.arc(0, -83 + b, 9, .12 * Math.PI, .88 * Math.PI); cx.stroke();
  cx.strokeStyle = '#F4C430'; cx.lineWidth = 1.5; cx.beginPath(); cx.arc(4, -87 + b, 4, Math.PI * .5, Math.PI * 1.8); cx.stroke();
  cx.restore();
}

// ── Family roster (used by showcase + cutscenes) ───────────────────
const FAMILY = [
  { id:1, key:'mami',          name:'Paarvathi Mami', rel:'Mother-in-law',         color:'#8B0000', want:'A peacock-blue Kanjivaram with a gold border. Her exact size. Nothing else.', draw:drawMami },
  { id:2, key:'mama',          name:'Govindarajan Mama', rel:'Father-in-law',     color:'#4A235A', want:'An authentic Tanjore painting for his puja room — genuine 22 carat gold relief.', draw:drawGovindarajan },
  { id:3, key:'soundarya',     name:'Soundarya Akka',  rel:'Elder Sister-in-law', color:'#D35400', want:'Biryani from Annamalai mess — the original, before they close in 90 seconds.', draw:drawSoundarya },
  { id:4, key:'paati',         name:'Paati',           rel:'Grandmother',         color:'#1E8449', want:'Tirupati prasadam ladoo — climbed from the hill yourself, no shortcuts.', draw:drawPaati },
  { id:5, key:'thatha',        name:'Thatha',          rel:'Grandfather',         color:'#1A5276', want:'Real Kumbakonam Degree Filter Kaapi — not instant, not café.', draw:drawThatha },
  { id:6, key:'chellapandi',   name:'Chellapandi Anna',rel:'Brother-in-law',      color:'#0E6655', want:'Beat him at Kabaddi. He has never lost. Ever.', draw:drawChellapandi },
  { id:7, key:'kanimozhi',     name:'Kanimozhi Akka',  rel:'Cousin Sister',       color:'#922B21', want:'A reel that goes viral — 10K likes minimum, bonus if it trends.', draw:drawKanimozhi },
  { id:8, key:'meenakshi',     name:'Meenakshi',       rel:'Your Love',           color:'#7D6608', want:'You. Worthy of everything above.', draw:drawMeenakshi },
];
