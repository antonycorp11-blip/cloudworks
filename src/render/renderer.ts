// World renderer — low-resolution canvas upscaled with nearest-neighbour (pixel art).
// Mood system: the world starts in a dusky drought, darkens under storms and comes alive as it's restored.
// Rendering only READS simulation state; visual particles never affect simulated mass.
import { MACHINES, type MachineKind } from '../data/machines';
import type { Camera } from '../core/camera';
import { portWorld, type Placement } from '../sim/build';
import type { SimEvent } from '../sim/events';
import type { Sim } from '../sim/sim';
import { cloudRadius, type Cloud, type Machine } from '../sim/types';
import { clamp, hash1, lerp, noise1, rng, smoothstep } from '../sim/util';
import { C, drawMachine, drawPort, drawWind } from './machines-draw';
import { CELL, ZONES } from '../sim/forest';

export interface Ghost extends Placement { kind: MachineKind; angle: number; flip: boolean; power: number; moveId?: number }
export type Selection = { type: 'machine' | 'cloud' | 'pipe'; id: number };
export interface ViewState {
  mode: 'play' | 'place' | 'pipe';
  ghost: Ghost | null;
  selection: Selection | null;
  pendingPort: { m: number; port: string } | null;
  dragPipe: { x: number; y: number } | null;
}

