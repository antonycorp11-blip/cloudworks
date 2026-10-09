// Simulation orchestrator. No DOM here: rendering/UI read state and call commands.
import { BIOMES, type BiomeDef } from '../data/biomes';
import { MACHINES, type MachineKind } from '../data/machines';
import { PERMANENT, UPGRADES, type ModKey, type PermKey } from '../data/upgrades';
import { activeMissions } from '../data/missions';
import { NODE, STARTER, TREE } from '../data/tree';
import { findPort, machineBox, pathLength, pipeCost, portWorld, resolvePlacement, routePipe } from './build';
import { Climate } from './climate';
import { Creature, SCALE } from './creature';
import { CELL, Forest, type ForestSave } from './forest';
import { chapter } from '../data/story';
import { CloudSystem, type CloudHost } from './clouds';
import { EventBus } from './events';
import { stepMachines, stepPipes, type FluidHost } from './hydraulics';
import { Mods } from './stats';
import { Terrain } from './terrain';
import { cloudRadius, type Cloud, type Machine, type Pipe, type PipeEnd } from './types';
import { WindField } from './wind';
import { rng } from './util';

export const STEP = 1 / 30;
export const SAVE_VERSION = 3;
/** seeds the engineer carries by hand (refilled by pods the Semente-Mãe lets the wind carry) */
export const POUCH_MAX = 12;
export const POUCH_GIVE = 6;
export const VEIL_LENGTH = 45;

export interface Result { ok: boolean; reason?: string }

export class Sim implements CloudHost, FluidHost {
  bus = new EventBus();
  mods = new Mods();
  biomeIndex = 0;
  biome!: BiomeDef;
  terrain!: Terrain;
  climate!: Climate;
  creature!: Creature;
  forest!: Forest;
  wind!: WindField;
  clouds!: CloudSystem;
  time = 0;
  credits = 0;
  patents = 0;
  levelsDone = 0;
  machines: Machine[] = [];
  pipes: Pipe[] = [];
  byId = new Map<number, Machine>();
  nextId = 1;
  bucket = 0;
  /** hand-carried seeds */
  pouch = POUCH_MAX;
  private pouchTimer = 0;
  helperTimer = 0;
  /** world events: the Nuvem-Mãe and the Véu thickening */
  motherAt = 360;
  veilAt = 420;
  veilLeft = 0;
  whisperIdx = 0;
  private transpireTimer = 0;
  private eventRng = rng(5);
  firstRain = false;
  /** engineering-tree levels by node id */
  tree: Record<string, number> = { core: 1 };
  missionIdx = 0;
  private missionTimer = 0;
  stats = { ...FRESH_STATS };
  rates = { water: 0, steam: 0, rain: 0, income: 0 };
  /** per-16px ground wetness (visual + feedback), decays over time */
  wet!: Float32Array;
  private pipesOut = new Map<number, Pipe[]>();
  private earnAcc = 0;
  private rainIn = 0;
  private rainOut = 0;
  private coinX: number | null = null;
  private earnTimer = 0;
  private last = { pumped: 0, steam: 0, rain: 0, earned: 0 };

  constructor(level = 0) {
    this.startLevel(level);
  }

  // ───────────────────────── level setup ─────────────────────────
  startLevel(index: number) {
    this.biomeIndex = Math.min(index, BIOMES.length - 1);
    this.biome = BIOMES[this.biomeIndex];
    this.terrain = new Terrain(this.biome);
    this.climate = new Climate(this.biome);
    // the Semente-Mãe lies 40% into the land; the Ancient that rises there grows back towards the factory
    const b = this.biome;
    this.creature = new Creature(this.biomeIndex, this.bus, b.targetStart + 0.4 * (b.targetEnd - b.targetStart) + 90 * SCALE[1]);
    this.forest = new Forest(this.biome, this.creature.geometry(SCALE[1]).cx);
    this.forest.onTier = (i, tier) => this.onTier(i, tier);
    this.uprootedStage = 0;
    this.wind = new WindField(this.biome, this.terrain);
    this.clouds = new CloudSystem(this);
    this.machines = [];
    this.pipes = [];
    this.byId.clear();
    this.time = 0;
    this.bucket = 0;
    this.firstRain = false;
    this.missionIdx = 0;
    this.lastStage = 0;
    this.pouch = POUCH_MAX;
    this.pouchTimer = 0;
    this.motherAt = 360;
    this.veilAt = 420;
    this.veilLeft = 0;
    this.whisperIdx = 0;
    this.transpireTimer = 0;
    this.firstTier = [false, false, false, false];
    this.wet = new Float32Array(Math.ceil(this.biome.width / 16) + 1);
    for (const u of UPGRADES) this.mods.levels[u.id] = 0;
    // modifier nodes reset each biome; research (unlocks) and legacy (patents) are permanent
    for (const id of Object.keys(this.tree)) if (NODE[id]?.mod) delete this.tree[id];
    this.tree.core = 1;
    this.credits = this.biome.startCredits + this.mods.perm.startCredits * 150 * (this.biomeIndex + 1);
    this.stats = { ...FRESH_STATS };
    this.last = { pumped: 0, steam: 0, rain: 0, earned: 0 };

    // Starting kit: a humble boiler next to the sea and one basic fan.
    const sea = this.terrain.sea;
    const industrial = this.mods.perm.industrialStart > 0;
    const bx = sea.x1 + 150;
    const boiler = this.forcePlace(industrial ? 'boiler_ind' : 'boiler', bx, this.biome.groundBase);
    if (boiler) boiler.water = this.mods.waterCap(boiler.kind); // starts full: the first cloud is seconds away
    if (industrial) {
      const cond = this.forcePlace('condenser', bx + 110, this.biome.groundBase);
      if (boiler && cond) this.connect({ m: boiler.id, port: 'out' }, { m: cond.id, port: 'in' }, true);
    }
    const condY = this.biome.groundBase - this.biome.condAlt;
    this.forcePlace('fan', bx + (industrial ? 330 : 250), condY - 10);
    if (this.mods.perm.starterPump > 0 && boiler) {
      const pump = this.forcePlace('pump', sea.x1 - 50, 0);
      if (pump) this.connect({ m: pump.id, port: 'out' }, { m: boiler.id, port: 'in' }, true);
    }
    this.wind.dirty = true;
    this.rebuildIndex();
  }

