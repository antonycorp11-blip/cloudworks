import type { BiomeDef } from '../data/biomes';
import type { Climate } from './climate';
import type { Mods } from './stats';
import type { Terrain } from './terrain';
import { cloudRadius, type Cloud, type Machine } from './types';
import type { WindField } from './wind';
import { clamp, type Vec } from './util';

export interface CloudHost {
  time: number;
  biome: BiomeDef;
  terrain: Terrain;
  climate: Climate;
  wind: WindField;
  mods: Mods;
  onRain(c: Cloud, litres: number, x0: number, x1: number, seeds: number): void;
  onMerge(into: Cloud, absorbed: Cloud): void;
  onSplit(a: Cloud, b: Cloud): void;
  onLost(mass: number): void;
  /** ground including obstacles (the Ancient's body) */
  groundAt(x: number): number;
}

const HASH = 220;
const MIN_MASS = 0.2;

/**
 * Every cloud is a simulated body: position, velocity, water mass, temperature.
 * No count limit — cost is kept low with a spatial hash for fusion and O(1) wind sampling.
 * Mass is conserved by formation, fusion (small simulated loss), division, rain and evaporation.
 */
export class CloudSystem {
  clouds: Cloud[] = [];
  nextId = 1;
  private w: Vec = { x: 0, y: 0 };
  private grid = new Map<number, Cloud[]>();

  constructor(private host: CloudHost) {}

  get condY() { return this.host.biome.groundBase - this.host.biome.condAlt; }

  hold: { id: number; x: number; y: number } | null = null;

  grab(id: number, x: number, y: number) {
    const c = this.clouds.find(q => q.id === id);
    if (!c) return null;
    if (this.hold) this.release(0, 0);
    c.held = true;
    this.hold = { id, x, y };
    return c;
  }
  moveHold(x: number, y: number) { if (this.hold) { this.hold.x = x; this.hold.y = y; } }
  /** Let go with the finger's velocity; heavy clouds can't be thrown as far. */
  release(vx: number, vy: number) {
    const h = this.hold;
    this.hold = null;
    if (!h) return null;
    const c = this.clouds.find(q => q.id === h.id);
    if (!c) return null;
    c.held = false;
    const f = 1 / (1 + c.mass / 15);
    c.vx = clamp(vx * f, -520, 520);
    c.vy = clamp(vy * f, -300, 300);
    return c;
  }

  spawn(x: number, y: number, mass: number, vx = 0, vy = 0): Cloud {
    const c: Cloud = {
      id: this.nextId++, x, y, vx, vy, mass,
      temp: this.host.climate.airTemp(x, y), raining: false, rainRate: 0,
      seed: Math.floor(Math.random() * 1e9), age: 0, splitCd: 0, pulse: 0, seeds: 0,
    };
    this.clouds.push(c);
    return c;
  }

  /** Vapor released at (x, y) rises `rise` units and condenses into the nearest cloud or a new one. */
  emit(x: number, y: number, amount: number, rise: number): boolean {
    if (amount <= 0) return false;
    // vapor condenses near the cloud base level (or lower if the vent is very high)
    const fy = Math.max(this.condY - 120, Math.min(y - rise, this.condY + 30));
    const absorb = this.host.mods.absorbMul();
    let best: Cloud | null = null;
    let bestD = Infinity;
    for (const c of this.clouds) {
      // the rising plume feeds any cloud hovering over the vent column
      const reach = cloudRadius(c.mass) * 0.8 * Math.sqrt(absorb) + 30 * absorb;
      const dx = Math.abs(c.x - x), dy = c.y - fy;
      if (dx > reach || dy > reach || dy < -reach * 2.5) continue;
      const d = dx * dx + dy * dy * 0.3;
      if (d < bestD) { best = c; bestD = d; }
    }
    if (best) { best.mass += amount; return true; }
    if (amount >= 0.25) {
      this.host.wind.at(x, fy, this.host.time, this.w);
      this.spawn(x, fy, amount, this.w.x * 0.5, -10);
      return true;
    }
    return false; // keep accumulating
  }

