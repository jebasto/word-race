// LEVEL 2 — THE PAINTING HEIST
// Top-down stealth. Procedurally generated gallery, 3 patrolling guards
// with 60° vision cones. Take the painting → 45s alarm → run to exit.

const L2 = {
  W: 600, H: 400,
  CELL: 50,
  COLS: 12, ROWS: 8,
  state: 'idle',     // 'running' | 'won' | 'failed'
  grid: [],          // 0=open  1=wall
  player: { x: 75, y: 75, dir: 0, speed: 2.4 },
  painting: { gx: 0, gy: 0, x: 0, y: 0, taken: false },
  exit: { gx: 1, gy: 1, x: 75, y: 75 },
  guards: [],
  dir: { up:false, down:false, left:false, right:false },
  frame: 0,
  alarmTimer: 0,
  detectFlash: 0,
};

// ── Maze generation ──────────────────────────────────────────────
function generateL2Maze() {
  const { COLS, ROWS } = L2;
  const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  // Border walls
  for (let x = 0; x < COLS; x++) { grid[0][x] = 1; grid[ROWS-1][x] = 1; }
  for (let y = 0; y < ROWS; y++) { grid[y][0] = 1; grid[y][COLS-1] = 1; }

  // Internal wall pieces — vertical and horizontal segments
  const numPieces = 8 + Math.floor(Math.random() * 4);
  for (let n = 0; n < numPieces; n++) {
    const isH = Math.random() < 0.5;
    const len = 2 + Math.floor(Math.random() * 3);
    const sx = 2 + Math.floor(Math.random() * (COLS - 4));
    const sy = 2 + Math.floor(Math.random() * (ROWS - 4));
    for (let k = 0; k < len; k++) {
      const cx = isH ? sx + k : sx;
      const cy = isH ? sy : sy + k;
      if (cx > 0 && cx < COLS-1 && cy > 0 && cy < ROWS-1) grid[cy][cx] = 1;
    }
  }

  // Force the start cell open
  grid[1][1] = 0;
  // Force a 2-cell open corridor near start so player isn't immediately walled in
  grid[1][2] = 0; grid[2][1] = 0;

  // Fix isolated walls: if reachable count is too low, knock down random walls
  let tries = 0;
  while (tries < 8) {
    const reach = floodFill(grid, 1, 1);
    if (reach.size > 40) break;
    // Knock down a random wall adjacent to the reachable set
    const adj = [];
    reach.forEach(k => {
      const [x, y] = k.split(',').map(Number);
      [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dx,dy]) => {
        const nx = x + dx, ny = y + dy;
        if (nx > 0 && nx < COLS-1 && ny > 0 && ny < ROWS-1 && grid[ny][nx] === 1) {
          adj.push([nx, ny]);
        }
      });
    });
    if (adj.length === 0) break;
    const [kx, ky] = adj[Math.floor(Math.random() * adj.length)];
    grid[ky][kx] = 0;
    tries++;
  }

  return grid;
}

function floodFill(grid, sx, sy) {
  const visited = new Set();
  const stack = [[sx, sy]];
  while (stack.length) {
    const [x, y] = stack.pop();
    const key = `${x},${y}`;
    if (visited.has(key)) continue;
    if (grid[y]?.[x] !== 0) continue;
    visited.add(key);
    [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dx,dy]) => stack.push([x+dx, y+dy]));
  }
  return visited;
}