  private forcePlace(kind: MachineKind, x: number, y: number) {
    const p = resolvePlacement(this.biome, this.terrain, this.machines, kind, x, y);
    if (!p.ok) return null;
    return this.addMachine(kind, p.x, p.y, 0, false, p.support);
  }

  private addMachine(kind: MachineKind, x: number, y: number, angle: number, flip: boolean, support: number): Machine {
    const m: Machine = {
      id: this.nextId++, kind, x, y, angle, flip, on: true, power: 1,
      water: 0, steam: 0, seeds: 0, heat: 0, fire: 0, emitted: 0, rate: 0, boost: 0, support, anim: 0,
    };
    this.machines.push(m);
    this.byId.set(m.id, m);
    if (MACHINES[kind].placement === 'mast') this.wind.dirty = true;
    return m;
  }

  rebuildIndex() {
    this.byId.clear();
    for (const m of this.machines) this.byId.set(m.id, m);
    this.pipesOut.clear();
    for (const p of this.pipes) {
      let a = this.pipesOut.get(p.from.m);
      if (!a) { a = []; this.pipesOut.set(p.from.m, a); }
      a.push(p);
    }
  }

  // ───────────────────────── simulation ─────────────────────────
  step(dt = STEP) {
    this.time += dt;
    if (this.wind.dirty) this.wind.rebuild(this.machines, this.mods);
    stepMachines(this, dt, this.pipesOut);
    stepPipes(this, dt, this.pipesOut);
    this.stepEmitters();
    this.clouds.step(dt, this.machines.filter(m => m.kind === 'divider'));
    this.stepHelper(dt);
    const m = this.mods;
    const vit = this.forest.vitality;
    this.creature.perks = { growth: 1 + m.m('rootDepth'), credit: m.m('lullaby'), thirst: 1 - m.m('patience'), forest: 0.6 + 0.8 * vit };
    this.climate.lossMul = this.creature.awake ? this.creature.thirst : 1;
    this.climate.coldStart = Math.min(this.biome.targetStart, this.targetRange()[0]) + 40;
    this.climate.step(dt);
    this.stepForest(dt);
    this.stepEvents(dt);
    this.creature.step(dt, this.climate.humidity, this.biome.humidity, this.rainIn, this.rainOut);
    this.rainIn = 0;
    this.rainOut = 0;
    if (this.creature.done && !this.climate.won) {
      this.climate.won = true;
      this.bus.emit({ type: 'sfx', name: 'win' });
      this.bus.emit({ type: 'levelComplete' });
    }
    this.checkMilestones();
    this.missionTimer += dt;
    if (this.missionTimer > 0.4) { this.missionTimer = 0; this.checkMissions(); this.checkStory(); }
    for (let i = 0; i < this.wet.length; i++) this.wet[i] *= 1 - dt * 0.02;
    this.updateRates(dt);
  }

  private stepEmitters() {
    for (const m of this.machines) {
      if (m.emitted <= 0) continue;
      const v = MACHINES[m.kind].vent;
      if (!v) { m.emitted = 0; continue; }
      const x = m.x + (m.flip ? -v.x : v.x), y = m.y + v.y;
      const rise = m.kind === 'condenser' ? 110 : 190;
      const amount = m.emitted;
      if (this.clouds.emit(x, y, amount, rise)) {
        this.stats.formed += amount;
        m.emitted = 0;
      }
    }
  }

  private stepHelper(dt: number) {
    const lvl = this.mods.lvl('helper');
    if (lvl <= 0) return;
    this.helperTimer += dt;
    if (this.helperTimer < 6) return;
    this.helperTimer = 0;
    for (let i = 0; i < lvl; i++) {
      let best: Machine | null = null;
      let bestSpace = 0.5;
      for (const m of this.machines) {
        if (m.kind !== 'boiler') continue;
        const space = this.mods.waterCap(m.kind) - m.water;
        if (space > bestSpace) { best = m; bestSpace = space; }
      }
      if (!best) return;
      const v = Math.min(bestSpace, this.mods.bucketSize());
      best.water += v;
      this.stats.pumped += v;
      const lx = this.terrain.sea.x1 - 90;
      this.bus.emit({ type: 'bucket', fromX: lx + i * 20, fromY: this.terrain.seaLevel, toX: best.x, toY: best.y - 40 });
    }
  }

  // ───────────────────────── the forest ─────────────────────────
  private firstTier = [false, false, false, false];

