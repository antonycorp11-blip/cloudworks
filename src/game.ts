// Game controller: owns the simulation, camera, renderer, input, audio and UI and
// translates player gestures into simulation commands.
import { AudioSys } from './audio/audio';
import { Camera } from './core/camera';
import { Input, type InputHandler } from './core/input';
import { MACHINES, type MachineKind } from './data/machines';
import { portWorld, resolvePlacement } from './sim/build';
import { loadGame, saveGame, wipeSave } from './sim/save';
import { Sim, STEP } from './sim/sim';
import { cloudRadius } from './sim/types';
import { distToPath } from './sim/build';
import { Renderer, type Ghost, type ViewState } from './render/renderer';
import { UI } from './ui/ui';

const PIX = 3; // physical pixels per low-res pixel (pixel-art scale)

export class Game implements InputHandler {
  sim: Sim;
  cam = new Camera();
  renderer: Renderer;
  audio = new AudioSys();
  ui: UI;
  view: ViewState = { mode: 'play', ghost: null, selection: null, pendingPort: null, dragPipe: null };
  private want = { x: 0, y: 0 };
  private dragOff = { x: 0, y: 0 };
  private camGoal: { x: number; y: number } | null = null;
  private holding: number | null = null;
  private holdTime = 0;
  private lastHold = 0;
  private bellowsSfx = 0;
  private grabbing = false;
  private autoFollow = false;
  private followLost = 0;
  private acc = 0;
  private lastT = 0;
  private saveTimer = 0;
  /** adaptive quality: extra pixel size (0..2) on devices that can't hold the frame rate */
  private lowRes = 0;
  private slowT = 0;
  private frameEma = 1 / 60;
  private unsub: (() => void) | null = null;
  canvas: HTMLCanvasElement;
  store: Storage | null;