  private ws: Vec = { x: 0, y: 0 };
  /** Wind integrated over the cloud body (centre + 4 points), so a cloud catches a jet with any part of it. */
  private bodyWind(x: number, y: number, r: number) {
    const { wind, time } = this.host;
    const o = this.w, s = this.ws;
    wind.at(x, y, time, o);
    let sx = o.x * 2, sy = o.y * 2;
    const pts = [[-0.6, 0], [0.6, 0], [0, -0.35], [0, 0.3]];
    for (const [px, py] of pts) {
      wind.at(x + px * r, y + py * r, time, s);
      sx += s.x; sy += s.y;
    }
    o.x = sx / 6; o.y = sy / 6;
    return o;
  }

  step(dt: number, dividers: Machine[]) {
    const { biome, climate, mods } = this.host;
    const aero = mods.aeroMul();
    const precip = mods.precipMul();
    const evapMul = mods.evapMul();
    const condY = this.condY;
    const out: Cloud[] = [];
    for (const c of this.clouds) {
      c.age += dt;
      c.pulse = Math.max(0, c.pulse - dt * 1.5);
      c.splitCd = Math.max(0, c.splitCd - dt);
      const r = cloudRadius(c.mass);
      this.bodyWind(c.x, c.y, r);
      const ground = this.host.groundAt(c.x);
      const minY = ground - r * 0.45 - 70; // cloud center must stay this high above the ground
      const targetY = Math.min(condY - Math.min(160, Math.sqrt(c.mass) * 4), minY);
      const buoy = clamp((targetY - c.y) * 0.35, -60, 60);
      // Heavier clouds respond more slowly to wind.
      const resp = (0.6 * aero) / (1 + Math.sqrt(c.mass) / 6);
      const k = Math.min(1, resp * dt);
      if (c.held && this.hold?.id === c.id) {
        // grabbed by the player: a spring pulls it to the finger; heavy clouds lag behind
        const stiff = 9 / (1 + Math.sqrt(c.mass) / 5);
        c.vx = clamp((this.hold.x - c.x) * stiff, -700, 700);
        c.vy = clamp((this.hold.y - c.y) * stiff, -700, 700);
      } else {
        c.vx += (this.w.x - c.vx) * k;
        c.vy += (this.w.y + buoy - c.vy) * Math.min(1, k * 1.6);
      }
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      if (c.y > minY) { c.y = minY; if (c.vy > 0) c.vy = 0; } // pushed up by terrain (orographic lift)
      if (c.y < 40) { c.y = 40; if (c.vy < 0) c.vy = 0; }

      const air = climate.airTemp(c.x, c.y);
      c.temp += (air - c.temp) * Math.min(1, dt / 4);
      const cap = climate.capacity(c.temp);
      const ratio = c.mass / cap;

      // Evaporation in warm air (stronger when the cloud is far from saturation).
      const evap = c.mass * biome.evap * Math.max(0, air - 5) / 15 * evapMul * (c.raining ? 0.3 : 1);
      c.mass -= evap * dt;

      if (!c.raining && ratio > 1) c.raining = true;
      else if (c.raining && ratio < 0.25) c.raining = false;
      c.rainRate = 0;
      if (c.raining) {
        const rate = Math.min(c.mass * 0.5, 0.06 * precip * c.mass * Math.min(ratio, 4));
        const amount = Math.min(c.mass, rate * dt);
        // seeds fall in proportion to the water that falls
        const seeds = c.seeds > 0 ? c.seeds * Math.min(1, amount / Math.max(1e-6, c.mass)) : 0;
        c.mass -= amount;
        c.seeds -= seeds;
        c.rainRate = rate;
        // Rain lands under the cloud, drifting with the wind while it falls.
        const fall = Math.max(0, ground - (c.y + r * 0.4)) / 320;
        const drift = this.w.x * fall * 0.6;
        this.host.onRain(c, amount, c.x - r * 0.75 + drift, c.x + r * 0.75 + drift, seeds);
      }

      if (c.mass < MIN_MASS) { if (c.held) this.hold = null; continue; } // dissolved
      if (c.x < -300 || c.x > biome.width + 300) { if (c.held) this.hold = null; this.host.onLost(c.mass); continue; }
      out.push(c);
    }
    this.clouds = out;
    this.fuse();
    if (dividers.length) this.divide(dividers);
  }

