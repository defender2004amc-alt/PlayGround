/* Shared constants, math helpers and tiny factories. */

export const TAU = Math.PI * 2;
export const WORLD = { w: 3000, h: 2100 };
export const FLOOR = WORLD.h - 150;
export const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';
export const DISPLAY = '"Arial Black", "Arial Bold", "Trebuchet MS", system-ui, sans-serif';

export const C = {
  cyan: '#6ef3ff',
  cyanSoft: '#a9fbff',
  amber: '#ffc247',
  orange: '#ff7a3d',
  pink: '#ff5d8f',
  green: '#69f0ae',
  violet: '#b98cff',
  white: '#f4ffff',
  deep: '#020a12',
};

export const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
export const rndi = (a, b) => Math.floor(rnd(a, b + 1));
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const mod = (n, m) => ((n % m) + m) % m;
export const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeIn = (t) => Math.pow(clamp(t, 0, 1), 3);

export function angleLerp(a, b, t) {
  const d = mod(b - a + Math.PI, TAU) - Math.PI;
  return a + d * t;
}

export function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function pointSegmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / l2;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export const ENEMY_DEFS = {
  chomper: { hp: 20, speed: 138, radius: 16, score: 10, contact: 8, color: '#ff7a4d', drop: 0.32 },
  puffer: { hp: 44, speed: 58, radius: 23, score: 25, contact: 10, color: '#ffd166', drop: 0.55 },
  jelly: { hp: 30, speed: 44, radius: 20, score: 15, contact: 12, color: '#c98cff', drop: 0.42 },
  shark: { hp: 85, speed: 150, radius: 33, score: 45, contact: 18, color: '#9fb3c8', drop: 0.85 },
  boss: { hp: 620, speed: 76, radius: 62, score: 500, contact: 26, color: '#b06bff', drop: 1 },
};

export const PICKUP_DEFS = {
  pearl: { color: '#eaffff', label: 'PEARL' },
  heart: { color: '#ff6b8f', label: 'HEAL' },
  triple: { color: '#ffc247', label: 'TRIPLE' },
  rapid: { color: '#6ef3ff', label: 'RAPID' },
  shield: { color: '#8fe3ff', label: 'SHIELD' },
};

export const WAVE_TAGS = [
  'THEY SMELL BLOOD',
  'KEEP SHOOTING',
  'THE REEF BITES BACK',
  'MORE TEETH INCOMING',
  'NO SUCH THING AS OVERFISHING',
  'SOMETHING BIG IS STIRRING',
  'HOLD THE LINE',
  'DEEPER WATERS',
];

export const MAG_SIZE = 12;
export const RELOAD_TIME = 1.05;
export const PLAYER_MAX_HP = 100;

export function makePlayer(x, y) {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    radius: 19,
    angle: 0,
    aimAngle: 0,
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP,
    invuln: 0,
    fireCd: 0,
    ammo: MAG_SIZE,
    reloading: 0,
    mag: MAG_SIZE,
    dashCd: 0,
    dashTime: 0,
    dashVX: 0,
    dashVY: 0,
    dashMax: 1.2,
    triple: 0,
    rapid: 0,
    shield: 0,
    recoil: 0,
    muzzle: 0,
    moving: false,
    dead: false,
    bubbleT: 0,
    hitT: 0,
  };
}

export function formatNumber(n) {
  return Math.round(n).toLocaleString('en-US');
}
