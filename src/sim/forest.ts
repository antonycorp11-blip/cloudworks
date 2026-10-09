// The land to reforest: a strip of cells across the target region. Rain wets the soil, seeds
// that fall with the rain germinate in wet soil, plants grow grass → bush → tree and, once mature,
// spread seeds by themselves. When the whole strip breathes, the Ancient rises from it.
import type { BiomeDef } from '../data/biomes';
import { clamp, rng, smoothstep } from './util';

export const CELL = 50;
export const ZONES = 5;
/** life levels: 1 = grass, 2 = bush, 3 = tree */
export const MAX_LIFE = 3;

export interface ForestSave { moist: number[]; life: number[]; seeds: number[] }

export class Forest {
  readonly x0: number;
  readonly x1: number;
  readonly n: number;
  moist: Float32Array;
  life: Float32Array;
  seeds: Float32Array;
  /** cell holding the Semente-Mãe */
  readonly heart: number;
  /** soil drying multiplier (the Véu thickening, the Ancient drinking) */
  dryMul = 1;
  perks = { germ: 0, pollen: 0 };
  stats = { seedsLanded: 0, seedsDied: 0 };
  /** a cell reached a new level (1 grass, 2 bush, 3 tree) */
  onTier: ((i: number, tier: number) => void) | null = null;
  private r = rng(11);

  constructor(public biome: BiomeDef, heartX: number) {
    this.x0 = biome.targetStart;
    this.n = Math.max(ZONES, Math.round((biome.targetEnd - biome.targetStart) / CELL));
    this.x1 = this.x0 + this.n * CELL;
    this.moist = new Float32Array(this.n);
    this.life = new Float32Array(this.n);
    this.seeds = new Float32Array(this.n);
    this.heart = clamp(Math.floor((heartX - this.x0) / CELL), 0, this.n - 1);
  }

  get heartX() { return this.x0 + (this.heart + 0.5) * CELL; }

  idx(x: number) {
    const i = Math.floor((x - this.x0) / CELL);
    return i >= 0 && i < this.n ? i : -1;
  }
  inside(x: number) { return x >= this.x0 && x < this.x1; }

  /** smooth life level at any x (fades out just past the region edges) */
  lifeAt(x: number) {
    const f = (x - this.x0) / CELL - 0.5;
    const i = Math.floor(f), t = f - i;
    const at = (k: number) => this.life[clamp(k, 0, this.n - 1)];
    const v = at(i) + (at(i + 1) - at(i)) * t;
    const edge = smoothstep(this.x0 - 120, this.x0 + 10, x) * (1 - smoothstep(this.x1 - 10, this.x1 + 120, x));
    return v * edge;
  }
  moistAt(x: number) {
    const i = this.idx(x);
    return i < 0 ? 0 : this.moist[i];
  }

  // ── thresholds (germination perk makes seeds sprout in drier soil) ──
  private germTh() { return 0.22 / (1 + this.perks.germ); }
  private tierTh(life: number) {
    const base = life < 1 ? 0.22 : life < 2 ? 0.35 : 0.5;
    return base / (1 + this.perks.germ);
  }
  private seedGain(life: number) {
    const g = life < 1 ? 0.2 : life < 2 ? 0.1 : 0.05;
    return g * (1 + this.perks.germ);
  }

  /** Rain (and the seeds it carries) landing on [a, b]. Returns litres that fell inside the region. */
  addRain(a: number, b: number, litres: number, seeds: number) {
    const span = Math.max(1, b - a);
    const i0 = Math.max(0, Math.floor((a - this.x0) / CELL)), i1 = Math.min(this.n - 1, Math.floor((b - this.x0) / CELL));
    let inside = 0;
    for (let i = i0; i <= i1; i++) {
      const c0 = this.x0 + i * CELL, c1 = c0 + CELL;
      const frac = Math.max(0, Math.min(b, c1) - Math.max(a, c0)) / span;
      if (frac <= 0) continue;
      const l = litres * frac;
      inside += l;
      this.moist[i] = Math.min(1.5, this.moist[i] + l * 0.22);
      const s = seeds * frac;
      this.seeds[i] += s;
      this.stats.seedsLanded += s;
    }
    return inside;
  }

