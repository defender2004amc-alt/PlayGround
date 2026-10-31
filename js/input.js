const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function readSafeInsets() {
  const probe = document.getElementById('safe-probe');
  if (!probe) return { top: 0, right: 0, bottom: 0, left: 0 };
  const cs = getComputedStyle(probe);
  return {
    top: parseFloat(cs.paddingTop) || 0,
    right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
    left: parseFloat(cs.paddingLeft) || 0,
  };
}

/**
 * Unified keyboard / mouse / dual-thumb-touch input.
 * Left half of a touch screen = swim stick, right half = aim + auto-fire stick.
 */
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { x: 0, y: 0, down: false, active: false, inside: false };
    this.touchMode = window.matchMedia('(pointer: coarse)').matches;
    this.move = this._emptyStick();
    this.aim = this._emptyStick();
    this.dashRequested = false;
    this.dashPointer = null;
    this.dashButton = { x: 0, y: 0, r: 36 };
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.safe = { top: 0, right: 0, bottom: 0, left: 0 };
    this.dashPulse = 0;
    this.enabled = true;
    this._lastTap = { time: 0, x: 0, y: 0 };

    this._bind();
  }

  _emptyStick() {
    return { active: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0, mag: 0 };
  }

  setViewport(w, h, safe) {
    this.w = w;
    this.h = h;
    this.safe = safe;
    this.dashButton.x = w - safe.right - 58;
    this.dashButton.y = h - safe.bottom - 84;
    this.dashButton.r = Math.min(38, Math.max(30, w * 0.085));
  }

  _bind() {
    const c = this.canvas;

    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => this.releaseAll());

    c.addEventListener('contextmenu', (e) => e.preventDefault());

    c.addEventListener('pointerdown', (e) => {
      this._onDown(e);
    });
    c.addEventListener('pointermove', (e) => {
      this._onMove(e);
    });
    const up = (e) => this._onUp(e);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);

    // Mouse aim is also useful on touch laptops.
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') {
        this.mouse.x = e.clientX;
        this.mouse.y = e.clientY;
        this.mouse.inside = true;
        this.mouse.active = true;
      }
    });
  }

  _onDown(e) {
    if (!this.enabled) return;
    if (e.pointerType === 'mouse') {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.inside = true;
      this.mouse.active = true;
      if (e.button === 0) this.mouse.down = true;
      if (e.button === 2) this.dashRequested = true;
      return;
    }

    this.touchMode = true;
    const x = e.clientX;
    const y = e.clientY;

    // Dash button wins over anything underneath it.
    if (Math.hypot(x - this.dashButton.x, y - this.dashButton.y) < this.dashButton.r * 1.3) {
      this.dashRequested = true;
      this.dashPointer = e.pointerId;
      this.dashPulse = 1;
      return;
    }

    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }

    if (x < this.w * 0.5) {
      if (!this.move.active) {
        const now = performance.now();
        if (now - this._lastTap.time < 260 && Math.hypot(x - this._lastTap.x, y - this._lastTap.y) < 70) {
          this.dashRequested = true;
          this.dashPulse = 1;
        }
        this._lastTap = { time: now, x, y };
        this.move = { active: true, id: e.pointerId, ox: x, oy: y, dx: 0, dy: 0, mag: 0 };
      }
    } else if (!this.aim.active) {
      this.aim = { active: true, id: e.pointerId, ox: x, oy: y, dx: 0, dy: 0, mag: 0 };
    }
  }

  _onMove(e) {
    if (e.pointerType === 'mouse') {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.inside = true;
      this.mouse.active = true;
      return;
    }
    if (this.move.active && this.move.id === e.pointerId) {
      this._updateStick(this.move, e.clientX, e.clientY, 62);
    } else if (this.aim.active && this.aim.id === e.pointerId) {
      this._updateStick(this.aim, e.clientX, e.clientY, 56);
    }
  }

  _updateStick(stick, x, y, radius) {
    let dx = x - stick.ox;
    let dy = y - stick.oy;
    const d = Math.hypot(dx, dy);
    if (d > radius) {
      // Let the stick origin trail the thumb so long swipes stay comfortable.
      stick.ox += dx * (1 - radius / d);
      stick.oy += dy * (1 - radius / d);
      dx = x - stick.ox;
      dy = y - stick.oy;
    }
    stick.dx = dx;
    stick.dy = dy;
    stick.mag = clamp(Math.hypot(dx, dy) / radius, 0, 1);
  }

  _onUp(e) {
    if (e.pointerType === 'mouse') {
      if (e.button === 0) this.mouse.down = false;
      return;
    }
    if (this.dashPointer === e.pointerId) this.dashPointer = null;
    if (this.move.active && this.move.id === e.pointerId) this.move = this._emptyStick();
    if (this.aim.active && this.aim.id === e.pointerId) this.aim = this._emptyStick();
  }

  releaseAll() {
    this.keys.clear();
    this.mouse.down = false;
    this.move = this._emptyStick();
    this.aim = this._emptyStick();
    this.dashRequested = false;
    this.dashPointer = null;
  }

  /** Reset transient one-shot inputs, e.g. when pausing or starting a run. */
  clearTransient() {
    this.pressed.clear();
    this.dashRequested = false;
    this.mouse.down = false;
    this.move = this._emptyStick();
    this.aim = this._emptyStick();
  }

  isDown(code) {
    return this.keys.has(code);
  }

  consumePress(code) {
    if (this.pressed.has(code)) {
      this.pressed.delete(code);
      return true;
    }
    return false;
  }

  moveVector() {
    let x = 0;
    let y = 0;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft')) x -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) x += 1;
    if (this.isDown('KeyW') || this.isDown('ArrowUp')) y -= 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown')) y += 1;

    if (this.move.active && this.move.mag > 0.12) {
      const len = Math.hypot(this.move.dx, this.move.dy) || 1;
      const strength = Math.min(1, this.move.mag * 1.25);
      x += (this.move.dx / len) * strength;
      y += (this.move.dy / len) * strength;
    }

    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y, len: Math.min(1, len) };
  }

  aimVector() {
    if (this.aim.active && this.aim.mag > 0.16) {
      const len = Math.hypot(this.aim.dx, this.aim.dy) || 1;
      return { x: this.aim.dx / len, y: this.aim.dy / len, active: true };
    }
    return { x: 0, y: 0, active: false };
  }

  shooting() {
    if (!this.enabled) return false;
    return this.mouse.down || this.isDown('Space') || (this.aim.active && this.aim.mag > 0.22);
  }

  takeDash() {
    if (this.dashRequested) {
      this.dashRequested = false;
      return true;
    }
    return false;
  }
}