function pickRandomOpen(grid, reach, exclude=[]) {
  const arr = [...reach].map(k => k.split(',').map(Number)).filter(([x,y]) => {
    return !exclude.some(([ex,ey]) => ex === x && ey === y);
  });
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Reset ────────────────────────────────────────────────────────
function resetL2() {
  L2.frame = 0;
  L2.state = 'running';
  L2.alarmTimer = 0;
  L2.detectFlash = 0;
  L2.dir = { up:false, down:false, left:false, right:false };
  L2.painting.taken = false;
  L2.guards = [];

  L2.grid = generateL2Maze();
  const reach = floodFill(L2.grid, 1, 1);

  // Place exit at start
  L2.exit = { gx: 1, gy: 1, x: 1.5 * L2.CELL, y: 1.5 * L2.CELL };

  // Place player at start
  L2.player.x = 1.5 * L2.CELL;
  L2.player.y = 1.5 * L2.CELL;
  L2.player.dir = 0;

  // Place painting far from start
  const reachArr = [...reach].map(k => k.split(',').map(Number));
  let bestCell = null, bestDist = -1;
  reachArr.forEach(([x, y]) => {
    const d = Math.abs(x - 1) + Math.abs(y - 1);
    if (d > bestDist) { bestDist = d; bestCell = [x, y]; }
  });
  // Pick a top-N for variety
  const candidates = reachArr
    .map(([x,y]) => [x, y, Math.abs(x-1) + Math.abs(y-1)])
    .filter(([,,d]) => d >= bestDist - 2)
    .map(([x,y]) => [x,y]);
  const [px, py] = candidates[Math.floor(Math.random() * candidates.length)] || bestCell;
  L2.painting.gx = px;
  L2.painting.gy = py;
  L2.painting.x = (px + 0.5) * L2.CELL;
  L2.painting.y = (py + 0.5) * L2.CELL;

  // Spawn 3 guards. Each guard picked from cells far enough from the start
  // so the player is never detected the moment the level loads.
  // Vision range: 2 guards see only 1 cell (50px). 1 guard ("captain") sees 2 cells (100px).
  const MIN_SPAWN_DIST = 5;   // Manhattan distance, in cells
  const MIN_WAYPOINT_DIST = 4;
  const reachArr = [...reach].map(k => k.split(',').map(Number));
  const farFromStart = (cell) =>
    (Math.abs(cell[0] - 1) + Math.abs(cell[1] - 1)) >= MIN_SPAWN_DIST;
  const pickFar = (excluded, minD = MIN_SPAWN_DIST) => {
    const candidates = reachArr.filter(([x, y]) => {
      if ((Math.abs(x - 1) + Math.abs(y - 1)) < minD) return false;
      if (x === px && y === py) return false;
      if (excluded.some(([ex, ey]) => ex === x && ey === y)) return false;
      return true;
    });
    if (!candidates.length) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  };

  const guardSpecs = [
    { range: 1.2, speed: 0.9 },     // 1-cell vision (forgiving)
    { range: 1.2, speed: 0.85 },
    { range: 2.0, speed: 1.05 },    // captain — 2-cell vision
  ];
  for (const spec of guardSpecs) {
    const taken = L2.guards.map(g => [g.gx, g.gy]);
    const cell = pickFar(taken);
    if (!cell) continue;
    const [gx, gy] = cell;
    const wp1 = pickFar([[gx, gy], ...taken], MIN_WAYPOINT_DIST);
    const wp2 = pickFar([[gx, gy], wp1, ...taken].filter(Boolean), MIN_WAYPOINT_DIST);
    L2.guards.push({
      gx, gy,
      x: (gx + 0.5) * L2.CELL,
      y: (gy + 0.5) * L2.CELL,
      waypoints: [wp1, wp2].filter(Boolean),
      wpIdx: 0,
      pauseT: 30 + Math.floor(Math.random() * 30),
      dir: Math.random() * Math.PI * 2,
      speed: spec.speed,
      range: spec.range,    // visibility radius in cells
    });
  }
}

// ── Update ───────────────────────────────────────────────────────
function updateL2(api) {
  if (L2.state !== 'running') return;
  L2.frame++;

  // Player movement
  let dx = 0, dy = 0;
  if (L2.dir.left)  dx -= 1;
  if (L2.dir.right) dx += 1;
  if (L2.dir.up)    dy -= 1;
  if (L2.dir.down)  dy += 1;
  if (dx || dy) {
    const m = Math.hypot(dx, dy) || 1;
    dx = (dx / m) * L2.player.speed;
    dy = (dy / m) * L2.player.speed;
    L2.player.dir = Math.atan2(dy, dx);
    movePlayer(dx, dy);
  }

  // Painting pickup
  if (!L2.painting.taken) {
    const d = Math.hypot(L2.player.x - L2.painting.x, L2.player.y - L2.painting.y);
    if (d < 28) {
      L2.painting.taken = true;
      L2.alarmTimer = 45 * 60;   // 45 seconds @60fps
      api.toast('🚨 ALARM! Run! 45s to escape!');
    }
  }

  // Alarm countdown
  if (L2.alarmTimer > 0) {
    L2.alarmTimer--;
    if (L2.alarmTimer <= 0) {
      L2.state = 'failed';
      setTimeout(() => api.lose(), 200);
      return;
    }
  }

  // Exit reached after painting taken → win
  if (L2.painting.taken) {
    const d = Math.hypot(L2.player.x - L2.exit.x, L2.player.y - L2.exit.y);
    if (d < 24) {
      L2.state = 'won';
      setTimeout(() => api.win(), 200);
      return;
    }
  }

  // Update guards
  L2.guards.forEach(g => updateGuard(g));

  // Detection check (60° cone, 4 cells deep, line of sight)
  for (const g of L2.guards) {
    if (canSee(g, L2.player.x, L2.player.y)) {
      L2.detectFlash = 60;
      L2.state = 'failed';
      setTimeout(() => api.lose(), 600);
      return;
    }
  }
}

function movePlayer(dx, dy) {
  const r = 14;
  const tryX = L2.player.x + dx;
  if (!hitsWall(tryX - r, L2.player.y - r) && !hitsWall(tryX + r, L2.player.y - r)
      && !hitsWall(tryX - r, L2.player.y + r) && !hitsWall(tryX + r, L2.player.y + r)) {
    L2.player.x = tryX;
  }
  const tryY = L2.player.y + dy;
  if (!hitsWall(L2.player.x - r, tryY - r) && !hitsWall(L2.player.x + r, tryY - r)
      && !hitsWall(L2.player.x - r, tryY + r) && !hitsWall(L2.player.x + r, tryY + r)) {
    L2.player.y = tryY;
  }
}

function hitsWall(x, y) {
  const gx = Math.floor(x / L2.CELL);
  const gy = Math.floor(y / L2.CELL);
  return L2.grid[gy]?.[gx] !== 0;
}

function updateGuard(g) {
  if (g.pauseT > 0) { g.pauseT--; return; }
  if (g.waypoints.length === 0) return;
  const wp = g.waypoints[g.wpIdx];
  const tx = (wp[0] + 0.5) * L2.CELL;
  const ty = (wp[1] + 0.5) * L2.CELL;
  const dx = tx - g.x, dy = ty - g.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 4) {
    g.wpIdx = (g.wpIdx + 1) % g.waypoints.length;
    g.pauseT = 40 + Math.floor(Math.random() * 30);
    return;
  }
  // Move + smoothly rotate facing
  const ang = Math.atan2(dy, dx);
  const da = wrapAngle(ang - g.dir);
  g.dir += da * 0.15;
  g.x += Math.cos(g.dir) * g.speed;
  g.y += Math.sin(g.dir) * g.speed;
}

