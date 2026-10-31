import {
  TAU, C, FONT, DISPLAY, clamp, lerp, easeOut, roundRect, formatNumber,
} from './core.js';

function glass(ctx, x, y, w, h, r = 12, tint = 0.52) {
  ctx.save();
  ctx.fillStyle = `rgba(3,17,26,${tint})`;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.strokeStyle = 'rgba(110,243,255,0.16)';
  ctx.lineWidth = 1;
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r);
  ctx.stroke();
  ctx.restore();
}

function label(ctx, text, x, y, size, color, weight = 700, align = 'left') {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}


function drawHealthPanel(ctx, game, x, y, w, h, scale) {
  const { player } = game;
  glass(ctx, x, y, w, h, 14);

  const hpFrac = clamp(player.hp / player.maxHp, 0, 1);
  label(ctx, 'HEALTH', x + 12 * scale, y + 16 * scale, 8.5 * scale, 'rgba(180,225,232,0.8)', 800);
  label(ctx, `${Math.ceil(player.hp)}`, x + w - 12 * scale, y + 17 * scale, 10 * scale, hpFrac < 0.3 ? C.pink : '#dffeff', 800, 'right');

  const barX = x + 12 * scale;
  const barY = y + 23 * scale;
  const barW = w - 24 * scale;
  const barH = 9 * scale;
  ctx.fillStyle = 'rgba(0,8,12,0.7)';
  roundRect(ctx, barX, barY, barW, barH, barH / 2);
  ctx.fill();
  const hpColor = hpFrac > 0.55 ? C.green : hpFrac > 0.28 ? C.amber : C.pink;
  const hg = ctx.createLinearGradient(barX, 0, barX + barW, 0);
  hg.addColorStop(0, hpFrac > 0.55 ? '#37d9a0' : hpFrac > 0.28 ? '#ffb340' : '#ff4d72');
  hg.addColorStop(1, hpColor);
  ctx.fillStyle = hg;
  if (hpFrac > 0) {
    roundRect(ctx, barX + 1, barY + 1, Math.max(2, (barW - 2) * hpFrac), barH - 2, (barH - 2) / 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(200,255,255,0.13)';
  ctx.lineWidth = 1;
  roundRect(ctx, barX, barY, barW, barH, barH / 2);
  ctx.stroke();

  const ammoY = y + 48 * scale;
  const pipW = Math.min(8 * scale, (barW - 11 * 3) / 12);
  const gap = 3 * scale;
  label(ctx, 'HARPOON', barX, ammoY + 7 * scale, 7 * scale, 'rgba(180,225,232,0.6)', 800);
  const pipsX = barX + 47 * scale;
  if (player.reloading > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    roundRect(ctx, pipsX, ammoY, barW - 47 * scale, 7 * scale, 3.5);
    ctx.fill();
    ctx.fillStyle = C.amber;
    const frac = 1 - player.reloading / 1.05;
    roundRect(ctx, pipsX, ammoY, Math.max(2, (barW - 47 * scale) * frac), 7 * scale, 3.5);
    ctx.fill();
    label(ctx, 'RELOAD', x + w, ammoY + 7 * scale, 7 * scale, C.amber, 800, 'right');
  } else {
    for (let i = 0; i < player.mag; i++) {
      const on = i < player.ammo;
      ctx.fillStyle = on ? C.amber : 'rgba(255,255,255,0.13)';
      roundRect(ctx, pipsX + i * (pipW + gap), ammoY, pipW, 7 * scale, 2);
      ctx.fill();
    }
  }
}

export function drawHUD(game) {
  const { ctx, w, h, safe, player, t } = game;
  if (!player) return;

  const narrow = w < 720;
  const scale = w < 430 ? 0.86 : 1;
  const left = safe.left + 16;
  const top = safe.top + 16;
  const panelW = 188 * scale;
  const panelH = 68 * scale;
  const touch = game.input.touchMode;
  const hpW = Math.min(250 * scale, w - safe.left - safe.right - 32);
  const hpH = 68 * scale;
  const hpX = left;
  const hpY = touch ? top + panelH + 8 : h - safe.bottom - 16 - hpH;

  /* ---------------- score / wave ---------------- */
  glass(ctx, left, top, panelW, panelH, 14);
  ctx.save();
  ctx.strokeStyle = 'rgba(255,194,71,0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(left + 12 * scale, top + 12 * scale);
  ctx.lineTo(left + 12 * scale, top + panelH - 12 * scale);
  ctx.stroke();
  ctx.restore();

  label(ctx, `WAVE ${String(Math.max(1, game.wave)).padStart(2, '0')}`, left + 22 * scale, top + 20 * scale, 9.5 * scale, C.cyan, 800);
  const scoreText = formatNumber(game.score);
  ctx.font = `900 ${24 * scale}px ${DISPLAY}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = C.white;
  ctx.shadowColor = 'rgba(110,243,255,0.35)';
  ctx.shadowBlur = 12;
  ctx.fillText(scoreText, left + 20 * scale, top + 50 * scale);
  ctx.shadowBlur = 0;
  label(ctx, 'PTS', left + 22 * scale + ctx.measureText(scoreText).width + 5 * scale, top + 50 * scale, 8.5 * scale, 'rgba(143,185,196,0.75)', 700);

  if (touch) drawHealthPanel(ctx, game, hpX, hpY, hpW, hpH, scale);

  /* ---------------- combo ---------------- */
  let stackY = touch ? hpY + hpH + 9 : top + panelH + 9;
  const hasBoss = !!game.boss;
  let bossH = 0;

  if (game.combo > 1) {
    const mult = game.comboMult();
    const cw = 150 * scale;
    const ch = 30 * scale;
    glass(ctx, left, stackY, cw, ch, 9, 0.42);
    ctx.font = `900 ${17 * scale}px ${DISPLAY}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = C.amber;
    ctx.fillText(`${mult.toFixed(1)}×`, left + 10 * scale, stackY + 21 * scale);
    label(ctx, `${game.combo} COMBO`, left + 52 * scale, stackY + 19 * scale, 9 * scale, '#d9fbff', 800);
    const frac = clamp(game.comboTimer / 3.4, 0, 1);
    ctx.fillStyle = 'rgba(255,194,71,0.18)';
    roundRect(ctx, left + 8 * scale, stackY + ch - 5 * scale, cw - 16 * scale, 2.5 * scale, 2);
    ctx.fill();
    ctx.fillStyle = C.amber;
    roundRect(ctx, left + 8 * scale, stackY + ch - 5 * scale, (cw - 16 * scale) * frac, 2.5 * scale, 2);
    ctx.fill();
    stackY += ch + 7;
  }

  /* ---------------- boss bar ---------------- */
  if (hasBoss) {
    const bw = narrow ? w - left - safe.right - 16 : Math.min(440, w * 0.42);
    const bx = narrow ? left : (w - bw) / 2;
    const by = narrow ? (touch ? stackY : top + panelH + 10) : safe.top + 16;
    bossH = 34 * scale;
    const frac = clamp(game.boss.hp / game.boss.maxHp, 0, 1);
    ctx.font = `900 ${11 * scale}px ${DISPLAY}`;
    ctx.textAlign = narrow ? 'left' : 'center';
    ctx.fillStyle = '#e3c9ff';
    ctx.shadowColor = 'rgba(177,110,255,0.6)';
    ctx.shadowBlur = 10;
    ctx.fillText('ANGLERFISH', narrow ? bx + 2 : w / 2, by + 10 * scale);
    ctx.shadowBlur = 0;
    if (narrow) {
      ctx.textAlign = 'right';
      label(ctx, `${Math.ceil(frac * 100)}%`, bx + bw, by + 10 * scale, 9 * scale, 'rgba(227,201,255,0.75)', 700);
    }
    const barY = by + 16 * scale;
    const barH = 10 * scale;
    ctx.fillStyle = 'rgba(5,10,20,0.72)';
    roundRect(ctx, bx, barY, bw, barH, barH / 2);
    ctx.fill();
    const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    g.addColorStop(0, '#7b3fff');
    g.addColorStop(0.55, '#c06bff');
    g.addColorStop(1, '#ff5d8f');
    ctx.fillStyle = g;
    if (frac > 0) {
      roundRect(ctx, bx + 1, barY + 1, Math.max(3, (bw - 2) * frac), barH - 2, (barH - 2) / 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(200,150,255,0.4)';
    ctx.lineWidth = 1;
    roundRect(ctx, bx, barY, bw, barH, barH / 2);
    ctx.stroke();
    if (narrow) stackY = Math.max(stackY, by + bossH + 6);
  }

  /* ---------------- power-ups ---------------- */
  const power = [
    ['3×', player.triple, C.amber, 10],
    ['RPD', player.rapid, C.cyan, 10],
    ['SHD', player.shield, C.cyanSoft, 12],
  ].filter((p) => p[1] > 0);
  if (power.length) {
    let px = left;
    const py = stackY;
    for (const [name, timer, color, max] of power) {
      const pw = 58 * scale;
      const ph = 23 * scale;
      glass(ctx, px, py, pw, ph, 7, 0.48);
      label(ctx, name, px + 7 * scale, py + 15 * scale, 8 * scale, color, 900);
      label(ctx, `${timer.toFixed(1)}s`, px + pw - 6 * scale, py + 15 * scale, 7.5 * scale, 'rgba(230,255,255,0.8)', 700, 'right');
      ctx.fillStyle = `${color}44`;
      ctx.fillRect(px + 6 * scale, py + ph - 4 * scale, pw - 12 * scale, 2);
      ctx.fillStyle = color;
      ctx.fillRect(px + 6 * scale, py + ph - 4 * scale, (pw - 12 * scale) * clamp(timer / max, 0, 1), 2);
      px += pw + 6 * scale;
    }
  }

  /* ---------------- health / ammo (desktop) ---------------- */
  if (!touch) drawHealthPanel(ctx, game, hpX, hpY, hpW, hpH, scale);

  /* ---------------- dash cooldown ring (desktop) ---------------- */
  if (!game.input.touchMode) {
    const cx = w - safe.right - 66;
    const cy = h - safe.bottom - 76;
    const ready = player.dashCd <= 0;
    ctx.save();
    ctx.globalAlpha = ready ? 0.85 : 0.45;
    ctx.strokeStyle = ready ? C.cyan : 'rgba(143,185,196,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, TAU);
    ctx.stroke();
    if (!ready) {
      ctx.strokeStyle = C.amber;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, 22, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - player.dashCd / player.dashMax));
      ctx.stroke();
    }
    ctx.fillStyle = ready ? C.cyan : 'rgba(143,185,196,0.7)';
    ctx.font = `900 16px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('»', cx, cy - 1);
    ctx.font = `800 7px ${FONT}`;
    ctx.fillStyle = 'rgba(180,225,232,0.7)';
    ctx.fillText('SHIFT', cx, cy + 34);
    ctx.restore();
  }

  /* ---------------- off-screen danger markers ---------------- */
  if (game.state === 'playing') {
    for (const e of game.enemies) {
      if (e.dead || e.type === 'chomper' || e.type === 'jelly') continue;
      const sx = (e.x - game.camera.x) * game.zoom;
      const sy = (e.y - game.camera.y) * game.zoom;
      if (sx > -30 && sx < w + 30 && sy > -30 && sy < h + 30) continue;
      const dx = sx - w / 2;
      const dy = sy - h / 2;
      const pad = 34;
      let tt = Infinity;
      if (dx > 0) tt = Math.min(tt, (w - pad - w / 2) / dx);
      if (dx < 0) tt = Math.min(tt, (pad - w / 2) / dx);
      if (dy > 0) tt = Math.min(tt, (h - pad - h / 2) / dy);
      if (dy < 0) tt = Math.min(tt, (pad - h / 2) / dy);
      if (!isFinite(tt)) continue;
      const ex = w / 2 + dx * tt;
      const ey = h / 2 + dy * tt;
      const ang = Math.atan2(dy, dx);
      const boss = e.type === 'boss';
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(ang);
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = boss ? C.violet : C.pink;
      ctx.beginPath();
      ctx.moveTo(boss ? 14 : 9, 0);
      ctx.lineTo(boss ? -5 : -4, boss ? -8 : -5);
      ctx.lineTo(boss ? -5 : -4, boss ? 8 : 5);
      ctx.closePath();
      ctx.fill();
      if (boss) {
        ctx.rotate(-ang);
        ctx.font = `900 9px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#e3c9ff';
        ctx.fillText('BOSS', 0, -14);
      }
      ctx.restore();
    }
  }

  /* ---------------- wave banner ---------------- */
  const b = game.banner;
  if (b) {
    const inA = clamp(b.t / 0.22, 0, 1);
    const outA = clamp((b.dur - b.t) / 0.4, 0, 1);
    const a = Math.min(inA, outA);
    const pop = 1 + (1 - easeOut(inA)) * 0.12;
    const cy = h * 0.28;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(w / 2, cy);
    ctx.scale(pop, pop);
    const lineW = Math.min(w * 0.42, 210);
    ctx.strokeStyle = `${b.color}88`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-lineW - 20, 0);
    ctx.lineTo(-24, 0);
    ctx.moveTo(24, 0);
    ctx.lineTo(lineW + 20, 0);
    ctx.stroke();
    ctx.fillStyle = b.color;
    ctx.save();
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-3, -3, 6, 6);
    ctx.restore();

    const size = Math.min(54, w * 0.1);
    ctx.font = `900 ${size}px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = Math.max(2, size * 0.06);
    ctx.strokeStyle = 'rgba(0,8,14,0.7)';
    ctx.strokeText(b.title, 0, 0);
    ctx.fillStyle = b.color;
    ctx.shadowColor = b.color;
    ctx.shadowBlur = 22;
    ctx.fillText(b.title, 0, 0);
    ctx.shadowBlur = 0;
    ctx.font = `800 ${Math.max(9, 10.5)}px ${FONT}`;
    ctx.fillStyle = 'rgba(226,252,255,0.8)';
    ctx.fillText(b.sub, 0, size * 0.62 + 8);
    ctx.restore();
  }
}

export function drawTouchControls(game) {
  const { ctx, input, w, h, safe, player } = game;
  if (!input.touchMode) return;

  // Aim guide for the right thumb.
  if (input.aim.active && input.aim.mag > 0.16) {
    const len = Math.hypot(input.aim.dx, input.aim.dy) || 1;
    const dx = input.aim.dx / len;
    const dy = input.aim.dy / len;
    const px = (player.x - game.camera.x) * game.zoom;
    const py = (player.y - game.camera.y) * game.zoom;
    ctx.save();
    ctx.strokeStyle = 'rgba(110,243,255,0.22)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 8]);
    ctx.beginPath();
    ctx.moveTo(px + dx * 40, py + dy * 40);
    ctx.lineTo(px + dx * 150, py + dy * 150);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(190,255,255,0.55)';
    ctx.beginPath();
    ctx.arc(px + dx * 155, py + dy * 155, 7, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  for (const stick of [input.move, input.aim]) {
    if (!stick.active) continue;
    const isAim = stick === input.aim;
    const color = isAim ? C.amber : C.cyan;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(stick.ox, stick.oy, isAim ? 56 : 62, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(stick.ox, stick.oy, isAim ? 56 : 62, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(stick.ox + stick.dx, stick.oy + stick.dy, isAim ? 20 : 23, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#02131c';
    ctx.beginPath();
    ctx.arc(stick.ox + stick.dx, stick.oy + stick.dy, isAim ? 14 : 16, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // Dash button.
  const b = input.dashButton;
  const ready = player.dashCd <= 0;
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.globalAlpha = ready ? 0.9 : 0.5;
  ctx.fillStyle = 'rgba(4,20,30,0.58)';
  ctx.beginPath();
  ctx.arc(0, 0, b.r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = ready ? C.cyan : 'rgba(143,185,196,0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, b.r, 0, TAU);
  ctx.stroke();
  if (!ready) {
    ctx.strokeStyle = C.amber;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, b.r + 2, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - player.dashCd / player.dashMax));
    ctx.stroke();
  }
  ctx.fillStyle = ready ? C.cyan : 'rgba(180,225,232,0.6)';
  ctx.font = `900 ${b.r * 0.62}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('»', 0, -b.r * 0.08);
  ctx.font = `800 ${b.r * 0.23}px ${FONT}`;
  ctx.fillStyle = ready ? 'rgba(220,255,255,0.8)' : 'rgba(180,225,232,0.5)';
  ctx.fillText('DASH', 0, b.r * 0.44);
  ctx.restore();


}
