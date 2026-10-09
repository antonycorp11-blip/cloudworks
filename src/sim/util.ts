// Small math helpers + deterministic RNG/noise shared by simulation and rendering.

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Mulberry32 seeded RNG. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash-based value noise in 1D (smooth, deterministic). */
export function hash1(i: number, seed = 0) {
  let h = (i * 374761393 + seed * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function noise1(x: number, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash1(i, seed), hash1(i + 1, seed), u) * 2 - 1;
}

export interface Vec { x: number; y: number }

export function fmt(n: number): string {
  const a = Math.abs(n);
  if (a < 1000) return a < 10 && a % 1 !== 0 ? n.toFixed(1) : Math.floor(n).toString();
  const units = ['K', 'M', 'B', 'T', 'Qa', 'Qi'];
  let u = -1;
  let v = a;
  while (v >= 1000 && u < units.length - 1) { v /= 1000; u++; }
  return (n < 0 ? '-' : '') + (v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.floor(v).toString()) + units[u];
}