function wrapAngle(a) {
  while (a > Math.PI)  a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// 60° cone (±30° from facing), per-guard range in cells, with line-of-sight raycast
function canSee(g, tx, ty) {
  const dx = tx - g.x, dy = ty - g.y;
  const dist = Math.hypot(dx, dy);
  const range = (g.range || 2) * L2.CELL;
  if (dist > range) return false;
  const ang = Math.atan2(dy, dx);
  const da = Math.abs(wrapAngle(ang - g.dir));
  if (da > Math.PI / 6) return false;
  const steps = Math.ceil(dist / 6);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const sx = g.x + dx * t;
    const sy = g.y + dy * t;
    if (hitsWall(sx, sy)) return false;
  }
  return true;
}

// ── Render ───────────────────────────────────────────────────────
function renderL2(cx) {
  const W = L2.W, H = L2.H, C = L2.CELL;
  cx.clearRect(0, 0, W, H);

  // Floor
  cx.fillStyle = '#2C1810';
  cx.fillRect(0, 0, W, H);

  // Marble tiles
  for (let y = 0; y < L2.ROWS; y++) {
    for (let x = 0; x < L2.COLS; x++) {
      if (L2.grid[y][x] === 0) {
        cx.fillStyle = (x + y) % 2 === 0 ? '#4a2a18' : '#3a2010';
        cx.fillRect(x * C, y * C, C, C);
        cx.strokeStyle = 'rgba(0,0,0,0.3)'; cx.lineWidth = 1;
        cx.strokeRect(x * C, y * C, C, C);
      }
    }
  }

  // Walls
  for (let y = 0; y < L2.ROWS; y++) {
    for (let x = 0; x < L2.COLS; x++) {
      if (L2.grid[y][x] === 1) {
        cx.fillStyle = '#7A3A1A';
        cx.fillRect(x * C, y * C, C, C);
        cx.fillStyle = '#5A2A10';
        cx.fillRect(x * C, y * C, C, 4);
        cx.fillStyle = '#9A5A2A';
        cx.fillRect(x * C, y * C + C - 4, C, 4);
        // Brick lines
        cx.strokeStyle = 'rgba(0,0,0,0.3)'; cx.lineWidth = 1;
        cx.beginPath();
        cx.moveTo(x*C, y*C + C/2); cx.lineTo(x*C + C, y*C + C/2);
        cx.moveTo(x*C + C/2, y*C); cx.lineTo(x*C + C/2, y*C + C/2);
        cx.moveTo(x*C + C*0.25, y*C + C/2); cx.lineTo(x*C + C*0.25, y*C + C);
        cx.moveTo(x*C + C*0.75, y*C + C/2); cx.lineTo(x*C + C*0.75, y*C + C);
        cx.stroke();
      }
    }
  }

  // Exit (highlight when painting taken)
  if (L2.painting.taken) {
    const pulse = 0.6 + Math.sin(L2.frame * 0.1) * 0.3;
    cx.fillStyle = `rgba(78,204,163,${pulse})`;
    cx.fillRect(L2.exit.x - C/2, L2.exit.y - C/2, C, C);
    cx.fillStyle = '#fff'; cx.font = 'bold 12px sans-serif'; cx.textAlign = 'center';
    cx.fillText('EXIT', L2.exit.x, L2.exit.y + 4);
    cx.textAlign = 'left';
  }

  // Painting on its cell
  if (!L2.painting.taken) {
    drawPainting(cx, L2.painting.x, L2.painting.y, L2.frame);
  }

  // Vision cones
  L2.guards.forEach(g => drawGuardCone(cx, g));

  // Guards
  L2.guards.forEach(g => drawGuardTopDown(cx, g, L2.frame));

  // Player (Muru top-down)
  drawMuruTopDown(cx, L2.player.x, L2.player.y, L2.player.dir, L2.frame, L2.painting.taken);

  // Detection flash
  if (L2.detectFlash > 0) {
    cx.fillStyle = `rgba(255,0,0,${L2.detectFlash / 60 * 0.6})`;
    cx.fillRect(0, 0, W, H);
    L2.detectFlash--;
  }

  // Alarm timer
  if (L2.alarmTimer > 0) {
    const sec = Math.ceil(L2.alarmTimer / 60);
    cx.fillStyle = sec <= 10 ? '#C0392B' : '#F4C430';
    cx.fillRect(0, 0, W, 26);
    cx.fillStyle = '#fff'; cx.font = 'bold 16px sans-serif'; cx.textAlign = 'center';
    cx.fillText(`🚨 ALARM — ${sec}s — RUN TO EXIT`, W/2, 18);
    cx.textAlign = 'left';
  } else {
    cx.fillStyle = 'rgba(0,0,0,0.6)';
    cx.fillRect(0, 0, W, 22);
    cx.fillStyle = '#F4C430'; cx.font = 'bold 12px sans-serif'; cx.textAlign = 'center';
    cx.fillText('STEAL THE PAINTING — STAY OUT OF GUARD VISION', W/2, 15);
    cx.textAlign = 'left';
  }
}