  private stepForest(dt: number) {
    const f = this.forest, cr = this.creature, m = this.mods;
    f.perks = { germ: m.m('germination'), pollen: m.m('pollination') };
    f.dryMul = (this.veilLeft > 0 ? 2.2 : 1) * (cr.awake ? 1 + 0.12 * cr.stage * cr.perks.thirst : 1);
    const gained = f.step(dt);
    if (gained > 0) {
      this.stats.life += gained;
      const v = gained * this.biome.creditPerL * 6;
      this.earn(v);
      this.earnAcc += v;
    }
    // pollination: clouds drifting over mature plants pick up their seeds
    const pollen = 0.05 * (1 + m.m('pollination'));
    for (const c of this.clouds.clouds) {
      if (!f.inside(c.x)) continue;
      const l = f.lifeAt(c.x);
      if (l > 2 && c.seeds < c.mass * 3) c.seeds += pollen * (l - 2) * dt;
    }
    // hand-carried seeds: pods drift in from the Semente-Mãe
    if (this.pouch < POUCH_MAX) {
      this.pouchTimer += dt;
      if (this.pouchTimer >= 10) { this.pouchTimer = 0; this.pouch++; }
    }
    if (!cr.awake && f.vitality >= this.biome.forest.awaken && f.heartLife >= 2.8) this.awaken();
    // the risen Ancient breathes clouds out of its back
    if (cr.awake && cr.stage >= 2) {
      this.transpireTimer += dt;
      if (this.transpireTimer >= 12) {
        this.transpireTimer = 0;
        const g = cr.geometry();
        const amount = 0.5 * cr.stage * (0.4 + f.vitality);
        this.clouds.emit(g.cx, this.terrain.groundY(g.cx) - g.ry * 1.1, amount, 120);
        this.stats.transpired += amount;
      }
    }
  }

  private awaken() {
    const cr = this.creature;
    cr.rise(chapter(this.biomeIndex).awaken);
    this.lastStage = cr.stage;
    this.uprootedStage = cr.stage;
    this.uproot();
    const bonus = Math.round(40 * this.biome.creditPerL);
    this.earn(bonus);
    this.bus.emit({ type: 'awaken' });
    this.bus.emit({ type: 'sfx', name: 'roar' });
    this.bus.emit({ type: 'toast', text: `A floresta se levantou: ${cr.def.name}, ${cr.def.title}, despertou! +${bonus} ₵`, kind: 'good' });
  }

  private onTier(i: number, tier: number) {
    const x = this.forest.x0 + (i + 0.5) * CELL;
    this.bus.emit({ type: 'sprout', x, y: this.terrain.groundY(x), tier });
    if (!this.firstTier[tier]) {
      this.firstTier[tier] = true;
      const name = ['', 'Brotou capim', 'Nasceu o primeiro arbusto', 'Nasceu a primeira árvore'][tier];
      if (name) this.bus.emit({ type: 'toast', text: `${name} na terra seca!`, kind: 'good' });
    }
  }

  /** the Nuvem-Mãe (a seed-laden storm) and the Véu thickening */
  private stepEvents(dt: number) {
    if (this.climate.won) return;
    if (this.time >= this.motherAt) {
      this.motherAt = this.time + 300 + this.eventRng() * 120;
      const x = this.terrain.sea.x1 - 160;
      const c = this.clouds.spawn(x, this.clouds.condY - 40, 10 + 3 * this.biomeIndex, 0, 0);
      c.seeds = 30 + 10 * this.biomeIndex;
      c.mother = true;
      c.pulse = 1;
      this.bus.emit({ type: 'mother' });
      this.bus.emit({ type: 'sfx', name: 'thunder' });
      this.bus.emit({ type: 'toast', text: 'Uma Nuvem-Mãe se formou sobre o mar, cheia de sementes! Arraste-a até a floresta.', kind: 'good' });
    }
    if (this.veilLeft > 0) {
      this.veilLeft -= dt;
      if (this.veilLeft <= 0) {
        this.veilLeft = 0;
        this.bus.emit({ type: 'veil', on: false });
        this.bus.emit({ type: 'toast', text: 'O Véu afinou de novo. O solo volta a secar no ritmo normal.', kind: 'info' });
      }
    } else if (this.time >= this.veilAt) {
      this.veilAt = this.time + 380 + this.eventRng() * 140;
      this.veilLeft = VEIL_LENGTH;
      this.bus.emit({ type: 'veil', on: true });
      this.bus.emit({ type: 'toast', text: 'O Véu engrossou! A terra seca duas vezes mais rápido — mantenha a chuva caindo sobre as plantas.', kind: 'warn' });
    }
  }

  /** whispers from under the soil, in step with the forest */
  private checkStory() {
    if (this.creature.awake) return;
    const f = this.forest, aw = this.biome.forest.awaken;
    const lines = chapter(this.biomeIndex).whispers;
    const reached = [
      this.firstRain, f.sprouted, f.vitality >= aw * 0.25, f.vitality >= aw * 0.5,
      f.heartLife >= 2.2 || f.vitality >= aw * 0.7, f.vitality >= aw * 0.9,
    ];
    if (this.whisperIdx < lines.length && reached[this.whisperIdx]) {
      this.creature.speakText(lines[this.whisperIdx], 'whisper', 'Voz sob a terra');
      this.whisperIdx++;
    }
  }

  currentMission() { return activeMissions(this)[this.missionIdx] ?? null; }
  missionReward(units: number) { return Math.round(units * this.biome.creditPerL * 2); }

  private checkMissions() {
    let m = this.currentMission();
    while (m && m.check(this)) {
      const reward = this.missionReward(m.reward);
      this.earn(reward);
      this.missionIdx++;
      this.bus.emit({ type: 'mission', text: m.text, reward });
      this.bus.emit({ type: 'sfx', name: 'mission' });
      m = this.currentMission();
    }
  }

