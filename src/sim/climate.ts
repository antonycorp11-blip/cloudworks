import type { BiomeDef } from '../data/biomes';
import { lerp, smoothstep } from './util';

/** Atmosphere model: air temperature, saturation capacity and the target region's humidity. */
export class Climate {
  humidity: number;
  stableTime = 0;
  won = false;
  milestone: number; // last 10%-band rewarded
  lossMul = 1;       // the Ancient's thirst
  /** the cold, rainy air begins near the Ancient's head (moves as it grows) */
  coldStart: number;

  constructor(public biome: BiomeDef) {
    this.humidity = biome.humidity.start;
    this.coldStart = biome.targetStart;
    this.milestone = Math.floor(biome.humidity.start / 10);
  }

  /** Ground-level temperature profile across the map (°C). */
  surfaceTemp(x: number) {
    const b = this.biome;
    const t = b.temp;
    const toMid = smoothstep(b.factoryEnd - 200, b.factoryEnd + 300, x);
    // the cold, rainy air deepens gradually across the land to reforest
    const toTarget = smoothstep(this.coldStart - 160, this.coldStart + 120 + 0.25 * (b.targetEnd - b.targetStart), x);
    return lerp(lerp(t.factory, t.mid, toMid), t.target, toTarget);
  }

  /** Air temperature with altitude lapse (colder higher up). */
  airTemp(x: number, y: number) {
    return this.surfaceTemp(x) - 0.02 * (this.biome.groundBase - y);
  }

  /** Water mass a cloud can hold before precipitating (Clausius–Clapeyron-ish). */
  capacity(temp: number) {
    return 2.5 * Math.exp(0.12 * (temp - 2));
  }

  inTarget(x: number) { return x >= this.biome.targetStart && x <= this.biome.targetEnd; }

  /** Litres of rain landing on the target. Returns humidity gained. */
  addRain(litres: number) {
    const g = litres * this.biome.humidity.gainPerL;
    this.humidity = Math.min(100, this.humidity + g);
    return g;
  }

  /** Advance humidity loss (the Ancient drinks the soil dry). */
  step(dt: number) {
    const h = this.biome.humidity;
    this.humidity = Math.max(0, this.humidity - h.loss * this.lossMul * (this.humidity - h.base * 0.5) * dt);
  }
}