function drawPainting(cx, x, y, t) {
  const wob = Math.sin(t * 0.05) * 1.5;
  // Glow
  const grd = cx.createRadialGradient(x, y, 4, x, y, 36);
  grd.addColorStop(0, 'rgba(244,196,48,0.55)');
  grd.addColorStop(1, 'rgba(244,196,48,0)');
  cx.fillStyle = grd;
  cx.fillRect(x - 36, y - 36, 72, 72);
  // Frame
  cx.fillStyle = '#F4C430';
  cx.fillRect(x - 22, y - 28 + wob, 44, 38);
  cx.strokeStyle = BL; cx.lineWidth = 2;
  cx.strokeRect(x - 22, y - 28 + wob, 44, 38);
  // Inner
  cx.fillStyle = '#8B0000';
  cx.fillRect(x - 18, y - 24 + wob, 36, 30);
  // Tanjore figure (simple deity silhouette)
  cx.fillStyle = '#F4C430';
  cx.beginPath(); cx.arc(x, y - 12 + wob, 6, 0, Math.PI*2); cx.fill();
  cx.fillRect(x - 5, y - 6 + wob, 10, 10);
  cx.fillStyle = BL;
  cx.fillRect(x - 1, y - 14 + wob, 2, 2);   // bindi
  // Sparkles
  for (let i = 0; i < 3; i++) {
    const sa = (t * 0.05 + i * Math.PI * 2 / 3) % (Math.PI * 2);
    cx.fillStyle = 'rgba(255,255,200,0.9)';
    cx.beginPath();
    cx.arc(x + Math.cos(sa) * 28, y + Math.sin(sa) * 22 + wob, 1.5, 0, Math.PI*2);
    cx.fill();
  }
}