  private lastStage = 0;
  private uprootedStage = 0;

  /** ground including the Ancient's body (clouds slam into it and are pushed up) */
  groundAt(x: number) {
    const g = this.terrain.groundY(x);
    if (!this.creature.awake) return g;
    const t = this.creature.topAt(x, g);
    return t == null ? g : Math.min(g, t);
  }
  /** the land to reforest */
  regionRange(): [number, number] { return [this.forest.x0, this.forest.x1]; }
  /** where rain matters most right now: the whole land before the Ancient rises, then its body */
  targetRange(): [number, number] { return this.creature.awake ? this.creature.zone() : this.regionRange(); }
  /** build limit: nothing may stand where the roots have grown */
  rootLimit() { return this.creature.awake ? this.creature.geometry().rootX : Infinity; }

  /** When the Ancient grows, its roots tear up every machine in the way (fully refunded). */
  private uproot() {
    const limit = this.rootLimit();
    const victims = this.machines.filter(m => machineBox(m.kind, m.x, m.y).x1 > limit);
    if (!victims.length) return;
    let refund = 0;
    for (const m of victims) {
      refund += MACHINES[m.kind].cost;
      for (const p of this.pipes.filter(q => q.from.m === m.id || q.to.m === m.id)) this.removePipe(p.id);
      this.bus.emit({ type: 'uproot', x: m.x, y: m.y });
    }
    const ids = new Set(victims.map(v => v.id));
    this.machines = this.machines.filter(m => !ids.has(m.id));
    this.credits += refund;
    this.wind.dirty = true;
    this.rebuildIndex();
    this.bus.emit({ type: 'toast', text: `As raízes de ${this.creature.def.name} arrancaram ${victims.length} máquina${victims.length > 1 ? 's' : ''} — reembolso de ${refund} ₵. Reorganize a fábrica!`, kind: 'warn' });
  }
  private checkMilestones() {
    if (this.creature.stage > this.lastStage) {
      this.lastStage = this.creature.stage;
      const bonus = Math.round(20 * Math.pow(1.7, this.creature.stage - 1) * this.biome.creditPerL);
      this.earn(bonus);
      this.bus.emit({ type: 'toast', text: `${this.creature.def.name} cresceu! Estágio ${this.creature.stage}/${this.creature.maxStage} — +${bonus} ₵`, kind: 'good' });
    }
  }

  private updateRates(dt: number) {
    const k = Math.min(1, dt * 0.8);
    const s = this.stats;
    this.rates.water += ((s.pumped - this.last.pumped) / dt - this.rates.water) * k;
    this.rates.steam += ((s.steam - this.last.steam) / dt - this.rates.steam) * k;
    this.rates.rain += ((s.rainTarget - this.last.rain) / dt - this.rates.rain) * k;
    this.rates.income += ((s.earned - this.last.earned) / dt - this.rates.income) * k;
    this.last = { pumped: s.pumped, steam: s.steam, rain: s.rainTarget, earned: s.earned };
    this.earnTimer += dt;
    if (this.earnTimer > 1 && this.earnAcc > 0) {
      const cx = (this.biome.targetStart + this.biome.targetEnd) / 2;
      this.bus.emit({ type: 'coins', x: this.coinX ?? cx, y: this.groundAt(this.coinX ?? cx) - 40, amount: this.earnAcc });
      this.earnAcc = 0;
      this.earnTimer = 0;
    }
  }

  earn(v: number) {
    this.credits += v;
    this.stats.earned += v;
  }

  // ── host callbacks ──
  isPumpValid(m: Machine) {
    const w = MACHINES[m.kind].w / 2;
    return this.terrain.isSea(m.x - w) && this.terrain.isSea(m.x + w);
  }
  vent(m: Machine, mass: number) { m.emitted += mass; }

  /** a seeder fires seeds straight up into the cloud passing over it */
  seedCloud(m: Machine, n: number) {
    const v = MACHINES[m.kind].vent!;
    const x = m.x, y = m.y + v.y;
    let best: Cloud | null = null, bd = Infinity;
    for (const c of this.clouds.clouds) {
      if (c.y > y) continue;
      const dx = Math.abs(c.x - x);
      if (dx > cloudRadius(c.mass) * 0.9 + 20 || y - c.y > 700) continue;
      if (dx < bd) { bd = dx; best = c; }
    }
    if (!best) return 0;
    best.seeds += n;
    this.stats.seedsShot += n;
    m.anim = 1;
    return n;
  }
  /** composters turn leaves from the living forest into fertiliser for the greenhouses */
  greenhouseMul() {
    const n = Math.min(4, this.machines.filter(q => q.kind === 'compost' && q.on).length);
    return 1 + n * (0.15 + 0.5 * this.forest.vitality);
  }

  private fireOutWarnings = 0;
  onFireOut(m: Machine) {
    if (this.mods.lvl('autoStoke') > 0 || this.fireOutWarnings >= 2) return;
    this.fireOutWarnings++;
    this.bus.emit({ type: 'toast', text: 'O fogo da caldeira apagou. Toque nela para reacender — ou compre Melhorias › Automação › Alimentação contínua.', kind: 'warn' });
    this.bus.emit({ type: 'float', x: m.x, y: m.y - 110, text: 'Fogo apagou!', color: '#ff9a6a' });
  }