  private fuse() {
    const fusion = this.host.mods.fusionMul();
    const grid = this.grid;
    grid.clear();
    const key = (cx: number, cy: number) => cx * 4096 + cy;
    for (const c of this.clouds) {
      const reach = cloudRadius(c.mass) * 0.5 * fusion;
      const x0 = Math.floor((c.x - reach) / HASH), x1 = Math.floor((c.x + reach) / HASH);
      const y0 = Math.floor((c.y - reach) / HASH) + 64, y1 = Math.floor((c.y + reach) / HASH) + 64;
      for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
        const k = key(cx + 64, cy);
        let a = grid.get(k);
        if (!a) { a = []; grid.set(k, a); }
        a.push(c);
      }
    }
    const dead = new Set<number>();
    for (const bucket of grid.values()) {
      if (bucket.length < 2) continue;
      for (let i = 0; i < bucket.length; i++) {
        const a = bucket[i];
        if (dead.has(a.id)) continue;
        for (let j = i + 1; j < bucket.length; j++) {
          const b = bucket[j];
          if (dead.has(b.id) || a === b) continue;
          if (a.splitCd > 0 || b.splitCd > 0) continue;
          const reach = (cloudRadius(a.mass) + cloudRadius(b.mass)) * 0.42 * fusion;
          const dx = a.x - b.x, dy = a.y - b.y;
          if (dx * dx + dy * dy > reach * reach) continue;
          const [big, small] = a.mass >= b.mass ? [a, b] : [b, a];
          const total = big.mass + small.mass;
          this.host.onMerge(big, small);
          big.x = (big.x * big.mass + small.x * small.mass) / total;
          big.y = (big.y * big.mass + small.y * small.mass) / total;
          big.vx = (big.vx * big.mass + small.vx * small.mass) / total;
          big.vy = (big.vy * big.mass + small.vy * small.mass) / total;
          big.temp = (big.temp * big.mass + small.temp * small.mass) / total;
          big.mass = total * 0.99; // 1% lost to turbulence
          big.raining = big.raining || small.raining;
          big.seeds += small.seeds;
          big.mother = big.mother || small.mother;
          big.pulse = 1;
          if (small.held) { small.held = false; big.held = true; if (this.hold) this.hold.id = big.id; }
          dead.add(small.id);
          if (small === a) break;
        }
      }
    }
    if (dead.size) this.clouds = this.clouds.filter(c => !dead.has(c.id));
  }

  private divide(dividers: Machine[]) {
    for (const d of dividers) {
      if (!d.on) continue;
      for (const c of this.clouds) {
        if (c.splitCd > 0 || c.mass < 8 || c.y > d.y) continue;
        const r = cloudRadius(c.mass);
        if (Math.abs(c.x - d.x) > 50 + r * 0.25) continue;
        const half = (c.mass * 0.99) / 2;
        const off = r * 0.35;
        c.mass = half;
        c.seeds /= 2;
        const b = this.spawn(c.x + off, c.y + 6, half, c.vx + 22, c.vy - 6);
        b.temp = c.temp;
        b.raining = c.raining;
        b.seeds = c.seeds;
        c.x -= off;
        c.vx -= 14;
        c.splitCd = b.splitCd = 6;
        c.pulse = b.pulse = 1;
        d.anim = 1;
        this.host.onSplit(c, b);
      }
    }
  }

  totalMass() { return this.clouds.reduce((s, c) => s + c.mass, 0); }
}
