import type { BiomeDef } from '../data/biomes';
import { MACHINES } from '../data/machines';
import type { Mods } from './stats';
import type { Terrain } from './terrain';
import type { Machine } from './types';
import { clamp, noise1, smoothstep, type Vec } from './util';

const CELL = 40;

/**
 * Wind = natural wind (biome, altitude, gusts) + player-built wind machines.
 * Machine wind is baked into a coarse grid whenever machines change, so sampling
 * stays O(1) regardless of how many fans the player builds.
 */
export class WindField {
  cols: number;
  rows: number;
  gx: Float32Array;
  gy: Float32Array;
  dirty = true;
  height: number;

  constructor(public biome: BiomeDef, public terrain: Terrain) {
    this.height = biome.groundBase + 300;
    this.cols = Math.ceil(biome.width / CELL) + 1;
    this.rows = Math.ceil(this.height / CELL) + 1;
    this.gx = new Float32Array(this.cols * this.rows);
    this.gy = new Float32Array(this.cols * this.rows);
  }

  natural(x: number, y: number, t: number, out: Vec) {
    const b = this.biome;
    const toOpen = smoothstep(b.factoryEnd - 300, b.factoryEnd + 300, x);
    const calmTarget = 1 - 0.45 * smoothstep(b.targetStart - 100, b.targetStart + 250, x);
    const shelter = (b.wind.shelter + (1 - b.wind.shelter) * toOpen) * calmTarget;
    const alt = clamp((this.terrain.groundY(x) - y) / 500, 0.15, 1.4);
    const gust = b.wind.gust * noise1(t / b.wind.gustPeriod + x / 1500, 5);
    out.x = (b.wind.base + gust) * shelter * alt;
    out.y = noise1(t / 7 + x / 400, 9) * 3;
    return out;
  }

  rebuild(machines: Machine[], mods: Mods) {
    this.gx.fill(0);
    this.gy.fill(0);
    for (const m of machines) {
      if (!m.on) continue;
      const w = mods.wind(m.kind);
      if (!w) continue;
      const P = w.power * m.power;
      const dx = Math.cos(m.angle), dy = Math.sin(m.angle);
      // fan mouth sits at the front of the head
      const ox = m.x + dx * MACHINES[m.kind].w * 0.45, oy = m.y + dy * MACHINES[m.kind].h * 0.45;
      const reach = w.range + 30 + w.range * w.spread;
      const c0 = Math.max(0, Math.floor((ox - reach) / CELL)), c1 = Math.min(this.cols - 1, Math.ceil((ox + reach) / CELL));
      const r0 = Math.max(0, Math.floor((oy - reach) / CELL)), r1 = Math.min(this.rows - 1, Math.ceil((oy + reach) / CELL));
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const px = c * CELL - ox, py = r * CELL - oy;
          const along = px * dx + py * dy;
          if (along < -20 || along > w.range) continue;
          const perp = Math.abs(-px * dy + py * dx);
          const half = 28 + Math.max(0, along) * w.spread;
          if (perp > half) continue;
          const s = P * Math.pow(1 - Math.max(0, along) / w.range, 0.7) * (1 - (perp / half) ** 2);
          const i = r * this.cols + c;
          this.gx[i] += dx * s;
          this.gy[i] += dy * s;
        }
      }
    }
    this.dirty = false;
  }

  /** Machine-generated wind at a point (bilinear). */
  machineAt(x: number, y: number, out: Vec) {
    const fx = clamp(x / CELL, 0, this.cols - 1.001), fy = clamp(y / CELL, 0, this.rows - 1.001);
    const c = Math.floor(fx), r = Math.floor(fy);
    const tx = fx - c, ty = fy - r;
    const i = r * this.cols + c;
    const a = (1 - tx) * (1 - ty), b = tx * (1 - ty), d = (1 - tx) * ty, e = tx * ty;
    out.x = this.gx[i] * a + this.gx[i + 1] * b + this.gx[i + this.cols] * d + this.gx[i + this.cols + 1] * e;
    out.y = this.gy[i] * a + this.gy[i + 1] * b + this.gy[i + this.cols] * d + this.gy[i + this.cols + 1] * e;
    return out;
  }

  private tmp: Vec = { x: 0, y: 0 };
  at(x: number, y: number, t: number, out: Vec) {
    this.natural(x, y, t, out);
    if (y < 0 || y > this.height) return out;
    const m = this.machineAt(x, y, this.tmp);
    out.x += m.x;
    out.y += m.y;
    return out;
  }
}