  /** Why a boiler is (not) producing — shown above it and in its panel. */
  boilerStatus(m: Machine): 'off' | 'nowater' | 'nofire' | 'lowwater' | 'blocked' | 'heating' | 'ok' {
    if (m.kind !== 'boiler' && m.kind !== 'boiler_ind') return 'ok';
    if (!m.on) return 'off';
    if (m.water < 0.3 && m.rate < 0.05) return 'nowater';
    if (m.kind === 'boiler' && m.fire <= 0 && m.boost <= 0) return 'nofire';
    if (m.heat < 0.35) return 'heating';
    const max = this.mods.boilerRate(m.kind);
    if (m.steam >= this.mods.steamCap(m.kind) - 0.05) return 'blocked';
    if (m.water < 1 && m.rate < max * 0.85) return 'lowwater';
    return 'ok';
  }

  onRain(_c: Cloud, litres: number, x0: number, x1: number, seeds = 0) {
    const b = this.biome;
    const span = Math.max(1, x1 - x0);
    const [r0, r1] = this.regionRange();
    // the soil and the seeds
    const hit = this.forest.addRain(x0, x1, litres, seeds);
    const seedIn = seeds * (hit / Math.max(1e-9, litres));
    this.stats.seedsRained += seedIn;
    this.stats.seedsWasted += seeds - seedIn;
    this.stats.rainWasted += litres - hit;
    // only rain near the destination counts as a "miss" the Ancient notices
    if (x1 > r0 - 500 && x0 < r1 + 300) this.rainOut += litres - hit;
    // wet the ground under the rain (visual)
    const i0 = Math.max(0, Math.floor(x0 / 16)), i1 = Math.min(this.wet.length - 1, Math.floor(x1 / 16));
    const per = litres / Math.max(1, i1 - i0 + 1);
    for (let i = i0; i <= i1; i++) this.wet[i] = Math.min(1, this.wet[i] + per * 0.4);
    if (hit <= 0) return;
    this.climate.addRain(hit);
    // the risen Ancient drinks what falls on its body
    if (this.creature.awake) {
      const [t0, t1] = this.creature.zone();
      const onBody = litres * Math.max(0, Math.min(x1, t1) - Math.max(x0, t0)) / span;
      if (onBody > 0) {
        this.creature.feed(onBody, this.climate.humidity);
        if (this.creature.stage > this.uprootedStage) { this.uprootedStage = this.creature.stage; this.uproot(); }
        this.rainIn += onBody;
      }
    } else this.rainIn += hit;
    this.stats.rainTarget += hit;
    const credits = hit * b.creditPerL * this.creature.creditMul;
    this.earn(credits);
    this.earnAcc += credits;
    this.coinX = Math.max(r0 + 30, Math.min(r1 - 30, (x0 + x1) / 2));
    if (!this.firstRain) {
      this.firstRain = true;
      const bonus = 50 * (this.biomeIndex + 1);
      this.earn(bonus);
      this.bus.emit({ type: 'firstRain' });
      this.bus.emit({ type: 'sfx', name: 'firstDrops' });
      this.bus.emit({ type: 'toast', text: `Primeira chuva na terra seca! +${bonus} ₵`, kind: 'good' });
    }
  }
  onMerge(into: Cloud, absorbed: Cloud) {
    this.stats.merges++;
    this.bus.emit({ type: 'merge', x: absorbed.x, y: absorbed.y, r: cloudRadius(absorbed.mass) });
    if (absorbed.mass > 1.5) this.bus.emit({ type: 'sfx', name: 'merge', x: into.x, y: into.y });
  }
  onSplit(a: Cloud) {
    this.stats.splits++;
    this.bus.emit({ type: 'sfx', name: 'split', x: a.x, y: a.y });
  }
  onLost(mass: number) { this.stats.lost += mass; }

  // ───────────────────────── player commands ─────────────────────────
  fillBucket(): Result {
    if (this.bucket >= this.mods.bucketSize()) return { ok: false, reason: 'O balde já está cheio' };
    this.bucket = this.mods.bucketSize();
    this.bus.emit({ type: 'sfx', name: 'bucket' });
    return { ok: true };
  }

  pourBucket(m: Machine): Result {
    if (this.bucket <= 0) return { ok: false, reason: 'Balde vazio — toque no mar' };
    const cap = this.mods.waterCap(m.kind);
    if (!findPortByFluid(m, 'water', 'in') || cap <= 0) return { ok: false, reason: 'Esta máquina não recebe água' };
    const v = Math.min(this.bucket, cap - m.water);
    if (v <= 0.01) return { ok: false, reason: 'Já está cheia' };
    m.water += v;
    this.bucket -= v;
    this.stats.pumped += v;
    this.bus.emit({ type: 'sfx', name: 'pour', x: m.x, y: m.y });
    this.bus.emit({ type: 'float', x: m.x, y: m.y - MACHINES[m.kind].h - 10, text: `+${v.toFixed(0)} L`, color: '#7cc7ff' });
    return { ok: true };
  }

  stoke(m: Machine): Result {
    if (m.kind !== 'boiler') return { ok: false };
    m.fire = Math.min(this.mods.fireDuration() * 2, m.fire + this.mods.fireDuration());
    m.on = true;
    this.bus.emit({ type: 'sfx', name: 'stoke', x: m.x, y: m.y });
    return { ok: true };
  }