function drawGuardCone(cx, g) {
  const range = (g.range || 2) * L2.CELL;
  cx.save();
  cx.translate(g.x, g.y);
  cx.rotate(g.dir);
  // Slight tint difference for the captain (longer range) — readable for the player
  const intense = (g.range >= 2) ? 0.42 : 0.28;
  const grd = cx.createRadialGradient(0, 0, 4, 0, 0, range);
  grd.addColorStop(0, `rgba(255,220,80,${intense})`);
  grd.addColorStop(1, 'rgba(255,220,80,0)');
  cx.fillStyle = grd;
  cx.beginPath();
  cx.moveTo(0, 0);
  cx.arc(0, 0, range, -Math.PI/6, Math.PI/6);
  cx.closePath();
  cx.fill();
  // Outline edge so the player can read the cone shape clearly
  cx.strokeStyle = 'rgba(255,200,40,0.55)';
  cx.lineWidth = 1.2;
  cx.beginPath();
  cx.moveTo(0, 0);
  cx.arc(0, 0, range, -Math.PI/6, Math.PI/6);
  cx.closePath();
  cx.stroke();
  cx.restore();
}

// Guard — top-down with visible head, cap brim, shoulders, flashlight
function drawGuardTopDown(cx, g, t) {
  const isCaptain = g.range >= 2;
  cx.save();
  cx.translate(g.x, g.y);
  cx.rotate(g.dir);

  // Cast shadow on the floor
  cx.fillStyle = 'rgba(0,0,0,0.45)';
  cx.beginPath(); cx.ellipse(0, 6, 16, 6, 0, 0, Math.PI * 2); cx.fill();

  // Shoulders/torso plate (perpendicular ovals so they visually sit on either side)
  cx.fillStyle = '#0a1a3a';
  cx.strokeStyle = BL; cx.lineWidth = 1.5;
  cx.beginPath(); cx.ellipse(0, -10, 6, 4, 0, 0, Math.PI * 2); cx.fill(); cx.stroke();
  cx.beginPath(); cx.ellipse(0,  10, 6, 4, 0, 0, Math.PI * 2); cx.fill(); cx.stroke();

  // Body — navy uniform
  ol(cx, () => { cx.beginPath(); cx.arc(0, 0, 12, 0, Math.PI * 2); }, '#1f4670');

  // Yellow belt + buckle
  cx.strokeStyle = '#F4C430'; cx.lineWidth = 2;
  cx.beginPath(); cx.arc(0, 0, 12, -Math.PI / 6, Math.PI / 6); cx.stroke();
  cx.fillStyle = '#F4C430';
  cx.beginPath(); cx.arc(12, 0, 1.8, 0, Math.PI * 2); cx.fill();

  // Captain rank stripe on body
  if (isCaptain) {
    cx.fillStyle = '#F4C430';
    cx.fillRect(-8, -2, 4, 1.5);
    cx.fillRect(-8,  1, 4, 1.5);
  }

  // Head (skin)
  ol(cx, () => { cx.beginPath(); cx.arc(3, 0, 7, 0, Math.PI * 2); }, SK, 1.5);

  // Cap dome (back of head only — front shows face)
  cx.fillStyle = isCaptain ? '#7d2f2f' : '#0a1a3a';
  cx.beginPath();
  cx.arc(3, 0, 7, Math.PI / 2 + 0.2, -Math.PI / 2 - 0.2, true);
  cx.fill();
  cx.strokeStyle = BL; cx.lineWidth = 1; cx.stroke();

  // Cap brim (the "visor" pointing forward)
  cx.fillStyle = isCaptain ? '#5a1f1f' : '#000';
  cx.beginPath();
  cx.moveTo(8, -4); cx.lineTo(13, -3); cx.lineTo(13, 3); cx.lineTo(8, 4); cx.closePath();
  cx.fill();
  cx.strokeStyle = BL; cx.lineWidth = 1; cx.stroke();

  // Cap badge
  cx.fillStyle = '#F4C430';
  cx.beginPath(); cx.arc(2, -3.5, 1.4, 0, Math.PI * 2); cx.fill();

  // Tiny mustache
  cx.fillStyle = BL;
  cx.fillRect(6, -1.5, 3, 1);
  cx.fillRect(6,  0.5, 3, 1);

  // Flashlight in forward hand
  cx.fillStyle = '#222';
  cx.fillRect(13, -3, 7, 6);
  cx.strokeStyle = BL; cx.lineWidth = 1;
  cx.strokeRect(13, -3, 7, 6);
  // Glow tip
  const tip = cx.createRadialGradient(22, 0, 1, 22, 0, 5);
  tip.addColorStop(0, '#FFF');
  tip.addColorStop(1, '#F4C430');
  cx.fillStyle = tip;
  cx.beginPath(); cx.arc(22, 0, 4, 0, Math.PI * 2); cx.fill();

  // CAPTAIN tag floating below
  if (isCaptain) {
    cx.rotate(-g.dir);   // un-rotate so text is upright
    cx.fillStyle = '#FFF8E0';
    cx.font = 'bold 8px sans-serif';
    cx.textAlign = 'center';
    cx.fillText('CAPTAIN', 0, 24);
    cx.textAlign = 'left';
  }

  cx.restore();
}

