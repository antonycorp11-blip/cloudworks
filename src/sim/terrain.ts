import type { BiomeDef } from '../data/biomes';
import { noise1, smoothstep } from './util';

const STEP = 4;

/** Heightmap of the side-view world, built from biome parameters. */
export class Terrain {
  readonly width: number;
  readonly heights: Float32Array;
  readonly seaLevel: number;
  readonly sea: { x0: number; x1: number };
  readonly pond: { x0: number; x1: number; bottom: number; rim: number };

  constructor(public biome: BiomeDef) {
    this.width = biome.width;
    const n = Math.ceil(biome.width / STEP) + 2;
    this.heights = new Float32Array(n);
    const { sea, hills, mountains, groundBase, factoryEnd, targetStart, targetEnd } = biome;
    this.sea = { x0: sea.x0, x1: sea.x1 };
    this.seaLevel = groundBase + 8;
    const pc = -1e6; // (dry pond removed — the Ancient now occupies the destination)
    const pw = 240;
    void targetStart; void targetEnd;
    for (let i = 0; i < n; i++) {
      const x = i * STEP;
      // Hills, flattened inside the factory and calmer in the target zone.
      const hillMask = 0.15 + 0.85 * smoothstep(factoryEnd - 250, factoryEnd + 250, x);
      let y = groundBase
        - hills.amp * hillMask * (noise1(x / hills.scale, hills.seed) * 0.8 + noise1(x / (hills.scale * 0.37), hills.seed + 7) * 0.35);
      for (const m of mountains) {
        const d = Math.abs(x - m.x) / (m.w / 2);
        if (d < 1) {
          const shape = Math.pow(Math.cos(d * Math.PI / 2), 1.4);
          y -= m.h * shape * (1 + 0.08 * noise1(x / 60, 99));
        }
      }
      // The sea: a sandy beach sloping down into deep water (continues past the map edge)
      if (x < sea.x1 + 50) {
        const beach = smoothstep(sea.x1 + 50, sea.x1 - 40, x);
        const deep = smoothstep(sea.x1 - 20, sea.x1 - 320, x);
        y = y * (1 - beach) + (groundBase + 4) * beach + sea.depth * deep + 10 * deep * noise1(x / 90, 13);
      }
      this.heights[i] = y;
    }
    this.pond = { x0: pc - pw / 2, x1: pc + pw / 2, bottom: this.groundY(pc), rim: Math.min(this.groundY(pc - pw / 2), this.groundY(pc + pw / 2)) };
  }

  groundY(x: number): number {
    const f = Math.max(0, Math.min(this.width, x)) / STEP;
    const i = Math.floor(f);
    const t = f - i;
    const a = this.heights[i];
    const b = this.heights[Math.min(i + 1, this.heights.length - 1)];
    return a + (b - a) * t;
  }

  isSea(x: number) { return x > this.sea.x0 + 12 && x < this.sea.x1 - 12; }

  /** Highest ground under a horizontal span (used for placement). */
  maxGroundUnder(x0: number, x1: number) {
    let m = Infinity;
    for (let x = x0; x <= x1; x += STEP) m = Math.min(m, this.groundY(x));
    return Math.min(m, this.groundY(x1));
  }
}