  /** the engineer throws a handful of seeds into a cloud */
  seedByHand(id: number): Result {
    const c = this.clouds.clouds.find(q => q.id === id);
    if (!c) return { ok: false };
    if (this.pouch < 1) return { ok: false, reason: 'Bolsa de sementes vazia — ela se enche sozinha aos poucos' };
    const n = Math.min(this.pouch, POUCH_GIVE);
    this.pouch -= n;
    c.seeds += n;
    c.pulse = 1;
    this.stats.seededByHand += n;
    this.bus.emit({ type: 'sfx', name: 'grab' });
    this.bus.emit({ type: 'float', x: c.x, y: c.y - cloudRadius(c.mass) - 10, text: `+${n} sementes`, color: '#e8d27a' });
    return { ok: true };
  }

  // ── cloud handling by touch ──
  grabCloud(id: number, x: number, y: number) {
    const c = this.clouds.grab(id, x, y);
    if (c) this.bus.emit({ type: 'sfx', name: 'grab' });
    return c;
  }
  dragCloud(x: number, y: number) { this.clouds.moveHold(x, y); }
  releaseCloud(vx: number, vy: number) {
    const c = this.clouds.release(vx, vy);
    if (c) {
      const sp = Math.hypot(c.vx, c.vy);
      if (sp > 120) { this.bus.emit({ type: 'sfx', name: 'whoosh' }); this.bus.emit({ type: 'throw', x: c.x, y: c.y, speed: sp }); }
    }
    return c;
  }
  setBoost(id: number) {
    const m = this.byId.get(id);
    if (!m || (m.kind !== 'boiler' && m.kind !== 'boiler_ind')) return;
    if (m.kind === 'boiler' && m.water <= 0.05) return;
    m.boost = 1;
  }

  canAfford(v: number) { return this.credits >= v - 1e-9; }

  isUnlocked(kind: MachineKind) {
    return STARTER.includes(kind) || TREE.some(n => n.unlock?.includes(kind) && (this.tree[n.id] ?? 0) > 0);
  }
  /** tree node that researches a machine */
  unlockNodeFor(kind: MachineKind) { return TREE.find(n => n.unlock?.includes(kind)); }

  // ── engineering tree ──
  nodeLevel(id: string) { return this.tree[id] ?? 0; }
  nodeMax(id: string) {
    const n = NODE[id];
    if (n.mod) return UPGRADES.find(u => u.id === n.mod)!.max;
    if (n.perm) return PERMANENT.find(p => p.id === n.perm)!.max;
    return 1;
  }
  nodeCurrency(id: string): 'credits' | 'patents' { return NODE[id].perm ? 'patents' : 'credits'; }
  nodeCost(id: string) {
    const n = NODE[id];
    if (n.mod) return this.upgradeCost(n.mod);
    if (n.perm) return n.cost ?? 1;
    return Math.round((n.cost ?? 0) * (1 + this.biomeIndex * 0.3));
  }
  nodeState(id: string): 'owned' | 'maxed' | 'available' | 'locked' {
    const lvl = this.nodeLevel(id);
    if (lvl >= this.nodeMax(id)) return 'maxed';
    if (!NODE[id].requires.every(r => this.nodeLevel(r) > 0)) return 'locked';
    return lvl > 0 ? 'owned' : 'available';
  }
  research(id: string): Result {
    const n = NODE[id];
    if (!n) return { ok: false };
    const st = this.nodeState(id);
    if (st === 'maxed') return { ok: false, reason: 'Nível máximo' };
    if (st === 'locked') return { ok: false, reason: 'Pesquise os nós anteriores primeiro' };
    const cost = this.nodeCost(id);
    if (n.perm) {
      if (this.patents < cost) return { ok: false, reason: 'Patentes insuficientes' };
      this.patents -= cost;
      this.mods.perm[n.perm]++;
    } else {
      if (!this.canAfford(cost)) return { ok: false, reason: 'Créditos insuficientes' };
      this.credits -= cost;
      if (n.mod) this.mods.levels[n.mod]++;
    }
    this.tree[id] = this.nodeLevel(id) + 1;
    this.wind.dirty = true;
    this.bus.emit({ type: 'sfx', name: 'upgrade' });
    return { ok: true };
  }

  build(kind: MachineKind, x: number, y: number, angle = 0, flip = false, power = 1): Result & { machine?: Machine } {
    const def = MACHINES[kind];
    if (!this.isUnlocked(kind)) return { ok: false, reason: 'Ainda bloqueado' };
    if (!this.canAfford(def.cost)) return { ok: false, reason: 'Créditos insuficientes' };
    const p = resolvePlacement(this.biome, this.terrain, this.machines, kind, x, y, -1, this.rootLimit());
    if (!p.ok) return { ok: false, reason: p.reason };
    this.credits -= def.cost;
    const m = this.addMachine(kind, p.x, p.y, def.rotatable ? angle : 0, flip, p.support);
    m.power = power;
    this.bus.emit({ type: 'sfx', name: 'build', x: m.x, y: m.y });
    return { ok: true, machine: m };
  }

  /** Machines standing on a platform. */
  private onTop(p: Machine) {
    const d = MACHINES.platform;
    const top = p.y - d.h;
    return this.machines.filter(m => m !== p && Math.abs(m.support - top) < 1 && m.x >= p.x - d.w / 2 - 4 && m.x <= p.x + d.w / 2 + 4);
  }

