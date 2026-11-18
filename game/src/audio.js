// Every sound in Meridian Heat is synthesised with WebAudio — no audio files, no
// network. The engine is a filtered sawtooth whose pitch follows speed; the siren is
// two alternating tones; shots, pickups and jingles are short oscillator/noise bursts.

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
    this.sirenHigh = false;
    this.muted = false;
    this.noiseBuffer = null;
  }

  /** Create the context on a user gesture (browsers block audio before one). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      // One second of white noise, reused by every percussive sound.
      const len = this.ctx.sampleRate;
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      // Engine: sawtooth through a low-pass, always running once unlocked.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 420;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
      // Siren: a square wave that flips between two notes.
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'square';
      this.sirenOsc.frequency.value = 720;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
    } catch {
      this.ctx = null;
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  /** Engine hum: speed01 is 0..1 of top speed, throttle 0..1. */
  setEngine(speed01, throttle) {
    if (!this.ctx || !this.engineOsc) return;
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(55 + speed01 * 165 + throttle * 30, t, 0.08);
    this.engineGain.gain.setTargetAtTime(0.02 + throttle * 0.05 + speed01 * 0.03, t, 0.1);
    this.engineFilter.frequency.setTargetAtTime(320 + speed01 * 900, t, 0.1);
  }

  /** Siren loudness by the nearest police car's distance in metres (Infinity = none). */
  setSiren(distance) {
    if (!this.ctx || !this.sirenOsc) return;
    const t = this.ctx.currentTime;
    const gain = distance === Infinity ? 0 : Math.max(0, 0.05 - distance * 0.0009);
    this.sirenGain.gain.setTargetAtTime(gain, t, 0.2);
  }

  /** Flip the siren note; called on a timer by the game loop. */
  stepSiren(dt) {
    if (!this.ctx || !this.sirenOsc) return;
    this.sirenTimer += dt;
    if (this.sirenTimer < 0.38) return;
    this.sirenTimer = 0;
    this.sirenHigh = !this.sirenHigh;
    this.sirenOsc.frequency.setTargetAtTime(this.sirenHigh ? 960 : 720, this.ctx.currentTime, 0.03);
  }

  gunshot() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2400;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t, Math.random() * 0.5, 0.16);
  }

  crash(strength) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.18);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.35 * Math.min(1, strength), t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.25);
  }

  pickup() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [880, 1318].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t + i * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.22, t + i * 0.09 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.22);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t + i * 0.09);
      osc.stop(t + i * 0.09 + 0.25);
    });
  }

  jingle() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [523, 659, 784, 1046].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t + i * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.25, t + i * 0.11 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.11 + 0.3);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t + i * 0.11);
      osc.stop(t + i * 0.11 + 0.32);
    });
  }
}
