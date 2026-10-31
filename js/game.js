import {
  TAU, WORLD, FLOOR, C, ENEMY_DEFS, WAVE_TAGS, MAG_SIZE, RELOAD_TIME,
  rnd, rndi, clamp, lerp, mod, angleLerp, easeOut, makePlayer, PICKUP_DEFS,
  pointSegmentDistance,
} from './core.js';
import { readSafeInsets } from './input.js';
import { Renderer } from './render.js';

const BEST_KEY = 'reef-rampage-best';

function loadBest() {
  try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; }
}
function saveBest(n) {
  try { localStorage.setItem(BEST_KEY, String(Math.round(n))); } catch { /* ignore */ }
}

export class Game {
  constructor(canvas, input, audio, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.input = input;
    this.audio = audio;
    this.options = options;
    this.best = loadBest();
    this.state = 'menu';
    this.t = 0;
    this.last = 0;
    this.dpr = 1;
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.safe = { top: 0, right: 0, bottom: 0, left: 0 };
    this.shake = 0;
    this.hurtFlash = 0;
    this.runToken = 0;
    this.aimPoint = null;

    this.islands = this.makeIslands();
    this.renderer = new Renderer(this);
    this.initAmbient();
    this.resize();
    this.setupMenu();

    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 120));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });
  }

  /* ------------------------------------------------------------------ */
  /*  setup / lifecycle                                                  */
  /* ------------------------------------------------------------------ */

  resize() {
    this.w = Math.max(320, window.innerWidth);
    this.h = Math.max(320, window.innerHeight);
    this.dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.zoom = this.w < 720 ? 1.02 : 1.22;
    this.viewW = this.w / this.zoom;
    this.viewH = this.h / this.zoom;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.safe = readSafeInsets();
    this.input.setViewport(this.w, this.h, this.safe);
    this.renderer.resize();
    if (this.camera) this.clampCamera(true);
  }

  emit(state, stats = null) {
    this.options.onState?.(state, stats);
  }

  makeIslands() {
    const specs = [
      { x: 330, w: 168, h: 305, seed: 1.7, hue: 0 },
      { x: 790, w: 118, h: 214, seed: 4.2, hue: 1 },
      { x: 1980, w: 156, h: 258, seed: 2.9, hue: 2 },
      { x: 2490, w: 218, h: 338, seed: 6.1, hue: 1 },
      { x: 2770, w: 96, h: 176, seed: 3.4, hue: 0 },
    ];
    return specs.map((s) => ({
      ...s,
      y: FLOOR,
      colliders: [
        { x: s.x, y: FLOOR - s.h * 0.2, r: s.w * 0.72 },
        { x: s.x + s.w * 0.05, y: FLOOR - s.h * 0.52, r: s.w * 0.5 },
        { x: s.x - s.w * 0.04, y: FLOOR - s.h * 0.82, r: s.w * 0.28 },
      ],
    }));
  }

  /** Push a swimmer out of an island, cancelling inward velocity. */
  collideIslands(ent) {
    let hit = false;
    for (const isl of this.islands) {
      for (const c of isl.colliders) {
        const dx = ent.x - c.x;
        const dy = ent.y - c.y;
        const min = c.r + (ent.radius || 0);
        const d = Math.hypot(dx, dy);
        if (d < min) {
          const nx = d > 0.001 ? dx / d : 1;
          const ny = d > 0.001 ? dy / d : 0;
          ent.x = c.x + nx * min;
          ent.y = c.y + ny * min;
          const vn = (ent.vx || 0) * nx + (ent.vy || 0) * ny;
          if (vn < 0) {
            ent.vx = (ent.vx || 0) - nx * vn;
            ent.vy = (ent.vy || 0) - ny * vn;
          }
          hit = true;
        }
      }
    }
    return hit;
  }

  pointInIsland(x, y, pad = 0) {
    for (const isl of this.islands) {
      for (const c of isl.colliders) {
        if (Math.hypot(x - c.x, y - c.y) < c.r + pad) return true;
      }
    }
    return false;
  }

  segmentHitsIsland(ax, ay, bx, by, pad = 0) {
    for (const isl of this.islands) {
      for (const c of isl.colliders) {
        if (pointSegmentDistance(c.x, c.y, ax, ay, bx, by) < c.r + pad) return true;
      }
    }
    return false;
  }

  initAmbient() {
    const a = { bubbles: [], motes: [], bgFish: [], bubbleT: rnd(2, 6) };
    for (let i = 0; i < 80; i++) {
      a.bubbles.push({
        x: rnd(0, WORLD.w),
        y: rnd(0, WORLD.h),
        r: rnd(1.4, 5),
        speed: rnd(16, 52),
        phase: rnd(0, TAU),
        drift: rnd(0.4, 1.4),
      });
    }
    for (let i = 0; i < 130; i++) {
      a.motes.push({
        x: rnd(0, WORLD.w),
        y: rnd(0, WORLD.h),
        r: rnd(0.6, 1.8),
        speed: rnd(3, 14),
        phase: rnd(0, TAU),
      });
    }
    for (let i = 0; i < 11; i++) {
      a.bgFish.push({
        nx: rnd(-150, this.w + 150),
        ny: rnd(0.08, 0.78),
        scale: rnd(0.5, 1.5),
        dir: Math.random() < 0.5 ? -1 : 1,
        speed: rnd(7, 22),
        phase: rnd(0, TAU),
        alpha: rnd(0.035, 0.09),
      });
    }
    this.ambient = a;
  }

  setupMenu() {
    this.state = 'menu';
    this.runToken++;
    this.player = makePlayer(WORLD.w / 2 + 300, FLOOR - 300);
    this.player.angle = -0.2;
    this.player.aimAngle = -0.2;
    this.camera = { x: this.player.x - this.viewW / 2, y: this.player.y - this.viewH / 2 };
    this.enemies = [];
    this.bullets = [];
    this.ebullets = [];
    this.pickups = [];
    this.particles = [];
    this.texts = [];
    this.spawnQueue = [];
    this.rings = [];
    this.boss = null;
    this.banner = null;
    this.wave = 0;
    this.waveState = 'idle';
    this.clearTimer = 0;
    this.score = 0;
    this.kills = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.bestCombo = 0;
    this.lastWaveHadBoss = false;
    this.clampCamera(true);
    this.emit('menu');
  }

  start() {
    this.audio.init();
    this.runToken++;
    this.player = makePlayer(WORLD.w / 2, FLOOR - 300);
    this.camera = { x: this.player.x - this.viewW / 2, y: this.player.y - this.viewH / 2 };
    this.enemies = [];
    this.bullets = [];
    this.ebullets = [];
    this.pickups = [];
    this.particles = [];
    this.texts = [];
    this.rings = [];
    this.spawnQueue = [];
    this.boss = null;
    this.banner = null;
    this.wave = 0;
    this.waveState = 'idle';
    this.clearTimer = 0;
    this.score = 0;
    this.kills = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.bestCombo = 0;
    this.shake = 0;
    this.hurtFlash = 0;
    this.lastWaveHadBoss = false;
    this.state = 'playing';
    this.input.clearTransient();
    this.input.enabled = true;
    this.clampCamera(true);
    this.emit('playing');
    this.startWave(1);
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.clearTransient();
    this.emit('paused');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.input.clearTransient();
    this.emit('playing');
  }

  quitToMenu() {
    this.runToken++;
    this.setupMenu();
    this.input.clearTransient();
  }

  /* ------------------------------------------------------------------ */
  /*  main loop                                                          */
  /* ------------------------------------------------------------------ */

  _loop(ts) {
    if (!this.last) this.last = ts;
    let dt = (ts - this.last) / 1000;
    this.last = ts;
    dt = clamp(dt, 0, 0.033);
    this.t += dt;

    if (this.state === 'playing') this.update(dt);
    else if (this.state === 'menu') this.updateMenu(dt);
    else if (this.state === 'dying' || this.state === 'gameover') this.updateIdle(dt);

    this.renderer.render(this, dt);
    requestAnimationFrame(this._loop);
  }

  update(dt) {
    this.updateAmbient(dt);

    this.player.invuln = Math.max(0, this.player.invuln - dt);
    this.player.fireCd -= dt;
    this.player.dashCd = Math.max(0, this.player.dashCd - dt);
    this.player.recoil = Math.max(0, this.player.recoil - dt * 9);
    this.player.muzzle = Math.max(0, this.player.muzzle - dt);
    this.player.hitT = Math.max(0, this.player.hitT - dt);

    this.aimPoint = this.getAimPoint();
    this.updatePlayer(dt);
    this.updateFiring(dt);
    this.updateBullets(dt);
    this.updateEnemies(dt);
    this.updateEnemyBullets(dt);
    this.updatePickups(dt);
    this.updateWave(dt);
    this.updateEffects(dt);
    this.updateCamera(dt);

    if (this.waveState === 'fighting') {
      for (let i = this.spawnQueue.length - 1; i >= 0; i--) {
        if (this.t >= this.spawnQueue[i].at) {
          const item = this.spawnQueue.splice(i, 1)[0];
          this.spawnEnemy(item.type);
        }
      }
    }

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }
  }

  updateMenu(dt) {
    this.updateAmbient(dt);
    this.updateEffects(dt);
    const p = this.player;
    if (!p) return;
    const cx = WORLD.w / 2 + Math.cos(this.t * 0.21) * 210;
    const cy = FLOOR - 300 + Math.sin(this.t * 0.3) * 90;
    const tx = cx + Math.cos(this.t * 0.21 + 0.1) * 210;
    const ty = cy + Math.sin(this.t * 0.3 + 0.1) * 90;
    p.x = cx;
    p.y = cy;
    p.angle = angleLerp(p.angle, Math.atan2(ty - cy, tx - cx), 0.05);
    p.moving = true;
    this.aimPoint = this.getAimPoint();
    if (this.aimPoint) {
      p.aimAngle = angleLerp(p.aimAngle, Math.atan2(this.aimPoint.y - p.y, this.aimPoint.x - p.x), 0.08);
    }
    this.camera.x = lerp(this.camera.x, clamp(p.x - this.viewW / 2, 0, Math.max(0, WORLD.w - this.viewW)), 0.03);
    this.camera.y = lerp(this.camera.y, clamp(p.y - this.viewH / 2, 0, Math.max(0, WORLD.h - this.viewH)), 0.03);
    this.clampCamera(true);
  }

  updateIdle(dt) {
    this.updateAmbient(dt);
    this.updateEffects(dt);
  }

  /* ------------------------------------------------------------------ */
  /*  player                                                             */
  /* ------------------------------------------------------------------ */

  getAimPoint() {
    const p = this.player;
    if (!p) return null;
    const av = this.input.aimVector();
    if (av.active) return { x: p.x + av.x * 420, y: p.y + av.y * 420 };
    if (this.input.mouse.active && this.input.mouse.inside) {
      return { x: this.input.mouse.x / this.zoom + this.camera.x, y: this.input.mouse.y / this.zoom + this.camera.y };
    }
    return null;
  }

  updatePlayer(dt) {
    const p = this.player;
    const mv = this.input.moveVector();
    const moving = mv.len > 0.12;
    p.moving = moving;

    if (p.triple > 0) p.triple -= dt;
    if (p.rapid > 0) p.rapid -= dt;
    if (p.shield > 0) p.shield -= dt;

    if (this.input.takeDash()) this.tryDash(mv);

    if (p.dashTime > 0) {
      p.dashTime = Math.max(0, p.dashTime - dt);
      if (p.dashTime === 0) { p.vx *= 0.55; p.vy *= 0.55; }
      p.x += p.dashVX * dt;
      p.y += p.dashVY * dt;
      p.bubbleT -= dt;
      if (p.bubbleT <= 0) {
        p.bubbleT = 0.025;
        this.addBubble(p.x - p.dashVX * 0.02, p.y - p.dashVY * 0.02, rnd(2, 5), 0.5);
      }
    } else {
      const speed = 342;
      const k = 1 - Math.exp(-9 * dt);
      p.vx = lerp(p.vx, mv.x * speed, k);
      p.vy = lerp(p.vy, mv.y * speed, k);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    p.x = clamp(p.x, 64, WORLD.w - 64);
    p.y = clamp(p.y, 78, FLOOR - 24);
    this.collideIslands(p);

    if (moving) {
      p.angle = angleLerp(p.angle, Math.atan2(mv.y, mv.x), 1 - Math.exp(-12 * dt));
      if (Math.hypot(p.vx, p.vy) > 120) {
        p.bubbleT -= dt;
        if (p.bubbleT <= 0) {
          p.bubbleT = rnd(0.08, 0.16);
          this.addBubble(p.x - Math.cos(p.angle) * 20, p.y - Math.sin(p.angle) * 14, rnd(1.5, 3.5), 0.4);
        }
      }
    }

    if (this.aimPoint) {
      p.aimAngle = angleLerp(
        p.aimAngle,
        Math.atan2(this.aimPoint.y - p.y, this.aimPoint.x - p.x),
        1 - Math.exp(-22 * dt),
      );
    } else if (moving) {
      p.aimAngle = angleLerp(p.aimAngle, p.angle, 1 - Math.exp(-6 * dt));
    }
  }

  tryDash(mv) {
    const p = this.player;
    if (p.dashCd > 0 || p.dashTime > 0) return;
    let dx = mv.x;
    let dy = mv.y;
    if (Math.hypot(dx, dy) < 0.15) {
      dx = Math.cos(p.aimAngle);
      dy = Math.sin(p.aimAngle);
    }
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;
    p.dashTime = 0.17;
    p.dashVX = dx * 1040;
    p.dashVY = dy * 1040;
    p.dashCd = p.dashMax;
    p.invuln = Math.max(p.invuln, 0.32);
    p.vx = p.dashVX * 0.5;
    p.vy = p.dashVY * 0.5;
    this.audio.dash();
    this.shake = Math.max(this.shake, 3);
    this.rings.push({ x: p.x, y: p.y, r: 12, max: 52, life: 0.35, t: 0, color: C.cyanSoft, width: 2 });
    for (let i = 0; i < 10; i++) {
      const a = Math.atan2(dy, dx) + Math.PI + rnd(-0.7, 0.7);
      this.addBubble(p.x + Math.cos(a) * rnd(4, 22), p.y + Math.sin(a) * rnd(4, 22), rnd(2, 6), rnd(0.3, 0.6));
    }
  }

  updateFiring(dt) {
    const p = this.player;
    if (p.reloading > 0) {
      p.reloading -= dt;
      if (p.reloading <= 0) {
        p.reloading = 0;
        p.ammo = p.mag;
      }
    }

    if (this.input.shooting() && !p.dead) {
      if (p.reloading <= 0) {
        if (p.ammo > 0) {
          if (p.fireCd <= 0) this.fire();
        } else {
          this.startReload();
        }
      }
    }
  }

  fire() {
    const p = this.player;
    const spread = p.triple > 0 ? [-0.125, 0, 0.125] : [0];
    const speed = 1120;
    p.ammo--;
    p.fireCd = p.rapid > 0 ? 0.072 : 0.135;
    p.recoil = 1;
    p.muzzle = 0.075;
    p.vx -= Math.cos(p.aimAngle) * 16;
    p.vy -= Math.sin(p.aimAngle) * 16;
    for (const off of spread) {
      const a = p.aimAngle + off + rnd(-0.012, 0.012);
      const mx = p.x + Math.cos(p.aimAngle) * 48;
      const my = p.y + Math.sin(p.aimAngle) * 48;
      this.bullets.push({
        x: mx, y: my, px: mx, py: my,
        vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        life: 1.12, dmg: 13, dead: false, radius: 3,
      });
      this.particles.push({
        x: mx, y: my, vx: Math.cos(a) * rnd(40, 130) + rnd(-30, 30),
        vy: Math.sin(a) * rnd(40, 130) + rnd(-30, 30),
        life: rnd(0.08, 0.2), max: 0.2, size: rnd(1.5, 3.5),
        color: C.amber, type: 'spark', drag: 0.9,
      });
    }
    this.audio.shoot();
    this.shake = Math.max(this.shake, 1.3);
    if (p.ammo <= 0) this.startReload();
  }

  startReload() {
    const p = this.player;
    if (p.reloading > 0 || p.ammo >= p.mag) return;
    p.reloading = RELOAD_TIME;
    this.audio.reload();
  }

  /* ------------------------------------------------------------------ */
  /*  bullets                                                            */
  /* ------------------------------------------------------------------ */

  updateBullets(dt) {
    for (const b of this.bullets) {
      b.px = b.x;
      b.py = b.y;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < 0 || b.y < 0 || b.x > WORLD.w || b.y > WORLD.h) {
        b.dead = true;
        continue;
      }
      if (this.segmentHitsIsland(b.px, b.py, b.x, b.y, 2)) {
        b.dead = true;
        this.burst(b.x, b.y, '#9fbfc4', 4, 90, 2);
        continue;
      }
      for (const e of this.enemies) {
        if (e.dead || e.spawn < 0.35) continue;
        if (pointSegmentDistance(e.x, e.y, b.px, b.py, b.x, b.y) < e.radius + 4) {
          this.hitEnemy(e, b.dmg, b);
          b.dead = true;
          break;
        }
      }
    }
    this.bullets = this.bullets.filter((b) => !b.dead);
  }

  updateEnemyBullets(dt) {
    const p = this.player;
    for (const b of this.ebullets) {
      b.px = b.x;
      b.py = b.y;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      b.t += dt;
      if (b.life <= 0 || b.x < -50 || b.y < -50 || b.x > WORLD.w + 50 || b.y > WORLD.h + 50) {
        b.dead = true;
        continue;
      }
      if (this.segmentHitsIsland(b.px, b.py, b.x, b.y, b.radius * 0.5)) {
        b.dead = true;
        this.burst(b.x, b.y, '#9fbfc4', 4, 80, 2);
        continue;
      }
      if (!p.dead && p.dashTime <= 0 && pointSegmentDistance(p.x, p.y, b.px, b.py, b.x, b.y) < p.radius + b.radius) {
        this.damagePlayer(b.dmg, b.x, b.y);
        this.burst(b.x, b.y, b.color, 8, 140, 3);
        b.dead = true;
      }
    }
    this.ebullets = this.ebullets.filter((b) => !b.dead);
  }

  hitEnemy(e, dmg, b) {
    e.hp -= dmg;
    e.flash = 1;
    if (b) {
      e.vx += b.vx * 0.02;
      e.vy += b.vy * 0.02;
    }
    this.audio.hit();
    this.burst(b ? b.x : e.x, b ? b.y : e.y, e.type === 'boss' ? C.violet : C.amber, 4, 110, 2.5);
    if (e.type === 'boss') this.shake = Math.max(this.shake, 2.2);
    if (e.hp <= 0) this.killEnemy(e);
  }

  killEnemy(e) {
    if (e.dead) return;
    e.dead = true;
    this.kills++;
    this.combo++;
    this.comboTimer = 3.4;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const mult = this.comboMult();
    const def = ENEMY_DEFS[e.type];
    const pts = Math.round(def.score * mult);
    this.score += pts;
    this.addText(e.x, e.y - e.radius - 6, `+${pts}`, this.combo > 1 ? C.amber : C.white, 16);

    if (e.type === 'boss') {
      this.boss = null;
      this.audio.explosion(true);
      this.shake = Math.max(this.shake, 26);
      this.burst(e.x, e.y, C.violet, 60, 420, 6);
      this.burst(e.x, e.y, C.amber, 30, 300, 4);
      this.ring(e.x, e.y, C.violet, 240, 0.9, 6);
      this.addText(e.x, e.y - 80, 'ANGLER SLAIN', C.violet, 26);
      for (let i = 0; i < 8; i++) {
        this.spawnPickup(e.x + rnd(-90, 90), e.y + rnd(-70, 70), i === 0 ? 'heart' : this.rollPickup(true));
      }
    } else {
      this.audio.explosion(e.type === 'shark');
      this.shake = Math.max(this.shake, e.type === 'shark' ? 8 : 3);
      this.burst(e.x, e.y, def.color, e.type === 'shark' ? 26 : 13, e.type === 'shark' ? 260 : 160, e.type === 'shark' ? 4.5 : 3);
      this.dropLoot(e);
    }
    if (this.combo === 5 || this.combo === 10 || this.combo === 20) {
      this.addText(this.player.x, this.player.y - 48, `${this.combo} COMBO!`, C.pink, 20);
    }
  }

  comboMult() {
    return Math.min(5, 1 + this.combo * 0.09);
  }

  /* ------------------------------------------------------------------ */
  /*  enemies                                                            */
  /* ------------------------------------------------------------------ */

  spawnEnemy(type, atX, atY) {
    if (this.enemies.length > 46) return;
    const p = this.player;
    let x = atX;
    let y = atY;
    if (x === undefined) {
      const minD = type === 'boss' ? 470 : Math.max(430, Math.min(this.w, this.h) * 0.58);
      const maxD = type === 'boss' ? 620 : Math.max(minD + 230, 820);
      let tries = 0;
      do {
        const a = rnd(0, TAU);
        const d = rnd(minD, maxD);
        x = clamp(p.x + Math.cos(a) * d, 90, WORLD.w - 90);
        y = clamp(p.y + Math.sin(a) * d, 110, FLOOR - 40);
        tries++;
      } while ((Math.hypot(x - p.x, y - p.y) < 330 || this.pointInIsland(x, y, 46)) && tries < 30);
    }
    const def = ENEMY_DEFS[type];
    const scale = type === 'boss'
      ? 1 + Math.floor(this.wave / 5 - 1) * 0.55
      : 1 + (this.wave - 1) * 0.115;
    const hp = Math.round(def.hp * scale);
    const e = {
      type,
      x, y, vx: 0, vy: 0,
      radius: def.radius * (type === 'boss' ? 1 : rnd(0.92, 1.1)),
      hp, maxHp: hp,
      angle: rnd(0, TAU),
      t: rnd(0, 20),
      seed: rnd(0, 100),
      age: 0,
      spawn: 0,
      flash: 0,
      contactCd: 0,
      state: 'idle',
      stateT: 0,
      fireT: rnd(1.4, 2.6),
      burstT: 2.2,
      summonT: 5.5,
      chargeT: 7,
      modeT: 0,
      mode: 'drift',
      chargeVX: 0,
      chargeVY: 0,
      dead: false,
    };
    this.enemies.push(e);
    if (type === 'boss') {
      this.boss = e;
      this.audio.bossRoar();
      this.showBanner('ANGLERFISH', 'THE ABYSS STIRS', C.violet, 2.6);
      this.shake = Math.max(this.shake, 10);
    }
    this.ring(x, y, type === 'boss' ? C.violet : C.cyan, type === 'boss' ? 120 : 42, 0.5, 2);
    return e;
  }

  updateEnemies(dt) {
    const p = this.player;
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.age += dt;
      e.t += dt;
      e.spawn = Math.min(1, e.spawn + dt * 3.2);
      e.flash = Math.max(0, e.flash - dt * 6);
      e.contactCd = Math.max(0, e.contactCd - dt);
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const toPlayer = Math.atan2(dy, dx);

      if (e.type === 'chomper') {
        const wobble = Math.sin(e.t * 3.1 + e.seed) * 0.42;
        const speed = ENEMY_DEFS.chomper.speed * (d < 240 ? 1.35 : 1) * (1 + this.wave * 0.012);
        const a = toPlayer + wobble;
        e.vx = lerp(e.vx, Math.cos(a) * speed, 1 - Math.exp(-2.4 * dt));
        e.vy = lerp(e.vy, Math.sin(a) * speed, 1 - Math.exp(-2.4 * dt));
      } else if (e.type === 'puffer') {
        let a = toPlayer;
        let speed = ENEMY_DEFS.puffer.speed;
        if (d < 190) { a = toPlayer + Math.PI; speed *= 1.25; }
        else if (d < 300) { a = toPlayer + Math.PI / 2; speed *= 0.85; }
        e.vx = lerp(e.vx, Math.cos(a) * speed, 1 - Math.exp(-1.8 * dt));
        e.vy = lerp(e.vy, Math.sin(a) * speed, 1 - Math.exp(-1.8 * dt));
        e.fireT -= dt;
        if (e.fireT <= 0) {
          e.fireT = rnd(2.3, 2.9);
          this.enemyRadial(e, 7, 195, 10, C.amber, 0.22);
        }
      } else if (e.type === 'jelly') {
        const a = toPlayer + Math.sin(e.t * 1.4 + e.seed) * 0.9;
        e.vx = lerp(e.vx, Math.cos(a) * ENEMY_DEFS.jelly.speed, 1 - Math.exp(-1.2 * dt));
        e.vy = lerp(e.vy, Math.sin(a) * ENEMY_DEFS.jelly.speed, 1 - Math.exp(-1.2 * dt));
        e.fireT -= dt;
        if (e.fireT <= 0) {
          e.fireT = rnd(3.2, 4.2);
          this.enemyRadial(e, 6, 130, 11, C.violet, 0.5);
          this.ring(e.x, e.y, C.violet, 80, 0.5, 2);
        }
      } else if (e.type === 'shark') {
        if (e.state === 'idle') {
          const a = toPlayer + Math.sin(e.t * 0.8) * 0.8;
          const speed = ENEMY_DEFS.shark.speed * 0.75;
          e.vx = lerp(e.vx, Math.cos(a) * speed, 1 - Math.exp(-2 * dt));
          e.vy = lerp(e.vy, Math.sin(a) * speed, 1 - Math.exp(-2 * dt));
          e.stateT += dt;
          if (e.stateT > 2.1 && d < 560) { e.state = 'wind'; e.stateT = 0; }
        } else if (e.state === 'wind') {
          e.vx *= Math.pow(0.02, dt);
          e.vy *= Math.pow(0.02, dt);
          e.stateT += dt;
          if (e.stateT > 0.65) {
            e.state = 'charge';
            e.stateT = 0;
            e.chargeVX = Math.cos(toPlayer) * 660;
            e.chargeVY = Math.sin(toPlayer) * 660;
            this.audio.enemyShoot();
          }
        } else {
          e.vx = e.chargeVX;
          e.vy = e.chargeVY;
          e.stateT += dt;
          if (e.stateT > 0.8) { e.state = 'idle'; e.stateT = 0; }
        }
      } else if (e.type === 'boss') {
        this.updateBoss(e, dt, d, toPlayer);
      }

      e.x += e.vx * dt;
      e.y += e.vy * dt;
      if (e.state !== 'charge' || e.type === 'boss') {
        e.angle = angleLerp(e.angle, Math.atan2(e.vy, e.vx) || e.angle, 1 - Math.exp(-4 * dt));
      } else {
        e.angle = angleLerp(e.angle, toPlayer, 1 - Math.exp(-8 * dt));
      }
      const pad = e.radius + 20;
      if (e.x < pad) { e.x = pad; e.vx = Math.abs(e.vx) * 0.6; }
      if (e.x > WORLD.w - pad) { e.x = WORLD.w - pad; e.vx = -Math.abs(e.vx) * 0.6; }
      if (e.y < 60 + e.radius) { e.y = 60 + e.radius; e.vy = Math.abs(e.vy) * 0.6; }
      if (e.y > FLOOR - e.radius * 0.5) { e.y = FLOOR - e.radius * 0.5; e.vy = -Math.abs(e.vy) * 0.6; }
      this.collideIslands(e);

      if (e.spawn > 0.55 && !p.dead) {
        const pdx = p.x - e.x;
        const pdy = p.y - e.y;
        const pd = Math.hypot(pdx, pdy) || 1;
        const minDist = p.radius + e.radius * 0.82;
        if (pd < minDist) {
          if (e.contactCd <= 0) {
            e.contactCd = 0.9;
            this.damagePlayer(ENEMY_DEFS[e.type].contact, e.x, e.y);
            const a = Math.atan2(p.y - e.y, p.x - e.x);
            p.vx += Math.cos(a) * 340;
            p.vy += Math.sin(a) * 340;
          }
          const push = minDist - pd;
          const nx = pdx / pd;
          const ny = pdy / pd;
          const eShare = e.type === 'boss' ? 0.85 : 0.55;
          e.x -= nx * push * eShare;
          e.y -= ny * push * eShare;
          p.x += nx * push * (1 - eShare);
          p.y += ny * push * (1 - eShare);
        }
      }
    }

    // Soft separation so the school doesn't stack into one blob.
    for (let i = 0; i < this.enemies.length; i++) {
      const a = this.enemies[i];
      if (a.dead) continue;
      for (let j = i + 1; j < this.enemies.length; j++) {
        const b = this.enemies[j];
        if (b.dead) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = a.radius + b.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 > 0 && d2 < min * min) {
          const d = Math.sqrt(d2);
          const push = ((min - d) / d) * 0.5;
          const ax = a.type === 'boss' ? 0.1 : 1;
          const bx = b.type === 'boss' ? 0.1 : 1;
          a.x -= dx * push * ax;
          a.y -= dy * push * ax;
          b.x += dx * push * bx;
          b.y += dy * push * bx;
        }
      }
    }

    this.enemies = this.enemies.filter((e) => !e.dead);
  }

  updateBoss(e, dt, d, toPlayer) {
    const p = this.player;
    const orbit = toPlayer + Math.PI / 2;
    let speed = ENEMY_DEFS.boss.speed;
    let moveA = toPlayer;
    if (d < 250) { moveA = toPlayer + Math.PI; speed *= 1.2; }
    else if (d < 380) { moveA = orbit; speed *= 0.9; }
    e.vx = lerp(e.vx, Math.cos(moveA) * speed, 1 - Math.exp(-1.4 * dt));
    e.vy = lerp(e.vy, Math.sin(moveA) * speed, 1 - Math.exp(-1.4 * dt));

    e.burstT -= dt;
    e.summonT -= dt;
    e.chargeT -= dt;

    if (e.mode === 'charge') {
      e.modeT -= dt;
      e.vx = e.chargeVX;
      e.vy = e.chargeVY;
      e.bubbleT = (e.bubbleT || 0) - dt;
      if (e.bubbleT <= 0) {
        e.bubbleT = 0.05;
        this.addBubble(e.x, e.y, rnd(3, 7), 0.5);
      }
      if (e.modeT <= 0) e.mode = 'drift';
    } else if (e.chargeT <= 0 && d < 560) {
      e.chargeT = rnd(7.5, 9.5);
      e.mode = 'charge';
      e.modeT = 0.95;
      e.chargeVX = Math.cos(toPlayer) * 560;
      e.chargeVY = Math.sin(toPlayer) * 560;
      this.audio.bossRoar();
      this.ring(e.x, e.y, C.pink, 160, 0.5, 3);
    }

    if (e.burstT <= 0) {
      e.burstT = 2.15;
      this.enemyRadial(e, 12, 210, 12, C.violet, rnd(0, TAU));
      this.ring(e.x, e.y, C.violet, 150, 0.5, 3);
      this.audio.enemyShoot();
    }
    if (e.summonT <= 0) {
      e.summonT = 7.5;
      if (this.enemies.length < 26) {
        for (let i = 0; i < 2; i++) {
          const a = rnd(0, TAU);
          this.spawnEnemy('chomper', clamp(e.x + Math.cos(a) * 90, 90, WORLD.w - 90), clamp(e.y + Math.sin(a) * 90, 90, FLOOR - 40));
        }
        this.ring(e.x, e.y, C.orange, 110, 0.5, 3);
      }
    }
  }

  enemyRadial(e, count, speed, dmg, color, offset = 0) {
    for (let i = 0; i < count; i++) {
      const a = offset + (i / count) * TAU;
      this.ebullets.push({
        x: e.x + Math.cos(a) * (e.radius + 6),
        y: e.y + Math.sin(a) * (e.radius + 6),
        px: e.x,
        py: e.y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        radius: e.type === 'boss' ? 8 : 6,
        dmg,
        life: 4.2,
        t: 0,
        color,
        dead: false,
        kind: e.type === 'boss' ? 'orb' : e.type === 'jelly' ? 'glow' : 'spine',
      });
    }
    e.flash = Math.max(e.flash, 0.5);
  }

  /* ------------------------------------------------------------------ */
  /*  pickups / damage                                                   */
  /* ------------------------------------------------------------------ */

  dropLoot(e) {
    const def = ENEMY_DEFS[e.type];
    let chance = def.drop;
    if (this.player.hp < 40) chance += 0.1;
    if (Math.random() > chance) return;
    this.spawnPickup(e.x, e.y, this.rollPickup(false));
  }

  rollPickup(rich = false) {
    const r = Math.random();
    if (this.player.hp < 55 && r < (rich ? 0.4 : 0.34)) return 'heart';
    if (r < 0.5) return 'pearl';
    if (r < 0.7) return 'heart';
    if (r < 0.82) return 'triple';
    if (r < 0.93) return 'rapid';
    return 'shield';
  }

  spawnPickup(x, y, type) {
    this.pickups.push({
      x: clamp(x, 60, WORLD.w - 60),
      y: clamp(y, 80, FLOOR - 30),
      vx: rnd(-60, 60),
      vy: rnd(-80, -20),
      type,
      t: rnd(0, 10),
      life: 14,
      r: 12,
      dead: false,
    });
    this.ring(x, y, PICKUP_DEFS[type].color, 34, 0.45, 2);
  }

  updatePickups(dt) {
    const p = this.player;
    for (const it of this.pickups) {
      it.t += dt;
      it.life -= dt;
      const dx = p.x - it.x;
      const dy = p.y - it.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < 150) {
        const pull = (1 - d / 150) * 900;
        it.vx += (dx / d) * pull * dt;
        it.vy += (dy / d) * pull * dt;
      }
      it.vx *= Math.pow(0.25, dt);
      it.vy *= Math.pow(0.25, dt);
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      it.x = clamp(it.x, 40, WORLD.w - 40);
      it.y = clamp(it.y, 60, FLOOR - 20);
      this.collideIslands(it);
      if (d < 28) {
        this.collectPickup(it);
        it.dead = true;
      }
      if (it.life <= 0) it.dead = true;
    }
    this.pickups = this.pickups.filter((it) => !it.dead);
  }

  collectPickup(it) {
    const p = this.player;
    const color = PICKUP_DEFS[it.type].color;
    this.burst(it.x, it.y, color, 8, 120, 2.5);
    this.addText(it.x, it.y - 18, PICKUP_DEFS[it.type].label, color, 13);
    if (it.type === 'pearl') {
      this.score += Math.round(60 * this.comboMult());
      this.audio.pickup(1);
    } else if (it.type === 'heart') {
      p.hp = Math.min(p.maxHp, p.hp + 22);
      this.audio.pickup(2);
    } else if (it.type === 'triple') {
      p.triple = Math.max(p.triple, 10);
      this.audio.powerup();
    } else if (it.type === 'rapid') {
      p.rapid = Math.max(p.rapid, 10);
      this.audio.powerup();
    } else if (it.type === 'shield') {
      p.shield = Math.max(p.shield, 12);
      this.audio.powerup();
    }
    this.ring(it.x, it.y, color, 36, 0.4, 2);
  }

  damagePlayer(dmg, sx, sy) {
    const p = this.player;
    if (p.dead || p.invuln > 0 || p.dashTime > 0) return;
    if (p.shield > 0) {
      p.shield = 0;
      p.invuln = Math.max(p.invuln, 0.7);
      this.audio.shieldBreak();
      this.audio.hurt();
      this.ring(p.x, p.y, C.cyan, 70, 0.5, 4);
      this.burst(p.x, p.y, C.cyan, 18, 220, 3);
      this.addText(p.x, p.y - 40, 'SHIELD BROKEN', C.cyan, 15);
      this.shake = Math.max(this.shake, 8);
      return;
    }
    p.hp -= dmg;
    p.invuln = 0.85;
    p.hitT = 1;
    this.combo = 0;
    this.comboTimer = 0;
    this.hurtFlash = 1;
    this.shake = Math.max(this.shake, 13);
    this.audio.hurt();
    const a = Math.atan2(p.y - sy, p.x - sx) || 0;
    p.vx += Math.cos(a) * 260;
    p.vy += Math.sin(a) * 260;
    this.burst(p.x, p.y, C.pink, 14, 190, 3.5);
    this.addText(p.x, p.y - 34, `-${Math.round(dmg)}`, C.pink, 17);
    if (p.hp <= 0) {
      p.hp = 0;
      this.die();
    }
  }

  die() {
    const p = this.player;
    p.dead = true;
    this.state = 'dying';
    this.input.enabled = false;
    this.input.releaseAll();
    this.shake = 32;
    this.hurtFlash = 1;
    this.audio.explosion(true);
    this.audio.hurt();
    this.burst(p.x, p.y, C.orange, 60, 440, 6);
    this.burst(p.x, p.y, C.amber, 30, 300, 4);
    this.ring(p.x, p.y, C.orange, 200, 0.9, 6);
    this.enemies.forEach((e) => { e.vx *= 0.2; e.vy *= 0.2; });

    const isBest = this.score > this.best;
    if (isBest) {
      this.best = Math.round(this.score);
      saveBest(this.best);
    }
    const stats = {
      score: Math.round(this.score),
      kills: this.kills,
      wave: this.wave,
      best: this.best,
      bestCombo: this.bestCombo,
      isBest,
    };
    const token = this.runToken;
    this.emit('dying');
    setTimeout(() => {
      if (this.runToken !== token || this.state !== 'dying') return;
      this.state = 'gameover';
      this.emit('gameover', stats);
    }, 850);
  }

  /* ------------------------------------------------------------------ */
  /*  waves                                                              */
  /* ------------------------------------------------------------------ */

  buildWave(n) {
    const q = [];
    if (n % 5 === 0) {
      q.push({ type: 'boss', at: this.t + 1.4 });
      const adds = 2 + Math.floor(n / 5);
      for (let i = 0; i < adds; i++) q.push({ type: 'chomper', at: this.t + 2.5 + i * 0.8 });
      this.lastWaveHadBoss = true;
      return q;
    }
    this.lastWaveHadBoss = false;
    const chompers = Math.min(22, 3 + Math.floor(n * 1.7));
    const puffers = n >= 2 ? Math.min(7, Math.floor(n / 2)) : 0;
    const jellies = n >= 3 ? Math.min(6, Math.floor(n / 3)) : 0;
    const sharks = n >= 4 ? Math.min(4, Math.floor((n - 1) / 3)) : 0;
    const all = [];
    for (let i = 0; i < chompers; i++) all.push('chomper');
    for (let i = 0; i < puffers; i++) all.push('puffer');
    for (let i = 0; i < jellies; i++) all.push('jelly');
    for (let i = 0; i < sharks; i++) all.push('shark');
    // Shuffle so each wave feels mixed.
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    const gap = Math.max(0.34, 0.95 - n * 0.035);
    all.forEach((type, i) => {
      q.push({ type, at: this.t + 1.9 + i * gap + rnd(0, 0.25) });
    });
    return q;
  }

  startWave(n) {
    this.wave = n;
    this.waveState = 'fighting';
    this.spawnQueue = this.buildWave(n);
    const boss = n % 5 === 0;
    const title = boss ? 'ANGLERFISH' : `WAVE ${String(n).padStart(2, '0')}`;
    const sub = boss ? 'THE ABYSS STIRS' : WAVE_TAGS[(n - 1) % WAVE_TAGS.length];
    this.showBanner(title, sub, boss ? C.violet : C.amber, 2.5);
    if (!boss) this.audio.waveStart();
  }

  updateWave(dt) {
    if (this.waveState === 'fighting') {
      if (this.spawnQueue.length === 0 && this.enemies.length === 0) {
        this.waveState = 'cleared';
        this.clearTimer = 3;
        const bonus = 75 * this.wave;
        this.score += bonus;
        const p = this.player;
        p.hp = Math.min(p.maxHp, p.hp + 12);
        p.ammo = p.mag;
        p.reloading = 0;
        this.showBanner(
          this.lastWaveHadBoss ? 'REEF SECURED' : 'WAVE CLEARED',
          `+${bonus} BONUS · +12 HP · AMMO REFILLED`,
          this.lastWaveHadBoss ? C.violet : C.green,
          2.5,
        );
        this.audio.waveClear();
      }
    } else if (this.waveState === 'cleared') {
      this.clearTimer -= dt;
      if (this.clearTimer <= 0) this.startWave(this.wave + 1);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  effects / camera / ambient                                         */
  /* ------------------------------------------------------------------ */

  showBanner(title, sub, color, dur = 2.2) {
    this.banner = { title, sub, color, t: 0, dur };
  }

  addText(x, y, text, color, size = 15) {
    this.texts.push({ x, y, text, color, size, life: 0.9, max: 0.9, vy: -38 });
    if (this.texts.length > 40) this.texts.shift();
  }

  burst(x, y, color, count, speed, size = 3) {
    for (let i = 0; i < count; i++) {
      const a = rnd(0, TAU);
      const s = rnd(speed * 0.25, speed);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: rnd(0.3, 0.85),
        max: 0.85,
        size: rnd(size * 0.5, size),
        color,
        type: Math.random() < 0.28 ? 'bubble' : 'spark',
        drag: 0.86,
      });
    }
    if (this.particles.length > 700) this.particles.splice(0, this.particles.length - 700);
  }

  addBubble(x, y, size = 3, life = 0.6) {
    this.particles.push({
      x, y,
      vx: rnd(-14, 14),
      vy: rnd(-34, -8),
      life: rnd(life * 0.6, life * 1.4),
      max: life * 1.4,
      size,
      color: C.cyanSoft,
      type: 'bubble',
      drag: 0.97,
    });
    if (this.particles.length > 700) this.particles.shift();
  }

  ring(x, y, color, max, life = 0.5, width = 2) {
    this.rings.push({ x, y, r: 6, max, life, t: 0, color, width });
    if (this.rings.length > 30) this.rings.shift();
  }

  updateEffects(dt) {
    this.shake *= Math.exp(-7.5 * dt);
    if (this.shake < 0.05) this.shake = 0;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.8);

    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t > this.banner.dur) this.banner = null;
    }

    for (const pt of this.particles) {
      pt.life -= dt;
      const drag = Math.pow(pt.drag, dt * 60);
      pt.vx *= drag;
      pt.vy *= drag;
      if (pt.type === 'bubble') pt.vy -= 16 * dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
    }
    this.particles = this.particles.filter((pt) => pt.life > 0);

    for (const tx of this.texts) {
      tx.life -= dt;
      tx.y += tx.vy * dt;
      tx.vy *= Math.pow(0.9, dt * 60);
    }
    this.texts = this.texts.filter((tx) => tx.life > 0);

    for (const r of this.rings) {
      r.t += dt;
      const k = clamp(r.t / r.life, 0, 1);
      r.r = lerp(6, r.max, easeOut(k));
    }
    this.rings = this.rings.filter((r) => r.t < r.life);
  }

  updateCamera(dt) {
    const p = this.player;
    let lookX = 0;
    let lookY = 0;
    if (this.aimPoint) {
      lookX = clamp((this.aimPoint.x - p.x) * 0.16, -95, 95);
      lookY = clamp((this.aimPoint.y - p.y) * 0.16, -80, 80);
    }
    const tx = clamp(p.x + lookX - this.viewW / 2, 0, Math.max(0, WORLD.w - this.viewW));
    const ty = clamp(p.y + lookY - this.viewH / 2, 0, Math.max(0, WORLD.h - this.viewH));
    const k = 1 - Math.exp(-6.5 * dt);
    this.camera.x = lerp(this.camera.x, tx, k);
    this.camera.y = lerp(this.camera.y, ty, k);
    this.clampCamera(false);
  }

  clampCamera(snap = false) {
    if (!this.camera) return;
    const vw = this.viewW || this.w;
    const vh = this.viewH || this.h;
    const maxX = Math.max(0, WORLD.w - vw);
    const maxY = Math.max(0, WORLD.h - vh);
    const tx = vw > WORLD.w ? (WORLD.w - vw) / 2 : clamp(this.camera.x, 0, maxX);
    const ty = vh > WORLD.h ? (WORLD.h - vh) / 2 : clamp(this.camera.y, 0, maxY);
    if (snap) {
      this.camera.x = tx;
      this.camera.y = ty;
    } else {
      this.camera.x = clamp(this.camera.x, 0, maxX);
      this.camera.y = clamp(this.camera.y, 0, maxY);
    }
  }

  updateAmbient(dt) {
    const a = this.ambient;
    if (!a) return;
    for (const b of a.bubbles) {
      b.y -= b.speed * dt;
      b.x += Math.sin(this.t * 0.8 + b.phase) * 8 * dt;
      if (b.y < -20) {
        b.y = WORLD.h + rnd(0, 80);
        b.x = rnd(0, WORLD.w);
      }
    }
    for (const m of a.motes) {
      m.y -= m.speed * dt;
      m.x += Math.sin(this.t * 0.5 + m.phase) * 4 * dt;
      if (m.y < 0) {
        m.y = WORLD.h;
        m.x = rnd(0, WORLD.w);
      }
    }
    for (const f of a.bgFish) {
      f.nx += f.dir * f.speed * dt;
      if (f.nx > this.w + 220) f.nx = -180;
      if (f.nx < -220) f.nx = this.w + 180;
    }
    a.bubbleT -= dt;
    if (a.bubbleT <= 0) {
      a.bubbleT = rnd(4, 9);
      if (this.audio.available) this.audio.bubble();
    }
  }
}