  /** Advance the soil and the plants. Returns the life gained (all cells) this step. */
  step(dt: number) {
    const dry = this.biome.forest.dry * this.dryMul;
    const gth = this.germTh();
    const vit = this.vitality;
    let gained = 0;
    for (let i = 0; i < this.n; i++) {
      let m = this.moist[i], l = this.life[i], s = this.seeds[i];
      const before = l;
      // plants shade the soil and hold water
      m = Math.max(0, m - dry * (1 - 0.4 * (l / MAX_LIFE)) * dt);
      if (s > 0.001) {
        if (m > gth && m > this.tierTh(l) && l < MAX_LIFE) {
          const conv = Math.min(s, 0.6 * dt);
          s -= conv;
          l = Math.min(MAX_LIFE, l + conv * this.seedGain(l));
          m = Math.max(0, m - conv * 0.02);
        } else if (m <= gth) {
          // seeds on dry dust slowly die
          const d = s * 0.015 * dt;
          s -= d;
          this.stats.seedsDied += d;
        }
      }
      if (i === this.heart && m > 0.2) {
        // the Semente-Mãe sprouts with water alone — but it only becomes a tree inside a living forest
        const cap = 1.2 + 1.9 * Math.min(1, vit / this.biome.forest.awaken);
        if (l < cap) l = Math.min(cap, l + 0.008 * (1 + this.perks.germ) * Math.min(1, m) * dt);
      }
      // mature plants (and the heart) drop seeds around them
      if (l > 1.6 && m > 0.3) this.spread(i, 0.004 * (l - 1.4) * (1 + this.perks.pollen) * dt);
      if (m < 0.05 && l > 0) l = Math.max(0, l - 0.004 * dt); // drought: plants wilt
      this.moist[i] = m; this.life[i] = l; this.seeds[i] = s;
      if (l > before) {
        gained += l - before;
        if (Math.floor(l + 1e-6) > Math.floor(before + 1e-6)) this.onTier?.(i, Math.floor(l + 1e-6));
      }
    }
    return gained;
  }

  private spread(i: number, amount: number) {
    const off = Math.floor(this.r() * 5) - 2;
    const j = clamp(i + (off === 0 ? 1 : off), 0, this.n - 1);
    this.seeds[j] += amount;
  }

  // ── metrics ──
  /** 0..1: mean life over the whole region */
  get vitality() {
    let s = 0;
    for (let i = 0; i < this.n; i++) s += this.life[i];
    return s / (this.n * MAX_LIFE);
  }
  get coverage() {
    let c = 0;
    for (let i = 0; i < this.n; i++) if (this.life[i] >= 1) c++;
    return c / this.n;
  }
  get heartLife() { return this.life[this.heart]; }
  get meanMoist() {
    let s = 0;
    for (let i = 0; i < this.n; i++) s += Math.min(1, this.moist[i]);
    return s / this.n;
  }
  /** any sprout outside the heart */
  get sprouted() {
    for (let i = 0; i < this.n; i++) if (i !== this.heart && this.life[i] >= 0.3) return true;
    return false;
  }
  zoneRange(z: number): [number, number] {
    const per = this.n / ZONES;
    return [Math.round(z * per), Math.round((z + 1) * per)];
  }
  zoneVitality(z: number) {
    const [a, b] = this.zoneRange(z);
    let s = 0;
    for (let i = a; i < b; i++) s += this.life[i];
    return s / (Math.max(1, b - a) * MAX_LIFE);
  }
  get seedsInSoil() {
    let s = 0;
    for (let i = 0; i < this.n; i++) s += this.seeds[i];
    return s;
  }

  serialize(): ForestSave {
    return { moist: Array.from(this.moist), life: Array.from(this.life), seeds: Array.from(this.seeds) };
  }
  restore(d: ForestSave | undefined) {
    if (!d) return;
    for (let i = 0; i < this.n; i++) {
      this.moist[i] = d.moist[i] ?? 0;
      this.life[i] = d.life[i] ?? 0;
      this.seeds[i] = d.seeds[i] ?? 0;
    }
  }
}