  constructor() {
    this.canvas = document.getElementById('world') as HTMLCanvasElement;
    this.store = safeStorage();
    this.sim = (this.store && loadGame(this.store)) || new Sim(0);
    this.renderer = new Renderer(this.canvas);
    this.renderer.onThunder = (dist, big) => {
      this.audio.thunder(Math.min(1, dist / 1500), big);
      const b = this.sim.biome;
      if (Math.abs(this.cam.x - (b.targetStart + b.targetEnd) / 2) < 900) this.sim.creature.react('lightning');
    };
    this.ui = new UI(this);
    new Input(this.canvas, this.cam, this);
    this.bindSim();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
    const unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', e => this.key(e));
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.save(); });
    window.addEventListener('pagehide', () => this.save());
    this.resetCamera();
    requestAnimationFrame(t => { this.lastT = t; this.frame(t); });
  }

  private bindSim() {
    this.unsub?.();
    this.unsub = this.sim.bus.on(e => {
      this.renderer.onEvent(e);
      this.ui.onEvent(e);
      if (e.type === 'sfx') this.audio.play(e.name);
      if (e.type === 'stageUp') { this.renderer.shake = Math.max(this.renderer.shake, e.final ? 1 : 0.7); }
    });
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    const pix = (dpr >= 2 ? PIX : 2) + this.lowRes;
    const lowW = Math.max(160, Math.round((w * dpr) / pix));
    const lowH = Math.max(120, Math.round((h * dpr) / pix));
    const wasValid = this.cam.cssW > 50 && this.cam.cssH > 50;
    const z = this.cam.zoom / this.cam.scale; // css px per world unit (kept across resizes)
    this.canvas.width = lowW;
    this.canvas.height = lowH;
    Object.assign(this.cam, { lowW, lowH, cssW: w, cssH: h });
    this.cam.worldW = this.sim.biome.width;
    this.cam.worldH = this.sim.biome.groundBase + 120;
    if (wasValid && Number.isFinite(z) && z > 0) {
      this.cam.zoom = z * this.cam.scale;
      this.cam.clamp();
    } else if (w > 50 && h > 50) this.resetCamera();
  }

  resetCamera() {
    this.cam.worldW = this.sim.biome.width;
    this.cam.worldH = this.sim.biome.groundBase + 120;
    const landscape = this.cam.cssW > this.cam.cssH;
    const viewWorldW = landscape ? 840 : 560;
    this.cam.zoom = this.cam.lowW / viewWorldW;
    this.cam.x = this.sim.terrain.sea.x1 + (landscape ? 220 : 130);
    this.cam.y = this.sim.biome.groundBase - this.cam.viewH * (landscape ? 0.3 : 0.14);
    this.cam.clamp();
  }

  goTo(x: number, y: number) { this.camGoal = { x, y }; this.cam.followId = null; }
  /** the Semente-Mãe before it rises, then the Ancient's body */
  goTarget() {
    const s = this.sim, x = s.creature.awake ? s.creature.geometry().cx : s.forest.heartX;
    // a grown Ancient doesn't fit the usual framing: pull the camera back to see all of it
    if (s.creature.awake) {
      const g = s.creature.geometry(), need = (s.creature.anchor - g.headX) * 1.5;
      if (need > this.cam.viewW) { this.cam.zoom = this.cam.lowW / need; this.cam.clamp(); }
    }
    this.goTo(x, s.biome.groundBase - this.cam.viewH * (this.cam.cssW > this.cam.cssH ? 0.3 : 0.14));
  }
  goHome() { const l = this.cam.cssW > this.cam.cssH; this.goTo(this.sim.terrain.sea.x1 + (l ? 220 : 130), this.sim.biome.groundBase - this.cam.viewH * (l ? 0.3 : 0.14)); }

  private frame(t: number) {
    const dt = Math.min(0.1, (t - this.lastT) / 1000);
    this.lastT = t;
    this.adaptQuality(dt);
    if (!this.ui.paused) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= STEP && n < 8) { this.sim.step(STEP); this.acc -= STEP; n++; }
      if (n === 8) this.acc = 0;
    }
    // bellows: holding the finger on a boiler fans the flames
    if (this.holding != null) {
      this.holdTime += dt;
      if (this.holdTime > 0.15) {
        this.sim.setBoost(this.holding);
        this.bellowsSfx -= dt;
        if (this.bellowsSfx <= 0) { this.audio.play('bellows'); this.bellowsSfx = 0.32; }
      }
    }
    this.updateCamera(dt);
    if (this.view.ghost) this.refreshGhost();
    // the tree screen covers the world: skip drawing it (the simulation keeps running)
    if (!this.ui.tree.isOpen) this.renderer.render(this.sim, this.cam, this.view, dt, t / 1000);
    this.audio.setRain(this.renderer.rainVisible);
    this.audio.setAmbience(this.renderer.mood.storm);
    this.ui.update(dt);
    this.saveTimer += dt;
    if (this.saveTimer > 10) { this.saveTimer = 0; this.save(); }
    requestAnimationFrame(tt => this.frame(tt));
  }

  private updateCamera(dt: number) {
    if (this.cam.followId != null) {
      const c = this.sim.clouds.clouds.find(q => q.id === this.cam.followId);
      if (!c) {
        this.cam.followId = null;
        this.ui.refreshCtx();
        if (this.autoFollow) { this.autoFollow = false; this.followLost = 1.6; }
      }
      else { this.cam.x += (c.x - this.cam.x) * Math.min(1, dt * 3); this.cam.y += (c.y + this.cam.viewH * 0.1 - this.cam.y) * Math.min(1, dt * 3); this.cam.clamp(); }
    } else if (this.followLost > 0) {
      this.followLost -= dt;
      if (this.followLost <= 0) this.goHome();
    } else if (this.camGoal) {
      const k = Math.min(1, dt * 4);
      this.cam.x += (this.camGoal.x - this.cam.x) * k;
      this.cam.y += (this.camGoal.y - this.cam.y) * k;
      this.cam.clamp();
      if (Math.abs(this.camGoal.x - this.cam.x) < 2) this.camGoal = null;
    }
  }

  save() { if (this.store) saveGame(this.sim, this.store); }

  /** if frames stay slow for a few seconds, render at a coarser pixel size and with fewer lights */
  private adaptQuality(dt: number) {
    if (this.ui.paused || document.hidden) return;
    this.frameEma += (dt - this.frameEma) * 0.05;
    if (this.frameEma > 1 / 36 && this.lowRes < 2) {
      this.slowT += dt;
      if (this.slowT > 3) {
        this.slowT = 0;
        this.lowRes++;
        this.renderer.maxLights = this.lowRes >= 2 ? 16 : 28;
        this.frameEma = 1 / 60;
        this.resize();
      }
    } else this.slowT = 0;
  }

  // ───────────── modes ─────────────
  setMode(mode: ViewState['mode']) {
    if (mode !== 'place') this.view.ghost = null;
    this.view.mode = mode;
    this.view.pendingPort = null;
    this.view.dragPipe = null;
    this.ui.refreshCtx();
    this.ui.refreshBar();
  }

  startPlacing(kind: MachineKind, opts: { angle?: number; flip?: boolean; power?: number; x?: number; y?: number } = {}) {
    const d = MACHINES[kind];
    this.view.selection = null;
    this.camGoal = null;
    this.cam.followId = null;
    let x = opts.x ?? this.cam.x;
    let y = opts.y ?? (d.placement === 'mast' ? this.cam.y : this.cam.y + this.cam.viewH * 0.2);
    if (d.placement === 'water' && opts.x == null) x = this.sim.terrain.sea.x1 - 130;
    if (opts.x == null && x > this.sim.biome.targetStart - 100 && d.placement !== 'mast') x = this.sim.biome.targetStart - 160;
    this.want = { x, y };
    this.view.ghost = { kind, angle: opts.angle ?? 0, flip: opts.flip ?? false, power: opts.power ?? 1, x, y, support: y, ok: false };
    this.view.mode = 'place';
    this.refreshGhost();
    if (d.placement === 'water') this.goTo(x, this.cam.y);
    this.ui.refreshCtx();
    this.ui.refreshBar();
  }

  startMove(id: number) {
    const m = this.sim.byId.get(id);
    if (!m) return;
    this.startPlacing(m.kind, { angle: m.angle, flip: m.flip, power: m.power, x: m.x, y: MACHINES[m.kind].placement === 'mast' ? m.y : m.y - 2 });
    this.view.ghost!.moveId = id;
    this.ui.refreshCtx();
  }

  refreshGhost() {
    const g = this.view.ghost;
    if (!g) return;
    const p = resolvePlacement(this.sim.biome, this.sim.terrain, this.sim.machines, g.kind, this.want.x, this.want.y, g.moveId ?? -1, this.sim.rootRange());
    Object.assign(g, p);
    if (g.moveId == null && !this.sim.canAfford(MACHINES[g.kind].cost) && p.ok) { g.ok = false; g.reason = 'Créditos insuficientes'; }
  }

  rotateGhost(delta: number) {
    const g = this.view.ghost;
    if (!g) return;
    g.angle = normAngle(g.angle + delta);
    this.ui.refreshCtx();
  }
  flipGhost() { const g = this.view.ghost; if (g) { g.flip = !g.flip; this.ui.refreshCtx(); } }

  confirmGhost() {
    const g = this.view.ghost;
    if (!g) return;
    const r = g.moveId != null
      ? this.sim.move(g.moveId, this.want.x, this.want.y, g.angle, g.flip)
      : this.sim.build(g.kind, this.want.x, this.want.y, g.angle, g.flip, g.power);
    if (!r.ok) { this.ui.toast(r.reason ?? 'Inválido', 'warn'); this.audio.play('error'); return; }
    this.view.ghost = null;
    this.view.mode = 'play';
    this.view.selection = null; // built: back to playing, no panel popping up
    this.ui.refreshCtx();
    this.ui.refreshBar();
    this.save();
  }

  cancelGhost() { this.view.ghost = null; this.setMode('play'); }

  select(sel: ViewState['selection']) {
    this.view.selection = sel;
    this.ui.refreshCtx();
  }

  // ───────────── input handler ─────────────
  private portRadius() { return Math.max(14, 24 * this.cam.unitPerCss); }

  private portAt(wx: number, wy: number) {
    let best: { m: number; port: string } | null = null;
    let bd = this.portRadius();
    for (const m of this.sim.machines) {
      for (const p of MACHINES[m.kind].ports) {
        const w = portWorld(m, p);
        const d = Math.hypot(w.x - wx, w.y - wy);
        if (d < bd) { bd = d; best = { m: m.id, port: p.id }; }
      }
    }
    return best;
  }

  private overGhost(wx: number, wy: number) {
    const g = this.view.ghost!;
    const d = MACHINES[g.kind];
    const pad = 40 * this.cam.unitPerCss;
    const top = d.placement === 'mast' ? g.y - d.h / 2 : g.y - d.h;
    const bot = d.placement === 'mast' ? g.y + d.h / 2 : g.y;
    return wx > g.x - d.w / 2 - pad && wx < g.x + d.w / 2 + pad && wy > top - pad && wy < bot + pad;
  }

  tap(wx: number, wy: number) {
    const s = this.sim;
    if (this.view.mode === 'place') {
      // tap elsewhere moves the ghost there (comfortable on phones)
      if (!this.overGhost(wx, wy)) { this.want = { x: wx, y: wy + (MACHINES[this.view.ghost!.kind].placement === 'mast' ? 0 : 10) }; this.ui.refreshCtx(); }
      return;
    }
    if (this.view.mode === 'pipe') {
      const port = this.portAt(wx, wy);
      if (!port) { this.view.pendingPort = null; this.ui.refreshCtx(); return; }
      if (!this.view.pendingPort) { this.view.pendingPort = port; this.audio.play('click'); this.ui.refreshCtx(); return; }
      this.tryConnect(this.view.pendingPort, port);
      return;
    }
    // play mode
    const m = s.machineAt(wx, wy, 4 * this.cam.unitPerCss + 2);
    if (m) {
      // holding a boiler worked the bellows: releasing it must not open its panel
      if (this.lastHold > 0.15 && (m.kind === 'boiler' || m.kind === 'boiler_ind')) return;
      // a tap that did a quick action (pour, stoke) doesn't open the panel either
      if (m.kind === 'boiler' && (s.bucket > 0 || m.fire < 5)) {
        if (s.bucket > 0) this.feedback(s.pourBucket(m));
        else s.stoke(m);
        return;
      }
      if (s.bucket > 0 && s.mods.waterCap(m.kind) > 0 && MACHINES[m.kind].ports.some(p => p.fluid === 'water' && p.dir === 'in')) {
        this.feedback(s.pourBucket(m));
        return;
      }
      const same = this.view.selection?.type === 'machine' && this.view.selection.id === m.id;
      this.select(same ? null : { type: 'machine', id: m.id }); // tapping it again closes the panel
      return;
    }
    const cl = s.cloudAt(wx, wy);
    if (cl) { this.select({ type: 'cloud', id: cl.id }); return; }
    const visitor = this.renderer.skyHit(this.cam, wx, wy);
    if (visitor) { this.ui.skyVisitor(visitor); return; }
    const pipe = s.pipes.find(p => distToPath(p.path, wx, wy) < Math.max(8, 14 * this.cam.unitPerCss));
    if (pipe) { this.select({ type: 'pipe', id: pipe.id }); return; }
    if (s.terrain.isSea(wx) && wy > s.terrain.seaLevel - 60 && wy < s.terrain.groundY(wx) + 20) {
      const r = s.fillBucket();
      if (r.ok) this.ui.float(wx, s.terrain.seaLevel - 20, `🪣 +${s.mods.bucketSize()} L`, '#7cc7ff');
      else this.ui.toast(r.reason!, 'info');
      this.select(null);
      return;
    }
    this.select(null);
  }

  private feedback(r: { ok: boolean; reason?: string }) {
    if (!r.ok && r.reason) { this.ui.toast(r.reason, 'info'); this.audio.play('error'); }
  }

  private tryConnect(a: { m: number; port: string }, b: { m: number; port: string }) {
    const r = this.sim.connect(a, b);
    if (!r.ok) { this.ui.toast(r.reason ?? 'Conexão inválida', 'warn'); this.audio.play('error'); }
    this.view.pendingPort = null;
    this.view.dragPipe = null;
    this.ui.refreshCtx();
  }

  press(wx: number, wy: number) {
    this.lastHold = 0;
    if (this.view.mode !== 'play') return;
    const m = this.sim.machineAt(wx, wy, 4 * this.cam.unitPerCss + 2);
    if (m && (m.kind === 'boiler' || m.kind === 'boiler_ind')) { this.holding = m.id; this.holdTime = 0; }
  }

  release() {
    if (this.holding != null) this.lastHold = this.holdTime;
    this.holding = null;
  }

  dragStart(wx: number, wy: number): boolean {
    if (this.view.mode === 'play') {
      // grab a cloud: drag it around and flick it
      const cl = this.sim.cloudAt(wx, wy) ?? this.nearCloud(wx, wy);
      if (cl) {
        this.release();
        this.sim.grabCloud(cl.id, wx, wy);
        this.grabbing = true;
        this.cam.followId = null;
        this.camGoal = null;
        return true;
      }
    }
    if (this.view.mode === 'place' && this.view.ghost && this.overGhost(wx, wy)) {
      this.dragOff = { x: this.want.x - wx, y: this.want.y - wy };
      // keep the "want" anchored at the resolved spot so the ghost doesn't jump
      this.want = { x: this.view.ghost.x, y: this.view.ghost.y };
      this.dragOff = { x: this.want.x - wx, y: this.want.y - wy };
      return true;
    }
    if (this.view.mode === 'pipe') {
      const port = this.portAt(wx, wy);
      if (port) { this.view.pendingPort = port; this.view.dragPipe = { x: wx, y: wy }; return true; }
      return false;
    }
    // (dragging a selected machine no longer moves it by accident — use the panel's "Mover")
    return false;
  }

  private nearCloud(wx: number, wy: number) {
    const pad = 30 * this.cam.unitPerCss;
    let best = null, bd = Infinity;
    for (const c of this.sim.clouds.clouds) {
      const d = Math.hypot(c.x - wx, c.y - wy) - (12 + 15 * Math.sqrt(c.mass));
      if (d < pad && d < bd) { bd = d; best = c; }
    }
    return best;
  }

  dragMove(wx: number, wy: number) {
    if (this.grabbing) { this.sim.dragCloud(wx, wy); return; }
    if (this.view.mode === 'place') { this.want = { x: wx + this.dragOff.x, y: wy + this.dragOff.y }; return; }
    if (this.view.mode === 'pipe' && this.view.dragPipe) { this.view.dragPipe = { x: wx, y: wy }; }
  }

  dragEnd(wx: number, wy: number, vx = 0, vy = 0) {
    if (this.grabbing) {
      this.grabbing = false;
      const c = this.sim.releaseCloud(vx, vy);
      if (c && Math.hypot(c.vx, c.vy) > 150) { this.cam.followId = c.id; this.autoFollow = true; }
      return;
    }
    if (this.view.mode === 'pipe' && this.view.pendingPort && this.view.dragPipe) {
      const port = this.portAt(wx, wy);
      const from = this.view.pendingPort;
      this.view.dragPipe = null;
      if (port && (port.m !== from.m || port.port !== from.port)) this.tryConnect(from, port);
      else this.ui.refreshCtx();
    }
    this.ui.refreshCtx();
  }

  private key(e: KeyboardEvent) {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    if (e.key === 'Escape') { if (this.view.mode !== 'play') this.cancelGhost(); else this.select(null); this.ui.closeAll(); }
    if (this.view.mode === 'place') {
      if (e.key === 'Enter') this.confirmGhost();
      if (e.key === 'r' || e.key === 'R') this.rotateGhost(e.shiftKey ? -Math.PI / 12 : Math.PI / 12);
      if (e.key === 'f' || e.key === 'F') this.flipGhost();
    }
    if (e.key === 'b' || e.key === 'B') this.ui.toggleShop();
    if (e.key === 'p' || e.key === 'P') this.setMode(this.view.mode === 'pipe' ? 'play' : 'pipe');
    if (e.key === 'u' || e.key === 'U') this.ui.openUpgrades();
  }

  // ───────────── level flow ─────────────
  nextLevel() {
    this.sim.completeLevel();
    this.afterLevelChange();
  }
  restart() {
    if (this.store) wipeSave(this.store);
    this.sim = new Sim(0);
    this.afterLevelChange();
  }
  private afterLevelChange() {
    this.bindSim();
    this.view = { mode: 'play', ghost: null, selection: null, pendingPort: null, dragPipe: null };
    this.resize();
    this.resetCamera();
    this.ui.rebuild();
    this.ui.showIntro();
    this.save();
  }

  cloudInfo(id: number) {
    const c = this.sim.clouds.clouds.find(q => q.id === id);
    if (!c) return null;
    const cap = this.sim.climate.capacity(c.temp);
    return { c, cap, r: cloudRadius(c.mass) };
  }
}

export const normAngle = (a: number) => {
  let x = a % (Math.PI * 2);
  if (x > Math.PI) x -= Math.PI * 2;
  if (x < -Math.PI) x += Math.PI * 2;
  return x;
};

function safeStorage(): Storage | null {
  try {
    const s = window.localStorage;
    s.setItem('__cw', '1');
    s.removeItem('__cw');
    return s;
  } catch {
    return null;
  }
}

export type { Ghost };