// Muru top-down — readable miniature: shirt + dhoti + head + tuft + mustache
// Direction-aware via cx.rotate(dir).
function drawMuruTopDown(cx, x, y, dir, t, hasPainting) {
  // Stepping animation — pulsing scale for a sense of running
  const step = Math.sin(t * 0.4) * 0.04;
  cx.save();
  cx.translate(x, y);
  cx.rotate(dir);
  cx.scale(1 + step, 1 - step);

  // Cast shadow
  cx.fillStyle = 'rgba(0,0,0,0.5)';
  cx.beginPath(); cx.ellipse(0, 6, 13, 5, 0, 0, Math.PI * 2); cx.fill();

  // Cream dhoti (lower body) — drawn behind the torso
  cx.fillStyle = '#FFFFF0';
  cx.strokeStyle = BL; cx.lineWidth = 1.2;
  cx.beginPath();
  cx.ellipse(-4, 6, 5, 4, 0, 0, Math.PI * 2);
  cx.fill(); cx.stroke();
  cx.beginPath();
  cx.ellipse(4, 6, 5, 4, 0, 0, Math.PI * 2);
  cx.fill(); cx.stroke();
  // Gold dhoti border
  cx.strokeStyle = '#C8900A'; cx.lineWidth = 1.2;
  cx.beginPath(); cx.arc(-4, 6, 5, 0, Math.PI * 2); cx.stroke();
  cx.beginPath(); cx.arc(4, 6, 5, 0, Math.PI * 2); cx.stroke();

  // Body — red shirt
  ol(cx, () => { cx.beginPath(); cx.arc(0, 0, 11, 0, Math.PI * 2); }, '#C0392B');

  // Gold chain hint
  cx.strokeStyle = '#F4C430'; cx.lineWidth = 1.2;
  cx.beginPath(); cx.arc(2, 0, 6, -Math.PI / 4, Math.PI / 4); cx.stroke();

  // Arms — small ovals on the sides, pumping with step
  cx.fillStyle = SK; cx.strokeStyle = BL; cx.lineWidth = 1;
  const armSwing = Math.sin(t * 0.4) * 1.5;
  cx.beginPath(); cx.ellipse(-1, -10 - armSwing, 3, 4, 0, 0, Math.PI * 2); cx.fill(); cx.stroke();
  cx.beginPath(); cx.ellipse(-1,  10 + armSwing, 3, 4, 0, 0, Math.PI * 2); cx.fill(); cx.stroke();

  // Head (skin)
  ol(cx, () => { cx.beginPath(); cx.arc(3, 0, 6.5, 0, Math.PI * 2); }, SK, 1.4);

  // Hair (back of head — rotated so the FACE points forward)
  cx.fillStyle = BL;
  cx.beginPath();
  cx.arc(3, 0, 6.5, Math.PI / 2 + 0.2, -Math.PI / 2 - 0.2, true);
  cx.fill();

  // Eyes — two tiny dots on the front of the face
  cx.fillStyle = BL;
  cx.beginPath(); cx.arc(7, -2, 0.9, 0, Math.PI * 2); cx.fill();
  cx.beginPath(); cx.arc(7,  2, 0.9, 0, Math.PI * 2); cx.fill();

  // Mustache (forward tip of face)
  cx.fillStyle = BL;
  cx.fillRect(7, -1, 3, 1);
  cx.fillRect(7,  0, 3, 1);

  // Painting tube — strapped diagonally across his back
  if (hasPainting) {
    cx.fillStyle = '#F4C430';
    cx.strokeStyle = BL; cx.lineWidth = 1.2;
    cx.save();
    cx.rotate(-Math.PI / 6);
    cx.fillRect(-12, -3, 14, 5);
    cx.strokeRect(-12, -3, 14, 5);
    cx.fillStyle = '#7A4014';
    cx.fillRect(-13, -3, 2, 5);
    cx.fillRect(0, -3, 2, 5);
    cx.restore();
  }

  cx.restore();
}

// ── Public API ────────────────────────────────────────────────────
const Level2 = {
  init(api) { resetL2(); this.api = api; },
  status() {
    if (L2.alarmTimer > 0) return `🚨 ${Math.ceil(L2.alarmTimer/60)}s`;
    return L2.painting.taken ? 'Run to EXIT!' : 'Find the painting';
  },
  setDir(dir, on) {
    if (dir in L2.dir) L2.dir[dir] = on;
  },
  update(api) { updateL2(api || this.api); },
  render(cx)  { renderL2(cx); },
  reset()     { resetL2(); },
};
window.Level2 = Level2;