  move(id: number, x: number, y: number, angle: number, flip: boolean): Result {
    const m = this.byId.get(id);
    if (!m) return { ok: false };
    if (m.kind === 'platform' && this.onTop(m).length) return { ok: false, reason: 'Remova as máquinas sobre a plataforma primeiro' };
    const p = resolvePlacement(this.biome, this.terrain, this.machines, m.kind, x, y, id, this.rootLimit());
    if (!p.ok) return { ok: false, reason: p.reason };
    const moved = p.x !== m.x || p.y !== m.y || flip !== m.flip;
    m.x = p.x; m.y = p.y; m.support = p.support; m.flip = flip;
    if (MACHINES[m.kind].rotatable) m.angle = angle;
    if (moved) {
      for (const pipe of this.pipes.filter(q => q.from.m === id || q.to.m === id)) this.reroute(pipe);
    }
    this.wind.dirty = true;
    this.bus.emit({ type: 'sfx', name: 'build', x: m.x, y: m.y });
    return { ok: true };
  }

  private reroute(p: Pipe) {
    const a = this.byId.get(p.from.m)!, b = this.byId.get(p.to.m)!;
    p.path = routePipe(portWorld(a, findPort(a, p.from.port)!), portWorld(b, findPort(b, p.to.port)!));
    p.length = pathLength(p.path);
  }

  sell(id: number): Result {
    const m = this.byId.get(id);
    if (!m) return { ok: false };
    if (m.kind === 'platform' && this.onTop(m).length) return { ok: false, reason: 'Remova as máquinas sobre a plataforma primeiro' };
    const refund = Math.floor(MACHINES[m.kind].cost * 0.75);
    for (const p of this.pipes.filter(q => q.from.m === id || q.to.m === id)) this.removePipe(p.id);
    this.machines = this.machines.filter(q => q !== m);
    this.credits += refund;
    this.wind.dirty = true;
    this.rebuildIndex();
    this.bus.emit({ type: 'sfx', name: 'sell', x: m.x, y: m.y });
    return { ok: true };
  }

  /** Connect two ports (order-independent). */
  connect(a: PipeEnd, b: PipeEnd, free = false): Result {
    const ma = this.byId.get(a.m), mb = this.byId.get(b.m);
    if (!ma || !mb) return { ok: false };
    if (ma === mb) return { ok: false, reason: 'Conecte duas máquinas diferentes' };
    const pa = findPort(ma, a.port), pb = findPort(mb, b.port);
    if (!pa || !pb) return { ok: false };
    if (pa.fluid !== pb.fluid) return { ok: false, reason: pa.fluid === 'water' ? 'Água não entra em entrada de vapor' : 'Vapor não entra em entrada de água' };
    if (pa.dir === pb.dir) return { ok: false, reason: pa.dir === 'out' ? 'Ligue uma SAÍDA a uma ENTRADA' : 'Ligue uma SAÍDA a uma ENTRADA' };
    const [from, to, fm, tm, fp, tp] = pa.dir === 'out' ? [a, b, ma, mb, pa, pb] : [b, a, mb, ma, pb, pa];
    if (this.pipes.some(p => p.from.m === from.m && p.from.port === from.port && p.to.m === to.m && p.to.port === to.port)) return { ok: false, reason: 'Já conectado' };
    const path = routePipe(portWorld(fm, fp), portWorld(tm, tp));
    const length = pathLength(path);
    const cost = free ? 0 : pipeCost(length);
    if (!this.canAfford(cost)) return { ok: false, reason: 'Créditos insuficientes' };
    this.credits -= cost;
    this.pipes.push({ id: this.nextId++, fluid: pa.fluid, from: { ...from }, to: { ...to }, path, length, flow: 0, phase: 0 });
    this.rebuildIndex();
    if (!free) this.bus.emit({ type: 'sfx', name: 'pipe' });
    return { ok: true };
  }

  removePipe(id: number): Result {
    const p = this.pipes.find(q => q.id === id);
    if (!p) return { ok: false };
    this.pipes = this.pipes.filter(q => q !== p);
    this.credits += pipeCost(p.length);
    this.rebuildIndex();
    return { ok: true };
  }

  toggle(id: number) {
    const m = this.byId.get(id);
    if (!m) return;
    m.on = !m.on;
    this.wind.dirty = true;
    this.bus.emit({ type: 'sfx', name: 'click' });
  }
  setPower(id: number, p: number) {
    const m = this.byId.get(id);
    if (!m) return;
    m.power = Math.max(0, Math.min(1, p));
    this.wind.dirty = true;
  }
  setAngle(id: number, a: number) {
    const m = this.byId.get(id);
    if (!m || !MACHINES[m.kind].rotatable) return;
    m.angle = a;
    this.wind.dirty = true;
  }

  upgradeCost(id: ModKey) {
    const u = UPGRADES.find(x => x.id === id)!;
    return Math.round(u.baseCost * Math.pow(u.costMult, this.mods.lvl(id)) * (1 + this.biomeIndex * 0.6));
  }
  buyUpgrade(id: ModKey): Result {
    const u = UPGRADES.find(x => x.id === id)!;
    if (this.mods.lvl(id) >= u.max) return { ok: false, reason: 'Nível máximo' };
    const c = this.upgradeCost(id);
    if (!this.canAfford(c)) return { ok: false, reason: 'Créditos insuficientes' };
    this.credits -= c;
    this.mods.levels[id]++;
    const node = TREE.find(n => n.mod === id);
    if (node) this.tree[node.id] = this.mods.levels[id];
    this.wind.dirty = true;
    this.bus.emit({ type: 'sfx', name: 'upgrade' });
    return { ok: true };
  }
  buyPerm(id: PermKey): Result {
    const d = PERMANENT.find(p => p.id === id)!;
    if (this.mods.perm[id] >= d.max) return { ok: false, reason: 'Nível máximo' };
    if (this.patents < d.cost) return { ok: false, reason: 'Patentes insuficientes' };
    this.patents -= d.cost;
    this.mods.perm[id]++;
    this.wind.dirty = true;
    this.bus.emit({ type: 'sfx', name: 'upgrade' });
    return { ok: true };
  }

