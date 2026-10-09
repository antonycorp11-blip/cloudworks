// Procedural Web Audio sound effects (no asset files). Each SfxName maps to a synth recipe;
// recipes can later be replaced by samples without touching the game code.
import type { SfxName } from '../sim/events';

type Recipe = (a: AudioSys, t: number) => void;

export class AudioSys {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  enabled = true;
  private noiseBuf: AudioBuffer | null = null;
  private rain: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private last = new Map<string, number>();

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? 0.5 : 0;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setEnabled(v: boolean) {
    this.enabled = v;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v ? 0.5 : 0, this.ctx.currentTime, 0.05);
  }

  tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.15, slide = 0, delay = 0) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(dur: number, vol: number, freq: number, q = 1, type: BiquadFilterType = 'bandpass', delay = 0) {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  play(name: SfxName) {
    if (!this.ctx || !this.enabled) return;
    const now = performance.now();
    if ((this.last.get(name) ?? 0) > now - 70) return; // de-duplicate bursts
    this.last.set(name, now);
    RECIPES[name]?.(this, now);
  }

  /** Thunder: distance 0..1 delays and muffles it */
  thunder(dist: number, big: boolean) {
    if (!this.ctx || !this.enabled) return;
    const delay = 0.15 + dist * 1.6;
    const f = 900 - dist * 600;
    this.noise(big ? 2.6 : 1.6, (big ? 0.7 : 0.45) * (1 - dist * 0.5), f, 0.7, 'lowpass', delay);
    this.noise(0.25, 0.5 * (1 - dist), 2500, 0.5, 'lowpass', delay * 0.6);
    this.tone(45, big ? 2 : 1.2, 'sine', 0.25 * (1 - dist * 0.6), -10, delay);
  }

  private wind: GainNode | null = null;
  /** Low howling wind bed — always there, louder in storms */
  setAmbience(storm: number) {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    if (!this.wind) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf; src.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 380; f.Q.value = 0.8;
      const lfo = this.ctx.createOscillator(); const lg = this.ctx.createGain();
      lfo.frequency.value = 0.13; lg.gain.value = 160;
      lfo.connect(lg).connect(f.frequency); lfo.start();
      this.wind = this.ctx.createGain(); this.wind.gain.value = 0;
      src.connect(f).connect(this.wind).connect(this.master);
      src.start();
    }
    this.wind.gain.setTargetAtTime(0.035 + storm * 0.09, this.ctx.currentTime, 1);
  }

  /** Continuous rain bed, 0..1 */
  setRain(level: number) {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    if (!this.rain) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = 'highpass'; f.frequency.value = 1800;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      src.connect(f).connect(gain).connect(this.master);
      src.start();
      this.rain = { src, gain };
    }
    this.rain.gain.gain.setTargetAtTime(level * 0.12, this.ctx.currentTime, 0.4);
  }
}

const RECIPES: Partial<Record<SfxName, Recipe>> = {
  click: a => a.tone(660, 0.05, 'square', 0.06),
  bucket: a => { a.noise(0.25, 0.25, 900, 2); a.tone(300, 0.1, 'triangle', 0.08, 200); },
  pour: a => { a.noise(0.5, 0.3, 700, 1.5); a.noise(0.35, 0.15, 1400, 3, 'bandpass', 0.1); },
  stoke: a => { a.noise(0.4, 0.35, 300, 0.8, 'lowpass'); a.tone(90, 0.3, 'sawtooth', 0.06, -30); },
  buy: a => { a.tone(523, 0.08, 'square', 0.08); a.tone(784, 0.12, 'square', 0.08, 0, 0.07); },
  upgrade: a => { a.tone(440, 0.08, 'triangle', 0.12); a.tone(660, 0.08, 'triangle', 0.12, 0, 0.07); a.tone(880, 0.16, 'triangle', 0.12, 0, 0.14); },
  build: a => { a.noise(0.12, 0.3, 200, 1, 'lowpass'); a.tone(140, 0.1, 'square', 0.08, -40); a.tone(180, 0.08, 'square', 0.06, 0, 0.09); },
  sell: a => { a.tone(500, 0.08, 'square', 0.07, -200); a.tone(300, 0.1, 'square', 0.06, 0, 0.07); },
  pipe: a => { a.tone(220, 0.06, 'square', 0.07); a.noise(0.08, 0.2, 2500, 4); },
  error: a => a.tone(140, 0.18, 'sawtooth', 0.08, -40),
  merge: a => { a.noise(0.6, 0.12, 400, 0.7, 'lowpass'); a.tone(180, 0.5, 'sine', 0.08, 60); },
  split: a => { a.tone(900, 0.12, 'sine', 0.06, 500); a.noise(0.2, 0.15, 3000, 3); },
  firstDrops: a => { for (let i = 0; i < 6; i++) a.tone(1200 + Math.random() * 800, 0.05, 'sine', 0.06, -400, i * 0.09); },
  milestone: a => { [523, 659, 784, 1047].forEach((f, i) => a.tone(f, 0.15, 'triangle', 0.1, 0, i * 0.08)); },
  whoosh: a => { a.noise(0.45, 0.35, 700, 0.6, 'bandpass'); a.noise(0.3, 0.2, 1600, 1, 'bandpass', 0.05); },
  grab: a => a.noise(0.18, 0.15, 500, 1, 'lowpass'),
  bellows: a => { a.noise(0.22, 0.28, 240, 0.7, 'lowpass'); a.noise(0.12, 0.1, 1200, 2, 'bandpass', 0.05); },
  coin: a => { a.tone(1318, 0.06, 'square', 0.05); a.tone(1760, 0.09, 'square', 0.05, 0, 0.05); },
  mission: a => { [392, 494, 587, 784].forEach((f, i) => a.tone(f, 0.14, 'square', 0.07, 0, i * 0.07)); },
  grumble: a => { a.tone(70 + Math.random() * 20, 0.5, 'sawtooth', 0.09, -20); a.tone(55, 0.6, 'square', 0.05, 15, 0.08); a.noise(0.5, 0.12, 160, 1, 'lowpass'); },
  roar: a => { a.tone(90, 1.4, 'sawtooth', 0.18, -50); a.tone(60, 1.6, 'square', 0.1, -20, 0.1); a.noise(1.4, 0.4, 300, 0.6, 'lowpass'); },
  win: a => { [392, 523, 659, 784, 1047, 1319].forEach((f, i) => a.tone(f, 0.3, 'triangle', 0.12, 0, i * 0.12)); },
};