type RGB = [number, number, number];
interface Puff { x: number; y: number; r: number }
interface Plant { x: number; kind: 'grass' | 'bush' | 'tree' | 'flower'; th: number; s: number; h: number; g: number; cl?: number[] }
type DecorKind = 'pier' | 'wreck' | 'buoy' | 'shack' | 'lantern' | 'crates' | 'barrel' | 'fence' | 'deadtree' | 'rock' | 'pole' | 'skull' | 'windmill' | 'well' | 'cabin' | 'sign' | 'tower' | 'cart';
interface Decor { kind: DecorKind; x: number; s: number; seed: number; flip: boolean; a: number }
export type SkyKind = 'ufo' | 'serpent' | 'fairies' | 'meteor' | 'lanterns';
interface SkyEvent { kind: SkyKind; t: number; dur: number; dir: number; y: number; seed: number; done: boolean; x?: number; cx?: number; cy?: number }
interface FarProp { kind: 'mill' | 'tree' | 'barn' | 'pole' | 'chimney'; x: number; s: number }
interface Bird { x: number; y: number; vx: number; ph: number }
interface Light { x: number; y: number; r: number; col: string; a: number }

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mixC = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];
const css = (c: RGB, a = 1) => (a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`);
const ch = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
const pack = (r: number, g: number, b: number) => (255 << 24) | (ch(b) << 16) | (ch(g) << 8) | ch(r);
const packC = (c: RGB, k = 1) => pack(c[0] * k, c[1] * k, c[2] * k);

const STORM_TOP: RGB = [52, 56, 78];
const STORM_BOT: RGB = [104, 110, 132];

const MAX_DROPS = 3000, MAX_SPL = 500, MAX_STEAM = 700, MAX_STREAKS = 260, MAX_BITS = 400;

export class Renderer {
  ctx: CanvasRenderingContext2D;
  private light: HTMLCanvasElement;
  private lctx: CanvasRenderingContext2D;
  private img: ImageData | null = null;
  private buf!: Uint32Array;
  private puffs = new Map<number, Puff[]>();
  private plants: Plant[] = [];
  private decor: Decor[] = [];
  private far: FarProp[] = [];
  private birds: Bird[] = [];
  private tumble: { x: number; y: number; vx: number; vy: number; a: number }[] = [];
  private builtFor = '';
  private skyEnd = new Int32Array(0);
  private ceil = new Int32Array(0);
  private sky: SkyEvent[] = [];
  private skyTimer = 25;
  private stars: { x: number; y: number; ph: number; big: boolean }[] = [];
  private rowBuf = new Uint32Array(0);
  private bandBuf = new Uint32Array(0);
  private rimBuf = new Uint32Array(0);
  private rowRGB = new Float32Array(0);
  // particle pools (struct-of-arrays)
  private dx = new Float32Array(MAX_DROPS); private dy = new Float32Array(MAX_DROPS); private dvx = new Float32Array(MAX_DROPS); private dvy = new Float32Array(MAX_DROPS); private dn = 0;
  private px = new Float32Array(MAX_SPL); private py = new Float32Array(MAX_SPL); private pvx = new Float32Array(MAX_SPL); private pvy = new Float32Array(MAX_SPL); private pl = new Float32Array(MAX_SPL); private pn = 0;
  private sx = new Float32Array(MAX_STEAM); private sy = new Float32Array(MAX_STEAM); private sl = new Float32Array(MAX_STEAM); private sr = new Float32Array(MAX_STEAM); private sn = 0;
  private wx = new Float32Array(MAX_STREAKS); private wy = new Float32Array(MAX_STREAKS); private wl = new Float32Array(MAX_STREAKS); private wg = new Float32Array(MAX_STREAKS); private wn = 0;
  // bits: 0 leaf, 1 dust, 2 firefly, 3 ember
  private bx = new Float32Array(MAX_BITS); private by = new Float32Array(MAX_BITS); private bvx = new Float32Array(MAX_BITS); private bvy = new Float32Array(MAX_BITS); private bl = new Float32Array(MAX_BITS); private bk = new Uint8Array(MAX_BITS); private bn = 0;
  private ghosts: { x: number; y: number; r: number; t: number; seed: number }[] = [];
  private buckets: { fx: number; fy: number; tx: number; ty: number; t: number }[] = [];
  private bolts: { pts: number[]; t: number; x: number; y: number }[] = [];
  private lights: Light[] = [];
  private ghostsDebris: { x: number; y: number; t: number }[] = [];
  private rand = rng(7);
  private tmp = { x: 0, y: 0 };
  private time = 0;
  /** smoothed atmosphere */
  mood = { storm: 0, health: 0, flash: 0, veil: 0, sun: 0 };
  shake = 0;
  rainVisible = 0;
  onThunder: ((dist: number, big: boolean) => void) | null = null;
  /** world position above the Ancient's head (UI anchors speech bubbles here) */
  creatureHead = { x: 0, y: 0 };
  private cSize = 0.95;
  private cMouth = 0;
  private cBlink = 3;
  private cZ = 0;
  private risenAt = -1;

  constructor(public canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.light = document.createElement('canvas');
    this.lctx = this.light.getContext('2d')!;
  }

  onEvent(e: SimEvent) {
    if (e.type === 'merge') {
      this.ghosts.push({ x: e.x, y: e.y, r: e.r, t: 0, seed: Math.random() * 1e6 });
      if (e.r > 60) this.shake = Math.max(this.shake, Math.min(1, e.r / 200));
    }
    if (e.type === 'bucket') this.buckets.push({ fx: e.fromX, fy: e.fromY, tx: e.toX, ty: e.toY, t: 0 });
    if (e.type === 'throw') this.gust(e.x, e.y, e.speed);
    if (e.type === 'firstRain') this.shake = Math.max(this.shake, 0.5);
    if (e.type === 'uproot') { this.shake = Math.max(this.shake, 0.8); this.burst(e.x, e.y - 20, 18, 1); this.burst(e.x, e.y - 10, 6, 3); this.ghostsDebris.push({ x: e.x, y: e.y, t: 0 }); }
    if (e.type === 'stageUp') this.mood.flash = Math.max(this.mood.flash, 0.7);
    if (e.type === 'awaken') { this.mood.flash = 1; this.shake = 1; this.cSize = 0.35; this.risenAt = this.time; }
    if (e.type === 'sprout') this.burst(e.x, e.y - 8 - e.tier * 8, 3 + e.tier * 3, 0);
    if (e.type === 'mother') this.mood.flash = Math.max(this.mood.flash, 0.4);
  }

  // ───────────────────────── frame ─────────────────────────
  render(sim: Sim, cam: Camera, view: ViewState, dt: number, t: number) {
    this.time = t;
    this.ensureWorld(sim);
    this.updateMood(sim, cam, dt);
    const sh = this.shake;
    const amp = (sh * 8 * cam.scale) / cam.zoom;
    const ox = sh > 0.01 ? (this.rand() - 0.5) * amp : 0;
    const oy = sh > 0.01 ? (this.rand() - 0.5) * amp : 0;
    cam.x += ox; cam.y += oy;
    this.shake = Math.max(0, this.shake - dt * 1.8);

    const c = this.ctx;
    c.imageSmoothingEnabled = false;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    this.drawBackground(sim, cam);
    this.lights.length = 0;
    this.drawSkyLife(sim, cam, dt);
    this.drawFarProps(sim, cam);
    const z = cam.zoom;
    c.setTransform(z, 0, 0, z, -cam.left * z, -cam.top * z);
    this.drawTargetMarkers(sim, cam, view);
    this.drawDecor(sim, cam, dt);
    this.drawVegetation(sim, cam, dt);
    this.drawCreature(sim, cam, dt, t);
    this.drawPipes(sim, view);
    this.drawMachines(sim, cam, view, t);
    this.updateSteam(sim, cam, dt);
    this.drawSteam();
    this.updateStreaks(sim, cam, dt);
    this.drawStreaks(sim);
    this.drawBirds(sim, cam, dt);
    this.updateBits(sim, cam, dt);
    this.drawClouds(sim, cam, view, t);
    this.updateDrops(sim, cam, dt);
    this.drawRain(cam);
    c.setTransform(z, 0, 0, z, -cam.left * z, -cam.top * z);
    this.drawBits();
    this.drawEffects(dt, t);
    this.updateLightning(sim, cam, dt);
    if (view.mode !== 'play') this.drawBuildOverlay(sim, view, t);
    if (view.ghost) this.drawGhost(sim, cam, view.ghost, t);
    this.drawLighting(cam);
    this.drawForeground(sim, cam);
    cam.x -= ox; cam.y -= oy;
  }

  // ───────────────────────── atmosphere ─────────────────────────
  private updateMood(sim: Sim, cam: Camera, dt: number) {
    const health = this.healthOf(sim);
    // the Véu: thickens during a pulse, tears open as the Ancient grows (fully at its final form)
    const cr = sim.creature;
    const sun = sim.climate.won ? 1 : cr.awake ? 0.12 * cr.stage : 0;
    this.mood.veil += ((sim.veilLeft > 0 ? 1 : 0) - this.mood.veil) * Math.min(1, dt * 0.8);
    this.mood.sun += (sun - this.mood.sun) * Math.min(1, dt * 0.4);
    let cover = 0;
    const x0 = cam.left, x1 = cam.left + cam.viewW;
    for (const cl of sim.clouds.clouds) {
      if (cl.x < x0 - 400 || cl.x > x1 + 400) continue;
      const r = cloudRadius(cl.mass);
      const sat = clamp(cl.mass / sim.climate.capacity(cl.temp), 0, 1.4);
      cover += ((r * 2) / cam.viewW) * (0.25 + sat * 0.6) * (cl.raining ? 1.5 : 0.6);
    }
    const storm = clamp(cover * 0.5 + this.rainVisible * 0.55, 0, 1);
    this.mood.storm += (storm - this.mood.storm) * Math.min(1, dt * 0.7);
    this.mood.health += (health - this.mood.health) * Math.min(1, dt * 0.5);
    this.mood.flash = Math.max(0, this.mood.flash - dt * 5);
  }

  /** how alive the land looks: mostly the forest, a little the air's humidity */
  private healthOf(sim: Sim) {
    const b = sim.biome;
    const hum = smoothstep(b.humidity.start, b.humidity.target, sim.climate.humidity);
    const forest = clamp(sim.forest.vitality / b.forest.awaken, 0, 1);
    return clamp(0.3 * hum + 0.7 * forest, 0, 1);
  }

  private ensureWorld(sim: Sim) {
    const key = sim.biome.id + ':' + sim.biomeIndex;
    if (this.builtFor === key) return;
    this.builtFor = key;
    const b = sim.biome, T = sim.terrain, r = rng(b.hills.seed * 97 + 13);
    this.mood.health = this.healthOf(sim);
    this.mood.sun = sim.climate.won ? 1 : 0;
    this.plants = [];
    // each plant appears when the forest cell under it reaches its life threshold (1 grass, 2 bush, 3 tree)
    const F = sim.forest;
    for (let x = F.x0 - 120; x < F.x1 + 120; x += 6 + r() * 7) {
      const v = r();
      const kind: Plant['kind'] = v < 0.11 ? 'tree' : v < 0.27 ? 'bush' : v < 0.38 ? 'flower' : 'grass';
      if (Math.abs(x - F.heartX) < 34 && kind !== 'grass') continue; // room for the Semente-Mãe
      const th = kind === 'grass' ? 0.05 + r() * 0.9 : kind === 'flower' ? 0.6 + r() * 0.9 : kind === 'bush' ? 1.05 + r() * 0.9 : 2.0 + r() * 0.95;
      this.plants.push({ x, kind, th, s: 0.7 + r() * 0.6, h: r(), g: 0 });
    }
    for (let x = 20; x < b.factoryEnd; x += 30 + r() * 70) {
      if (x < T.sea.x1 + 40) continue;
      this.plants.push({ x, kind: 'grass', th: -100, s: 0.5 + r() * 0.4, h: r(), g: 1 });
    }
    this.plants.sort((a, c) => a.x - c.x);
    for (const p of this.plants) if (p.th > -100) p.g = smoothstep(p.th - 0.1, p.th + 0.4, F.lifeAt(p.x));
    const d: Decor[] = [];
    const add = (kind: DecorKind, x: number, s = 1) => d.push({ kind, x, s, seed: r() * 1e6, flip: r() < 0.5, a: r() * 6 });
    const L = T.sea;
    add('lantern', L.x1 + 100);
    add('sign', L.x1 + 12);
    add('crates', L.x1 + 330);
    add('barrel', L.x1 + 362);
    add('barrel', L.x1 + 380);
    add('lantern', Math.min(b.factoryEnd - 40, L.x1 + 430));
    add('tower', b.factoryEnd - 70);
    add('cart', b.factoryEnd - 170);
    add('lantern', b.factoryEnd + 10);
    add('pier', L.x1 - 10);
    add('wreck', L.x1 - 620, 1.3);
    add('buoy', L.x1 - 300);
    const span = b.targetStart - b.factoryEnd;
    for (let x = b.factoryEnd + 60; x < b.targetStart - 40; x += 70 + r() * 120) {
      const v = r();
      add(v < 0.3 ? 'deadtree' : v < 0.5 ? 'rock' : v < 0.62 ? 'skull' : v < 0.8 ? 'fence' : 'rock', x, 0.8 + r() * 0.6);
    }
    for (let x = b.factoryEnd + 120; x < b.width; x += 260 + r() * 60) add('pole', x);
    if (span > 300) add('windmill', b.factoryEnd + span * 0.55);
    add('cabin', b.targetStart + (b.targetEnd - b.targetStart) * 0.18);
    add('well', b.targetStart + (b.targetEnd - b.targetStart) * 0.8);
    for (let x = b.targetEnd + 60; x < b.width; x += 90 + r() * 120) add(r() < 0.5 ? 'deadtree' : 'rock', x, 0.8 + r() * 0.5);
    this.decor = d.sort((a, c) => a.x - c.x);
    this.far = [];
    for (let x = -800; x < b.width * 0.6 + 1200; x += 160 + r() * 260) {
      const v = r();
      this.far.push({ kind: v < 0.2 ? 'mill' : v < 0.55 ? 'tree' : v < 0.68 ? 'barn' : v < 0.85 ? 'pole' : 'chimney', x, s: 0.7 + r() * 0.5 });
    }
    this.birds = [];
    for (let i = 0; i < 7; i++) this.birds.push({ x: r() * b.width, y: b.groundBase - 450 - r() * 300, vx: (r() < 0.5 ? -1 : 1) * (40 + r() * 30), ph: r() * 6 });
    this.tumble = [];
    for (let i = 0; i < 3; i++) this.tumble.push({ x: b.factoryEnd + r() * span, y: 0, vx: 0, vy: 0, a: 0 });
    this.puffs.clear();
  }

  // ───────────────────────── background: one pixel buffer ─────────────────────────
  private farH(lx: number, seed: number) { return 230 + 120 * noise1(lx / 700, seed) + 40 * noise1(lx / 170, seed + 3); }
  private midH(lx: number, seed: number) { return 105 + 55 * noise1(lx / 420, seed + 5) + 16 * noise1(lx / 80, seed + 9); }

  /**
   * Sky, hills, sea and ground in one low-res pixel buffer. Every colour is precomputed per frame,
   * per row or per column (no allocation per pixel): this runs over the whole screen each frame.
   */
  private drawBackground(sim: Sim, cam: Camera) {
    const W = cam.lowW, H = cam.lowH;
    if (!this.img || this.img.width !== W || this.img.height !== H) {
      this.img = this.ctx.createImageData(W, H);
      this.buf = new Uint32Array(this.img.data.buffer);
      this.light.width = W;
      this.light.height = H;
      this.skyEnd = new Int32Array(W);
      this.ceil = new Int32Array(W);
      this.stars = [];
      const q = rng(77);
      for (let k = 0; k < (W * H) / 900; k++) this.stars.push({ x: Math.floor(q() * W), y: Math.floor(q() * H * 0.55), ph: q() * 6, big: q() < 0.15 });
    }
    const buf = this.buf, skyEnd = this.skyEnd;
    const b = sim.biome, p = b.palette, T = sim.terrain;
    const z = cam.zoom, top = cam.top, left = cam.left;
    const st = this.mood.storm, he = this.mood.health;
    const viewTarget = clamp((Math.min(left + cam.viewW, b.targetEnd) - Math.max(left, b.targetStart)) / cam.viewW, 0, 1);
    const sun = this.mood.sun, veil = this.mood.veil;
    const skyH = Math.max(he * (0.55 + 0.45 * viewTarget), sun);
    let sTop = mixC(hex(p.dryTop), hex(p.skyTop), skyH), sBot = mixC(hex(p.dryBottom), hex(p.skyBottom), skyH);
    // the Véu: ash-brown when it thickens, a warm clear sky where it has torn open
    sTop = mixC(sTop, [38, 30, 30], veil * 0.55);
    sBot = mixC(sBot, [72, 58, 50], veil * 0.5);
    sBot = mixC(sBot, [255, 236, 200], sun * 0.12);
    sTop = mixC(sTop, STORM_TOP, st * 0.8);
    sBot = mixC(sBot, STORM_BOT, st * 0.75);
    const haze = mixC(hex(p.haze), sBot, 0.4 + skyH * 0.4);
    const glowC = hex(p.glow);
    const glowK = (1 - st * 0.85) * (0.85 - 0.45 * skyH);
    const farC = mixC(mixC(hex(p.farHills), haze, 0.3), STORM_BOT, st * 0.3);
    const midC = mixC(hex(p.nearHills), STORM_TOP, st * 0.35);
    const fogC = mixC(haze, glowC, 0.18);
    const sunX = W * 0.78, sunY = H * 0.16, sunR = Math.max(5, Math.min(W, H) * (0.035 + 0.02 * sun));
    const sunC: RGB = mixC(mixC([236, 228, 210], [250, 246, 230], skyH), [255, 226, 150], sun);
    const sunA = (1 - st * 0.95) * 0.95 * (1 - veil * 0.7);
    const starA = (1 - st) * (1 - skyH * 0.5) * 0.9;

    // ── per-row sky, plus the band of the Véu hanging low over the horizon ──
    const rows = this.rowBuf.length === H ? this.rowBuf : (this.rowBuf = new Uint32Array(H));
    const band = this.bandBuf.length === H ? this.bandBuf : (this.bandBuf = new Uint32Array(H));
    const rim = this.rimBuf.length === H ? this.rimBuf : (this.rimBuf = new Uint32Array(H));
    const rr = this.rowRGB.length === H * 3 ? this.rowRGB : (this.rowRGB = new Float32Array(H * 3));
    const veilC = mixC(mixC(sBot, [40, 34, 40], 0.45 - 0.3 * sun), STORM_BOT, st * 0.4);
    for (let y = 0; y < H; y++) {
      const wy = top + y / z;
      // the gradient spans the screen: deep colour at the top, light near the horizon
      let col = mixC(sTop, sBot, Math.pow(clamp(y / H, 0, 1), 1.15));
      col = mixC(col, glowC, smoothstep(b.groundBase - 560, b.groundBase - 40, wy) * glowK * 0.85);
      rr[y * 3] = col[0]; rr[y * 3 + 1] = col[1]; rr[y * 3 + 2] = col[2];
      rows[y] = packC(col);
      band[y] = packC(mixC(col, veilC, 0.5 + 0.25 * veil + 0.15 * (1 - y / H)));
      rim[y] = packC(mixC(mixC(col, veilC, 0.3), glowC, 0.35 * glowK + 0.05));
    }
    // ── colour ramps ──
    const N = 64;
    const lut = (n: number, f: (t: number) => RGB) => { const a = new Uint32Array(n + 1); for (let k = 0; k <= n; k++) a[k] = packC(f(k / n)); return a; };
    const farL = lut(N, t => mixC(farC, fogC, t * 0.55)), midL = lut(N, t => mixC(midC, fogC, t * 0.5));
    const farTop = packC(mixC(farC, glowC, 0.3 * glowK + 0.08)), midTop = packC(mixC(midC, glowC, 0.45 * glowK + 0.08));
    // background forests on the hills: sparse grey stubs during the drought, full green crowns as the land heals
    const grow = 0.3 + 0.7 * he;
    const farTreeC = packC(mixC(mixC(farC, [70, 140, 90], 0.35 * he), fogC, 0.15)), farTreeHi = packC(mixC(mixC(farC, [120, 190, 120], 0.35 * he), glowC, 0.2 * glowK));
    const midTreeC = packC(mixC(midC, [50, 120, 70], 0.45 * he)), midTreeHi = packC(mixC(mixC(midC, [110, 190, 100], 0.45 * he), glowC, 0.3 * glowK));
    const water = hex(p.water), waterDeep = mul(water, 0.28), waterTop = mixC(water, [150, 200, 220], 0.25);
    const waterL = lut(N, t => mixC(mixC(waterTop, waterDeep, t), STORM_BOT, st * 0.3));
    const foam = packC([222, 236, 244]), foamSoft = packC(mixC(waterTop, [200, 225, 240], 0.4));
    const shine = packC(mixC(mixC(waterTop, sunC, 0.55 * sunA), STORM_BOT, st * 0.3)), spark = packC(mixC(waterTop, glowC, 0.5 * glowK));
    const dry = hex(p.groundDry), wetC = hex(p.groundWet), dirt = hex(p.dirt), gD = hex(p.grassDry), gW = hex(p.grassWet), rock = hex(p.rock);
    const sand: RGB = [214, 186, 128], snow: RGB = [236, 240, 244];
    const ore1 = packC([255, 214, 90]), ore2 = packC([110, 220, 230]);
    const tick = Math.floor(this.time * 3);
    const seed = b.hills.seed;
    const zF = 60 * z + 6, zM = 90 * z + 8;
    const sunCols0 = sunX - sunR * 1.6, sunCols1 = sunX + sunR * 1.6;

    for (let sx = 0; sx < W; sx++) {
      const wx = left + (sx + 0.5) / z;
      const lf = cam.x * 0.25 + (sx - W / 2) / z, lm = cam.x * 0.5 + (sx - W / 2) / z, lb = cam.x * 0.1 + (sx - W / 2) / z;
      const syF0 = Math.round((b.groundBase - this.farH(lf, seed) - top) * z);
      const syM0 = Math.round((b.groundBase - this.midH(lm, seed) - top) * z);
      // pines on the far hills, round crowns on the near hills
      let syF = syF0, syM = syM0;
      {
        const cf = Math.floor(lf / 26), hf = hash1(cf, seed + 60);
        if (hf > 0.3) { const lx = Math.abs(lf - cf * 26 - 13), w = 9 + 4 * hf, th = (14 + 26 * hf) * grow; if (lx < w) syF = Math.min(syF, syF0 - Math.round(th * (1 - lx / w) * z)); }
        const cm = Math.floor(lm / 38), hm = hash1(cm, seed + 70);
        if (hm > 0.25) {
          const lx = Math.abs(lm - cm * 38 - 19), r = (9 + 7 * hm) * grow, trunk = (8 + 10 * hm) * grow;
          if (lx < r) syM = Math.min(syM, syM0 - Math.round((trunk + Math.sqrt(1 - (lx / r) ** 2) * r) * z));
          else if (lx < 1.5) syM = Math.min(syM, syM0 - Math.round(trunk * z));
        }
      }
      // the Véu: a ragged ceiling of ash overhead, pulled back as it tears open
      const syB = Math.round(H * (0.09 + 0.05 * noise1(lb / 260, seed + 21) + 0.018 * noise1(lb / 60, seed + 4) - 0.16 * sun + 0.07 * veil));
      const gy = T.groundY(wx);
      const syG = Math.round((gy - top) * z);
      const wet = sim.wet[clamp(Math.floor(wx / 16), 0, sim.wet.length - 1)] ?? 0;
      const life = sim.forest.lifeAt(wx);
      const green = Math.max(Math.min(1, life * 0.45), wet * 0.4, wx < b.factoryEnd ? 0.12 : 0);
      const n = hash1(Math.floor(wx / 5), 3) * 0.14 - 0.07;
      const high = b.groundBase - gy;
      const isRock = high > 140;
      const beachK = smoothstep(T.sea.x1 + 70, T.sea.x1 + 10, wx);
      const soil = isRock ? rock : mixC(mixC(mixC(dry, wetC, green * 0.9), sand, beachK * 0.8), mul(dry, 0.7), Math.min(0.5, wet * 0.6));
      const grass = isRock && high > 300 ? snow : mixC(mixC(gD, gW, Math.min(1, green * 1.1)), [196, 172, 124], beachK);
      // tufts: grass is thicker and more ragged where the land is alive
      const grassD = 4 + 4 * green + hash1(Math.floor(wx / 4), 8) * 3;
      const grassC = packC(grass, 1 + n), grassHi = packC(mixC(grass, glowC, 0.45 * glowK + 0.1)), grassDk = packC(grass, 0.72 + n);
      const soilLt = packC(soil, 1.3 + n);
      const base = isRock ? rock : dirt;
      const shoreK = clamp((wx - (T.sea.x1 - 400)) / 400, 0, 1);
      const wave = (2.5 + 3 * shoreK) * Math.sin(wx / 38 + this.time * 1.6) + 2 * Math.sin(wx / 15 - this.time * 2.4) + 4 * Math.sin(wx / 130 + this.time * 0.7);
      const inSea = wx < T.sea.x1 && gy > T.seaLevel + wave;
      const sw = inSea ? Math.round((T.seaLevel + wave - top) * z) : H + 1;
      const crest = wave > 4.5;
      const moonCol = sx > sunCols0 && sx < sunCols1;
      const ix = Math.floor(wx / 2);
      const crackable = !isRock && green < 0.45;
      const tx = Math.floor(wx / 8), fx = wx - tx * 8;
      const sky = Math.min(syF, syG, sw, H);
      skyEnd[sx] = sky;
      this.ceil[sx] = syB;
      let i = sx, y = 0;
      // sky (stars and the sun are added afterwards, only where they are)
      const yb = Math.max(0, Math.min(sky, syB));
      for (; y < yb; y++, i += W) buf[i] = band[y];
      if (y < sky) { buf[i] = rim[y]; y++; i += W; }
      if (y < sky) { buf[i] = rim[y]; y++; i += W; }
      for (; y < sky; y++, i += W) buf[i] = rows[y];
      for (; y < H; y++, i += W) {
        if (y >= sw && y < syG) {
          const dd = (y - sw) / z;
          let c = waterL[Math.min(N, (dd / 120 * N) | 0)];
          if (moonCol && dd < 160 && hash1(((y >> 1) * 31) + tick, sx) > 0.55 + dd / 400) c = shine;
          else if (dd < 40 && hash1(ix * 3 + ((y / 3) | 0) + tick, 4) > 0.97) c = spark;
          if (y <= sw + 1) c = crest || hash1(ix + tick, 1) > 0.85 ? foam : foamSoft;
          else if (crest && y <= sw + 3) c = foamSoft;
          buf[i] = c;
          continue;
        }
        if (y < syG) {
          if (y < syM) buf[i] = y < syF0 ? (y === syF ? farTreeHi : farTreeC) : y === syF ? farTop : farL[Math.min(N, ((y - syF0) / zF * N) | 0)];
          else buf[i] = y < syM0 ? (y === syM ? midTreeHi : midTreeC) : y === syM ? midTop : midL[Math.min(N, ((y - syM0) / zM * N) | 0)];
          continue;
        }
        const d = (y - syG) / z;
        let c: number;
        if (d < grassD && sw > syG) { buf[i] = y === syG ? grassHi : d > grassD - 1.5 ? grassDk : grassC; continue; }
        // blocks of earth (8 units), each a little different, lit on top-left and shaded bottom-right;
        // stone blocks become common deeper down, with the odd glint of ore
        const ty = Math.floor(d / 8), fy = d - ty * 8;
        const hv = hash1(tx * 197 + ty * 31, 5);
        const deep = d > 30 ? Math.min(1, (d - 30) / 90) : 0;
        const stone = isRock || hv > 0.93 - deep * 0.35;
        let r0: number, g0: number, b0: number;
        if (stone) { r0 = rock[0]; g0 = rock[1]; b0 = rock[2]; }
        else if (d < 22) { r0 = soil[0]; g0 = soil[1]; b0 = soil[2]; }
        else { const k = Math.min(1, (d - 22) / 30); r0 = soil[0] + (base[0] - soil[0]) * k; g0 = soil[1] + (base[1] - soil[1]) * k; b0 = soil[2] + (base[2] - soil[2]) * k; }
        let f = (1 + n) * (0.9 + 0.2 * hv) * (1 - deep * 0.35);
        if (fy < 1.2 || fx < 1.2) f *= 1.14; else if (fy > 6.8 || fx > 6.8) f *= 0.78;
        if (crackable && d < 24 && !stone) {
          const u = wx + d * 0.7;
          if (Math.abs(u % 14) < 1.1 && hash1(Math.floor(u / 14), Math.floor(d / 7) + 11) > 0.45) f *= 0.7;
        }
        c = pack(r0 * f, g0 * f, b0 * f);
        if (stone && deep > 0.2 && hv > 0.985) c = hv > 0.993 ? ore1 : ore2;
        else if (d < grassD + 2.5 && sw > syG) c = soilLt; // sunlit lip under the grass
        buf[i] = c;
      }
    }
    // stars, only over open sky
    if (starA > 0.02) {
      for (const s of this.stars) {
        if (s.y >= skyEnd[s.x] || s.y <= this.ceil[s.x]) continue;
        const tw = starA * (0.5 + 0.5 * Math.sin(this.time * 3 + s.ph));
        const o = s.y * 3;
        const sp = pack(rr[o] + (230 - rr[o]) * tw, rr[o + 1] + (236 - rr[o + 1]) * tw, rr[o + 2] + (255 - rr[o + 2]) * tw);
        buf[s.y * W + s.x] = sp;
        if (s.big && s.x + 1 < W && s.y + 1 < skyEnd[s.x + 1]) { buf[s.y * W + s.x + 1] = sp; buf[(s.y + 1) * W + s.x] = sp; }
      }
    }
    // the pale sun behind the Véu (warm and bigger as it tears open)
    if (sunA > 0.05) {
      const gr = sunR * 4, x0 = Math.max(0, Math.floor(sunX - gr)), x1 = Math.min(W - 1, Math.ceil(sunX + gr));
      const y0 = Math.max(0, Math.floor(sunY - gr)), y1 = Math.min(H - 1, Math.ceil(sunY + gr));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (y >= skyEnd[x]) continue;
        const dx = x - sunX, dy = y - sunY, d2 = dx * dx + dy * dy;
        if (d2 >= gr * gr) continue;
        const k = d2 < sunR * sunR ? sunA : Math.pow(1 - Math.sqrt(d2) / gr, 2) * 0.55 * sunA;
        const j = y * W + x, v = buf[j];
        const r0 = v & 255, g0 = (v >> 8) & 255, b0 = (v >> 16) & 255;
        buf[j] = pack(r0 + (sunC[0] - r0) * k, g0 + (sunC[1] - g0) * k, b0 + (sunC[2] - b0) * k);
      }
    }
    this.ctx.putImageData(this.img, 0, 0);
  }

  // ───────────────────────── life in the far sky ─────────────────────────
  /**
   * Rare visitors crossing the distant sky (screen space, behind the world): a flying saucer,
   * a sky serpent, a swarm of fairies, meteors, drifting lanterns. Some can be tapped.
   */
  private drawSkyLife(sim: Sim, cam: Camera, dt: number) {
    const c = this.ctx, W = cam.lowW, H = cam.lowH, t = this.time;
    this.skyTimer -= dt;
    if (this.skyTimer <= 0) {
      this.skyTimer = 35 + this.rand() * 45;
      const v = this.rand();
      const kind: SkyKind = v < 0.22 ? 'ufo' : v < 0.4 ? 'serpent' : v < 0.62 ? 'fairies' : v < 0.85 ? 'meteor' : 'lanterns';
      const dir = this.rand() < 0.5 ? 1 : -1;
      const dur = { ufo: 16, serpent: 30, fairies: 18, meteor: 1.4, lanterns: 26 }[kind];
      this.sky.push({ kind, t: 0, dur, dir, y: H * (0.12 + this.rand() * 0.2), seed: this.rand() * 1000, done: false });
      if (kind === 'meteor' && this.rand() < 0.5) this.sky.push({ kind, t: -0.3, dur, dir, y: H * (0.08 + this.rand() * 0.15), seed: this.rand() * 1000, done: false });
    }
    const end = this.skyEnd;
    const visible = (x: number, y: number) => x >= 0 && x < W && y < (end[x | 0] ?? H);
    const light = (x: number, y: number, r: number, col: string, a: number) =>
      this.lights.push({ x: cam.left + x / cam.zoom, y: cam.top + y / cam.zoom, r: r / cam.zoom, col, a });
    const s = Math.max(1, Math.min(W, H) / 220); // sprite scale in low-res pixels
    for (const e of this.sky) {
      e.t += dt;
      const k = e.t / e.dur;
      if (k >= 1 || e.t < 0) continue;
      const along = e.dir > 0 ? -0.1 * W + k * 1.2 * W : 1.1 * W - k * 1.2 * W;
      e.x = along;
      switch (e.kind) {
        case 'ufo': {
          // glides, pauses mid-sky to shine a beam, then darts off
          const pause = k > 0.42 && k < 0.6;
          const x = e.dir > 0 ? (k < 0.42 ? -0.1 * W + (k / 0.42) * 0.6 * W : pause ? 0.5 * W : 0.5 * W + ((k - 0.6) / 0.4) * 0.65 * W)
            : (k < 0.42 ? 1.1 * W - (k / 0.42) * 0.6 * W : pause ? 0.5 * W : 0.5 * W - ((k - 0.6) / 0.4) * 0.65 * W);
          const y = e.y + Math.sin(t * 2 + e.seed) * 3 * s;
          e.x = x; e.cy = y;
          if (!visible(x, y)) break;
          if (pause) {
            const g = c.createLinearGradient(0, y, 0, y + 60 * s);
            g.addColorStop(0, 'rgba(160,255,200,0.35)'); g.addColorStop(1, 'rgba(160,255,200,0)');
            c.fillStyle = g;
            c.beginPath(); c.moveTo(x - 4 * s, y + 3 * s); c.lineTo(x - 18 * s, y + 60 * s); c.lineTo(x + 18 * s, y + 60 * s); c.lineTo(x + 4 * s, y + 3 * s); c.fill();
          }
          c.fillStyle = '#2a2e3a'; c.beginPath(); c.ellipse(x, y, 12 * s, 3.5 * s, 0, 0, 7); c.fill();
          c.fillStyle = '#7a8aa0'; c.beginPath(); c.ellipse(x, y - 1 * s, 11 * s, 2.5 * s, 0, Math.PI, Math.PI * 2); c.fill();
          c.fillStyle = 'rgba(150,240,220,0.85)'; c.beginPath(); c.ellipse(x, y - 3 * s, 4.5 * s, 3.5 * s, 0, Math.PI, Math.PI * 2); c.fill();
          for (let i = 0; i < 5; i++) {
            const on = Math.floor(t * 6 + i) % 5 === 0;
            c.fillStyle = on ? '#ffe066' : '#e0524a';
            c.fillRect(x - 9 * s + i * 4.5 * s, y + 0.5 * s, 1.5 * s, 1.5 * s);
          }
          light(x, y, 30 * s, '150,240,220', 0.5);
          break;
        }
        case 'serpent': {
          // a long sky serpent swimming slowly through the haze
          const n = 16;
          for (let i = n - 1; i >= 0; i--) {
            const sx = along - e.dir * i * 7 * s, sy = e.y + 14 * s + Math.sin(t * 1.3 - i * 0.55 + e.seed) * 9 * s;
            if (!visible(sx, sy)) continue;
            const r = (i === 0 ? 5.5 : 5 - i * 0.22) * s;
            c.fillStyle = `rgba(28,30,46,${0.75 - i * 0.02})`;
            c.beginPath(); c.arc(sx, sy, Math.max(1, r), 0, 7); c.fill();
            if (i % 3 === 1) { c.fillStyle = 'rgba(70,90,130,0.6)'; c.fillRect(sx - 1, sy - r, 2, r * 0.5); }
            if (i === 0) {
              e.cx = sx; e.cy = sy;
              c.fillStyle = '#ffcf5a'; c.fillRect(sx + e.dir * 2 * s, sy - 1.5 * s, 1.5 * s, 1.5 * s);
              light(sx, sy, 16 * s, '255,200,90', 0.4);
            }
          }
          break;
        }
        case 'fairies': {
          const cx = along, cy = e.y + 20 * s + Math.sin(t * 0.9 + e.seed) * 12 * s;
          e.cx = cx; e.cy = cy;
          for (let i = 0; i < 9; i++) {
            const a = t * (1.5 + i * 0.13) + i * 2.1 + e.seed;
            const x = cx + Math.cos(a) * (6 + i * 1.6) * s, y = cy + Math.sin(a * 1.3) * (4 + i) * s;
            if (!visible(x, y)) continue;
            const tw = 0.6 + 0.4 * Math.sin(t * 9 + i * 3);
            c.fillStyle = i % 3 === 0 ? `rgba(255,190,240,${tw})` : `rgba(200,255,170,${tw})`;
            c.fillRect(x, y, Math.max(2, 2.2 * s), Math.max(2, 2.2 * s));
            c.fillStyle = `rgba(230,255,230,${0.25 * tw})`;
            c.fillRect(x - e.dir * 3 * s, y, 3 * s, 1);
          }
          light(cx, cy, 34 * s, '210,255,190', 0.45);
          break;
        }
        case 'meteor': {
          const x0 = e.dir > 0 ? W * 0.15 : W * 0.85, x = x0 + e.dir * k * W * 0.45, y = e.y + k * H * 0.18;
          if (!visible(x, y)) break;
          const g = c.createLinearGradient(x, y, x - e.dir * 40 * s, y - 16 * s);
          g.addColorStop(0, `rgba(255,240,210,${1 - k})`); g.addColorStop(1, 'rgba(255,240,210,0)');
          c.strokeStyle = g; c.lineWidth = Math.max(1, s);
          c.beginPath(); c.moveTo(x, y); c.lineTo(x - e.dir * 40 * s, y - 16 * s); c.stroke();
          break;
        }
        case 'lanterns': {
          for (let i = 0; i < 7; i++) {
            const x = along + (i - 3) * 14 * s + Math.sin(t * 0.7 + i) * 3 * s, y = e.y + 50 * s - k * 40 * s + ((i * 37) % 23) * s;
            if (!visible(x, y)) continue;
            c.fillStyle = '#ffb04a'; c.fillRect(x, y, 2.5 * s, 3 * s);
            c.fillStyle = '#ffe9a0'; c.fillRect(x + 0.6 * s, y + 1.5 * s, 1.2 * s, 1.2 * s);
            light(x, y, 10 * s, '255,180,90', 0.35);
          }
          break;
        }
      }
    }
    this.sky = this.sky.filter(e => e.t < e.dur);
  }

  /** a tap in the sky: did it hit a visitor? (low-res screen coordinates) */
  skyHit(cam: Camera, wx: number, wy: number): SkyKind | null {
    const x = (wx - cam.left) * cam.zoom, y = (wy - cam.top) * cam.zoom;
    const r = Math.max(14, Math.min(cam.lowW, cam.lowH) / 12);
    for (const e of this.sky) {
      if (e.done || e.kind === 'meteor' || e.kind === 'lanterns' || e.cx == null && e.kind !== 'ufo') continue;
      const ex = e.kind === 'ufo' ? e.x : e.cx, ey = e.cy;
      if (ex == null || ey == null || Math.hypot(ex - x, ey - y) > r) continue;
      e.done = true;
      if (e.kind === 'ufo') e.t = Math.max(e.t, e.dur * 0.6); // startled, it darts away
      if (e.kind === 'fairies') e.t = e.dur; // they vanish in a puff
      return e.kind;
    }
    return null;
  }

  /** parallax silhouettes standing on the mid hills */
  private drawFarProps(sim: Sim, cam: Camera) {
    const c = this.ctx, b = sim.biome, W = cam.lowW, z = cam.zoom;
    const col = css(mixC(mixC(hex(b.palette.nearHills), [10, 10, 14], 0.35), STORM_TOP, this.mood.storm * 0.4));
    c.fillStyle = col;
    c.strokeStyle = col;
    const ps = z * 0.8;
    for (const f of this.far) {
      const sx = (f.x - cam.x * 0.5) * z + W / 2;
      if (sx < -80 * ps || sx > W + 80 * ps) continue;
      const sy = (b.groundBase - this.midH(f.x, b.hills.seed) - cam.top) * z + 1;
      c.setTransform(ps * f.s, 0, 0, ps * f.s, sx, sy);
      switch (f.kind) {
        case 'tree':
          c.fillRect(-2, -38, 4, 38);
          c.lineWidth = 2.5;
          c.beginPath(); c.moveTo(0, -24); c.lineTo(-13, -40); c.moveTo(0, -30); c.lineTo(12, -46); c.moveTo(0, -38); c.lineTo(-4, -52); c.stroke();
          break;
        case 'mill': {
          c.beginPath(); c.moveTo(-8, 0); c.lineTo(-3, -62); c.lineTo(3, -62); c.lineTo(8, 0); c.fill();
          const a = this.time * 0.6 + f.x;
          c.lineWidth = 2;
          c.beginPath();
          for (let k = 0; k < 4; k++) { const t = a + (k * Math.PI) / 2; c.moveTo(0, -62); c.lineTo(Math.cos(t) * 24, -62 + Math.sin(t) * 24); }
          c.stroke();
          break;
        }
        case 'barn': c.fillRect(-22, -22, 44, 22); c.beginPath(); c.moveTo(-26, -22); c.lineTo(0, -38); c.lineTo(26, -22); c.fill(); break;
        case 'pole': c.fillRect(-1.5, -50, 3, 50); c.fillRect(-10, -46, 20, 2.5); break;
        case 'chimney': c.fillRect(-5, -70, 10, 70); c.fillRect(-12, -18, 24, 18); break;
      }
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ───────────────────────── world props ─────────────────────────
  private drawTargetMarkers(sim: Sim, cam: Camera, view: ViewState) {
    const c = this.ctx, b = sim.biome;
    const ok = sim.climate.humidity >= b.humidity.target;
    const [z0, z1] = sim.targetRange();
    const [r0, r1] = sim.regionRange();
    const g = c.createLinearGradient(0, cam.top, 0, b.groundBase);
    g.addColorStop(0, 'rgba(120,200,255,0)');
    g.addColorStop(1, ok ? 'rgba(140,255,170,0.10)' : 'rgba(120,190,255,0.07)');
    c.fillStyle = g;
    c.fillRect(z0, cam.top, z1 - z0, b.groundBase - cam.top);
    if (view.mode !== 'play') {
      c.strokeStyle = 'rgba(255,220,150,0.45)';
      c.lineWidth = 2 / cam.zoom;
      c.setLineDash([10 / cam.zoom, 8 / cam.zoom]);
      c.beginPath();
      c.moveTo(b.factoryEnd, cam.top); c.lineTo(b.factoryEnd, sim.terrain.groundY(b.factoryEnd));
      const lim = Math.min(b.targetStart - 60, sim.rootLimit()); c.moveTo(lim, cam.top); c.lineTo(lim, sim.terrain.groundY(lim));
      c.stroke();
      c.setLineDash([]);
    }
    // stakes between the parcels of land
    for (let k = 1; k < ZONES; k++) {
      const [a] = sim.forest.zoneRange(k);
      const x = r0 + a * CELL, gy = sim.terrain.groundY(x);
      if (x < cam.left - 20 || x > cam.left + cam.viewW + 20) continue;
      c.fillStyle = '#2a1c12'; c.fillRect(x - 2, gy - 26, 4, 26);
      c.fillStyle = sim.forest.zoneVitality(k - 1) >= b.forest.awaken ? '#7ac04a' : '#c8a060'; c.fillRect(x - 4, gy - 30, 8, 5);
    }
    for (const x of [r0, r1]) {
      const gy = sim.terrain.groundY(x);
      c.fillStyle = '#2a1c12'; c.fillRect(x - 3, gy - 74, 6, 74);
      c.fillStyle = '#4a3220'; c.fillRect(x - 2, gy - 74, 3, 74);
      const wave = Math.sin(this.time * 3 + x) * 3;
      c.fillStyle = ok ? '#5aa04a' : '#8a3a2a';
      c.beginPath(); c.moveTo(x + 3, gy - 72); c.lineTo(x + 30, gy - 68 + wave); c.lineTo(x + 24, gy - 60 + wave); c.lineTo(x + 30, gy - 52 + wave); c.lineTo(x + 3, gy - 56); c.fill();
      this.lights.push({ x: x + 14, y: gy - 64, r: 40, col: '255,190,120', a: 0.25 });
    }
  }

  private drawDecor(sim: Sim, cam: Camera, dt: number) {
    const c = this.ctx, T = sim.terrain;
    const x0 = cam.left - 300, x1 = cam.left + cam.viewW + 300;
    const he = this.mood.health;
    let prevPole: { x: number; y: number } | null = null;
    for (const d of this.decor) {
      // dead trees and skulls give way where the forest has come back
      if ((d.kind === 'deadtree' || d.kind === 'skull') && sim.forest.lifeAt(d.x) > 1.6) continue;
      const gy = T.groundY(d.x);
      if (d.kind === 'pole') {
        const top = { x: d.x, y: gy - 130 };
        if (prevPole && top.x > x0 && prevPole.x < x1) {
          c.strokeStyle = 'rgba(20,16,14,0.8)';
          c.lineWidth = 1.2;
          for (const off of [0, 8]) {
            c.beginPath();
            c.moveTo(prevPole.x, prevPole.y + off);
            c.quadraticCurveTo((prevPole.x + top.x) / 2, Math.max(prevPole.y, top.y) + off + 34, top.x, top.y + off);
            c.stroke();
          }
        }
        prevPole = top;
        if (d.x < x0 || d.x > x1) continue;
        c.fillStyle = '#2b1d14'; c.fillRect(d.x - 3, gy - 134, 6, 134);
        c.fillStyle = '#3d2a1c'; c.fillRect(d.x - 2, gy - 134, 2, 134);
        c.fillStyle = '#2b1d14'; c.fillRect(d.x - 18, gy - 128, 36, 4);
        c.fillStyle = '#9a8f7a'; c.fillRect(d.x - 16, gy - 132, 3, 4); c.fillRect(d.x + 13, gy - 132, 3, 4);
        continue;
      }
      if (d.x < x0 || d.x > x1) continue;
      c.save();
      c.translate(d.x, gy);
      c.scale(d.flip ? -d.s : d.s, d.s);
      const fx = d.flip ? -1 : 1;
      switch (d.kind) {
        case 'shack': this.shack(d.x, gy, fx); break;
        case 'pier': {
          c.restore(); c.save(); c.translate(d.x, T.seaLevel);
          const deck = -16;
          c.fillStyle = '#2a1a10';
          for (let x = -150; x <= 0; x += 30) c.fillRect(x - 3, deck, 6, 60);
          c.fillStyle = '#5a3a22'; c.fillRect(-160, deck - 6, 170, 7);
          c.fillStyle = '#3e2816'; for (let x = -160; x < 10; x += 10) c.fillRect(x, deck - 6, 1, 7);
          c.fillStyle = '#2a1a10'; c.fillRect(-156, deck - 40, 4, 34);
          const fl = 0.85 + 0.15 * Math.sin(this.time * 7 + 3);
          c.fillStyle = '#1a120c'; c.fillRect(-160, deck - 48, 12, 12);
          c.fillStyle = `rgb(255,${(190 + 40 * fl) | 0},110)`; c.fillRect(-158, deck - 46, 8, 8);
          this.lights.push({ x: d.x - 154, y: T.seaLevel + deck - 42, r: 110 * fl, col: '255,190,110', a: 0.7 });
          // rowboat tied to the pier, bobbing
          const bob = Math.sin(this.time * 1.6) * 2;
          c.fillStyle = '#3a2416'; c.beginPath(); c.moveTo(-120, bob - 4); c.lineTo(-70, bob - 4); c.lineTo(-78, bob + 6); c.lineTo(-112, bob + 6); c.fill();
          c.fillStyle = '#6a4626'; c.fillRect(-118, bob - 6, 46, 3);
          break;
        }
        case 'wreck': {
          c.restore(); c.save(); c.translate(d.x, T.seaLevel); c.scale(d.s, d.s);
          c.fillStyle = '#120e10';
          c.beginPath(); c.moveTo(-70, 6); c.lineTo(-50, -18); c.lineTo(40, -26); c.lineTo(70, -8); c.lineTo(60, 8); c.fill();
          c.fillRect(-10, -110, 5, 90); c.fillRect(-40, -96, 64, 3);
          c.strokeStyle = '#120e10'; c.lineWidth = 1.2;
          c.beginPath(); c.moveTo(-8, -110); c.lineTo(60, -20); c.moveTo(-8, -110); c.lineTo(-60, -16); c.stroke();
          c.fillStyle = 'rgba(30,26,30,0.9)'; c.beginPath(); c.moveTo(-6, -92); c.lineTo(22, -60); c.lineTo(-6, -50); c.fill();
          break;
        }
        case 'buoy': {
          c.restore(); c.save();
          const bob = Math.sin(this.time * 2 + 1) * 3;
          c.translate(d.x, T.seaLevel + bob); c.rotate(Math.sin(this.time * 1.3) * 0.15);
          c.fillStyle = '#1a1210'; c.fillRect(-7, -14, 14, 16);
          c.fillStyle = '#a83a2a'; c.fillRect(-6, -13, 12, 6);
          c.fillStyle = '#d8d0c0'; c.fillRect(-6, -7, 12, 4);
          c.fillStyle = '#1a1210'; c.fillRect(-1, -26, 2, 12);
          const on = Math.sin(this.time * 3) > 0.3;
          c.fillStyle = on ? '#ff5a3a' : '#5a2a20'; c.fillRect(-3, -30, 6, 5);
          if (on) this.lights.push({ x: d.x, y: T.seaLevel + bob - 28, r: 40, col: '255,90,60', a: 0.6 });
          break;
        }
        case 'lantern': {
          c.fillStyle = '#24170f'; c.fillRect(-2, -58, 4, 58); c.fillRect(-2, -58, 14, 3); c.fillRect(9, -55, 2, 5);
          const fl = 0.85 + 0.15 * Math.sin(this.time * 9 + d.seed) * Math.sin(this.time * 3.7);
          c.fillStyle = '#1a120c'; c.fillRect(5, -50, 10, 12);
          c.fillStyle = `rgb(255,${(190 + 40 * fl) | 0},110)`; c.fillRect(7, -48, 6, 8);
          this.lights.push({ x: d.x + 10 * fx * d.s, y: gy - 44 * d.s, r: 85 * fl, col: '255,190,110', a: 0.6 });
          break;
        }
        case 'crates':
          for (const [x, y, s] of [[-14, 0, 22], [8, 0, 18], [-6, -22, 18]] as const) {
            c.fillStyle = '#2a1a10'; c.fillRect(x - 1, y - s - 1, s + 2, s + 2);
            c.fillStyle = '#7a5530'; c.fillRect(x, y - s, s, s);
            c.fillStyle = '#5a3c20'; c.fillRect(x, y - s / 2 - 1, s, 2); c.fillRect(x + s / 2 - 1, y - s, 2, s);
          }
          break;
        case 'barrel':
          c.fillStyle = '#20140c'; c.fillRect(-9, -26, 18, 26);
          c.fillStyle = '#6b3f22'; c.fillRect(-8, -25, 16, 24);
          c.fillStyle = '#3a3a3e'; c.fillRect(-8, -21, 16, 2); c.fillRect(-8, -8, 16, 2);
          c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(-6, -25, 3, 24);
          break;
        case 'fence':
          c.fillStyle = '#3a2818';
          for (let x = -30; x <= 30; x += 15) c.fillRect(x - 2, -24 + ((hash1(x, d.seed) * 6) | 0), 4, 24);
          c.fillRect(-32, -18, 64, 3); c.fillRect(-32, -9, 40, 3);
          break;
        case 'deadtree': {
          c.strokeStyle = '#2a1c14'; c.fillStyle = '#2a1c14';
          c.fillRect(-4, -70, 8, 70);
          c.lineWidth = 4;
          c.beginPath(); c.moveTo(0, -40); c.lineTo(-24, -70); c.moveTo(0, -55); c.lineTo(20, -84); c.moveTo(0, -68); c.lineTo(-6, -96); c.stroke();
          c.lineWidth = 2;
          c.beginPath(); c.moveTo(-16, -60); c.lineTo(-28, -64); c.moveTo(12, -72); c.lineTo(24, -70); c.moveTo(-3, -84); c.lineTo(6, -100); c.stroke();
          if (he > 0.35 && d.x > sim.biome.targetStart - 300) {
            c.fillStyle = `rgba(80,140,60,${Math.min(1, (he - 0.35) * 1.4)})`;
            c.beginPath(); c.arc(-14, -74, 14, 0, 7); c.arc(14, -86, 12, 0, 7); c.fill();
          }
          break;
        }
        case 'rock':
          c.fillStyle = '#2e2a28'; c.beginPath(); c.moveTo(-16, 0); c.lineTo(-11, -13); c.lineTo(2, -18); c.lineTo(14, -9); c.lineTo(17, 0); c.fill();
          c.fillStyle = '#5e5852'; c.beginPath(); c.moveTo(-10, -11); c.lineTo(2, -16); c.lineTo(8, -10); c.lineTo(-4, -8); c.fill();
          break;
        case 'skull':
          c.fillStyle = '#d8ccb0'; c.fillRect(-8, -9, 14, 8); c.fillRect(-12, -6, 4, 3);
          c.fillStyle = '#2a2420'; c.fillRect(-4, -7, 3, 3); c.fillRect(1, -7, 3, 3);
          c.fillStyle = '#d8ccb0'; c.fillRect(6, -12, 2, 5); c.fillRect(-10, -12, 2, 5);
          break;
        case 'sign':
          c.fillStyle = '#2a1c12'; c.fillRect(-2, -44, 4, 44);
          c.fillStyle = '#6a4626'; c.fillRect(-20, -46, 40, 16);
          c.fillStyle = '#e8d8b0'; c.fillRect(-14, -41, 6, 5); c.fillRect(-10, -43, 8, 7); c.fillRect(-4, -41, 6, 5);
          c.fillStyle = '#4fa3d8'; c.fillRect(6, -40, 2, 4); c.fillRect(10, -39, 2, 4); c.fillRect(14, -40, 2, 4);
          break;
        case 'tower':
          c.fillStyle = '#2a1c14';
          c.fillRect(-20, -90, 4, 90); c.fillRect(16, -90, 4, 90);
          c.strokeStyle = '#2a1c14'; c.lineWidth = 2;
          c.beginPath(); for (let y = -90; y < 0; y += 30) { c.moveTo(-18, y); c.lineTo(18, y + 30); c.moveTo(18, y); c.lineTo(-18, y + 30); } c.stroke();
          c.fillStyle = '#4a3020'; c.fillRect(-26, -130, 52, 42);
          c.fillStyle = '#3a2416'; for (let x = -24; x < 26; x += 8) c.fillRect(x, -130, 2, 42);
          c.fillStyle = '#2a1c14'; c.fillRect(-28, -134, 56, 6); c.fillRect(-28, -92, 56, 4);
          break;
        case 'cart':
          c.fillStyle = '#4a3020'; c.fillRect(-26, -24, 52, 14);
          c.fillStyle = '#2a1c14'; c.fillRect(-26, -26, 52, 3); c.fillRect(24, -20, 26, 3);
          for (const wx of [-15, 15]) { c.fillStyle = '#1e140e'; c.beginPath(); c.arc(wx, -9, 9, 0, 7); c.fill(); c.fillStyle = '#5a4030'; c.beginPath(); c.arc(wx, -9, 3, 0, 7); c.fill(); }
          c.fillStyle = '#6b5a48'; c.fillRect(-20, -30, 12, 6); c.fillRect(-6, -32, 14, 8);
          break;
        case 'windmill': {
          c.fillStyle = '#2a1c14';
          c.beginPath(); c.moveTo(-14, 0); c.lineTo(-4, -150); c.lineTo(4, -150); c.lineTo(14, 0); c.lineTo(10, 0); c.lineTo(2, -140); c.lineTo(-2, -140); c.lineTo(-10, 0); c.fill();
          c.strokeStyle = '#2a1c14'; c.lineWidth = 1.5;
          c.beginPath(); for (let y = -140; y < 0; y += 28) { c.moveTo(-3 - (y + 150) * 0.07, y); c.lineTo(3 + (y + 178) * 0.07, y + 28); } c.stroke();
          sim.wind.natural(d.x, gy - 150, sim.time, this.tmp);
          d.a += this.tmp.x * dt * 0.05;
          c.fillStyle = '#3a2a1e'; c.fillRect(-6, -156, 12, 10);
          for (let k = 0; k < 12; k++) {
            const a = d.a + (k * Math.PI) / 6;
            c.strokeStyle = k % 3 === 0 ? '#2a1c14' : '#4a3a2a'; c.lineWidth = 3;
            c.beginPath(); c.moveTo(0, -151); c.lineTo(Math.cos(a) * 34, -151 + Math.sin(a) * 34); c.stroke();
          }
          c.fillStyle = '#5a4a3a'; c.beginPath(); c.arc(0, -151, 4, 0, 7); c.fill();
          c.fillStyle = '#2a1c14'; c.beginPath(); c.moveTo(4, -154); c.lineTo(30, -160); c.lineTo(30, -146); c.lineTo(4, -149); c.fill();
          break;
        }
        case 'cabin':
          c.fillStyle = '#2a1a10'; c.fillRect(-34, -40, 68, 40);
          c.fillStyle = '#5a3a22'; c.fillRect(-32, -38, 64, 38);
          c.fillStyle = '#3e2816'; for (let y = -34; y < 0; y += 7) c.fillRect(-32, y, 64, 2);
          c.fillStyle = '#1e140e'; c.beginPath(); c.moveTo(-40, -38); c.lineTo(-6, -64); c.lineTo(10, -52); c.lineTo(40, -38); c.fill();
          c.fillStyle = '#15100c'; c.fillRect(-8, -24, 14, 24);
          c.fillStyle = he > 0.6 ? '#ffcf70' : '#15100c'; c.fillRect(14, -28, 10, 9);
          if (he > 0.6) this.lights.push({ x: d.x + 19 * fx * d.s, y: gy - 24 * d.s, r: 60, col: '255,200,110', a: Math.min(0.6, (he - 0.6) * 2) });
          break;
        case 'well':
          c.fillStyle = '#3a3532'; c.fillRect(-18, -20, 36, 20);
          c.fillStyle = '#5a544e'; for (let x = -18; x < 18; x += 9) c.fillRect(x, -20 + (((x / 9) & 1) * 2), 8, 6);
          c.fillStyle = '#2a1c14'; c.fillRect(-16, -50, 3, 32); c.fillRect(13, -50, 3, 32); c.fillRect(-20, -54, 40, 5);
          c.fillStyle = '#6b6058'; c.fillRect(-1, -48, 2, 16); c.fillStyle = '#4a3a2a'; c.fillRect(-5, -34, 10, 8);
          break;
      }
      c.restore();
    }
    // tumbleweeds roll with the natural wind across the dry plain (they stop once it's green)
    const b = sim.biome;
    if (he > 0.7) return;
    for (const tw of this.tumble) {
      sim.wind.natural(tw.x, T.groundY(tw.x) - 20, sim.time, this.tmp);
      tw.vx += (this.tmp.x * 1.4 - tw.vx) * Math.min(1, dt * 0.8);
      tw.x += tw.vx * dt;
      tw.vy += 400 * dt;
      tw.y += tw.vy * dt;
      if (tw.y > 0) { tw.y = 0; tw.vy = -60 - Math.abs(tw.vx) * 1.2 * this.rand(); }
      tw.a += (tw.vx * dt) / 12;
      if (tw.x > b.targetStart - 50 || tw.x < b.factoryEnd - 100) { tw.x = b.factoryEnd + this.rand() * 100; tw.y = -20; }
      if (tw.x < x0 || tw.x > x1) continue;
      const gy = T.groundY(tw.x);
      c.save();
      c.translate(tw.x, gy - 12 + tw.y);
      c.rotate(tw.a);
      c.strokeStyle = '#7a5e3a'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(0, 0, 11, 0, 7); c.moveTo(-10, -3); c.lineTo(9, 5); c.moveTo(-6, 8); c.lineTo(5, -9); c.moveTo(-9, 5); c.lineTo(8, -4); c.stroke();
      c.restore();
    }
  }

  private shack(wx: number, gy: number, fx: number) {
    const c = this.ctx;
    c.fillStyle = '#20140c'; c.fillRect(-36, -58, 72, 58);
    c.fillStyle = '#5e3e24'; c.fillRect(-34, -56, 68, 56);
    c.fillStyle = '#4a301c'; for (let x = -34; x < 34; x += 9) c.fillRect(x, -56, 2, 56);
    c.fillStyle = '#6b6058'; c.beginPath(); c.moveTo(-44, -54); c.lineTo(-6, -82); c.lineTo(44, -54); c.fill();
    c.fillStyle = '#4a4440'; for (let i = 0; i < 5; i++) c.fillRect(-36 + i * 16, -62 - Math.abs(2 - i) * 4, 14, 3);
    c.fillStyle = '#2a1a10'; c.fillRect(-26, -40, 16, 40);
    c.fillStyle = '#ffc870'; c.fillRect(8, -42, 14, 11);
    c.fillStyle = '#2a1a10'; c.fillRect(14, -42, 2, 11); c.fillRect(8, -37, 14, 2);
    c.fillStyle = '#3a3a3e'; c.fillRect(18, -96, 8, 30);
    this.lights.push({ x: wx + 15 * fx, y: gy - 36, r: 70, col: '255,190,110', a: 0.55 });
  }

  private drawVegetation(sim: Sim, cam: Camera, dt: number) {
    const c = this.ctx, p = sim.biome.palette;
    const gd = hex(p.grassDry), gw = hex(p.grassWet);
    const x0 = cam.left - 80, x1 = cam.left + cam.viewW + 80;
    const veg = sim.biome.vegetation;
    for (const pl of this.plants) {
      if (pl.th > -100) {
        const target = smoothstep(pl.th - 0.1, pl.th + 0.4, sim.forest.lifeAt(pl.x));
        const before = pl.g;
        pl.g += (target - pl.g) * Math.min(1, dt * 1.5);
        if (before < 0.5 && pl.g >= 0.5 && pl.kind !== 'grass' && pl.x > x0 && pl.x < x1) this.burst(pl.x, sim.terrain.groundY(pl.x) - 20, 7, 0);
      }
      if (pl.x < x0 || pl.x > x1) continue;
      if (sim.creature.awake && pl.kind !== 'grass' && pl.x > sim.creature.geometry(this.cSize).headX - 10 && pl.x < sim.creature.anchor + 20) continue;
      const gy = sim.terrain.groundY(pl.x);
      const g = pl.th <= -100 ? 0.35 : pl.g;
      const sway = Math.sin(this.time * 1.7 + pl.x * 0.05) * 1.5 * g;
      switch (pl.kind) {
        case 'grass': {
          const h = (3 + 12 * g) * pl.s;
          c.fillStyle = css(mixC(gd, gw, g));
          c.fillRect(pl.x, gy - h, 2, h);
          c.fillRect(pl.x + 3 + sway * 0.5, gy - h * 0.7, 2, h * 0.7);
          c.fillRect(pl.x - 3 + sway * 0.3, gy - h * 0.55, 2, h * 0.55);
          break;
        }
        case 'flower': {
          const h = (2 + 10 * g) * pl.s;
          c.fillStyle = css(mixC(gd, gw, g));
          c.fillRect(pl.x, gy - h, 2, h);
          if (g > 0.6) { c.fillStyle = pl.h > 0.66 ? '#ff7aa8' : pl.h > 0.33 ? '#ffe066' : '#c8a0ff'; c.fillRect(pl.x - 2 + sway, gy - h - 4, 6, 5); }
          break;
        }
        case 'bush': {
          const r = (3 + 9 * g) * pl.s;
          const col = mixC(mul(gd, 0.75), gw, g);
          c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(pl.x - r * 1.2, gy - 1, r * 2.4, 2);
          c.fillStyle = '#3a2a1c';
          c.fillRect(pl.x - 1, gy - r * 0.8, 2, r * 0.8);
          if (g < 0.08) { c.fillRect(pl.x - 4, gy - r, 1.5, r * 0.5); c.fillRect(pl.x + 3, gy - r * 0.9, 1.5, r * 0.4); break; }
          this.drawCanopy(pl, pl.x + sway * 0.4, gy - r * 0.75, r, col, 4, 0.55, g);
          if (g > 0.75 && pl.h > 0.5) {
            c.fillStyle = pl.h > 0.8 ? '#e0524a' : '#f0d060';
            for (let k = 0; k < 3; k++) c.fillRect(pl.x + (k - 1) * r * 0.55 + sway * 0.4, gy - r * (0.7 + 0.3 * ((k + pl.h * 7) % 2)), 2, 2);
          }
          break;
        }
        case 'tree': {
          const kind = veg === 'desert' ? 'cactus' : veg === 'alpine' || (veg === 'forest' && pl.h > 0.72) ? 'pine' : veg === 'savanna' ? 'acacia' : 'oak';
          const s = pl.s * (kind === 'cactus' ? 0.7 : kind === 'acacia' ? 1.1 : 1);
          const col = mixC(mul(gd, 0.75), gw, g);
          c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(pl.x - 22 * s, gy - 1, 44 * s, 2);
          if (kind === 'cactus') {
            const h = (14 + 46 * g) * s, cc = css(mixC(mul(gd, 0.7), [90, 140, 70], g)), dk = css(mul(mixC(mul(gd, 0.7), [90, 140, 70], g), 0.7));
            c.fillStyle = dk; c.fillRect(pl.x - 4 * s, gy - h, 8 * s, h);
            c.fillStyle = cc; c.fillRect(pl.x - 4 * s, gy - h, 5 * s, h);
            if (g > 0.4) {
              const ah = h * 0.35;
              c.fillStyle = dk; c.fillRect(pl.x - 12 * s, gy - h * 0.55 - ah, 5 * s, ah); c.fillRect(pl.x - 12 * s, gy - h * 0.55 - 4 * s, 10 * s, 4 * s);
              c.fillRect(pl.x + 7 * s, gy - h * 0.7 - ah * 0.8, 5 * s, ah * 0.8); c.fillRect(pl.x + 2 * s, gy - h * 0.7 - 4 * s, 10 * s, 4 * s);
            }
            if (g > 0.85) { c.fillStyle = '#ff7aa8'; c.fillRect(pl.x - 2 * s, gy - h - 3 * s, 4 * s, 3 * s); }
            break;
          }
          const h = 72 * s, tw = 7 * s;
          // trunk: tapered, lit from the left, with root flares
          c.fillStyle = '#2a1a10';
          c.beginPath(); c.moveTo(pl.x - tw * 0.9, gy); c.lineTo(pl.x - tw * 0.4, gy - h); c.lineTo(pl.x + tw * 0.4, gy - h); c.lineTo(pl.x + tw * 0.9, gy); c.closePath(); c.fill();
          c.fillStyle = '#4a3220'; c.fillRect(pl.x - tw * 0.5, gy - h * 0.95, tw * 0.35, h * 0.9);
          c.fillStyle = '#2a1a10'; c.fillRect(pl.x - tw * 1.6, gy - 2, tw * 3.2, 2);
          c.strokeStyle = '#2a1a10';
          c.lineWidth = 2.5 * s;
          c.beginPath();
          if (kind === 'pine') {
            for (let k = 0; k < 4; k++) { const yy = gy - h * (0.45 + k * 0.15); c.moveTo(pl.x, yy); c.lineTo(pl.x - (12 - k * 2) * s, yy + 5 * s); c.moveTo(pl.x, yy); c.lineTo(pl.x + (12 - k * 2) * s, yy + 5 * s); }
          } else {
            c.moveTo(pl.x, gy - h * 0.6); c.lineTo(pl.x - 18 * s, gy - h * 0.95);
            c.moveTo(pl.x, gy - h * 0.75); c.lineTo(pl.x + 16 * s, gy - h * 1.05);
            c.moveTo(pl.x - 9 * s, gy - h * 0.78); c.lineTo(pl.x - 12 * s, gy - h * 1.08);
          }
          c.stroke();
          if (g <= 0.02) break;
          if (kind === 'pine') {
            // stacked needle tiers, dark below and lit on the left edge
            const tiers = 4, wv = 26 * s * (0.35 + 0.65 * g);
            for (let k = 0; k < tiers; k++) {
              const yb = gy - h * 0.35 - k * h * 0.2, w = wv * (1 - k * 0.2), th = h * 0.32;
              const dx = sway * (0.3 + k * 0.2);
              c.fillStyle = css(mul(col, 0.6));
              c.beginPath(); c.moveTo(pl.x - w + dx, yb); c.lineTo(pl.x + dx, yb - th); c.lineTo(pl.x + w + dx, yb); c.closePath(); c.fill();
              c.fillStyle = css(col);
              c.beginPath(); c.moveTo(pl.x - w + dx, yb - 2); c.lineTo(pl.x + dx, yb - th); c.lineTo(pl.x + w * 0.35 + dx, yb - 2); c.closePath(); c.fill();
              c.fillStyle = css(mixC(col, [255, 250, 210], 0.22));
              c.fillRect(pl.x - w * 0.55 + dx, yb - th * 0.45, 2, 2);
            }
            break;
          }
          const cr = 28 * s * (0.3 + 0.7 * g);
          if (kind === 'acacia') this.drawCanopy(pl, pl.x + sway, gy - h - cr * 0.15, cr, col, 7, 0.32, g, 1.7);
          else this.drawCanopy(pl, pl.x + sway, gy - h - cr * 0.1, cr, col, 8, 0.5, g);
          break;
        }
      }
    }
  }

  /**
   * A crown of leaf clusters: each cluster gets a shadow, a body and a sunlit top-left,
   * plus a few leaf pixels. Layout is fixed per plant so it doesn't shimmer.
   */
  private drawCanopy(pl: Plant, cx: number, cy: number, r: number, col: RGB, n: number, flat: number, g: number, wide = 1) {
    const c = this.ctx;
    if (!pl.cl) {
      const q = rng(Math.floor(pl.x * 13 + pl.h * 1e5));
      pl.cl = [];
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + q() * 0.6;
        const d = k === 0 ? 0 : 0.45 + q() * 0.35;
        pl.cl.push(Math.cos(a) * d * wide, Math.sin(a) * d * flat - 0.08, 0.42 + q() * 0.3);
      }
    }
    const L = pl.cl;
    const dark = css(mul(col, 0.55)), mid = css(col), lite = css(mixC(col, [255, 250, 200], 0.2)), leaf = css(mixC(col, [255, 255, 220], 0.35));
    c.globalAlpha = 0.45 + 0.55 * g;
    c.fillStyle = dark;
    c.beginPath();
    for (let k = 0; k < L.length; k += 3) { const x = cx + L[k] * r + r * 0.08, y = cy + L[k + 1] * r + r * 0.12, rr = L[k + 2] * r; c.moveTo(x + rr, y); c.arc(x, y, rr, 0, 7); }
    c.fill();
    c.fillStyle = mid;
    c.beginPath();
    for (let k = 0; k < L.length; k += 3) { const x = cx + L[k] * r, y = cy + L[k + 1] * r, rr = L[k + 2] * r * 0.88; c.moveTo(x + rr, y); c.arc(x, y, rr, 0, 7); }
    c.fill();
    c.fillStyle = lite;
    c.beginPath();
    for (let k = 0; k < L.length; k += 3) {
      if (L[k + 1] > 0.1) continue; // only the upper clusters catch the light
      const rr = L[k + 2] * r * 0.45, x = cx + L[k] * r - rr * 0.6, y = cy + L[k + 1] * r - rr * 0.7;
      c.moveTo(x + rr, y); c.arc(x, y, rr, 0, 7);
    }
    c.fill();
    if (r > 6) {
      c.fillStyle = leaf;
      for (let k = 0; k < L.length; k += 3) c.fillRect(cx + L[k] * r - L[k + 2] * r * 0.3, cy + L[k + 1] * r - L[k + 2] * r * 0.5, 2, 1.5);
    }
    c.globalAlpha = 1;
  }

  creatureX(sim: Sim) { return sim.creature.geometry().cx; }

  /** The Ancient: an immobile colossus of stone, roots and moss that drinks the rain. */
  private drawCreature(sim: Sim, cam: Camera, dt: number, t: number) {
    const cr = sim.creature, def = cr.def, skin = def.skin;
    if (!cr.awake) { this.drawMotherSeed(sim, cam, t); return; }
    // rising out of the forest: leaves and earth burst around it for a few seconds
    if (this.risenAt >= 0 && this.time - this.risenAt < 4 && this.rand() < 0.6) {
      const g0 = cr.geometry(this.cSize);
      this.burst(g0.cx + (this.rand() - 0.5) * g0.rx * 2.4, sim.terrain.groundY(g0.cx) - this.rand() * g0.ry, 2, this.rand() < 0.7 ? 0 : 1);
    }
    const want = cr.scale;
    this.cSize += (want - this.cSize) * Math.min(1, dt * 0.8);
    const s = this.cSize;
    const geo = cr.geometry(s);
    const cx = geo.cx - 22 * s; // drawing origin (body centre is at local x = 22)
    const gy = sim.terrain.groundY(geo.cx) + 6;
    this.creatureHead = { x: cx - 85 * s, y: gy - 95 * s };
    this.drawRoots(sim, cam, geo, t);
    if (cx + 200 * s < cam.left || cx - 200 * s > cam.left + cam.viewW) return;
    const c = this.ctx;
    const mood = cr.mood;
    const H = sim.climate.humidity;
    const moss = clamp((H - 12) / 40, 0, 1);
    // drinking: is rain falling over the creature?
    let rainOver = 0;
    for (const cl of sim.clouds.clouds) if (cl.raining && Math.abs(cl.x - cx) < cloudRadius(cl.mass) + 60 * s) rainOver = 1;
    this.cMouth += ((rainOver ? 1 : mood === 'starving' ? 0.25 : 0) - this.cMouth) * Math.min(1, dt * 3);
    this.cBlink -= dt;
    if (this.cBlink < -0.14) this.cBlink = 2.5 + this.rand() * 4;
    const eyesClosed = mood === 'sleeping' || this.cBlink < 0;
    const breathe = 1 + (mood === 'euphoric' ? 0.04 : 0.025) * Math.sin(t * (mood === 'starving' ? 3 : 1.3));
    const tremble = mood === 'starving' ? (this.rand() - 0.5) * 1.5 : 0;
    const stone = hex(skin.stone), light = hex(skin.stoneLight), mossC = mixC(hex('#5a5a3a'), hex(skin.moss), moss);
    const dark = mul(stone, 0.55);
    c.save();
    c.translate(cx + tremble, gy);
    c.scale(s, s * breathe);
    // roots spreading into the ground
    c.strokeStyle = css(dark);
    c.lineWidth = 5;
    c.beginPath();
    for (const [x0, x1] of [[-40, -150], [60, 160], [30, 120], [-10, -95]]) { c.moveTo(x0, -4); c.quadraticCurveTo((x0 + x1) / 2, 6, x1, 10); }
    c.stroke();
    // body: a stone shell mound
    c.fillStyle = css(dark);
    c.beginPath(); c.ellipse(22, 2, 92, 72, 0, Math.PI, Math.PI * 2); c.fill();
    c.fillStyle = css(stone);
    c.beginPath(); c.ellipse(22, 2, 86, 66, 0, Math.PI, Math.PI * 2); c.fill();
    // moonlit plates on the shell
    c.fillStyle = css(light);
    for (const [px, py, pr] of [[-20, -44, 20], [12, -56, 24], [46, -50, 22], [74, -30, 18], [-38, -22, 15]] as const) {
      c.beginPath(); c.ellipse(px, py, pr, pr * 0.62, -0.2, Math.PI, Math.PI * 2); c.fill();
    }
    // cracks glow with the Ancient's mood
    const glowCol = mood === 'sleeping' ? null : mood === 'starving' ? '255,70,40' : mood === 'content' ? '150,230,255' : mood === 'euphoric' ? '190,255,120' : '255,170,70';
    c.strokeStyle = glowCol ? `rgba(${glowCol},${0.55 + 0.35 * Math.sin(t * 2)})` : css(mul(stone, 0.4));
    c.lineWidth = glowCol ? 2.2 : 1.6;
    c.beginPath();
    c.moveTo(-8, -60); c.lineTo(-2, -42); c.lineTo(-12, -28); c.moveTo(40, -62); c.lineTo(34, -46); c.lineTo(44, -32); c.lineTo(38, -18); c.moveTo(80, -24); c.lineTo(70, -12);
    c.stroke();
    if (glowCol) for (const [lx, ly] of [[-4, -44], [38, -40], [74, -16]]) this.lights.push({ x: cx + lx * s, y: gy + ly * s, r: 26 * s, col: glowCol, a: 0.35 });
    // ridge spikes
    c.fillStyle = css(dark);
    for (let i = 0; i < 6; i++) {
      const a = Math.PI + 0.35 + i * 0.42;
      const bx = 22 + Math.cos(a) * 84, by = 2 + Math.sin(a) * 64;
      c.beginPath(); c.moveTo(bx - 6, by + 2); c.lineTo(bx + Math.cos(a) * 14, by + Math.sin(a) * 14 - 2); c.lineTo(bx + 6, by + 2); c.fill();
    }
    // moss grows as it drinks
    if (moss > 0.02) {
      c.globalAlpha = 0.4 + 0.6 * moss;
      for (let i = 0; i < 11; i++) {
        const a = Math.PI + 0.22 + i * 0.27;
        const mx = 22 + Math.cos(a) * 82, my = 2 + Math.sin(a) * 62;
        const r = (4 + 7 * moss) * (0.6 + 0.4 * Math.abs(Math.sin(i * 2.3)));
        // clumps: dark base, lit top, a few hanging strands
        c.fillStyle = css(mul(mossC, 0.6));
        c.beginPath(); c.arc(mx, my + 1, r, 0, 7); c.arc(mx + r * 0.9, my + 2, r * 0.7, 0, 7); c.fill();
        c.fillStyle = css(mossC);
        c.beginPath(); c.arc(mx - r * 0.2, my - r * 0.25, r * 0.75, 0, 7); c.arc(mx + r * 0.8, my, r * 0.5, 0, 7); c.fill();
        c.fillStyle = css(mixC(mossC, [255, 255, 220], 0.3));
        c.fillRect(mx - r * 0.5, my - r * 0.7, r * 0.5, r * 0.3);
        if (moss > 0.5 && i % 2 === 0) { c.fillStyle = css(mul(mossC, 0.7)); c.fillRect(mx, my + r * 0.6, 1.2, r * (0.8 + moss)); }
      }
      c.globalAlpha = 1;
    }
    // a tree grows from its back after stage 2
    if (cr.stage >= 2 || this.cSize > 1.15) {
      const g = clamp((this.cSize - 1.1) / 0.6, 0, 1);
      c.fillStyle = '#2e1e14';
      c.fillRect(30, -64 - 50 * g, 6, 50 * g + 4);
      c.strokeStyle = '#2e1e14'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(33, -64 - 30 * g); c.lineTo(14, -64 - 54 * g); c.moveTo(33, -64 - 40 * g); c.lineTo(52, -64 - 62 * g); c.stroke();
      if (moss > 0.3) {
        c.fillStyle = css(mul(hex(skin.moss), 0.8));
        c.globalAlpha = Math.min(1, (moss - 0.3) * 2);
        c.beginPath(); c.arc(33, -64 - 58 * g, 22 * g + 6, 0, 7); c.arc(16, -64 - 50 * g, 14 * g + 4, 0, 7); c.arc(50, -64 - 54 * g, 15 * g + 4, 0, 7); c.fill();
        c.globalAlpha = 1;
      }
    }
    // front claws gripping the earth
    c.fillStyle = css(dark);
    c.fillRect(-58, -26, 20, 26);
    c.fillStyle = css(mul(light, 0.9));
    for (const x of [-66, -58, -50]) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x - 5, 2); c.lineTo(x + 4, -8); c.fill(); }
    // head (tilts up to drink) — a sculpted, horned stone skull
    const tilt = -0.34 * this.cMouth + (mood === 'starving' ? Math.sin(t * 20) * 0.02 : Math.sin(t * 0.9) * 0.02);
    const poly = (pts: number[], fill: string) => { c.fillStyle = fill; c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); c.fill(); };
    const eyeCol = mood === 'starving' ? '#ff3a2a' : mood === 'content' ? '#9ae8ff' : mood === 'euphoric' ? '#c8ff7a' : skin.eye;
    c.save();
    c.translate(-44, -30);
    c.rotate(tilt);
    // neck: thick stone rings
    poly([6, -22, 18, -8, 16, 18, -10, 20, -14, -12], css(dark));
    c.fillStyle = css(mul(light, 0.8)); c.fillRect(-8, -8, 22, 3); c.fillRect(-9, 4, 22, 3);
    // horns: twisted branches sweeping back
    c.strokeStyle = css(mul(stone, 0.45)); c.lineCap = 'round';
    c.lineWidth = 6; c.beginPath(); c.moveTo(-14, -30); c.quadraticCurveTo(-4, -64, 26, -72); c.stroke();
    c.lineWidth = 4; c.beginPath(); c.moveTo(4, -58); c.lineTo(0, -80); c.moveTo(16, -68); c.lineTo(30, -88); c.moveTo(-34, -32); c.quadraticCurveTo(-34, -56, -18, -62); c.stroke();
    c.lineCap = 'butt';
    if (moss > 0.45) { c.fillStyle = css(hex(skin.moss)); for (const [lx, ly] of [[0, -82], [30, -90], [-18, -64], [26, -74]]) { c.beginPath(); c.arc(lx, ly, 3 + moss * 3, 0, 7); c.fill(); } }
    // lower jaw (hinged at the back)
    c.save();
    c.translate(2, 4);
    c.rotate(0.6 * this.cMouth);
    poly([4, -2, -46, -2, -70, 4, -74, 10, -52, 16, -18, 16, 6, 10], css(dark));
    poly([0, 0, -44, 0, -66, 5, -52, 11, -18, 12, 2, 8], css(stone));
    c.fillStyle = '#e6dac0';
    for (const x of [-62, -50, -38, -26]) { c.beginPath(); c.moveTo(x, 1); c.lineTo(x + 3, -7); c.lineTo(x + 6, 1); c.fill(); }
    c.restore();
    // glowing gullet when drinking
    if (this.cMouth > 0.05) {
      poly([4, 4, -64, 4, -58, 4 + 22 * this.cMouth, -10, 8 + 14 * this.cMouth], '#1a0808');
      c.fillStyle = `rgba(${mood === 'starving' ? '255,80,40' : '120,200,255'},${0.35 * this.cMouth})`;
      c.beginPath(); c.ellipse(-24, 8 + 8 * this.cMouth, 16, 5 + 6 * this.cMouth, 0, 0, 7); c.fill();
    }
    // upper skull: tapering snout
    poly([10, -26, -8, -40, -40, -38, -66, -30, -80, -16, -84, -4, -72, 4, -40, 4, 8, 4], css(dark));
    poly([6, -24, -10, -36, -40, -35, -64, -27, -76, -15, -78, -5, -68, 1, -40, 1, 6, 1], css(stone));
    // moonlit planes
    poly([-10, -35, -40, -34, -62, -27, -50, -24, -28, -28, -10, -28], css(light));
    poly([-70, -12, -76, -6, -68, -2, -56, -6], css(mul(light, 0.85)));
    // cheek plate & cracks
    poly([-20, -16, -6, -20, 2, -6, -12, -2], css(mul(stone, 0.8)));
    c.strokeStyle = glowCol ? `rgba(${glowCol},0.6)` : css(mul(stone, 0.4)); c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(-30, -34); c.lineTo(-26, -24); c.lineTo(-32, -18); c.stroke();
    // upper fangs
    c.fillStyle = '#e6dac0';
    for (const x of [-72, -60, -46, -32, -18]) { c.beginPath(); c.moveTo(x, 1); c.lineTo(x + 3, x === -72 || x === -32 ? 12 : 7); c.lineTo(x + 6, 1); c.fill(); }
    // nostril
    c.fillStyle = '#120c0a'; c.fillRect(-78, -12, 5, 3);
    if (mood === 'starving' && this.rand() < dt * 5) this.burst(cx + (-44 - 80) * s, gy + (-30 - 12) * s, 1, 1);
    // heavy brow ridge
    poly([-12, -34, -40, -40, -66, -30, -62, -24, -40, -31, -14, -27], css(mul(stone, 0.5)));
    // eyes: slanted, glowing, following the nearest cloud
    let look = 0;
    const near = sim.clouds.clouds.reduce<Cloud | null>((b, q) => (!b || Math.abs(q.x - cx) < Math.abs(b.x - cx) ? q : b), null);
    if (near) look = clamp((near.x - cx) / 600, -1, 1);
    for (const ex of [-52, -32]) {
      if (eyesClosed) { c.fillStyle = '#120c0a'; c.fillRect(ex - 6, -23, 12, 2); continue; }
      poly([ex - 8, -20, ex - 4, -27, ex + 7, -26, ex + 6, -19], '#120c0a');
      poly([ex - 6, -21, ex - 3, -25, ex + 5, -25, ex + 4, -20], eyeCol);
      c.fillStyle = '#120c0a'; c.fillRect(ex - 1 + look * 3, -25, 2, 5);
      c.fillStyle = 'rgba(255,255,255,0.7)'; c.fillRect(ex + 2, -25, 1, 1);
    }
    c.restore();
    c.restore();
    // glowing eyes light up the night; sleeping Zs
    if (mood !== 'sleeping') {
      const ey = gy - 52 * s;
      this.lights.push({ x: cx - 95 * s, y: ey, r: 55 * s + 20, col: mood === 'starving' ? '255,70,40' : mood === 'content' ? '150,230,255' : mood === 'euphoric' ? '190,255,120' : '255,170,70', a: 0.6 });
    } else {
      this.cZ += dt;
      for (let k = 0; k < 3; k++) {
        const ph = (this.cZ * 0.4 + k / 3) % 1;
        const zx = cx - 110 * s + ph * 30 * s, zy = gy - 70 * s - ph * 60 * s, zs = (3 + ph * 4) * Math.max(0.7, s);
        c.strokeStyle = `rgba(230,230,255,${1 - ph})`; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(zx, zy); c.lineTo(zx + zs, zy); c.lineTo(zx, zy + zs); c.lineTo(zx + zs, zy + zs); c.stroke();
      }
    }
    if (mood === 'euphoric' && this.rand() < dt * 2) this.burst(cx + (this.rand() - 0.3) * 120 * s, gy - 70 * s, 2, 0);
  }

  /** Before the Ancient rises: the Semente-Mãe, half buried, cracked and glowing, sprouting the heart tree. */
  private drawMotherSeed(sim: Sim, cam: Camera, t: number) {
    const F = sim.forest, x = F.heartX, gy = sim.terrain.groundY(x);
    const L = F.heartLife, wet = Math.min(1, F.moistAt(x));
    const h = L > 0.02 ? 6 + 64 * Math.min(1, L / 3) : 0;
    this.creatureHead = { x, y: gy - 46 - h };
    if (x < cam.left - 120 || x > cam.left + cam.viewW + 120) return;
    const c = this.ctx;
    const pulse = 0.5 + 0.5 * Math.sin(t * (1.2 + wet * 1.5));
    // roots reaching into the soil, longer as the forest lives
    c.strokeStyle = '#2a1c14'; c.lineWidth = 3;
    const reach = 20 + 90 * clamp(F.vitality / sim.biome.forest.awaken, 0, 1);
    c.beginPath();
    for (const dir of [-1, 1]) for (const k of [0.5, 1]) { c.moveTo(x + dir * 10, gy + 2); c.quadraticCurveTo(x + dir * reach * 0.5 * k, gy + 10 * k, x + dir * reach * k, gy + 4 + 6 * k); }
    c.stroke();
    // the shell, half buried
    c.fillStyle = '#1c120c'; c.beginPath(); c.ellipse(x, gy - 3, 25, 17, -0.15, Math.PI, Math.PI * 2); c.fill();
    c.fillStyle = '#5a3a22'; c.beginPath(); c.ellipse(x, gy - 3, 23, 15, -0.15, Math.PI, Math.PI * 2); c.fill();
    c.fillStyle = '#7a5434'; c.beginPath(); c.ellipse(x - 7, gy - 10, 10, 5, -0.4, Math.PI, Math.PI * 2); c.fill();
    // glowing cracks (brighter when the soil is wet)
    const glow = 0.35 + 0.55 * pulse * (0.3 + 0.7 * wet);
    c.strokeStyle = `rgba(255,${(170 + 60 * wet) | 0},90,${glow})`; c.lineWidth = 1.8;
    c.beginPath(); c.moveTo(x - 12, gy - 4); c.lineTo(x - 6, gy - 11); c.lineTo(x - 1, gy - 7); c.lineTo(x + 5, gy - 15); c.moveTo(x + 9, gy - 3); c.lineTo(x + 13, gy - 9); c.stroke();
    this.lights.push({ x, y: gy - 10, r: 50 + 30 * pulse * wet, col: '255,190,110', a: 0.45 + 0.25 * wet });
    if (h <= 0) return;
    // the heart sprout: a stem that becomes a trunk, leaves that become a crown
    const g = Math.min(1, L / 3);
    const sway = Math.sin(t * 1.4) * 1.5 * g;
    c.fillStyle = L > 2 ? '#3a2618' : '#4f8a3a';
    const tw = 2 + 6 * g;
    c.fillRect(x + 2 - tw / 2, gy - 10 - h, tw, h);
    const leaf = mixC(hex(sim.biome.palette.grassDry), hex(sim.biome.palette.grassWet), 0.4 + 0.6 * g);
    c.fillStyle = css(leaf);
    if (L < 1.4) {
      const r = 3 + 5 * g;
      c.beginPath(); c.ellipse(x + 2 - r + sway, gy - 10 - h, r, r * 0.5, -0.5, 0, 7); c.ellipse(x + 2 + r + sway, gy - 12 - h, r, r * 0.5, 0.5, 0, 7); c.fill();
    } else {
      const cr = 10 + 30 * g;
      c.fillStyle = css(mul(leaf, 0.7));
      c.beginPath(); c.arc(x + 2 + sway, gy - 8 - h, cr, 0, 7); c.fill();
      c.fillStyle = css(leaf);
      c.beginPath(); c.arc(x + 2 + sway, gy - 12 - h, cr * 0.85, 0, 7); c.arc(x - cr * 0.6 + sway, gy - 4 - h, cr * 0.55, 0, 7); c.arc(x + cr * 0.7 + sway, gy - 5 - h, cr * 0.55, 0, 7); c.fill();
      // the heart glows through the crown
      c.fillStyle = `rgba(255,220,140,${0.2 + 0.25 * pulse})`;
      c.beginPath(); c.arc(x + 2 + sway, gy - 10 - h, cr * 0.3, 0, 7); c.fill();
      this.lights.push({ x, y: gy - 10 - h, r: cr * 2, col: '220,255,160', a: 0.3 * g });
    }
  }

  /** roots creeping over the ground towards the factory, and the warning line for the next stage */
  private drawRoots(sim: Sim, cam: Camera, geo: { cx: number; rx: number; rootX: number; scale: number }, t: number) {
    const c = this.ctx, cr = sim.creature;
    const x0 = geo.rootX, x1 = geo.cx;
    if (x1 > cam.left - 50 && x0 < cam.left + cam.viewW + 50) {
      c.strokeStyle = '#2a1c14';
      for (let k = 0; k < 5; k++) {
        const r = rng(k * 77 + 3);
        c.lineWidth = (5 - k * 0.7) * Math.min(2, geo.scale * 0.6);
        c.beginPath();
        let x = x1 - geo.rx * 0.6, y = sim.terrain.groundY(x) - 2;
        c.moveTo(x, y);
        while (x > x0 + 10) {
          x -= 30 + r() * 30;
          y = sim.terrain.groundY(x) - 2 - r() * 4 + (k % 2 ? 6 : 0);
          c.lineTo(Math.max(x, x0), y);
        }
        c.stroke();
      }
    }
    if (!cr.awake || cr.done) return;
    // next frontier: pulsing danger line + post
    const nx = cr.nextRootX();
    if (nx < cam.left - 30 || nx > cam.left + cam.viewW + 30) return;
    const gy = sim.terrain.groundY(nx);
    const a = 0.5 + 0.4 * Math.sin(t * 4);
    c.strokeStyle = `rgba(255,90,60,${a})`;
    c.lineWidth = 2.5;
    c.setLineDash([6, 6]);
    c.beginPath(); c.moveTo(nx, gy + 4); c.lineTo(nx, gy - 140); c.stroke();
    c.setLineDash([]);
    c.fillStyle = `rgba(255,90,60,${a * 0.12})`;
    c.fillRect(nx, gy - 140, Math.min(geo.rootX, cam.left + cam.viewW) - nx, 144);
    c.fillStyle = '#2a1c12'; c.fillRect(nx - 2, gy - 40, 4, 40);
    c.fillStyle = '#c0392b'; c.beginPath(); c.moveTo(nx, gy - 62); c.lineTo(nx + 12, gy - 42); c.lineTo(nx - 12, gy - 42); c.fill();
    c.fillStyle = '#f1e6c8'; c.fillRect(nx - 1, gy - 56, 2, 8); c.fillRect(nx - 1, gy - 46, 2, 2);
  }



  // ───────────────────────── machines & pipes ─────────────────────────
  private drawPipes(sim: Sim, view: ViewState) {
    const c = this.ctx;
    c.lineJoin = 'round';
    for (const p of sim.pipes) {
      const sel = view.selection?.type === 'pipe' && view.selection.id === p.id;
      c.beginPath();
      c.moveTo(p.path[0].x, p.path[0].y);
      for (let i = 1; i < p.path.length; i++) c.lineTo(p.path[i].x, p.path[i].y);
      c.strokeStyle = sel ? '#ffe066' : '#140e0a';
      c.lineWidth = sel ? 11 : 9;
      c.stroke();
      c.strokeStyle = p.fluid === 'water' ? '#6a5a4a' : p.fluid === 'seed' ? '#5e6238' : '#7d6a5a';
      c.lineWidth = 6;
      c.stroke();
      c.strokeStyle = p.fluid === 'water' ? 'rgba(120,190,230,0.35)' : p.fluid === 'seed' ? 'rgba(200,230,110,0.35)' : 'rgba(255,240,220,0.25)';
      c.lineWidth = 2;
      c.stroke();
      if (p.flow > 0.02) {
        c.strokeStyle = p.fluid === 'water' ? C.waterL : p.fluid === 'seed' ? '#d8f07a' : '#ffffff';
        c.lineWidth = 2.5;
        c.setLineDash([5, 11]);
        c.lineDashOffset = -p.phase * 3;
        c.globalAlpha = Math.min(1, 0.35 + p.flow / 3);
        c.stroke();
        c.setLineDash([]);
        c.globalAlpha = 1;
      }
      for (let i = 1; i < p.path.length - 1; i++) {
        c.fillStyle = '#140e0a'; c.fillRect(p.path[i].x - 6, p.path[i].y - 6, 12, 12);
        c.fillStyle = '#8a5a34'; c.fillRect(p.path[i].x - 5, p.path[i].y - 5, 10, 10);
        c.fillStyle = '#d9a35c'; c.fillRect(p.path[i].x - 4, p.path[i].y - 4, 2, 2);
      }
    }
  }

  private drawMachines(sim: Sim, cam: Camera, view: ViewState, t: number) {
    const c = this.ctx;
    const x0 = cam.left - 150, x1 = cam.left + cam.viewW + 150;
    const groundAt = (x: number) => sim.terrain.groundY(x);
    const order = [...sim.machines].sort((a, b) => (a.kind === 'platform' ? 0 : 1) - (b.kind === 'platform' ? 0 : 1));
    for (const m of order) {
      if (m.x < x0 || m.x > x1) continue;
      if (view.ghost?.moveId === m.id) c.globalAlpha = 0.25;
      const wc = sim.mods.waterCap(m.kind), sc = sim.mods.steamCap(m.kind);
      const jitter = m.boost > 0.05 ? Math.sin(t * 50) * 1.2 : 0;
      c.save();
      c.translate(jitter, 0);
      const kc = sim.mods.seedCap(m.kind);
      drawMachine(c, m, {
        t, waterFrac: wc ? m.water / wc : 0, steamFrac: sc ? m.steam / sc : 0, seedFrac: kc ? m.seeds / kc : 0,
        active: m.rate > (m.kind === 'greenhouse' || m.kind === 'seeder' ? 0.01 : 0.05)
          || (m.kind === 'pump' || m.kind === 'pump_hp' ? sim.isPumpValid(m) && m.water < wc - 0.01 : false)
          || (m.kind === 'compost' && sim.forest.vitality > 0.05),
      }, groundAt);
      c.restore();
      m.anim = Math.max(0, m.anim - 0.02);
      c.globalAlpha = 1;
      this.machineLights(m, t);
      const big = view.mode === 'pipe';
      for (const p of MACHINES[m.kind].ports) {
        const w = portWorld(m, p);
        const hot = !!view.pendingPort && view.pendingPort.m === m.id && view.pendingPort.port === p.id;
        drawPort(c, w.x, w.y, p.fluid, p.dir, big ? Math.max(5, (7 / cam.zoom) * cam.scale * 1.2) : 3, hot);
      }
      if (view.selection?.type === 'machine' && view.selection.id === m.id) this.drawSelectBox(m, cam, t);
      if (m.kind === 'boiler' || m.kind === 'boiler_ind') {
        const st = sim.boilerStatus(m);
        if (st !== 'ok' && st !== 'heating' && sim.time > 2) this.drawBubble(m.x, m.y - MACHINES[m.kind].h - 50, t, st);
      }
    }
  }

  private machineLights(m: Machine, t: number) {
    const fl = 0.8 + 0.2 * Math.sin(t * 17 + m.id) * Math.sin(t * 5.3);
    if (m.kind === 'boiler' && (m.fire > 0 || m.heat > 0.2)) {
      const k = (0.4 + m.heat * 0.6) * fl * (1 + m.boost * 0.6);
      this.lights.push({ x: m.x, y: m.y - 10, r: 70 * k + 20, col: '255,150,60', a: 0.75 });
      if (m.boost > 0.05 && this.rand() < 0.5) this.burst(m.x + (this.rand() - 0.5) * 14, m.y - 14, 1, 3);
    }
    if (m.kind === 'boiler_ind' && m.heat > 0.1) this.lights.push({ x: m.x, y: m.y - 8, r: 70 * m.heat * fl + 10, col: '120,170,255', a: 0.6 });
    if (m.kind === 'condenser' && m.rate > 0.05) this.lights.push({ x: m.x, y: m.y - 55, r: 60, col: '120,220,255', a: 0.45 });
    if (m.kind === 'greenhouse' && m.rate > 0.01) this.lights.push({ x: m.x, y: m.y - 34, r: 60, col: '170,255,140', a: 0.45 });
    if (m.kind === 'seeder' && m.rate > 0.01) this.lights.push({ x: m.x, y: m.y - 58, r: 36, col: '240,230,140', a: 0.5 });
    if (m.kind === 'divider' && m.on) this.lights.push({ x: m.x, y: m.y - 50, r: 50, col: '190,140,255', a: 0.5 });
    if ((m.kind === 'pump' || m.kind === 'pump_hp') && m.on) this.lights.push({ x: m.x + 7, y: m.y - 28, r: 16, col: '120,255,150', a: 0.35 });
  }

  /** status sign above a boiler explaining why it isn't producing */
  private drawBubble(x: number, y: number, t: number, kind: string) {
    const c = this.ctx;
    const bob = Math.sin(t * 4) * 3;
    const urgent = kind === 'nofire' || kind === 'nowater' || kind === 'off';
    const blink = urgent && Math.sin(t * 6) > 0.6;
    y += bob;
    c.fillStyle = '#140e0a'; c.fillRect(x - 12, y - 12, 24, 22); c.fillRect(x - 4, y + 10, 8, 5);
    c.fillStyle = blink ? '#ffd7b0' : '#efe2c0'; c.fillRect(x - 10, y - 10, 20, 18); c.fillRect(x - 2, y + 8, 4, 4);
    if (kind === 'nowater' || kind === 'lowwater') {
      c.fillStyle = kind === 'lowwater' ? '#e0903a' : C.water;
      c.beginPath(); c.arc(x, y + 2, 5, 0, 7); c.fill();
      c.beginPath(); c.moveTo(x - 4.5, y + 1); c.lineTo(x, y - 7); c.lineTo(x + 4.5, y + 1); c.fill();
      if (kind === 'nowater') { c.strokeStyle = '#c0392b'; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 8, y + 6); c.lineTo(x + 8, y - 8); c.stroke(); }
    } else if (kind === 'nofire') {
      c.fillStyle = '#ff8a2a'; c.beginPath(); c.moveTo(x - 6, y + 6); c.quadraticCurveTo(x - 7, y - 2, x, y - 8); c.quadraticCurveTo(x + 7, y - 2, x + 6, y + 6); c.fill();
      c.fillStyle = '#ffd35a'; c.beginPath(); c.moveTo(x - 3, y + 6); c.quadraticCurveTo(x - 3, y, x, y - 3); c.quadraticCurveTo(x + 3, y, x + 3, y + 6); c.fill();
    } else if (kind === 'off') {
      c.strokeStyle = '#c0392b'; c.lineWidth = 2.5;
      c.beginPath(); c.arc(x, y + 1, 6, -1.1, Math.PI + 1.1, true); c.stroke();
      c.beginPath(); c.moveTo(x, y - 7); c.lineTo(x, y + 1); c.stroke();
    } else if (kind === 'blocked') {
      c.fillStyle = '#8a96ac'; c.beginPath(); c.arc(x - 3, y, 4, 0, 7); c.arc(x + 3, y - 2, 4, 0, 7); c.fill();
      c.strokeStyle = '#c0392b'; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 7, y + 6); c.lineTo(x + 7, y - 7); c.stroke();
    }
  }

  private drawSelectBox(m: Machine, cam: Camera, t: number) {
    const d = MACHINES[m.kind];
    const c = this.ctx;
    const b = d.placement === 'mast' ? { x: m.x - d.w / 2, y: m.y - d.h / 2 } : { x: m.x - d.w / 2, y: m.y - d.h };
    c.strokeStyle = '#ffd36a';
    c.lineWidth = (2 / cam.zoom) * cam.scale * 1.5;
    c.setLineDash([6, 4]);
    c.lineDashOffset = -t * 20;
    c.strokeRect(b.x - 5, b.y - 5, d.w + 10, d.h + 10);
    c.setLineDash([]);
    if (d.placement === 'mast') this.drawWindCone(m, 0.25);
  }

  private drawWindCone(m: { kind: MachineKind; x: number; y: number; angle: number }, alpha: number) {
    const d = MACHINES[m.kind];
    const c = this.ctx;
    const base = { fan: [380, 0.32], fan_ind: [650, 0.34], turbine: [1000, 0.28] } as Record<string, [number, number]>;
    const s = base[m.kind];
    if (!s) return;
    c.save();
    c.translate(m.x, m.y);
    c.rotate(m.angle);
    c.fillStyle = `rgba(220,240,255,${alpha * 0.45})`;
    c.strokeStyle = `rgba(220,240,255,${alpha * 1.6})`;
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(d.w * 0.45, -28);
    c.lineTo(d.w * 0.45 + s[0], -28 - s[0] * s[1]);
    c.lineTo(d.w * 0.45 + s[0], 28 + s[0] * s[1]);
    c.lineTo(d.w * 0.45, 28);
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();
  }

  // ───────────────────────── particles ─────────────────────────
  private updateSteam(sim: Sim, cam: Camera, dt: number) {
    const x0 = cam.left - 100, x1 = cam.left + cam.viewW + 100;
    for (const m of sim.machines) {
      const v = MACHINES[m.kind].vent;
      if (!v || m.x < x0 || m.x > x1) continue;
      const venting = m.kind === 'condenser' ? m.rate : sim.pipes.some(p => p.from.m === m.id) ? 0 : m.rate;
      const smoke = m.kind === 'boiler' && m.fire > 0 ? 0.6 : 0;
      const n = venting * dt * 12 + smoke * dt * 2;
      let k = Math.floor(n) + (this.rand() < n % 1 ? 1 : 0);
      while (k-- > 0 && this.sn < MAX_STEAM) {
        const i = this.sn++;
        this.sx[i] = m.x + (m.flip ? -v.x : v.x) + (this.rand() - 0.5) * 6;
        this.sy[i] = m.y + v.y;
        this.sl[i] = 0;
        this.sr[i] = 4 + this.rand() * 4;
      }
    }
    for (let i = 0; i < this.sn; i++) {
      this.sl[i] += dt;
      sim.wind.at(this.sx[i], this.sy[i], sim.time, this.tmp);
      this.sx[i] += this.tmp.x * 0.5 * dt + Math.sin(this.sl[i] * 3 + i) * 6 * dt;
      this.sy[i] -= 75 * dt;
      this.sr[i] += 9 * dt;
      if (this.sl[i] > 3.6) { this.sn--; this.sx[i] = this.sx[this.sn]; this.sy[i] = this.sy[this.sn]; this.sl[i] = this.sl[this.sn]; this.sr[i] = this.sr[this.sn]; i--; }
    }
  }
  private drawSteam() {
    const c = this.ctx;
    for (let i = 0; i < this.sn; i++) {
      c.fillStyle = `rgba(232,236,240,${0.5 * (1 - this.sl[i] / 3.6)})`;
      c.beginPath(); c.arc(this.sx[i], this.sy[i], this.sr[i], 0, 7); c.fill();
    }
  }

  /** a thrown cloud leaves a burst of air streaks behind it */
  private gust(x: number, y: number, speed: number) {
    const n = Math.min(24, 6 + speed / 25);
    for (let k = 0; k < n && this.wn < MAX_STREAKS; k++) {
      const i = this.wn++;
      this.wx[i] = x + (this.rand() - 0.5) * 80;
      this.wy[i] = y + (this.rand() - 0.5) * 60;
      this.wl[i] = 0.4;
      this.wg[i] = speed;
    }
  }
  private updateStreaks(sim: Sim, cam: Camera, dt: number) {
    const fans = sim.machines.filter(m => MACHINES[m.kind].placement === 'mast' && m.on && m.power > 0);
    const want = Math.min(MAX_STREAKS, 30 + fans.length * 25);
    let tries = 6;
    while (this.wn < want && tries-- > 0) {
      const i = this.wn++;
      if (fans.length && this.rand() < 0.75) {
        const f = fans[Math.floor(this.rand() * fans.length)];
        const d = this.rand() * 200, s = (this.rand() - 0.5) * 50;
        this.wx[i] = f.x + Math.cos(f.angle) * (30 + d) - Math.sin(f.angle) * s;
        this.wy[i] = f.y + Math.sin(f.angle) * (30 + d) + Math.cos(f.angle) * s;
      } else {
        this.wx[i] = cam.left + this.rand() * cam.viewW;
        this.wy[i] = cam.top + this.rand() * cam.viewH;
      }
      this.wl[i] = 0;
      this.wg[i] = 0;
    }
    for (let i = 0; i < this.wn; i++) {
      this.wl[i] += dt;
      if (this.wg[i] > 0) this.wx[i] += this.wg[i] * 0.3 * dt;
      else {
        sim.wind.at(this.wx[i], this.wy[i], sim.time, this.tmp);
        this.wx[i] += this.tmp.x * dt * 2.2;
        this.wy[i] += this.tmp.y * dt * 2.2;
      }
      if (this.wl[i] > 1.4) { this.wn--; this.wx[i] = this.wx[this.wn]; this.wy[i] = this.wy[this.wn]; this.wl[i] = this.wl[this.wn]; this.wg[i] = this.wg[this.wn]; i--; }
    }
  }
  private drawStreaks(sim: Sim) {
    const c = this.ctx;
    c.lineWidth = 1.5;
    for (let i = 0; i < this.wn; i++) {
      let vx: number, vy: number;
      if (this.wg[i] > 0) { vx = this.wg[i] * 0.5; vy = 0; }
      else { sim.wind.at(this.wx[i], this.wy[i], sim.time, this.tmp); vx = this.tmp.x; vy = this.tmp.y; }
      const sp = Math.hypot(vx, vy);
      if (sp < 8) continue;
      const a = Math.sin((this.wl[i] / 1.4) * Math.PI) * Math.min(0.45, sp / 140);
      c.strokeStyle = `rgba(255,248,230,${a})`;
      c.beginPath();
      c.moveTo(this.wx[i], this.wy[i]);
      c.lineTo(this.wx[i] - vx * 0.35, this.wy[i] - vy * 0.35);
      c.stroke();
    }
  }

  private drawBirds(sim: Sim, cam: Camera, dt: number) {
    const c = this.ctx, b = sim.biome;
    const restored = this.mood.health > 0.6;
    for (const bd of this.birds) {
      bd.x += bd.vx * dt;
      bd.ph += dt * 6;
      if (bd.x < -200) bd.x = b.width + 150;
      if (bd.x > b.width + 200) bd.x = -150;
      const y = bd.y + Math.sin(bd.ph * 0.3) * 30 - this.mood.storm * 120;
      if (bd.x < cam.left - 20 || bd.x > cam.left + cam.viewW + 20) continue;
      const wing = Math.sin(bd.ph) * 5;
      c.strokeStyle = restored && bd.vx > 0 ? '#f0ece0' : '#16110e';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(bd.x - 7, y - wing); c.lineTo(bd.x, y); c.lineTo(bd.x + 7, y - wing);
      c.stroke();
    }
  }

  private burst(x: number, y: number, n: number, kind: number) {
    for (let k = 0; k < n && this.bn < MAX_BITS; k++) {
      const i = this.bn++;
      this.bx[i] = x; this.by[i] = y;
      this.bvx[i] = (this.rand() - 0.5) * (kind === 3 ? 30 : 60);
      this.bvy[i] = -20 - this.rand() * (kind === 3 ? 60 : 50);
      this.bl[i] = kind === 2 ? 3 + this.rand() * 3 : kind === 3 ? 0.8 : 1.4;
      this.bk[i] = kind;
    }
  }
  private updateBits(sim: Sim, cam: Camera, dt: number) {
    const b = sim.biome;
    if (this.rand() < dt * 6 * (1 - this.mood.health) && this.bn < MAX_BITS) {
      const i = this.bn++;
      this.bx[i] = cam.left + this.rand() * cam.viewW; this.by[i] = cam.top + cam.viewH * (0.3 + this.rand() * 0.6);
      this.bvx[i] = 6 + this.rand() * 10; this.bvy[i] = (this.rand() - 0.5) * 4; this.bl[i] = 4; this.bk[i] = 1;
    }
    const tx0 = Math.max(cam.left, b.targetStart), tx1 = Math.min(cam.left + cam.viewW, b.targetEnd);
    if (this.mood.health > 0.45 && tx1 > tx0 && this.rand() < dt * 5 * this.mood.health && this.bn < MAX_BITS) {
      const i = this.bn++;
      this.bx[i] = tx0 + this.rand() * (tx1 - tx0); this.by[i] = sim.terrain.groundY(this.bx[i]) - 10 - this.rand() * 60;
      this.bvx[i] = (this.rand() - 0.5) * 8; this.bvy[i] = (this.rand() - 0.5) * 8; this.bl[i] = 4 + this.rand() * 3; this.bk[i] = 2;
    }
    for (let i = 0; i < this.bn; i++) {
      this.bl[i] -= dt;
      const k = this.bk[i];
      if (k === 0) { this.bvy[i] += 60 * dt; this.bvx[i] *= 1 - dt; }
      else if (k === 2) { this.bvx[i] += (this.rand() - 0.5) * 30 * dt; this.bvy[i] += (this.rand() - 0.5) * 30 * dt; }
      else if (k === 3) this.bvy[i] -= 20 * dt;
      else if (k === 4) { this.bvx[i] += Math.sin(this.bl[i] * 5 + i) * 20 * dt; if (this.by[i] > sim.terrain.groundY(this.bx[i])) this.bl[i] = 0; }
      this.bx[i] += this.bvx[i] * dt; this.by[i] += this.bvy[i] * dt;
      if (this.bl[i] <= 0) {
        this.bn--;
        this.bx[i] = this.bx[this.bn]; this.by[i] = this.by[this.bn]; this.bvx[i] = this.bvx[this.bn]; this.bvy[i] = this.bvy[this.bn]; this.bl[i] = this.bl[this.bn]; this.bk[i] = this.bk[this.bn];
        i--;
      }
    }
  }
  private drawBits() {
    const c = this.ctx;
    for (let i = 0; i < this.bn; i++) {
      const k = this.bk[i];
      if (k === 0) { c.fillStyle = '#6cc04a'; c.fillRect(this.bx[i], this.by[i], 3, 2); }
      else if (k === 1) { c.fillStyle = `rgba(255,220,170,${Math.min(0.5, this.bl[i] * 0.2)})`; c.fillRect(this.bx[i], this.by[i], 1.5, 1.5); }
      else if (k === 2) {
        const a = 0.5 + 0.5 * Math.sin(this.bl[i] * 6 + i);
        c.fillStyle = `rgba(230,255,140,${a})`; c.fillRect(this.bx[i], this.by[i], 2, 2);
        if (a > 0.6) this.lights.push({ x: this.bx[i], y: this.by[i], r: 10, col: '200,255,120', a: 0.4 * a });
      } else if (k === 4) { c.fillStyle = '#e8d27a'; c.fillRect(this.bx[i] - 1, this.by[i] - 1, 3, 2); c.fillStyle = '#7a5a2a'; c.fillRect(this.bx[i] - 1, this.by[i] + 1, 3, 1); }
      else { c.fillStyle = `rgba(255,${(150 + this.bl[i] * 100) | 0},60,${this.bl[i]})`; c.fillRect(this.bx[i], this.by[i], 2, 2); }
    }
  }

  private updateDrops(sim: Sim, cam: Camera, dt: number) {
    const x0 = cam.left - 200, x1 = cam.left + cam.viewW + 200;
    let visibleRain = 0;
    const lod = clamp(cam.zoom / cam.scale, 0.25, 1);
    for (const cl of sim.clouds.clouds) {
      if (!cl.raining || cl.rainRate <= 0) continue;
      const r = cloudRadius(cl.mass);
      if (cl.x + r < x0 || cl.x - r > x1) continue;
      visibleRain += cl.rainRate;
      if (cl.seeds > 0.3 && this.rand() < dt * Math.min(8, 1 + cl.seeds * 0.5) && this.bn < MAX_BITS) {
        const i = this.bn++;
        this.bx[i] = cl.x + (this.rand() * 2 - 1) * r * 0.6; this.by[i] = cl.y + r * 0.2;
        this.bvx[i] = (this.rand() - 0.5) * 10; this.bvy[i] = 40 + this.rand() * 30; this.bl[i] = 6; this.bk[i] = 4;
      }
      sim.wind.at(cl.x, cl.y, sim.time, this.tmp);
      const n = Math.min(90, (cl.rainRate * 40 + r * 0.6) * dt * lod);
      let k = Math.floor(n) + (this.rand() < n % 1 ? 1 : 0);
      while (k-- > 0 && this.dn < MAX_DROPS) {
        const i = this.dn++;
        this.dx[i] = cl.x + (this.rand() * 2 - 1) * r * 0.75;
        this.dy[i] = cl.y + r * 0.2;
        this.dvx[i] = this.tmp.x * 0.6;
        this.dvy[i] = 300 + this.rand() * 90;
      }
    }
    this.rainVisible = clamp(visibleRain / 5, 0, 1);
    for (let i = 0; i < this.dn; i++) {
      this.dx[i] += this.dvx[i] * dt;
      this.dy[i] += this.dvy[i] * dt;
      const g = sim.groundAt(this.dx[i]);
      if (this.dy[i] > g) {
        if (this.rand() < 0.35) {
          for (let s = 0; s < 2 && this.pn < MAX_SPL; s++) {
            const j = this.pn++;
            this.px[j] = this.dx[i]; this.py[j] = g - 1; this.pvx[j] = (this.rand() - 0.5) * 60; this.pvy[j] = -40 - this.rand() * 50; this.pl[j] = 0.35;
          }
        }
        this.dn--; this.dx[i] = this.dx[this.dn]; this.dy[i] = this.dy[this.dn]; this.dvx[i] = this.dvx[this.dn]; this.dvy[i] = this.dvy[this.dn]; i--;
      }
    }
    for (let j = 0; j < this.pn; j++) {
      this.pl[j] -= dt;
      this.pvy[j] += 400 * dt;
      this.px[j] += this.pvx[j] * dt; this.py[j] += this.pvy[j] * dt;
      if (this.pl[j] <= 0) { this.pn--; this.px[j] = this.px[this.pn]; this.py[j] = this.py[this.pn]; this.pvx[j] = this.pvx[this.pn]; this.pvy[j] = this.pvy[this.pn]; this.pl[j] = this.pl[this.pn]; j--; }
    }
  }

  /** rain drawn in screen space with integer pixels (cheap and crisp) */
  private drawRain(cam: Camera) {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    const z = cam.zoom, L = cam.left, T = cam.top;
    const len = Math.max(2, Math.round(10 * z));
    c.fillStyle = 'rgba(180,205,235,0.75)';
    for (let i = 0; i < this.dn; i++) {
      const x = ((this.dx[i] - L) * z) | 0, y = ((this.dy[i] - T) * z) | 0;
      if (x < 0 || y < -len || x >= cam.lowW || y >= cam.lowH) continue;
      c.fillRect(x, y, 1, len);
    }
    c.fillStyle = 'rgba(210,230,255,0.85)';
    for (let j = 0; j < this.pn; j++) c.fillRect(((this.px[j] - L) * z) | 0, ((this.py[j] - T) * z) | 0, 1, 1);
  }

  // ───────────────────────── clouds ─────────────────────────
  private puffsFor(cl: { id: number; seed: number }): Puff[] {
    let p = this.puffs.get(cl.id);
    if (p) return p;
    const r = rng(cl.seed);
    p = [{ x: 0, y: -0.1, r: 0.62 }];
    for (let i = 1; i < 20; i++) {
      const a = r() * Math.PI * 2;
      const d = 0.25 + r() * 0.55;
      p.push({ x: Math.cos(a) * d * 1.15, y: Math.min(0.18, Math.sin(a) * d * 0.45) - 0.05, r: 0.3 + r() * 0.3 });
    }
    this.puffs.set(cl.id, p);
    return p;
  }

  private drawClouds(sim: Sim, cam: Camera, view: ViewState, t: number) {
    const c = this.ctx;
    const x0 = cam.left, x1 = cam.left + cam.viewW, y0 = cam.top, y1 = cam.top + cam.viewH;
    if (this.puffs.size > sim.clouds.clouds.length * 2 + 200) {
      const live = new Set(sim.clouds.clouds.map(q => q.id));
      for (const k of this.puffs.keys()) if (!live.has(k)) this.puffs.delete(k);
    }
    const selId = view.selection?.type === 'cloud' ? view.selection.id : -1;
    for (const cl of sim.clouds.clouds) {
      const r = cloudRadius(cl.mass) * (1 + 0.08 * Math.sin(cl.pulse * 12) * cl.pulse);
      if (cl.x + r * 1.3 < x0 || cl.x - r * 1.3 > x1 || cl.y + r < y0 || cl.y - r > y1 + 400) continue;
      const sat = clamp(cl.mass / sim.climate.capacity(cl.temp), 0, 1.5);
      if (cl.raining) {
        const gy = sim.terrain.groundY(cl.x);
        const g = c.createLinearGradient(0, cl.y, 0, gy);
        g.addColorStop(0, 'rgba(70,84,110,0.22)');
        g.addColorStop(0.7, 'rgba(70,84,110,0.08)');
        g.addColorStop(1, 'rgba(70,84,110,0)');
        c.fillStyle = g;
        c.fillRect(cl.x - r * 0.72, cl.y, r * 1.44, gy - cl.y);
      }
      if (cl.mother) {
        const a = 0.25 + 0.15 * Math.sin(t * 3);
        c.fillStyle = `rgba(255,220,130,${a * 0.5})`;
        c.beginPath(); c.ellipse(cl.x, cl.y, r * 1.35, r * 0.85, 0, 0, 7); c.fill();
        this.lights.push({ x: cl.x, y: cl.y, r: r * 1.6, col: '255,210,120', a: 0.4 });
      }
      this.drawCloudShape(cl, r, sat, cam, t);
      if (cl.seeds > 0.4) this.drawCloudSeeds(cl, r, t);
      if (cl.held) {
        c.strokeStyle = 'rgba(255,230,160,0.85)';
        c.lineWidth = (2 / cam.zoom) * cam.scale * 1.5;
        c.beginPath(); c.ellipse(cl.x, cl.y, r * 1.2, r * 0.75, 0, 0, 7); c.stroke();
      }
      if (cl.id === selId) {
        c.strokeStyle = '#ffd36a';
        c.lineWidth = (2.5 / cam.zoom) * cam.scale * 1.5;
        c.setLineDash([8, 6]);
        c.beginPath(); c.ellipse(cl.x, cl.y, r * 1.25, r * 0.8, 0, 0, 7); c.stroke();
        c.setLineDash([]);
        c.beginPath(); c.moveTo(cl.x, cl.y); c.lineTo(cl.x + cl.vx * 1.5, cl.y + cl.vy * 1.5); c.stroke();
      }
    }
  }

  /** golden specks: the seeds a cloud carries */
  private drawCloudSeeds(cl: Cloud, r: number, t: number) {
    const c = this.ctx;
    const n = Math.min(16, Math.ceil(cl.seeds / 2));
    const q = rng(cl.seed + 3);
    for (let i = 0; i < n; i++) {
      const a = q() * Math.PI * 2, d = Math.sqrt(q()) * 0.7;
      const x = cl.x + Math.cos(a + t * 0.3) * d * r, y = cl.y + Math.sin(a) * d * r * 0.4 + Math.sin(t * 2 + i) * 2;
      c.fillStyle = i % 3 ? '#e8d27a' : '#a8d860';
      c.fillRect(x - 1.5, y - 1, 3, 2.5);
    }
  }

  private drawCloudShape(cl: Pick<Cloud, 'id' | 'seed' | 'mass' | 'x' | 'y' | 'raining'>, r: number, sat: number, cam: Camera, t: number) {
    const c = this.ctx;
    const screenR = r * cam.zoom;
    const tone = clamp(sat * 0.7 + (cl.raining ? 0.35 : 0) + this.mood.storm * 0.15, 0, 1);
    const lightC = mixC([206, 216, 234], [244, 248, 255], this.mood.health);
    const main = mixC(mixC(lightC, [116, 126, 150], 0.42), [52, 58, 76], tone);
    const shadow = mixC([58, 62, 84], [20, 22, 32], tone);
    const hi = css(lightC, 0.95 - tone * 0.5);
    if (screenR < 3) { c.fillStyle = css(main); c.fillRect(cl.x - r, cl.y - r * 0.5, r * 2, r); return; }
    const puffs = this.puffsFor(cl);
    const vis = Math.min(puffs.length, 4 + Math.sqrt(cl.mass) * 2.2);
    const lod = screenR < 10 ? Math.min(vis, 6) : vis;
    const tower = 1 + Math.min(0.8, Math.log10(cl.mass + 1) * 0.26);
    const wob = (i: number) => Math.sin(t * 0.8 + i * 1.7 + cl.seed) * 0.03;
    for (let pass = 0; pass < 3; pass++) {
      c.fillStyle = pass === 0 ? css(shadow) : pass === 1 ? css(main) : hi;
      c.beginPath();
      for (let i = 0; i < lod; i++) {
        const p = puffs[i];
        const grow = clamp(vis - i, 0, 1);
        if (grow <= 0) break;
        const pr = p.r * r * grow * (pass === 2 ? 0.42 : 1);
        const px = cl.x + (p.x + wob(i)) * r + (pass === 2 ? -pr * 0.5 : 0);
        const py = cl.y + p.y * r * (p.y < 0 ? tower : 1) + (pass === 0 ? r * 0.12 : pass === 2 ? -pr * 0.55 : 0);
        c.moveTo(px + pr, py);
        c.arc(px, py, pr, 0, Math.PI * 2);
      }
      c.fill();
      if (pass === 0) {
        c.fillRect(cl.x - r * 0.7, cl.y + r * 0.05, r * 1.4, r * 0.24);
        // warm rim on the belly, lit by the glowing horizon
        c.fillStyle = `rgba(230,130,70,${0.35 * (1 - this.mood.storm) * (1 - tone * 0.6)})`;
        c.fillRect(cl.x - r * 0.62, cl.y + r * 0.27, r * 1.24, Math.max(1.5, r * 0.035));
      }
    }
    // storms flicker from inside
    if (cl.raining && cl.mass > 8 && this.rand() < 0.03) { c.fillStyle = 'rgba(190,200,255,0.25)'; c.beginPath(); c.arc(cl.x + (this.rand() - 0.5) * r, cl.y, r * 0.5, 0, 7); c.fill(); }
  }

  private updateLightning(sim: Sim, cam: Camera, dt: number) {
    const c = this.ctx;
    for (const cl of sim.clouds.clouds) {
      if (!cl.raining || cl.mass < 10) continue;
      if (cl.x < cam.left - 100 || cl.x > cam.left + cam.viewW + 100) continue;
      if (this.rand() > Math.min(0.6, 0.04 + cl.mass / 350) * dt) continue;
      const r = cloudRadius(cl.mass);
      const gx = cl.x + (this.rand() - 0.5) * r;
      const gy = sim.terrain.groundY(gx);
      const sx0 = cl.x + (this.rand() - 0.5) * r * 0.5, sy0 = cl.y + r * 0.2;
      const pts: number[] = [sx0, sy0];
      for (let i = 1; i <= 9; i++) pts.push(lerp(sx0, gx, i / 9) + (i < 9 ? (this.rand() - 0.5) * 40 : 0), lerp(sy0, gy, i / 9));
      this.bolts.push({ pts, t: 0, x: gx, y: gy });
      this.mood.flash = Math.max(this.mood.flash, Math.min(1, 0.6 + cl.mass / 200));
      this.shake = Math.max(this.shake, Math.min(0.6, cl.mass / 120));
      this.onThunder?.(Math.abs(cl.x - cam.x), cl.mass > 40);
    }
    for (const b of this.bolts) {
      b.t += dt;
      const a = 1 - b.t / 0.25;
      if (a <= 0) continue;
      for (const [w, col] of [[6, `rgba(170,190,255,${a * 0.4})`], [2, `rgba(255,255,255,${a})`]] as const) {
        c.strokeStyle = col;
        c.lineWidth = w;
        c.beginPath();
        c.moveTo(b.pts[0], b.pts[1]);
        for (let i = 2; i < b.pts.length; i += 2) c.lineTo(b.pts[i], b.pts[i + 1]);
        c.stroke();
      }
      this.lights.push({ x: b.x, y: b.y - 60, r: 260, col: '200,210,255', a });
    }
    this.bolts = this.bolts.filter(b => b.t < 0.25);
  }

  private drawEffects(dt: number, t: number) {
    const c = this.ctx;
    for (const g of this.ghosts) {
      g.t += dt;
      const k = 1 - g.t / 0.6;
      if (k <= 0) continue;
      c.globalAlpha = k * 0.8;
      this.drawCloudShape({ id: -1, seed: g.seed, mass: 1, x: g.x, y: g.y, raining: false }, g.r * k, 0, { zoom: 1 } as Camera, t);
      this.puffs.delete(-1);
      c.globalAlpha = 1;
    }
    this.ghosts = this.ghosts.filter(g => g.t < 0.6);
    for (const b of this.buckets) {
      b.t += dt / 0.9;
      const k = Math.min(1, b.t);
      const x = lerp(b.fx, b.tx, k), y = lerp(b.fy, b.ty, k) - Math.sin(k * Math.PI) * 120;
      c.fillStyle = C.ink; c.fillRect(x - 7, y - 8, 14, 12);
      c.fillStyle = C.metal; c.fillRect(x - 6, y - 7, 12, 10);
      c.fillStyle = C.water; c.fillRect(x - 5, y - 7, 10, 3);
    }
    this.buckets = this.buckets.filter(b => b.t < 1);
    for (const d of this.ghostsDebris) {
      d.t += dt;
      const k = d.t / 1.2;
      c.fillStyle = `rgba(60,40,28,${1 - k})`;
      for (let i = 0; i < 8; i++) {
        const a = i * 0.8 + 0.3;
        c.fillRect(d.x + Math.cos(a) * 60 * k, d.y - 30 - Math.sin(a) * 80 * k + 120 * k * k, 6, 6);
      }
    }
    this.ghostsDebris = this.ghostsDebris.filter(d => d.t < 1.2);
  }

  /** darkness layer with light sources cut out, plus warm additive glow */
  private drawLighting(cam: Camera) {
    const c = this.ctx, l = this.lctx;
    const st = this.mood.storm, he = this.mood.health;
    const dark = clamp((0.04 + 0.08 * (1 - he) + st * 0.3 + this.mood.veil * 0.14) * (1 - this.mood.flash * 0.9) * (1 - 0.55 * this.mood.sun), 0, 0.78);
    const z = cam.zoom;
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.globalCompositeOperation = 'source-over';
    l.clearRect(0, 0, cam.lowW, cam.lowH);
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (dark > 0.01) {
      const tint = '8,10,24';
      const g = l.createLinearGradient(0, 0, 0, cam.lowH);
      g.addColorStop(0, `rgba(${tint},${Math.min(0.85, dark * 1.15)})`);
      g.addColorStop(1, `rgba(${tint},${dark * 0.8})`);
      l.fillStyle = g;
      l.fillRect(0, 0, cam.lowW, cam.lowH);
      l.globalCompositeOperation = 'destination-out';
      for (const L of this.lights) {
        const x = (L.x - cam.left) * z, y = (L.y - cam.top) * z, r = L.r * z;
        if (r < 1 || x < -r || y < -r || x > cam.lowW + r || y > cam.lowH + r) continue;
        const rg = l.createRadialGradient(x, y, 0, x, y, r);
        rg.addColorStop(0, `rgba(0,0,0,${Math.min(1, L.a * 1.4)})`);
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        l.fillStyle = rg;
        l.fillRect(x - r, y - r, r * 2, r * 2);
      }
      c.drawImage(this.light, 0, 0);
    }
    c.globalCompositeOperation = 'lighter';
    for (const L of this.lights) {
      const x = (L.x - cam.left) * z, y = (L.y - cam.top) * z, r = L.r * z * 0.6;
      if (r < 1 || x < -r || y < -r || x > cam.lowW + r || y > cam.lowH + r) continue;
      const rg = c.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, `rgba(${L.col},${L.a * 0.35 * (0.4 + dark)})`);
      rg.addColorStop(1, `rgba(${L.col},0)`);
      c.fillStyle = rg;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // sunbeams pouring through the torn Véu
    const sun = this.mood.sun * (1 - st * 0.8);
    if (sun > 0.03) {
      const sx = cam.lowW * 0.78, sy = cam.lowH * 0.16, len = Math.hypot(cam.lowW, cam.lowH);
      for (let k = 0; k < 6; k++) {
        const a = 2.05 + (k - 2.5) * 0.16 + Math.sin(this.time * 0.15 + k * 1.7) * 0.03, w = 0.025 + 0.015 * Math.sin(k * 2.3 + this.time * 0.3);
        const g = c.createLinearGradient(sx, sy, sx + Math.cos(a) * len * 0.8, sy + Math.sin(a) * len * 0.8);
        g.addColorStop(0, `rgba(255,226,160,${0.16 * sun})`);
        g.addColorStop(1, 'rgba(255,226,160,0)');
        c.fillStyle = g;
        c.beginPath(); c.moveTo(sx, sy);
        c.lineTo(sx + Math.cos(a - w) * len, sy + Math.sin(a - w) * len);
        c.lineTo(sx + Math.cos(a + w) * len, sy + Math.sin(a + w) * len);
        c.closePath(); c.fill();
      }
    }
    if (this.mood.flash > 0.02) { c.fillStyle = `rgba(200,210,255,${this.mood.flash * 0.25})`; c.fillRect(0, 0, cam.lowW, cam.lowH); }
    c.globalCompositeOperation = 'source-over';
  }

  /** near-black parallax grass & rocks framing the bottom of the screen (depth) */
  private drawForeground(sim: Sim, cam: Camera) {
    const c = this.ctx, W = cam.lowW, H = cam.lowH, z = cam.zoom;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = css(mixC(mul(hex(sim.biome.palette.nearHills), 0.35), mul(hex(sim.biome.palette.grassWet), 0.45), this.mood.health * 0.6));
    const base = H - Math.max(4, H * 0.035);
    for (let sx = 0; sx < W; sx++) {
      const fx = cam.x * 1.5 * z + sx;
      const h = H * 0.03 * (0.5 + 0.5 * noise1(fx / 22, 77)) + (hash1(Math.floor(fx / 3), 5) > 0.82 ? H * 0.03 * hash1(Math.floor(fx / 3), 6) : 0);
      c.fillRect(sx, base - h, 1, H - base + h);
    }
  }

  // ───────────────────────── building ─────────────────────────
  private drawBuildOverlay(sim: Sim, view: ViewState, t: number) {
    const c = this.ctx;
    if (view.mode === 'pipe' && view.pendingPort && view.dragPipe) {
      const m = sim.byId.get(view.pendingPort.m);
      const p = m && MACHINES[m.kind].ports.find(q => q.id === view.pendingPort!.port);
      if (m && p) {
        const a = portWorld(m, p);
        c.strokeStyle = p.fluid === 'water' ? C.waterL : '#ffffff';
        c.lineWidth = 4;
        c.setLineDash([8, 6]);
        c.lineDashOffset = -t * 30;
        c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(view.dragPipe.x, view.dragPipe.y); c.stroke();
        c.setLineDash([]);
      }
    }
  }

  private drawGhost(sim: Sim, cam: Camera, g: Ghost, t: number) {
    const c = this.ctx;
    const fake: Machine = {
      id: -1, kind: g.kind, x: g.x, y: g.y, angle: g.angle, flip: g.flip, on: true, power: g.power,
      water: 0, steam: 0, seeds: 0, heat: 0, fire: 0, emitted: 0, rate: 0, boost: 0, support: g.support, anim: 0,
    };
    c.globalAlpha = 0.75;
    drawMachine(c, fake, { t, waterFrac: 0, steamFrac: 0, active: true, ghost: true }, x => sim.terrain.groundY(x));
    c.globalAlpha = 1;
    const d = MACHINES[g.kind];
    const bx = g.x - d.w / 2, by = d.placement === 'mast' ? g.y - d.h / 2 : g.y - d.h;
    c.fillStyle = g.ok ? 'rgba(120,230,140,0.22)' : 'rgba(255,90,70,0.28)';
    c.fillRect(bx - 4, by - 4, d.w + 8, d.h + 8);
    c.strokeStyle = g.ok ? '#8dffaa' : '#ff7a6b';
    c.lineWidth = (2 / cam.zoom) * cam.scale * 1.5;
    c.strokeRect(bx - 4, by - 4, d.w + 8, d.h + 8);
    if (d.placement === 'mast') this.drawWindCone(fake, 0.3);
    this.lights.push({ x: g.x, y: by + d.h / 2, r: 90, col: '255,255,255', a: 0.6 });
  }
}

/** Small icon of a machine for the shop. */
export function drawIcon(canvas: HTMLCanvasElement, kind: MachineKind) {
  const c = canvas.getContext('2d')!;
  const d = MACHINES[kind];
  c.clearRect(0, 0, canvas.width, canvas.height);
  c.imageSmoothingEnabled = false;
  const extra = d.kind === 'boiler' ? 30 : d.kind === 'boiler_ind' ? 32 : d.kind === 'condenser' ? 10 : d.kind === 'seeder' ? 8 : 0;
  const s = Math.min((canvas.width - 6) / (d.w + 4), (canvas.height - 6) / (d.h + extra + 4));
  c.save();
  if (d.placement === 'mast') {
    c.translate(canvas.width / 2, canvas.height / 2);
    c.scale(s * 0.95, s * 0.95);
    drawWind(c, kind, 0.6);
  } else {
    c.translate(canvas.width / 2, canvas.height - 3);
    c.scale(s, s);
    const fake: Machine = { id: 0, kind, x: 0, y: 0, angle: 0, flip: false, on: true, power: 1, water: 0, steam: 0, seeds: 0, heat: 0.6, fire: 1, emitted: 0, rate: 0, boost: 0, support: 0, anim: 0 };
    drawMachine(c, fake, { t: 0.4, waterFrac: 0.6, steamFrac: 0.4, active: true });
  }
  c.restore();
}
