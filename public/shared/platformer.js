// Shared 2D platformer engine — used by Don and Mangaatha.
// Tile-based, AABB collisions, camera-follow, smooth input with coyote-time
// and variable jump height, themed sprite drawing.
//
// Tile chars (default):
//   . air     X solid     _ solid (grass top)   # solid (decorative)
//   P player start    G goal/door    C cup (pickup)
//   * coin             E walker enemy            F fast enemy
//   B boss enemy       S spike strip             R rescue NPC

class Platformer {
  constructor(opts) {
    this.canvas = opts.canvas;
    this.ctx    = this.canvas.getContext('2d');
    this.theme  = opts.theme || {};
    this.requireCup = !!opts.requireCup;
    this.onWin    = opts.onWin    || (() => {});
    this.onLose   = opts.onLose   || (() => {});
    this.onScore  = opts.onScore  || (() => {});
    this.onLives  = opts.onLives  || (() => {});
    this.onCup    = opts.onCup    || (() => {});

    // Geometry
    this.tile = 36;
    this.gravity   = 0.62;
    this.jumpV     = -13.0;
    this.jumpCut   = 0.45;        // velocity multiplier when jump released early
    this.moveAcc   = 0.95;
    this.maxRun    = 5.5;
    this.airAcc    = 0.55;
    this.friction  = 0.78;

    this.coyoteFrames = 6;        // can still jump for N frames after leaving ground
    this.bufferFrames = 8;        // queued jump press valid for N frames

    // State
    this.keys = {};
    this.touch = { left: false, right: false, jump: false };
    this.cameraX = 0;
    this.gameOver = false;
    this.won = false;
    this.lives = 3;
    this.score = 0;
    this.cupTaken = !this.requireCup;
    this._jumpHeld = false;
    this._coyote = 0;
    this._jumpBuffer = 0;
    this._screenShake = 0;

    this._load(opts.level || '');
    this._bindInput();
    this._raf = null;
  }

