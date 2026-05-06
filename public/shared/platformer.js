// Shared 2D platformer engine — used by Dharani and Mariappa.
// Tile-based, AABB collisions, camera-follow, keyboard + touch input.
//
// Usage:
//   const game = new Platformer({ canvas, level, theme, onWin, onLose });
//   game.start();

class Platformer {
  constructor(opts) {
    this.canvas = opts.canvas;
    this.ctx    = this.canvas.getContext('2d');
    this.theme  = opts.theme || {};
    this.onWin  = opts.onWin  || (() => {});
    this.onLose = opts.onLose || (() => {});
    this.onScore= opts.onScore|| (() => {});
    this.onLives= opts.onLives|| (() => {});

    // Geometry
    this.tile = 36;
    this.gravity = 0.65;
    this.jumpV   = -12.5;
    this.moveAcc = 0.6;
    this.maxRun  = 4.2;
    this.friction= 0.82;

    // State
    this.keys = {};
    this.touch = { left: false, right: false, jump: false };
    this.cameraX = 0;
    this.gameOver = false;
    this.won = false;
    this.lives = 3;
    this.score = 0;

    this._load(opts.level || '');
    this._bindInput();
    this._raf = null;
    this._lastT = 0;
  }

  _load(levelStr) {
    const rows = levelStr.split('\n').filter(r => r.length > 0);
    this.cols = Math.max(...rows.map(r => r.length));
    this.rows = rows.length;
    this.tiles = rows.map(r => r.padEnd(this.cols, '.').split(''));

    this.coins   = [];
    this.enemies = [];
    this.spikes  = [];
    this.goal    = null;
    this.startX  = 0;
    this.startY  = 0;

    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const c = this.tiles[y][x];
        if (c === 'P') { this.startX = x * this.tile; this.startY = y * this.tile; this.tiles[y][x] = '.'; }
        else if (c === '*') { this.coins.push({ x: x*this.tile + this.tile/2, y: y*this.tile + this.tile/2, taken: false }); this.tiles[y][x] = '.'; }
        else if (c === 'E') { this.enemies.push({ x: x*this.tile, y: y*this.tile, w: this.tile-4, h: this.tile-2, vx: -1.2, alive: true, kind: 'walker' }); this.tiles[y][x] = '.'; }
        else if (c === 'F') { this.enemies.push({ x: x*this.tile, y: y*this.tile, w: this.tile-4, h: this.tile-2, vx: -1.8, alive: true, kind: 'fast'   }); this.tiles[y][x] = '.'; }
        else if (c === 'S') { this.spikes.push({ x: x*this.tile, y: y*this.tile + this.tile - 12, w: this.tile, h: 12 }); this.tiles[y][x] = '.'; }
        else if (c === 'G') { this.goal = { x: x*this.tile, y: y*this.tile - this.tile, w: this.tile, h: this.tile*2 }; this.tiles[y][x] = '.'; }
      }
    }

    this.player = {
      x: this.startX, y: this.startY,
      w: 24, h: 38,
      vx: 0, vy: 0,
      onGround: false,
      facing: 1,
      hurt: 0,
    };

    this.canvas.width  = Math.min(900, window.innerWidth - 16);
    this.canvas.height = Math.min(520, this.rows * this.tile);
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
      this.keys[e.code] = true;
      if (['ArrowUp','Space','KeyW','ArrowLeft','ArrowRight','KeyA','KeyD'].includes(e.code)) e.preventDefault();
    }, { passive: false });
    window.addEventListener('keyup', e => this.keys[e.code] = false);
    // Touch buttons (set up by host page)
  }

  _input() {
    const left  = this.keys['ArrowLeft']  || this.keys['KeyA'] || this.touch.left;
    const right = this.keys['ArrowRight'] || this.keys['KeyD'] || this.touch.right;
    const jump  = this.keys['ArrowUp']    || this.keys['KeyW'] || this.keys['Space'] || this.touch.jump;
    return { left, right, jump };
  }

  _physics() {
    if (this.gameOver) return;
    const inp = this._input();
    const p = this.player;

    if (inp.left)  { p.vx -= this.moveAcc; p.facing = -1; }
    if (inp.right) { p.vx += this.moveAcc; p.facing = 1; }
    if (!inp.left && !inp.right) p.vx *= this.friction;
    p.vx = Math.max(-this.maxRun, Math.min(this.maxRun, p.vx));
    if (Math.abs(p.vx) < 0.05) p.vx = 0;

    if (inp.jump && p.onGround) { p.vy = this.jumpV; p.onGround = false; }
    p.vy += this.gravity;
    if (p.vy > 14) p.vy = 14;

    // Horizontal move + collide
    p.x += p.vx;
    this._collideAxis('x');

    // Vertical move + collide
    p.y += p.vy;
    p.onGround = false;
    this._collideAxis('y');

    // Fall off world?
    if (p.y > this.rows * this.tile + 200) this._die();

    // Collisions: enemies, coins, spikes, goal
    this._collideEntities();

    // Camera
    const targetCam = p.x - this.canvas.width / 2 + p.w / 2;
    this.cameraX = Math.max(0, Math.min(this.cols * this.tile - this.canvas.width, targetCam));

    // Enemy AI
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.x += e.vx;
      // turn at wall or edge
      const probeX = e.vx > 0 ? e.x + e.w : e.x - 1;
      const probeY = e.y + e.h + 2;
      const ahead = this.tileAt(probeX, e.y + e.h / 2);
      const below = this.tileAt(probeX + (e.vx > 0 ? 0 : 0), probeY);
      if (this.isSolid(ahead) || !this.isSolid(below)) e.vx *= -1;
    }

    if (p.hurt > 0) p.hurt--;
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
          if (p.vx > 0) p.x = bx - p.w;
          else if (p.vx < 0) p.x = bx + this.tile;
          p.vx = 0;
        } else {
          if (p.vy > 0) { p.y = by - p.h; p.onGround = true; }
          else if (p.vy < 0) p.y = by + this.tile;
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
      if (dx*dx + dy*dy < 24*24) {
        c.taken = true;
        this.score += 10;
        this.onScore(this.score);
      }
    }

    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (this._aabb(p, e)) {
        // Stomp from above?
        if (p.vy > 2 && (p.y + p.h - e.y) < 14) {
          e.alive = false;
          p.vy = this.jumpV * 0.7;
          this.score += 25;
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
      this.won = true;
      this.gameOver = true;
      setTimeout(() => this.onWin(this.score), 100);
    }
  }

  _aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  _hurt() {
    this.player.hurt = 60;
    this.lives--;
    this.onLives(this.lives);
    this.player.vy = -8;
    this.player.vx = -this.player.facing * 5;
    if (this.lives <= 0) this._die();
  }

  _die() {
    if (this.gameOver) return;
    this.gameOver = true;
    setTimeout(() => this.onLose(this.score), 80);
  }

  reset() {
    this.player.x = this.startX;
    this.player.y = this.startY;
    this.player.vx = 0; this.player.vy = 0;
    this.player.hurt = 0;
    this.lives = 3;
    this.score = 0;
    this.gameOver = false;
    this.won = false;
    for (const c of this.coins) c.taken = false;
    for (const e of this.enemies) e.alive = true;
    this.onScore(0);
    this.onLives(this.lives);
  }

  _render() {
    const ctx = this.ctx;
    const T = this.theme;
    const W = this.canvas.width, H = this.canvas.height;

    // Background — themed
    if (T.bg)        T.bg(ctx, W, H, this.cameraX);
    else { ctx.fillStyle = '#7ad0ff'; ctx.fillRect(0, 0, W, H); }

    ctx.save();
    ctx.translate(-this.cameraX, 0);

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
    if (this.goal && T.goal) T.goal(ctx, this.goal);

    // Coins
    for (const c of this.coins) if (!c.taken && T.coin) T.coin(ctx, c, performance.now());

    // Spikes
    for (const s of this.spikes) if (T.spike) T.spike(ctx, s);

    // Enemies
    for (const e of this.enemies) if (e.alive && T.enemy) T.enemy(ctx, e, performance.now());

    // Player
    if (T.player) T.player(ctx, this.player, performance.now());
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
      this._render();
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  stop() { cancelAnimationFrame(this._raf); }
}

window.Platformer = Platformer;