  completeLevel() {
    if (!this.climate.won) return;
    this.patents += this.biome.reward;
    this.levelsDone = Math.max(this.levelsDone, this.biomeIndex + 1);
    // after the last land the journey starts over (research and patents are kept)
    this.startLevel(this.biomeIndex + 1 < BIOMES.length ? this.biomeIndex + 1 : 0);
  }

  // ───────────────────────── queries ─────────────────────────
  machineAt(x: number, y: number, pad = 6): Machine | null {
    for (let i = this.machines.length - 1; i >= 0; i--) {
      const m = this.machines[i];
      const b = machineBox(m.kind, m.x, m.y);
      if (x >= b.x0 - pad && x <= b.x1 + pad && y >= b.y0 - pad && y <= b.y1 + pad) return m;
    }
    return null;
  }

  cloudAt(x: number, y: number): Cloud | null {
    let best: Cloud | null = null, bd = Infinity;
    for (const c of this.clouds.clouds) {
      const r = cloudRadius(c.mass);
      const d = Math.hypot(c.x - x, (c.y - y) * 1.4);
      if (d < r && d < bd) { best = c; bd = d; }
    }
    return best;
  }

  pipesOf(id: number) { return this.pipes.filter(p => p.from.m === id || p.to.m === id); }

  // ───────────────────────── persistence ─────────────────────────
  serialize() {
    return {
      v: SAVE_VERSION,
      biomeIndex: this.biomeIndex, time: this.time, credits: this.credits, patents: this.patents, levelsDone: this.levelsDone,
      levels: this.mods.levels, perm: this.mods.perm, bucket: this.bucket, firstRain: this.firstRain, tree: this.tree,
      humidity: this.climate.humidity, stable: this.climate.stableTime, won: this.climate.won, milestone: this.climate.milestone,
      nextId: this.nextId, cloudNext: this.clouds.nextId, stats: this.stats, missionIdx: this.missionIdx,
      creature: { stage: this.creature.stage, growth: this.creature.growth, awake: this.creature.awake },
      uprooted: this.uprootedStage,
      forest: this.forest.serialize() as ForestSave,
      pouch: this.pouch, motherAt: this.motherAt, veilAt: this.veilAt, veilLeft: this.veilLeft, whisperIdx: this.whisperIdx,
      firstTier: this.firstTier,
      machines: this.machines, pipes: this.pipes, clouds: this.clouds.clouds,
    };
  }

  static deserialize(data: ReturnType<Sim['serialize']>): Sim {
    if (!data || data.v !== SAVE_VERSION) throw new Error('save version mismatch');
    const s = new Sim(0);
    Object.assign(s.mods.perm, data.perm);
    if (data.tree) s.tree = { ...data.tree };
    s.startLevel(data.biomeIndex);
    if (data.tree) s.tree = { ...data.tree };
    Object.assign(s.mods.levels, data.levels);
    s.time = data.time; s.credits = data.credits; s.patents = data.patents; s.levelsDone = data.levelsDone;
    s.bucket = data.bucket; s.firstRain = data.firstRain;
    s.climate.humidity = data.humidity; s.climate.stableTime = data.stable; s.climate.won = data.won; s.climate.milestone = data.milestone;
    s.nextId = data.nextId; s.clouds.nextId = data.cloudNext;
    s.stats = { ...s.stats, ...data.stats };
    s.machines = data.machines.map(m => ({ ...m, seeds: m.seeds ?? 0, boost: 0 }));
    s.forest.restore(data.forest);
    s.pouch = data.pouch ?? POUCH_MAX;
    s.motherAt = data.motherAt ?? s.motherAt; s.veilAt = data.veilAt ?? s.veilAt; s.veilLeft = data.veilLeft ?? 0;
    s.whisperIdx = data.whisperIdx ?? 0;
    if (data.firstTier) s.firstTier = [...data.firstTier];
    s.missionIdx = data.missionIdx ?? 0;
    if (data.creature) { Object.assign(s.creature, data.creature); s.lastStage = data.creature.stage; s.uprootedStage = data.uprooted ?? data.creature.stage; }
    s.pipes = data.pipes.map(p => ({ ...p, path: p.path.map(v => ({ ...v })) }));
    s.clouds.clouds = data.clouds.map(c => ({ ...c, seeds: c.seeds ?? 0, held: false }));
    s.last = { pumped: s.stats.pumped, steam: s.stats.steam, rain: s.stats.rainTarget, earned: s.stats.earned };
    s.wind.dirty = true;
    s.rebuildIndex();
    return s;
  }
}

const FRESH_STATS = {
  pumped: 0, steam: 0, formed: 0, rainTarget: 0, rainWasted: 0, earned: 0, lost: 0, merges: 0, splits: 0,
  seedsMade: 0, seedsShot: 0, seededByHand: 0, seedsRained: 0, seedsWasted: 0, life: 0, transpired: 0,
};

function findPortByFluid(m: Machine, fluid: 'water' | 'steam', dir: 'in' | 'out') {
  return MACHINES[m.kind].ports.find(p => p.fluid === fluid && p.dir === dir);
}

export type SaveData = ReturnType<Sim['serialize']>;