  _load(levelStr) {
    const rows = levelStr.split('\n').filter(r => r.length > 0);
    this.cols = Math.max(...rows.map(r => r.length));
    this.rows = rows.length;
    this.tiles = rows.map(r => r.padEnd(this.cols, '.').split(''));

    this.coins   = [];
    this.enemies = [];
    this.bosses  = [];
    this.spikes  = [];
    this.cups    = [];
    this.npcs    = [];
    this.goal    = null;
    this.startX  = 0;
    this.startY  = 0;

    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const c = this.tiles[y][x];
        const px = x * this.tile, py = y * this.tile;
        if (c === 'P')      { this.startX = px; this.startY = py; this.tiles[y][x] = '.'; }
        else if (c === '*') { this.coins.push({ x: px + this.tile/2, y: py + this.tile/2, taken: false }); this.tiles[y][x] = '.'; }
        else if (c === 'C') { this.cups.push({ x: px + this.tile/2, y: py + this.tile/2, taken: false }); this.tiles[y][x] = '.'; }
        else if (c === 'E') { this.enemies.push({ x: px, y: py, w: this.tile-4, h: this.tile-2, vx: -1.4, alive: true, kind: 'walker', hp: 1 }); this.tiles[y][x] = '.'; }
        else if (c === 'F') { this.enemies.push({ x: px, y: py, w: this.tile-4, h: this.tile-2, vx: -2.2, alive: true, kind: 'fast',   hp: 1 }); this.tiles[y][x] = '.'; }
        else if (c === 'B') { this.enemies.push({ x: px, y: py - this.tile, w: this.tile + 4, h: this.tile*2 - 2, vx: -1.0, alive: true, kind: 'boss',   hp: 3 }); this.tiles[y][x] = '.'; }
        else if (c === 'S') { this.spikes.push({ x: px, y: py + this.tile - 12, w: this.tile, h: 12 }); this.tiles[y][x] = '.'; }
        else if (c === 'R') { this.npcs.push({ x: px, y: py - this.tile/2, w: this.tile, h: this.tile + this.tile/2, kind: 'rescue' }); this.tiles[y][x] = '.'; }
        else if (c === 'G') { this.goal = { x: px, y: py - this.tile, w: this.tile, h: this.tile*2 }; this.tiles[y][x] = '.'; }
      }
    }

    this.player = {
      x: this.startX, y: this.startY,
      w: 26, h: 44,
      vx: 0, vy: 0,
      onGround: false,
      facing: 1,
      hurt: 0,
      walkPhase: 0,
    };

    // Canvas sized to viewport
    const w = Math.min(900, window.innerWidth - 16);
    this.canvas.width  = w;
    this.canvas.height = Math.min(540, this.rows * this.tile);
  }

  isSolid(c) { return c === 'X' || c === '_' || c === '#'; }

  tileAt(px, py) {
    const tx = Math.floor(px / this.tile);
    const ty = Math.floor(py / this.tile);
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) return '.';
    return this.tiles[ty][tx];
  }

  _bindInput() {
    window.addEventListener('keydown', e => {
      const blocked = ['ArrowUp','Space','KeyW','ArrowLeft','ArrowRight','KeyA','KeyD','ArrowDown','KeyS'].includes(e.code);
      if (e.repeat) {
        if (blocked) e.preventDefault();
        return;
      }
      this.keys[e.code] = true;
      if (['ArrowUp','Space','KeyW'].includes(e.code)) this._jumpBuffer = this.bufferFrames;
      if (blocked) e.preventDefault();
    }, { passive: false });
    window.addEventListener('keyup', e => {
      this.keys[e.code] = false;
      if (['ArrowUp','Space','KeyW'].includes(e.code)) this._jumpHeld = false;
    });
    window.addEventListener('blur', () => { this.keys = {}; this._jumpHeld = false; });
  }

  _input() {
    const left  = this.keys['ArrowLeft']  || this.keys['KeyA'] || this.touch.left;
    const right = this.keys['ArrowRight'] || this.keys['KeyD'] || this.touch.right;
    const jumpDown = this.keys['ArrowUp'] || this.keys['KeyW'] || this.keys['Space'] || this.touch.jump;
    return { left, right, jumpDown };
  }

  _physics() {
    if (this.gameOver) return;
    const inp = this._input();
    const p = this.player;

    // Horizontal acceleration (more in air? no, less, for control)
    const acc = p.onGround ? this.moveAcc : this.airAcc;
    if (inp.left  && !inp.right) { p.vx -= acc; p.facing = -1; }
    if (inp.right && !inp.left)  { p.vx += acc; p.facing =  1; }
    if (!inp.left && !inp.right && p.onGround) p.vx *= this.friction;
    if (Math.abs(p.vx) < 0.08) p.vx = 0;
    p.vx = Math.max(-this.maxRun, Math.min(this.maxRun, p.vx));

    // Coyote/buffer + variable jump height
    if (this._jumpBuffer > 0) this._jumpBuffer--;
    if (this._coyote > 0) this._coyote--;

    if (inp.jumpDown && !this._jumpHeld) {
      this._jumpHeld = true;
      // Buffered or coyote jump
      if (p.onGround || this._coyote > 0) {
        p.vy = this.jumpV;
        p.onGround = false;
        this._coyote = 0;
        this._jumpBuffer = 0;
      } else {
        this._jumpBuffer = this.bufferFrames;
      }
    }

    // Jump-cut: if released while still rising, cut velocity
    if (!inp.jumpDown && p.vy < 0) p.vy *= this.jumpCut;

    // Gravity
    p.vy += this.gravity;
    if (p.vy > 16) p.vy = 16;

    // Move + collide horizontally
    p.x += p.vx;
    this._collideAxis('x');

    // Move + collide vertically
    const wasOnGround = p.onGround;
    p.y += p.vy;
    p.onGround = false;
    this._collideAxis('y');

    // Coyote time: just stepped off the edge
    if (wasOnGround && !p.onGround && p.vy >= 0) this._coyote = this.coyoteFrames;

    // Use buffered jump if landed
    if (p.onGround && this._jumpBuffer > 0) {
      p.vy = this.jumpV;
      p.onGround = false;
      this._jumpBuffer = 0;
    }

    // Walk animation phase
    if (p.onGround && Math.abs(p.vx) > 0.5) p.walkPhase += Math.abs(p.vx) * 0.15;
    else p.walkPhase = 0;

    // Fall off world?
    if (p.y > this.rows * this.tile + 200) this._die();

    // Entity collisions
    this._collideEntities();

    // Camera follow with deadzone
    const targetCam = p.x - this.canvas.width / 2 + p.w / 2;
    this.cameraX = Math.max(0, Math.min(this.cols * this.tile - this.canvas.width, targetCam));

    // Enemy AI
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.x += e.vx;
      const probeX = e.vx > 0 ? e.x + e.w + 1 : e.x - 1;
      const ahead  = this.tileAt(probeX, e.y + e.h / 2);
      const below  = this.tileAt(probeX, e.y + e.h + 2);
      if (this.isSolid(ahead) || !this.isSolid(below)) e.vx *= -1;
    }

    if (p.hurt > 0) p.hurt--;
    if (this._screenShake > 0) this._screenShake--;
  }

  _collideAxis(axis) {
    const p = this.player;
    const left   = Math.floor(p.x / this.tile);
    const right  = Math.floor((p.x + p.w - 1) / this.tile);
    const top    = Math.floor(p.y / this.tile);
    const bottom = Math.floor((p.y + p.h - 1) / this.tile);
    for (let ty = top; ty <= bottom; ty++) {
      for (let tx = left; tx <= right; tx++) {
        if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) continue;
        if (!this.isSolid(this.tiles[ty][tx])) continue;
        const bx = tx * this.tile, by = ty * this.tile;
        if (axis === 'x') {
          if (p.vx > 0)      p.x = bx - p.w;
          else if (p.vx < 0) p.x = bx + this.tile;
          p.vx = 0;
        } else {
          if (p.vy > 0)      { p.y = by - p.h; p.onGround = true; }
          else if (p.vy < 0) { p.y = by + this.tile; }
          p.vy = 0;
        }
      }
    }
  }

  _collideEntities() {
    const p = this.player;

    for (const c of this.coins) {
      if (c.taken) continue;
      const dx = (p.x + p.w/2) - c.x;
      const dy = (p.y + p.h/2) - c.y;
      if (dx*dx + dy*dy < 26*26) {
        c.taken = true;
        this.score += 10;
        this.onScore(this.score);
      }
    }

    for (const c of this.cups) {
      if (c.taken) continue;
      const dx = (p.x + p.w/2) - c.x;
      const dy = (p.y + p.h/2) - c.y;
      if (dx*dx + dy*dy < 32*32) {
        c.taken = true;
        this.cupTaken = true;
        this.score += 50;
        this.onScore(this.score);
        this.onCup(true);
      }
    }

    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (this._aabb(p, e)) {
        // Stomp from above (must be falling fast enough)?
        const stomp = p.vy > 3 && (p.y + p.h - e.y) < 18;
        if (stomp) {
          e.hp--;
          p.vy = this.jumpV * 0.7;
          if (e.hp <= 0) {
            e.alive = false;
            this.score += (e.kind === 'boss') ? 200 : 25;
          } else {
            this.score += 15;
            e.vx *= -1;          // stagger boss
          }
          this.onScore(this.score);
        } else if (p.hurt === 0) {
          this._hurt();
        }
      }
    }

    for (const s of this.spikes) {
      if (this._aabb(p, s) && p.hurt === 0) this._hurt();
    }

    if (this.goal && this._aabb(p, this.goal) && !this.won) {
      if (this.requireCup && !this.cupTaken) return;   // door locked
      this.won = true;
      this.gameOver = true;
      setTimeout(() => this.onWin(this.score), 100);
    }
  }

  _aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  _hurt() {
    const p = this.player;
    p.hurt = 90;                 // 1.5s invulnerability
    this.lives--;
    this.onLives(this.lives);
    p.vy = -9;
    p.vx = -p.facing * 6;
    this._screenShake = 12;
    if (this.lives <= 0) this._die();
  }

  _die() {
    if (this.gameOver) return;
    this.gameOver = true;
    setTimeout(() => this.onLose(this.score), 80);
  }

  reset() {
    const p = this.player;
    p.x = this.startX; p.y = this.startY;
    p.vx = 0; p.vy = 0;
    p.hurt = 0; p.walkPhase = 0; p.facing = 1;
    this.lives = 3;
    this.score = 0;
    this.gameOver = false;
    this.won = false;
    this.cupTaken = !this.requireCup;
    this._coyote = 0; this._jumpBuffer = 0; this._jumpHeld = false;
    for (const c of this.coins)   c.taken = false;
    for (const c of this.cups)    c.taken = false;
    for (const e of this.enemies) { e.alive = true; e.hp = e.kind === 'boss' ? 3 : 1; }
    this.onScore(0);
    this.onLives(this.lives);
    this.onCup(false);
  }

  _render(t) {
    const ctx = this.ctx, T = this.theme;
    const W = this.canvas.width, H = this.canvas.height;

    // Background
    if (T.bg) T.bg(ctx, W, H, this.cameraX);
    else { ctx.fillStyle = '#7ad0ff'; ctx.fillRect(0,0,W,H); }

    // Screen shake
    let shakeX = 0, shakeY = 0;
    if (this._screenShake > 0) {
      shakeX = (Math.random() - 0.5) * 6;
      shakeY = (Math.random() - 0.5) * 6;
    }

    ctx.save();
    ctx.translate(-this.cameraX + shakeX, shakeY);

    // Tiles
    const startCol = Math.max(0, Math.floor(this.cameraX / this.tile));
    const endCol   = Math.min(this.cols - 1, Math.ceil((this.cameraX + W) / this.tile));
    for (let ty = 0; ty < this.rows; ty++) {
      for (let tx = startCol; tx <= endCol; tx++) {
        const c = this.tiles[ty][tx];
        if (c === '.') continue;
        const x = tx * this.tile, y = ty * this.tile;
        if (T.tile) T.tile(ctx, c, x, y, this.tile);
        else { ctx.fillStyle = '#5a3a1f'; ctx.fillRect(x, y, this.tile, this.tile); }
      }
    }

    // Goal
    if (this.goal && T.goal) T.goal(ctx, this.goal, this.cupTaken, t);

    // NPCs (rescue target etc.)
    for (const n of this.npcs) if (T.npc) T.npc(ctx, n, t);

    // Cups
    for (const c of this.cups) if (!c.taken && T.cup) T.cup(ctx, c, t);

    // Coins
    for (const c of this.coins) if (!c.taken && T.coin) T.coin(ctx, c, t);

    // Spikes
    for (const s of this.spikes) if (T.spike) T.spike(ctx, s);

    // Enemies
    for (const e of this.enemies) if (e.alive && T.enemy) T.enemy(ctx, e, t);

    // Player
    if (T.player) T.player(ctx, this.player, t);
    else {
      ctx.fillStyle = '#ff6584';
      ctx.fillRect(this.player.x, this.player.y, this.player.w, this.player.h);
    }

    ctx.restore();
  }

  start() {
    cancelAnimationFrame(this._raf);
    const tick = (t) => {
      this._physics();
      this._render(t);
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  stop() { cancelAnimationFrame(this._raf); }
}

window.Platformer = Platformer;
