/**
 * Tiny procedural sound engine — no audio files needed.
 * Everything is synthesized with the Web Audio API on demand.
 */
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this.muted = false;
    try {
      this.muted = localStorage.getItem('reef-rampage-muted') === '1';
    } catch { /* storage may be unavailable */ }
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(this.ctx.destination);

    // Pre-render one second of white noise for percussive sounds.
    const length = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;
  }

  get available() {
    return !!(this.ctx && this.master);
  }

  setMuted(muted) {
    this.muted = muted;
    try { localStorage.setItem('reef-rampage-muted', muted ? '1' : '0'); } catch { /* ignore */ }
    if (this.master) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(muted ? 0 : 0.55, t, 0.03);
    }
  }

  toggleMuted() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  tone({ freq = 440, to = null, dur = 0.15, type = 'sine', vol = 0.1, delay = 0, attack = 0.004 }) {
    if (!this.available) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  noise({ dur = 0.2, vol = 0.1, filter = 1200, type = 'lowpass', delay = 0, q = 1, sweepTo = null }) {
    if (!this.available) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const biquad = this.ctx.createBiquadFilter();
    biquad.type = type;
    biquad.frequency.setValueAtTime(filter, t0);
    biquad.Q.value = q;
    if (sweepTo) biquad.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(biquad).connect(gain).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.03);
  }

  /* ---------------- game sounds ---------------- */
  shoot() {
    this.tone({ freq: 620, to: 150, dur: 0.09, type: 'square', vol: 0.045 });
    this.noise({ dur: 0.06, vol: 0.05, filter: 3200, type: 'highpass' });
  }

  dryFire() {
    this.noise({ dur: 0.035, vol: 0.05, filter: 2200, type: 'bandpass', q: 2 });
  }

  reload() {
    this.noise({ dur: 0.035, vol: 0.055, filter: 1400, type: 'bandpass', q: 2 });
    this.tone({ freq: 330, to: 220, dur: 0.05, type: 'square', vol: 0.025, delay: 0.06 });
    this.noise({ dur: 0.045, vol: 0.06, filter: 1800, type: 'bandpass', q: 2, delay: 0.62 });
    this.tone({ freq: 180, to: 420, dur: 0.08, type: 'sine', vol: 0.05, delay: 0.64 });
  }

  hit() {
    this.tone({ freq: 780, to: 260, dur: 0.07, type: 'triangle', vol: 0.055 });
  }

  explosion(big = false) {
    this.noise({ dur: big ? 0.65 : 0.3, vol: big ? 0.23 : 0.12, filter: big ? 1100 : 1500, sweepTo: 120, type: 'lowpass' });
    this.tone({ freq: big ? 130 : 200, to: 40, dur: big ? 0.5 : 0.25, type: 'sine', vol: big ? 0.18 : 0.07 });
    if (big) this.tone({ freq: 90, to: 28, dur: 0.8, type: 'sawtooth', vol: 0.06, delay: 0.05 });
  }

  hurt() {
    this.tone({ freq: 220, to: 70, dur: 0.28, type: 'sawtooth', vol: 0.12 });
    this.noise({ dur: 0.18, vol: 0.08, filter: 700, type: 'lowpass' });
  }

  shieldBreak() {
    this.tone({ freq: 1200, to: 300, dur: 0.22, type: 'triangle', vol: 0.1 });
    this.noise({ dur: 0.3, vol: 0.1, filter: 5000, type: 'highpass' });
  }

  pickup(step = 0) {
    const base = 660 * Math.pow(1.12, Math.min(step, 6));
    this.tone({ freq: base, to: base, dur: 0.08, type: 'sine', vol: 0.09 });
    this.tone({ freq: base * 1.5, to: base * 1.5, dur: 0.1, type: 'sine', vol: 0.07, delay: 0.07 });
  }

  powerup() {
    [523, 659, 784, 1046].forEach((f, i) => {
      this.tone({ freq: f, dur: 0.13, type: 'triangle', vol: 0.07, delay: i * 0.055 });
    });
  }

  dash() {
    this.noise({ dur: 0.22, vol: 0.11, filter: 500, sweepTo: 3800, type: 'bandpass', q: 1.4 });
    this.tone({ freq: 160, to: 600, dur: 0.16, type: 'sine', vol: 0.05 });
  }

  waveStart() {
    [196, 262, 330, 392].forEach((f, i) => {
      this.tone({ freq: f, dur: 0.55, type: 'sawtooth', vol: 0.05, delay: i * 0.11, attack: 0.03 });
    });
  }

  waveClear() {
    [523, 659, 784, 1046, 1318].forEach((f, i) => {
      this.tone({ freq: f, dur: 0.28, type: 'triangle', vol: 0.06, delay: i * 0.08 });
    });
  }

  bossRoar() {
    this.tone({ freq: 70, to: 40, dur: 1.1, type: 'sawtooth', vol: 0.13, attack: 0.05 });
    this.noise({ dur: 1.0, vol: 0.1, filter: 300, type: 'lowpass', sweepTo: 90 });
  }

  enemyShoot() {
    this.tone({ freq: 300, to: 120, dur: 0.12, type: 'triangle', vol: 0.04 });
  }

  bubble() {
    const f = 500 + Math.random() * 700;
    this.tone({ freq: f, to: f * 1.6, dur: 0.06, type: 'sine', vol: 0.018 });
  }
}
