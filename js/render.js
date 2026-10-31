import {
  TAU, WORLD, FLOOR, C, FONT, DISPLAY, PICKUP_DEFS,
  clamp, lerp, mod, rnd, roundRect, formatNumber,
} from './core.js';
import { drawHUD, drawTouchControls } from './hud.js';

export class Renderer {
  constructor(game) {
    this.game = game;
    this.ctx = game.ctx;
    this.decor = this.makeDecor();
    this.bgGrad = null;
    this.vignette = null;
    this.aimHover = null;
  }

  resize() {
    const { ctx, w, h } = this.game;
    this.bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    this.bgGrad.addColorStop(0, '#0b3a4c');
    this.bgGrad.addColorStop(0.32, '#072838');
    this.bgGrad.addColorStop(0.7, '#04151f');
    this.bgGrad.addColorStop(1, '#01070c');
    this.vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.78);
    this.vignette.addColorStop(0, 'rgba(0,0,0,0)');
    this.vignette.addColorStop(0.72, 'rgba(0,4,8,0.12)');
    this.vignette.addColorStop(1, 'rgba(0,4,8,0.6)');
  }

  makeDecor() {
    const weeds = [];
    const rocks = [];
    const corals = [];
    for (let i = 0; i < 100; i++) {
      weeds.push({
        x: rnd(0, WORLD.w),
        y: FLOOR + rnd(-4, 46),
        h: rnd(45, 185),
        phase: rnd(0, TAU),
        lean: rnd(-0.4, 0.4),
        hue: Math.random() < 0.5 ? '#1f6b5c' : Math.random() < 0.5 ? '#2c7d63' : '#176052',
        blades: Array.from({ length: 3 }, (_, j) => ({
          o: rnd(-12, 12),
          hk: rnd(0.6, 1),
          w: rnd(1.5, 3.6),
          ph: rnd(0, TAU) + j,
        })),
      });
    }
    for (let i = 0; i < 55; i++) {
      rocks.push({
        x: rnd(0, WORLD.w),
        y: FLOOR + rnd(8, 66),
        w: rnd(22, 88),
        h: rnd(10, 34),
        rot: rnd(-0.2, 0.2),
        shade: Math.random() < 0.5 ? '#06141b' : '#081a22',
      });
    }
    const coralColors = ['#b14d63', '#c46a49', '#8a4d7c', '#3f7f78', '#a45b3f'];
    for (let i = 0; i < 34; i++) {
      corals.push({
        x: rnd(0, WORLD.w),
        y: FLOOR + rnd(0, 24),
        size: rnd(18, 62),
        phase: rnd(0, TAU),
        color: coralColors[Math.floor(rnd(0, coralColors.length))],
      });
    }
    return { weeds, rocks, corals };
  }

  /* ================================================================== */
  /*  main render                                                        */
  /* ================================================================== */

  render(game) {
    const ctx = game.ctx;
    ctx.setTransform(game.dpr, 0, 0, game.dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;

    this.drawBackdrop(game);

    const shake = game.shake;
    const sx = shake ? rnd(-shake, shake) : 0;
    const sy = shake ? rnd(-shake, shake) : 0;

    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(game.zoom, game.zoom);
    ctx.translate(-game.camera.x, -game.camera.y);
    this.drawWorld(game);
    this.drawPickups(game);
    this.drawEnemyBullets(game);
    this.drawEnemies(game);
    if (game.state === 'playing' || game.state === 'paused') this.drawAimGuide(game);
    if (!game.player.dead && game.state !== 'menu') this.drawPlayer(game);
    this.drawBullets(game);
    this.drawRings(game);
    this.drawParticles(game);
    this.drawTexts(game);
    ctx.restore();

    this.drawScreenFX(game);

    if (game.state !== 'menu') {
      drawHUD(game);
      drawTouchControls(game);
      this.drawReticle(game);
    }
  }

  drawBackdrop(game) {
    const { ctx, w, h, t } = game;
    ctx.fillStyle = this.bgGrad || '#04151f';
    ctx.fillRect(0, 0, w, h);

    // Light shafts from the surface.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 7; i++) {
      const phase = t * 0.045 + i * 1.71;
      const x = (i / 6) * w + Math.sin(phase) * w * 0.07;
      const topW = 34 + Math.sin(i * 2.3) * 18;
      const grad = ctx.createLinearGradient(0, 0, 0, h * 0.95);
      grad.addColorStop(0, 'rgba(130,245,255,0.075)');
      grad.addColorStop(0.7, 'rgba(90,200,230,0.022)');
      grad.addColorStop(1, 'rgba(60,150,190,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(x - topW / 2, -80);
      ctx.lineTo(x + topW / 2, -80);
      ctx.lineTo(x + topW / 2 + 190 + Math.sin(phase * 0.7) * 40, h * 0.95);
      ctx.lineTo(x - topW / 2 + 120 + Math.sin(phase * 0.7) * 40, h * 0.95);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    this.drawReefHorizon(game);
    this.drawDistantFish(game);
  }

  drawReefHorizon(game) {
    const { ctx, w, h, camera, t } = game;
    for (let layer = 0; layer < 2; layer++) {
      const baseY = h * (0.855 + layer * 0.062);
      const par = 0.07 + layer * 0.07;
      const off = mod(camera.x * par, 260);
      ctx.fillStyle = layer === 0 ? 'rgba(5,25,34,0.45)' : 'rgba(2,13,19,0.72)';
      ctx.beginPath();
      for (let x = -100; x <= w + 100; x += 16) {
        const xx = x + off;
        const y = baseY + Math.sin(xx * 0.011 + layer * 2.3) * 16 + Math.sin(xx * 0.03 + layer) * 6;
        if (x === -100) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineTo(w + 100, h + 20);
      ctx.lineTo(-100, h + 20);
      ctx.closePath();
      ctx.fill();

      if (layer === 1) {
        ctx.save();
        ctx.strokeStyle = 'rgba(8,34,42,0.65)';
        ctx.lineCap = 'round';
        for (let i = 0; i < 10; i++) {
          const bx = mod(i * 173 - off * 1.6, w + 160) - 80;
          const by = baseY + 10;
          const tall = 48 + ((i * 43) % 52);
          ctx.lineWidth = 4 + (i % 3);
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.quadraticCurveTo(bx + Math.sin(t * 0.5 + i) * 10, by - tall * 0.5, bx + Math.sin(t * 0.7 + i) * 16, by - tall);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  }

  drawDistantFish(game) {
    const { ctx, w, h, t, camera, ambient } = game;
    ctx.save();
    for (const f of ambient.bgFish) {
      const x = mod(f.nx - camera.x * 0.12, w + 300) - 150;
      const y = f.ny * h + Math.sin(t * 0.4 + f.phase) * 9;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(f.scale * (f.dir < 0 ? -1 : 1), f.scale);
      ctx.globalAlpha = f.alpha;
      ctx.fillStyle = '#9ceef5';
      ctx.beginPath();
      ctx.ellipse(0, 0, 24, 8, 0, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-20, 0);
      ctx.quadraticCurveTo(-34, -9, -40, 0);
      ctx.quadraticCurveTo(-34, 9, -20, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-2, -7);
      ctx.lineTo(8, -14);
      ctx.lineTo(13, -6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  drawWorld(game) {
    const { ctx, camera, t } = game;
    const x0 = camera.x - 140;
    const x1 = camera.x + game.viewW + 140;

    // Water surface.
    if (camera.y < 210) {
      const surf = ctx.createLinearGradient(0, -20, 0, 230);
      surf.addColorStop(0, 'rgba(150,255,255,0.20)');
      surf.addColorStop(0.35, 'rgba(80,210,235,0.06)');
      surf.addColorStop(1, 'rgba(20,80,110,0)');
      ctx.fillStyle = surf;
      ctx.fillRect(x0, -30, x1 - x0, 260);
      ctx.strokeStyle = 'rgba(185,255,255,0.38)';
      ctx.lineWidth = 2;
      for (let k = 0; k < 2; k++) {
        ctx.beginPath();
        for (let x = x0; x <= x1; x += 22) {
          const y = 28 + k * 15 + Math.sin(x * 0.012 + t * 1.6 + k * 1.4) * 6 + Math.sin(x * 0.026 - t * 1.1) * 3;
          if (x === x0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.globalAlpha = k === 0 ? 0.5 : 0.2;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Sand floor.
    const floorGrad = ctx.createLinearGradient(0, FLOOR - 20, 0, WORLD.h);
    floorGrad.addColorStop(0, '#173c3b');
    floorGrad.addColorStop(0.22, '#0f2c30');
    floorGrad.addColorStop(1, '#050f14');
    ctx.fillStyle = floorGrad;
    ctx.beginPath();
    ctx.moveTo(x0, WORLD.h + 20);
    for (let x = x0; x <= x1; x += 34) {
      const y = FLOOR + Math.sin(x * 0.006) * 15 + Math.sin(x * 0.014 + 1.7) * 8 + Math.cos(x * 0.002) * 8;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(x1, WORLD.h + 20);
    ctx.closePath();
    ctx.fill();

    // Dune shadow line.
    ctx.fillStyle = 'rgba(2,10,14,0.35)';
    ctx.beginPath();
    ctx.moveTo(x0, WORLD.h + 20);
    for (let x = x0; x <= x1; x += 40) {
      const y = FLOOR + 56 + Math.sin(x * 0.005 + 2) * 12 + Math.cos(x * 0.011) * 6;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(x1, WORLD.h + 20);
    ctx.closePath();
    ctx.fill();

    // Rocks, weeds and coral (culled to view).
    this.drawIslands(game);

    for (const r of this.decor.rocks) {
      if (r.x < x0 - 120 || r.x > x1 + 120) continue;
      ctx.save();
      ctx.translate(r.x, r.y);
      ctx.rotate(r.rot);
      ctx.fillStyle = r.shade;
      ctx.beginPath();
      ctx.ellipse(0, 0, r.w, r.h, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(70,140,150,0.07)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    for (const wd of this.decor.weeds) {
      if (wd.x < x0 - 80 || wd.x > x1 + 80) continue;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = wd.hue;
      for (const b of wd.blades) {
        const sway = Math.sin(t * 1.05 + wd.phase + b.ph) * (8 + wd.h * 0.06);
        const top = wd.y - wd.h * b.hk;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = b.w;
        ctx.beginPath();
        ctx.moveTo(wd.x + b.o, wd.y);
        ctx.quadraticCurveTo(
          wd.x + b.o + wd.lean * 22 + sway * 0.4,
          wd.y - wd.h * b.hk * 0.55,
          wd.x + b.o + wd.lean * 34 + sway,
          top,
        );
        ctx.stroke();
      }
      ctx.restore();
    }

    for (const c of this.decor.corals) {
      if (c.x < x0 - 80 || c.x > x1 + 80) continue;
      const sway = Math.sin(t * 0.8 + c.phase) * 2;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.strokeStyle = c.color;
      ctx.fillStyle = c.color;
      ctx.globalAlpha = 0.5;
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(2, c.size * 0.08);
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i - 2) * 0.32 + sway * 0.01;
        const ex = Math.cos(a) * c.size;
        const ey = Math.sin(a) * c.size;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(ex * 0.3, ey * 0.55, ex, ey);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(ex, ey, Math.max(2, c.size * 0.11), 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    // Ambient bubbles and motes.
    for (const b of game.ambient.bubbles) {
      if (b.x < x0 || b.x > x1 || b.y < camera.y - 40 || b.y > camera.y + game.viewH + 40) continue;
      ctx.globalAlpha = 0.16 + Math.min(0.18, b.r * 0.03);
      ctx.strokeStyle = '#bdf6ff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const m of game.ambient.motes) {
      if (m.x < x0 || m.x > x1 || m.y < camera.y - 40 || m.y > camera.y + game.viewH + 40) continue;
      ctx.globalAlpha = 0.1 + Math.sin(t * 1.2 + m.phase) * 0.05;
      ctx.fillStyle = '#d8ffff';
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // World edge haze.
    const edge = ctx.createLinearGradient(x0, 0, x0 + 220, 0);
    edge.addColorStop(0, 'rgba(0,6,10,0.4)');
    edge.addColorStop(1, 'rgba(0,6,10,0)');
    ctx.fillStyle = edge;
    ctx.fillRect(x0, camera.y - 100, 220, game.viewH + 200);
    const edgeR = ctx.createLinearGradient(x1 - 220, 0, x1, 0);
    edgeR.addColorStop(0, 'rgba(0,6,10,0)');
    edgeR.addColorStop(1, 'rgba(0,6,10,0.4)');
    ctx.fillStyle = edgeR;
    ctx.fillRect(x1 - 220, camera.y - 100, 220, game.viewH + 200);
  }

  /* ================================================================== */
  /*  reef islands                                                       */
  /* ================================================================== */

  drawIslands(game) {
    const { ctx, camera, t } = game;
    for (const isl of game.islands) {
      if (isl.x + isl.w * 1.6 < camera.x - 100 || isl.x - isl.w * 1.6 > camera.x + game.viewW + 100) continue;
      const { w, h, seed } = isl;
      ctx.save();
      ctx.translate(isl.x, FLOOR);

      // Seabed shadow and sandy apron.
      ctx.fillStyle = 'rgba(1,10,13,0.45)';
      ctx.beginPath();
      ctx.ellipse(0, 10, w * 1.26, 24, 0, 0, TAU);
      ctx.fill();
      const apron = ctx.createLinearGradient(0, -32, 0, 26);
      apron.addColorStop(0, 'rgba(46,82,74,0.55)');
      apron.addColorStop(1, 'rgba(20,46,44,0)');
      ctx.fillStyle = apron;
      ctx.beginPath();
      ctx.ellipse(0, 4, w * 1.16, 34, 0, 0, TAU);
      ctx.fill();

      // Mound silhouette with a gently jagged rim.
      const pts = [];
      const N = 28;
      for (let i = 0; i <= N; i++) {
        const th = Math.PI * (1 - i / N);
        const noise = 1 + 0.05 * Math.sin(i * 2.1 + seed * 11) + 0.03 * Math.sin(i * 5.3 + seed * 4);
        pts.push({
          x: Math.cos(th) * w * noise,
          y: -Math.sin(th) * h * (0.95 + 0.05 * Math.sin(i * 1.3 + seed)) + 10 * (1 - Math.sin(th)),
        });
      }
      const trace = () => {
        ctx.beginPath();
        ctx.moveTo(-w * 1.08, 16);
        for (const pt of pts) ctx.lineTo(pt.x, pt.y);
        ctx.lineTo(w * 1.08, 16);
        ctx.quadraticCurveTo(0, 34, -w * 1.08, 16);
        ctx.closePath();
      };

      trace();
      const rock = ctx.createLinearGradient(0, -h, 0, 20);
      rock.addColorStop(0, '#22534f');
      rock.addColorStop(0.4, '#153b3f');
      rock.addColorStop(1, '#07181f');
      ctx.fillStyle = rock;
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,220,205,0.16)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Rock facets, kept inside the silhouette.
      ctx.save();
      trace();
      ctx.clip();
      ctx.fillStyle = 'rgba(120,210,195,0.055)';
      ctx.beginPath();
      ctx.moveTo(-w * 0.96, 10);
      ctx.quadraticCurveTo(-w * 0.7, -h * 0.4, -w * 0.3, -h * 0.86);
      ctx.lineTo(-w * 0.08, -h * 0.7);
      ctx.quadraticCurveTo(-w * 0.4, -h * 0.28, -w * 0.5, 10);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(0,8,12,0.22)';
      ctx.beginPath();
      ctx.moveTo(w * 0.25, -h * 0.86);
      ctx.quadraticCurveTo(w * 0.7, -h * 0.4, w * 0.95, 12);
      ctx.lineTo(w * 0.55, 12);
      ctx.quadraticCurveTo(w * 0.42, -h * 0.38, w * 0.06, -h * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(130,225,210,0.09)';
      ctx.lineWidth = 1.6;
      for (let k = 1; k < 5; k++) {
        const yy = -h * (k / 5.4);
        ctx.beginPath();
        ctx.moveTo(-w * 0.9, yy + 14);
        ctx.quadraticCurveTo(0, yy - 16, w * 0.88, yy + 10);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(2,12,16,0.5)';
      ctx.lineWidth = 2;
      for (let k = 0; k < 3; k++) {
        const sx = (seed * 37 + k * 23) % w - w * 0.5;
        ctx.beginPath();
        ctx.moveTo(sx, -h * (0.72 + k * 0.03));
        ctx.lineTo(sx + 8, -h * 0.55);
        ctx.lineTo(sx - 4, -h * 0.4);
        ctx.lineTo(sx + 6, -h * 0.22);
        ctx.stroke();
      }
      ctx.restore();

      // Soft glow over the crown.
      const crownGlow = ctx.createRadialGradient(0, -h + 6, 4, 0, -h + 6, w * 0.85);
      crownGlow.addColorStop(0, 'rgba(160,255,225,0.1)');
      crownGlow.addColorStop(1, 'rgba(80,220,200,0)');
      ctx.fillStyle = crownGlow;
      ctx.beginPath();
      ctx.arc(0, -h + 6, w * 0.85, 0, TAU);
      ctx.fill();

      // Sandy, slightly irregular crown.
      const crown = ctx.createLinearGradient(0, -h - 8, 0, -h + 22);
      crown.addColorStop(0, '#58806b');
      crown.addColorStop(0.5, '#446e5e');
      crown.addColorStop(1, '#2f534b');
      ctx.fillStyle = crown;
      ctx.beginPath();
      ctx.moveTo(-w * 0.48, -h + 10);
      ctx.bezierCurveTo(-w * 0.4, -h - 1, -w * 0.18, -h - 6, w * 0.04, -h - 5);
      ctx.bezierCurveTo(w * 0.28, -h - 5, w * 0.46, -h + 1, w * 0.48, -h + 11);
      ctx.bezierCurveTo(w * 0.34, -h + 22, w * 0.12, -h + 24, -w * 0.06, -h + 23);
      ctx.bezierCurveTo(-w * 0.26, -h + 22, -w * 0.44, -h + 18, -w * 0.48, -h + 10);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(170,240,215,0.25)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.fillStyle = 'rgba(200,245,220,0.13)';
      ctx.beginPath();
      ctx.ellipse(-w * 0.12, -h - 1, w * 0.2, 4.5, -0.04, 0, TAU);
      ctx.fill();

      // A dark little grotto in the rock face.
      ctx.fillStyle = 'rgba(1,10,14,0.65)';
      ctx.beginPath();
      ctx.ellipse(-w * 0.18, -h * 0.34, w * 0.13, h * 0.11, 0.15, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,220,195,0.14)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.fillStyle = 'rgba(120,255,220,0.14)';
      ctx.beginPath();
      ctx.arc(-w * 0.14, -h * 0.36, 3.4, 0, TAU);
      ctx.fill();

      // Coral gardens clinging to the slopes.
      const coralColors = ['#b7566f', '#c97a4d', '#8c5a92', '#3f8f86'];
      for (let k = 0; k < 4; k++) {
        const side = k % 2 === 0 ? -1 : 1;
        const cx = side * w * (0.52 + (k % 3) * 0.1);
        const cy = -h * (0.12 + ((k * 0.21 + seed * 0.05) % 0.6));
        const size = 10 + ((k * 13 + seed * 7) % 12);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.strokeStyle = coralColors[k];
        ctx.fillStyle = coralColors[k];
        ctx.globalAlpha = 0.7;
        ctx.lineCap = 'round';
        ctx.lineWidth = 2.4;
        for (let b = 0; b < 4; b++) {
          const a = -Math.PI / 2 + (b - 1.5) * 0.45;
          const ex = Math.cos(a) * size;
          const ey = Math.sin(a) * size;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.quadraticCurveTo(ex * 0.3, ey * 0.6, ex, ey);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(ex, ey, 2.6, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      }

      // Sea-palm silhouettes on the crown.
      const palms = w > 150 ? [-0.22, 0.14, 0.3] : w > 100 ? [-0.14, 0.2] : [0.02];
      palms.forEach((off, pi) => {
        const bx = w * off;
        const by = -h + 8;
        const tall = 62 + ((seed * 7 + pi * 11) % 26);
        const sway = Math.sin(t * 0.6 + seed + pi * 1.7) * 6;
        const tipX = bx + sway + (pi === 0 ? -12 : pi === 1 ? 13 : -2);
        const tipY = by - tall;
        ctx.strokeStyle = '#123b33';
        ctx.lineWidth = 5.4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.quadraticCurveTo(bx - 9, by - tall * 0.55, tipX, tipY);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(95,180,145,0.25)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(bx - 1.5, by - 4);
        ctx.quadraticCurveTo(bx - 10, by - tall * 0.55, tipX - 1.5, tipY + 4);
        ctx.stroke();

        for (let f = 0; f < 6; f++) {
          const a = -Math.PI / 2 + (f - 2.5) * 0.52;
          const len = 24 + (f % 3) * 5;
          const fx = tipX + Math.cos(a) * len;
          const fy = tipY + Math.sin(a) * len + 15;
          ctx.strokeStyle = f % 2 === 0 ? '#1c5345' : '#266451';
          ctx.lineWidth = 3.2;
          ctx.beginPath();
          ctx.moveTo(tipX, tipY);
          ctx.quadraticCurveTo(tipX + Math.cos(a) * len * 0.55, tipY + Math.sin(a) * len * 0.45 - 5, fx, fy);
          ctx.stroke();
          // Leaflets.
          ctx.lineWidth = 1.2;
          for (let l = 1; l <= 2; l++) {
            const lx = tipX + (fx - tipX) * (0.4 + l * 0.22);
            const ly = tipY + (fy - tipY) * (0.4 + l * 0.22);
            ctx.beginPath();
            ctx.moveTo(lx, ly);
            ctx.lineTo(lx + Math.cos(a + 1.1) * 7, ly + Math.sin(a + 1.1) * 7);
            ctx.stroke();
          }
        }
      });

      // Bioluminescent specks.
      for (let k = 0; k < 7; k++) {
        const bx = Math.sin(seed * 3 + k * 2.3) * w * 0.72;
        const by = -h * (0.12 + ((k * 0.37) % 0.72));
        ctx.globalAlpha = 0.35 + Math.sin(t * 1.6 + k + seed) * 0.2;
        ctx.fillStyle = '#a6ffe6';
        ctx.beginPath();
        ctx.arc(bx, by, 1.6, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Little bubbles drifting up along the island face.
      for (let k = 0; k < 4; k++) {
        const rise = (t * 14 + k * 47 + seed * 13) % (h * 0.8);
        const bx = (k % 2 === 0 ? -1 : 1) * w * (0.45 + k * 0.1);
        ctx.globalAlpha = 0.18;
        ctx.strokeStyle = '#c9fbff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(bx + Math.sin(t + k) * 4, -rise, 1.8 + (k % 3), 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      ctx.restore();
    }
  }

  /* ================================================================== */
  /*  player                                                             */
  /* ================================================================== */

  drawPlayer(game) {
    const { ctx, t } = game;
    const p = game.player;
    const flicker = p.invuln > 0 && Math.floor(t * 24) % 2 === 0;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.globalAlpha = flicker ? 0.55 : 1;

    if (p.shield > 0) {
      const pulse = 1 + Math.sin(t * 6) * 0.03;
      ctx.save();
      ctx.globalAlpha = 0.4 + Math.sin(t * 5) * 0.1;
      ctx.strokeStyle = C.cyan;
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 7]);
      ctx.lineDashOffset = -t * 40;
      ctx.beginPath();
      ctx.arc(0, 0, 34 * pulse, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = C.cyan;
      ctx.beginPath();
      ctx.arc(0, 0, 34, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // Tail + body face the swim direction.
    ctx.save();
    ctx.rotate(p.angle);
    const wag = Math.sin(t * (p.moving ? 16 : 6)) * 0.5;

    ctx.fillStyle = '#e8792f';
    ctx.beginPath();
    ctx.moveTo(-14, 0);
    ctx.quadraticCurveTo(-30, -10 - wag * 10, -47, -5 - wag * 6);
    ctx.quadraticCurveTo(-37, 0, -47, 5 - wag * 6);
    ctx.quadraticCurveTo(-30, 10 - wag * 10, -14, 0);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,190,90,0.85)';
    ctx.beginPath();
    ctx.moveTo(-1, -13);
    ctx.quadraticCurveTo(4, -27, 15, -15);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-3, 12);
    ctx.quadraticCurveTo(-10, 24, 8, 15);
    ctx.closePath();
    ctx.fill();

    const bodyGrad = ctx.createLinearGradient(-20, -15, 20, 15);
    bodyGrad.addColorStop(0, '#ffb45c');
    bodyGrad.addColorStop(0.55, '#ff9036');
    bodyGrad.addColorStop(1, '#e5602a');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, 23, 15.5, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,28,8,0.5)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,235,190,0.45)';
    ctx.beginPath();
    ctx.ellipse(2, 7, 14, 6, 0.05, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = 'rgba(200,70,20,0.4)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.arc(-2 - i * 6, -1, 11 - i, -1.1, 1.1);
      ctx.stroke();
    }

    // Eye.
    ctx.fillStyle = '#fffdf4';
    ctx.beginPath();
    ctx.arc(11, -4, 5.6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#10222b';
    ctx.beginPath();
    ctx.arc(13, -4, 2.9, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(14, -5.4, 1, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#7b3510';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(14, 5, 5, 0.15, 1.05);
    ctx.stroke();
    ctx.restore();

    // Harpoon gun, aims independently.
    ctx.save();
    ctx.rotate(p.aimAngle);
    const kick = p.recoil * 4;
    ctx.translate(-kick, 0);
    ctx.fillStyle = '#0a222d';
    roundRect(ctx, 0, -7.5, 27, 15, 4.5);
    ctx.fill();
    ctx.fillStyle = '#164457';
    roundRect(ctx, 20, -4.5, 30, 9, 3);
    ctx.fill();
    ctx.fillStyle = '#0a222d';
    roundRect(ctx, 45, -7, 8, 14, 2.5);
    ctx.fill();
    ctx.fillStyle = C.cyan;
    ctx.globalAlpha = 0.8;
    ctx.fillRect(22, -1.5, 25, 3);
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.amber;
    ctx.fillRect(4, -2, 10, 4);
    if (p.triple > 0) {
      ctx.strokeStyle = C.amber;
      ctx.lineWidth = 2;
      for (const off of [-7, 7]) {
        ctx.beginPath();
        ctx.moveTo(40, off * 1.4);
        ctx.lineTo(54, off * 1.4);
        ctx.stroke();
      }
    }
    if (p.muzzle > 0) {
      const s = p.muzzle / 0.075;
      ctx.globalAlpha = s;
      ctx.fillStyle = '#fff6cf';
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        const r = i % 2 === 0 ? 12 * s : 4 * s;
        const x = 54 + Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,194,71,0.5)';
      ctx.beginPath();
      ctx.arc(55, 0, 9 * s, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    ctx.restore();
  }

  drawAimGuide(game) {
    const { ctx, player, aimPoint } = game;
    if (!aimPoint) return;
    const dx = aimPoint.x - player.x;
    const dy = aimPoint.y - player.y;
    const d = Math.hypot(dx, dy);
    if (d < 30) return;
    const ux = dx / d;
    const uy = dy / d;
    ctx.save();
    ctx.strokeStyle = 'rgba(110,243,255,0.22)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([2, 9]);
    ctx.lineDashOffset = -game.t * 40;
    ctx.beginPath();
    ctx.moveTo(player.x + ux * 58, player.y + uy * 58);
    ctx.lineTo(player.x + ux * Math.min(d, 260), player.y + uy * Math.min(d, 260));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  /* ================================================================== */
  /*  enemies                                                            */
  /* ================================================================== */

  drawEnemies(game) {
    for (const e of game.enemies) {
      if (e.dead) continue;
      const spawn = clamp(e.spawn, 0, 1);
      const alpha = spawn < 1 ? spawn : 1;
      const scale = 0.65 + 0.35 * (1 - Math.pow(1 - spawn, 3));
      const ctx = game.ctx;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(e.x, e.y);
      ctx.scale(scale, scale);
      if (e.type === 'chomper') this.drawChomper(game, e);
      else if (e.type === 'puffer') this.drawPuffer(game, e);
      else if (e.type === 'jelly') this.drawJelly(game, e);
      else if (e.type === 'shark') this.drawShark(game, e);
      else if (e.type === 'boss') this.drawBoss(game, e);
      if (e.flash > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = e.flash * 0.55;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(0, 0, e.radius * 1.05, e.radius * 0.8, 0, 0, TAU);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();

      if (e.type !== 'boss' && e.hp < e.maxHp) {
        const w = e.radius * 2.2;
        const x = e.x - w / 2;
        const y = e.y - e.radius - 12;
        const frac = clamp(e.hp / e.maxHp, 0, 1);
        ctx.fillStyle = 'rgba(0,8,12,0.65)';
        roundRect(ctx, x, y, w, 4, 2);
        ctx.fill();
        ctx.fillStyle = frac > 0.55 ? C.green : frac > 0.25 ? C.amber : C.pink;
        roundRect(ctx, x, y, Math.max(2, w * frac), 4, 2);
        ctx.fill();
      }
    }
  }

  drawChomper(game, e) {
    const { ctx, t } = game;
    const s = e.radius / 16;
    ctx.rotate(e.angle);
    const wag = Math.sin(e.t * 11 + e.seed) * 0.5;

    ctx.fillStyle = '#d9422c';
    ctx.beginPath();
    ctx.moveTo(-12 * s, 0);
    ctx.quadraticCurveTo(-25 * s, (-9 - wag * 7) * s, -34 * s, (-4 - wag * 4) * s);
    ctx.quadraticCurveTo(-27 * s, 0, -34 * s, (4 - wag * 4) * s);
    ctx.quadraticCurveTo(-25 * s, (9 - wag * 7) * s, -12 * s, 0);
    ctx.fill();

    ctx.fillStyle = '#b52f24';
    ctx.beginPath();
    ctx.moveTo(-3 * s, -11 * s);
    ctx.lineTo(5 * s, -21 * s);
    ctx.lineTo(11 * s, -9 * s);
    ctx.closePath();
    ctx.fill();

    const g = ctx.createLinearGradient(-16 * s, -10 * s, 16 * s, 10 * s);
    g.addColorStop(0, '#ff9a5b');
    g.addColorStop(0.55, '#f4623c');
    g.addColorStop(1, '#c22f26');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, 17 * s, 11.5 * s, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,15,10,0.55)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(120,20,15,0.5)';
    ctx.lineWidth = 2 * s;
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.arc(-2 * s - i * 5 * s, 0, (8 - i * 1.5) * s, -1, 1);
      ctx.stroke();
    }

    // Mouth and teeth.
    ctx.fillStyle = '#3a0c0c';
    ctx.beginPath();
    ctx.ellipse(12 * s, 1.5 * s, 6.5 * s, 5.4 * s, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff4e2';
    for (let i = 0; i < 3; i++) {
      const tx = (9 + i * 3.4) * s;
      ctx.beginPath();
      ctx.moveTo(tx - 1.5 * s, -2.8 * s);
      ctx.lineTo(tx + 1.2 * s, -2.8 * s);
      ctx.lineTo(tx - 0.2 * s, 0.4 * s);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(tx - 1.5 * s, 5.2 * s);
      ctx.lineTo(tx + 1.2 * s, 5.2 * s);
      ctx.lineTo(tx - 0.2 * s, 2.4 * s);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = '#fffdf4';
    ctx.beginPath();
    ctx.arc(8 * s, -4.5 * s, 4.4 * s, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#171013';
    ctx.beginPath();
    ctx.arc(9.4 * s, -4.5 * s, 2.2 * s, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#5a120c';
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(4 * s, -9 * s);
    ctx.lineTo(11 * s, -7.4 * s);
    ctx.stroke();
  }

  drawPuffer(game, e) {
    const { ctx, t } = game;
    const s = e.radius / 23;
    const pulse = 1 + Math.sin(t * 3 + e.seed) * 0.035;
    const charging = e.fireT < 0.45;
    ctx.scale(pulse, pulse);

    if (charging) {
      ctx.globalAlpha = 0.25 + 0.2 * Math.sin(t * 20);
      ctx.fillStyle = C.amber;
      ctx.beginPath();
      ctx.arc(0, 0, (30 + Math.sin(t * 12) * 3) * s, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = '#c9861f';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + e.t * 0.08;
      const r1 = 21 * s;
      const r2 = 30 * s;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a - 0.13) * r1, Math.sin(a - 0.13) * r1);
      ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
      ctx.lineTo(Math.cos(a + 0.13) * r1, Math.sin(a + 0.13) * r1);
      ctx.closePath();
      ctx.fill();
    }

    const g = ctx.createRadialGradient(-6 * s, -7 * s, 2, 0, 0, 23 * s);
    g.addColorStop(0, '#ffe58a');
    g.addColorStop(0.6, '#f5c34a');
    g.addColorStop(1, '#c98b1e');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 21 * s, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(110,70,10,0.4)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.fillStyle = 'rgba(140,90,20,0.45)';
    for (const p of [[-7, 4], [6, 8], [9, -7], [-10, -8]]) {
      ctx.beginPath();
      ctx.arc(p[0] * s, p[1] * s, 2.2 * s, 0, TAU);
      ctx.fill();
    }

    ctx.fillStyle = '#fffdf4';
    for (const ex of [-7, 7]) {
      ctx.beginPath();
      ctx.arc(ex * s, -3 * s, 4.4 * s, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#1b1710';
    for (const ex of [-7, 7]) {
      ctx.beginPath();
      ctx.arc((ex + 1) * s, -2 * s, 2.2 * s, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = '#7a4c08';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(0, 10 * s, 4 * s, 0.2, Math.PI - 0.2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(140,90,20,0.5)';
    ctx.beginPath();
    ctx.ellipse(-19 * s, 5 * s, 6 * s, 3 * s, -0.3, 0, TAU);
    ctx.fill();
  }

  drawJelly(game, e) {
    const { ctx, t } = game;
    const s = e.radius / 20;
    const bob = Math.sin(t * 2.4 + e.seed);
    ctx.translate(0, bob * 2);

    ctx.globalAlpha *= 0.92;
    ctx.strokeStyle = 'rgba(220,170,255,0.55)';
    ctx.lineWidth = 1.6;
    ctx.fillStyle = 'rgba(170,90,255,0.12)';
    for (let i = 0; i < 5; i++) {
      const sw = Math.sin(t * 2.2 + i * 1.3 + e.seed) * 6;
      ctx.beginPath();
      ctx.moveTo((-13 + i * 6.5) * s, 10 * s);
      ctx.quadraticCurveTo((-16 + i * 7 + sw) * s, 22 * s, (-12 + i * 6 + sw * 1.4) * s, 34 * s);
      ctx.stroke();
    }

    const g = ctx.createRadialGradient(-4 * s, -8 * s, 2, 0, 0, 22 * s);
    g.addColorStop(0, 'rgba(255,210,255,0.95)');
    g.addColorStop(0.55, 'rgba(190,120,255,0.8)');
    g.addColorStop(1, 'rgba(110,50,190,0.55)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-20 * s, 4 * s);
    ctx.bezierCurveTo(-22 * s, -18 * s, 22 * s, -18 * s, 20 * s, 4 * s);
    ctx.quadraticCurveTo(15 * s, 10 * s, 10 * s, 4 * s);
    ctx.quadraticCurveTo(5 * s, 10 * s, 0, 4 * s);
    ctx.quadraticCurveTo(-5 * s, 10 * s, -10 * s, 4 * s);
    ctx.quadraticCurveTo(-15 * s, 10 * s, -20 * s, 4 * s);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(230,180,255,0.65)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.fillStyle = '#2b1236';
    for (const ex of [-6, 6]) {
      ctx.beginPath();
      ctx.arc(ex * s, -4 * s, 2.1 * s, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (const ex of [-6, 6]) {
      ctx.beginPath();
      ctx.arc((ex - 0.6) * s, -4.8 * s, 0.7 * s, 0, TAU);
      ctx.fill();
    }
  }

  drawShark(game, e) {
    const { ctx, t } = game;
    const s = e.radius / 33;
    ctx.rotate(e.angle);
    const wind = e.state === 'wind';
    if (wind) {
      ctx.globalAlpha = 0.5 + Math.sin(t * 24) * 0.3;
      ctx.strokeStyle = C.pink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 48 * s, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (e.state === 'charge') {
      ctx.strokeStyle = 'rgba(160,225,255,0.25)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-50 * s - i * 12, (-10 + i * 10) * s);
        ctx.lineTo(-20 * s - i * 12, (-10 + i * 10) * s);
        ctx.stroke();
      }
    }

    ctx.fillStyle = '#7e94a6';
    ctx.beginPath();
    ctx.moveTo(-30 * s, 0);
    ctx.quadraticCurveTo(-46 * s, -14 * s, -55 * s, -19 * s);
    ctx.quadraticCurveTo(-45 * s, 0, -55 * s, 19 * s);
    ctx.quadraticCurveTo(-46 * s, 14 * s, -30 * s, 0);
    ctx.fill();

    ctx.fillStyle = '#7a93a6';
    ctx.beginPath();
    ctx.moveTo(-4 * s, -13 * s);
    ctx.lineTo(2 * s, -32 * s);
    ctx.lineTo(14 * s, -12 * s);
    ctx.closePath();
    ctx.fill();

    const g = ctx.createLinearGradient(0, -18 * s, 0, 18 * s);
    g.addColorStop(0, '#b2c5d3');
    g.addColorStop(0.55, '#8ba1b4');
    g.addColorStop(1, '#5e7488');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(2 * s, 0, 42 * s, 16 * s, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#e3edf3';
    ctx.beginPath();
    ctx.ellipse(4 * s, 7 * s, 34 * s, 7.5 * s, 0, 0, TAU);
    ctx.fill();

    ctx.fillStyle = '#6f8496';
    ctx.beginPath();
    ctx.moveTo(-8 * s, 10 * s);
    ctx.lineTo(0, 26 * s);
    ctx.lineTo(10 * s, 10 * s);
    ctx.closePath();
    ctx.fill();

    // Nose, eye, teeth.
    ctx.fillStyle = '#f2f7fa';
    ctx.beginPath();
    ctx.moveTo(43 * s, -4 * s);
    ctx.lineTo(52 * s, 1 * s);
    ctx.lineTo(43 * s, 5 * s);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#11222c';
    ctx.beginPath();
    ctx.arc(24 * s, -4 * s, 2.6 * s, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 4; i++) {
      const tx = (30 + i * 4.2) * s;
      ctx.beginPath();
      ctx.moveTo(tx, 8 * s);
      ctx.lineTo(tx + 2 * s, 8 * s);
      ctx.lineTo(tx + 1 * s, 13 * s);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(40,60,75,0.5)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(24 * s, 8 * s);
    ctx.lineTo(48 * s, 8 * s);
    ctx.stroke();
  }

  drawBoss(game, e) {
    const { ctx, t } = game;
    const s = e.radius / 62;
    const pulse = 1 + Math.sin(t * 2.2) * 0.02;
    const charging = e.mode === 'charge';

    // Aura.
    const aura = ctx.createRadialGradient(0, 0, 20 * s, 0, 0, 100 * s);
    aura.addColorStop(0, charging ? 'rgba(255,80,140,0.18)' : 'rgba(150,90,255,0.15)');
    aura.addColorStop(1, 'rgba(80,20,150,0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, 0, 100 * s, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.rotate(e.angle);
    ctx.scale(pulse, pulse);
    const wag = Math.sin(t * 3.4) * 0.5;

    ctx.fillStyle = '#3a1854';
    ctx.beginPath();
    ctx.moveTo(-46 * s, 0);
    ctx.quadraticCurveTo(-72 * s, (-26 - wag * 12) * s, -92 * s, (-30 - wag * 10) * s);
    ctx.quadraticCurveTo(-78 * s, 0, -92 * s, (30 - wag * 10) * s);
    ctx.quadraticCurveTo(-72 * s, (26 - wag * 12) * s, -46 * s, 0);
    ctx.fill();

    ctx.fillStyle = '#4c1f6b';
    ctx.beginPath();
    ctx.moveTo(-24 * s, -34 * s);
    ctx.quadraticCurveTo(-6 * s, -66 * s, 18 * s, -38 * s);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-22 * s, 34 * s);
    ctx.quadraticCurveTo(-4 * s, 62 * s, 20 * s, 38 * s);
    ctx.closePath();
    ctx.fill();

    const g = ctx.createRadialGradient(-10 * s, -18 * s, 8 * s, 0, 0, 68 * s);
    g.addColorStop(0, '#8b4fc2');
    g.addColorStop(0.5, '#5b2a83');
    g.addColorStop(1, '#2c123f');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, 58 * s, 42 * s, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(190,120,255,0.25)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Ridges.
    ctx.strokeStyle = 'rgba(30,10,45,0.7)';
    ctx.lineWidth = 3 * s;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(-8 * s - i * 9 * s, 0, (30 - i * 4) * s, -1.2, 1.2);
      ctx.stroke();
    }

    // Mouth.
    ctx.fillStyle = '#1a061f';
    ctx.beginPath();
    ctx.ellipse(38 * s, 4 * s, 24 * s, 18 * s, 0.05, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff6e0';
    for (let i = 0; i < 5; i++) {
      const tx = (23 + i * 6.5) * s;
      ctx.beginPath();
      ctx.moveTo(tx, -9 * s);
      ctx.lineTo(tx + 4.5 * s, -9 * s);
      ctx.lineTo(tx + 2.2 * s, 0);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(tx, 17 * s);
      ctx.lineTo(tx + 4.5 * s, 17 * s);
      ctx.lineTo(tx + 2.2 * s, 7 * s);
      ctx.closePath();
      ctx.fill();
    }

    // Eye.
    ctx.fillStyle = '#ffe0a8';
    ctx.beginPath();
    ctx.arc(18 * s, -16 * s, 8 * s, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#170a1c';
    ctx.beginPath();
    ctx.arc(21 * s, -16 * s, 4 * s, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(22.6 * s, -17.6 * s, 1.4 * s, 0, TAU);
    ctx.fill();

    // Lure.
    ctx.strokeStyle = '#3c1c55';
    ctx.lineWidth = 4 * s;
    ctx.beginPath();
    ctx.moveTo(10 * s, -38 * s);
    ctx.quadraticCurveTo(26 * s, -72 * s, 54 * s, -62 * s);
    ctx.stroke();
    const lure = ctx.createRadialGradient(58 * s, -62 * s, 1, 58 * s, -62 * s, 20 * s);
    lure.addColorStop(0, 'rgba(255,255,220,1)');
    lure.addColorStop(0.35, 'rgba(200,255,120,0.9)');
    lure.addColorStop(1, 'rgba(140,255,80,0)');
    ctx.fillStyle = lure;
    ctx.beginPath();
    ctx.arc(58 * s, -62 * s, 20 * s, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#f4ffd0';
    ctx.beginPath();
    ctx.arc(58 * s, -62 * s, 4 * s, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  /* ================================================================== */
  /*  projectiles / pickups / particles                                  */
  /* ================================================================== */

  drawBullets(game) {
    const { ctx } = game;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of game.bullets) {
      const tx = b.x - b.vx * 0.024;
      const ty = b.y - b.vy * 0.024;
      const grad = ctx.createLinearGradient(tx, ty, b.x, b.y);
      grad.addColorStop(0, 'rgba(110,243,255,0)');
      grad.addColorStop(1, 'rgba(190,255,255,0.9)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 2.4, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  drawEnemyBullets(game) {
    const { ctx } = game;
    for (const b of game.ebullets) {
      ctx.save();
      ctx.translate(b.x, b.y);
      if (b.kind === 'orb') {
        const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 14);
        g.addColorStop(0, 'rgba(255,240,255,0.95)');
        g.addColorStop(0.4, 'rgba(190,110,255,0.8)');
        g.addColorStop(1, 'rgba(120,40,200,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, TAU);
        ctx.fill();
      } else if (b.kind === 'glow') {
        ctx.fillStyle = 'rgba(200,120,255,0.25)';
        ctx.beginPath();
        ctx.arc(0, 0, 13, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#e0a8ff';
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, TAU);
        ctx.fill();
      } else {
        ctx.rotate(Math.atan2(b.vy, b.vx));
        ctx.fillStyle = 'rgba(255,194,71,0.25)';
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.moveTo(8, 0);
        ctx.lineTo(-4, -4.5);
        ctx.lineTo(-2, 0);
        ctx.lineTo(-4, 4.5);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  drawPickups(game) {
    const { ctx, t } = game;
    for (const it of game.pickups) {
      const def = PICKUP_DEFS[it.type];
      const bob = Math.sin(t * 3 + it.t) * 3;
      const alpha = it.life < 3 ? 0.4 + Math.sin(t * 16) * 0.35 : 1;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(it.x, it.y + bob);
      const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 26);
      g.addColorStop(0, `${def.color}55`);
      g.addColorStop(1, `${def.color}00`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, TAU);
      ctx.fill();

      ctx.strokeStyle = `${def.color}88`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 5]);
      ctx.lineDashOffset = -t * 20;
      ctx.beginPath();
      ctx.arc(0, 0, 16 + Math.sin(t * 3 + it.t) * 1.5, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);

      if (it.type === 'pearl') {
        ctx.fillStyle = '#f4ffff';
        ctx.beginPath();
        ctx.arc(0, 0, 6.5, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(110,243,255,0.7)';
        ctx.beginPath();
        ctx.arc(-2, -2, 2, 0, TAU);
        ctx.fill();
      } else if (it.type === 'heart') {
        ctx.fillStyle = '#ff6b8f';
        ctx.beginPath();
        ctx.moveTo(0, 7);
        ctx.bezierCurveTo(-10, 0, -8, -9, -3.5, -6.5);
        ctx.bezierCurveTo(-1.5, -5.4, 0, -3.2, 0, -3.2);
        ctx.bezierCurveTo(0, -3.2, 1.5, -5.4, 3.5, -6.5);
        ctx.bezierCurveTo(8, -9, 10, 0, 0, 7);
        ctx.fill();
      } else if (it.type === 'triple') {
        ctx.strokeStyle = '#ffc247';
        ctx.lineWidth = 2.2;
        for (const o of [-4, 0, 4]) {
          ctx.beginPath();
          ctx.moveTo(-5 + o, 5);
          ctx.lineTo(3 + o, -6);
          ctx.stroke();
        }
      } else if (it.type === 'rapid') {
        ctx.fillStyle = '#6ef3ff';
        ctx.beginPath();
        ctx.moveTo(1, -7);
        ctx.lineTo(-6, 1);
        ctx.lineTo(-1, 1);
        ctx.lineTo(-2, 8);
        ctx.lineTo(6, -1);
        ctx.lineTo(1, -1);
        ctx.closePath();
        ctx.fill();
      } else if (it.type === 'shield') {
        ctx.fillStyle = 'rgba(143,227,255,0.25)';
        ctx.strokeStyle = '#8fe3ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -7);
        ctx.lineTo(6, -4);
        ctx.lineTo(6, 2);
        ctx.quadraticCurveTo(6, 6, 0, 8);
        ctx.quadraticCurveTo(-6, 6, -6, 2);
        ctx.lineTo(-6, -4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  drawRings(game) {
    const { ctx } = game;
    for (const r of game.rings) {
      const a = 1 - r.t / r.life;
      ctx.save();
      ctx.globalAlpha = a * 0.8;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * a;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawParticles(game) {
    const { ctx } = game;
    for (const p of game.particles) {
      const a = clamp(p.life / p.max, 0, 1);
      if (p.type === 'bubble') {
        ctx.globalAlpha = a * 0.5;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.stroke();
      } else {
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * a, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawTexts(game) {
    const { ctx } = game;
    for (const tx of game.texts) {
      const a = clamp(tx.life / tx.max, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = `800 ${tx.size}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,10,16,0.65)';
      ctx.strokeText(tx.text, tx.x, tx.y);
      ctx.fillStyle = tx.color;
      ctx.fillText(tx.text, tx.x, tx.y);
      ctx.restore();
    }
  }

  /* ================================================================== */
  /*  screen-space overlays                                              */
  /* ================================================================== */

  drawScreenFX(game) {
    const { ctx, w, h } = game;
    if (this.vignette) {
      ctx.fillStyle = this.vignette;
      ctx.fillRect(0, 0, w, h);
    }

    if (game.hurtFlash > 0) {
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.7);
      g.addColorStop(0, 'rgba(255,30,60,0)');
      g.addColorStop(1, `rgba(255,30,60,${0.42 * game.hurtFlash})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    if (game.state === 'playing' && game.player.hp / game.player.maxHp < 0.3) {
      const a = 0.08 + Math.sin(game.t * 5) * 0.04;
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.7);
      g.addColorStop(0, 'rgba(255,20,50,0)');
      g.addColorStop(1, `rgba(255,20,50,${Math.max(0.03, a)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    // Slow caustic shimmer on top of the scene.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.035;
    ctx.strokeStyle = '#bffcff';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      for (let x = 0; x <= w; x += 30) {
        const y = h * 0.15 + i * 48 + Math.sin(x * 0.009 + game.t * 0.5 + i * 1.7) * 12;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  drawReticle(game) {
    const { ctx, input, w, h, t } = game;
    if (input.touchMode) return;
    if (!input.mouse.active) return;
    const mx = input.mouse.x;
    const my = input.mouse.y;
    if (mx < 0 || my < 0 || mx > w || my > h) return;

    let hover = false;
    const viewX = game.camera.x;
    const viewY = game.camera.y;
    for (const e of game.enemies) {
      if (e.dead) continue;
      const ex = (e.x - viewX) * game.zoom;
      const ey = (e.y - viewY) * game.zoom;
      if (Math.hypot(ex - mx, ey - my) < e.radius * game.zoom + 14) { hover = true; break; }
    }

    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(t * 0.7);
    ctx.strokeStyle = hover ? C.pink : 'rgba(190,255,255,0.85)';
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, 13, i * (TAU / 4) + 0.25, i * (TAU / 4) + 1.05);
      ctx.stroke();
    }
    ctx.rotate(-t * 0.7);
    ctx.fillStyle = hover ? C.pink : C.cyan;
    ctx.beginPath();
    ctx.arc(0, 0, 1.8, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.5;
    for (const [dx, dy] of [[0, -20], [0, 20], [-20, 0], [20, 0]]) {
      ctx.beginPath();
      ctx.moveTo(dx * 0.75, dy * 0.75);
      ctx.lineTo(dx, dy);
      ctx.stroke();
    }
    ctx.restore();
  }
}
