// The Ancient: it sleeps inside the Semente-Mãe until the forest around it is alive, then rises
// from that forest (stage 1). From then on rain on its body feeds it; it grows in stages, thirstier each stage.
import { CREATURES, LINES, MOOD_MUL, type CreatureDef, type LineKind, type Mood } from '../data/creatures';
import type { EventBus } from './events';

/** body scale per stage (stage 0 = sleeping hatchling … final form) */
export const SCALE = [1.2, 1.75, 2.4, 3.1, 3.9, 5.0];

export class Creature {
  def: CreatureDef;
  stage = 0;
  growth = 0;        // effective litres eaten
  awake = false;
  mood: Mood = 'sleeping';
  fed = 0;           // EMA of litres per second received (for animation / reactions)
  missed = 0;        // EMA of litres per second that fell outside
  private speakCd = 6;
  private used = new Map<LineKind, number>();

  /** x of the Ancient's back end; it grows leftwards, towards the factory */
  constructor(biomeIndex: number, private bus: EventBus, public anchor: number) {
    this.def = CREATURES[Math.min(biomeIndex, CREATURES.length - 1)];
  }

  /** current body scale (grows a little within a stage, jumps at each stage) */
  get scale() {
    const a = SCALE[Math.min(this.stage, SCALE.length - 1)], b = SCALE[Math.min(this.stage + 1, SCALE.length - 1)];
    return a + (b - a) * Math.min(1, Math.max(0, this.progress)) * 0.3;
  }

  /** world geometry of the body for a given scale */
  geometry(scale = this.scale) {
    const rx = 90 * scale;
    const cx = this.anchor - rx;
    return { cx, rx, ry: 66 * scale, headX: cx - 150 * scale, headTop: 74 * scale, rootX: cx - 175 * scale, scale };
  }
  /** where the roots will reach after the next stage */
  nextRootX() { return this.geometry(SCALE[Math.min(this.stage + 1, SCALE.length - 1)]).rootX; }

  /** top surface of the body at x (world y), or null if not over the creature */
  topAt(x: number, groundY: number): number | null {
    const g = this.geometry();
    const d = (x - g.cx) / g.rx;
    if (Math.abs(d) < 1) return groundY - g.ry * Math.sqrt(1 - d * d);
    if (x >= g.headX && x < g.cx - g.rx * 0.6) return groundY - g.headTop * 0.85;
    return null;
  }

  /** rain falling on this span feeds the Ancient */
  zone(): [number, number] {
    const g = this.geometry();
    return [g.headX - 70, this.anchor + 40];
  }

  get maxStage() { return this.def.needs.length; }
  get done() { return this.stage >= this.maxStage; }
  /** progress 0..1 towards the next stage */
  get progress() {
    if (this.done) return 1;
    const prev = this.stage ? this.def.needs[this.stage - 1] : 0;
    return (this.growth - prev) / (this.def.needs[this.stage] - prev);
  }
  /** thirst multiplier on humidity loss: bigger Ancients dry out faster */
  /** tech-tree perks (set by the sim every step) */
  perks = { growth: 1, credit: 0, thirst: 1, forest: 1, lockFinal: false };
  get thirst() { return (1 + 0.6 * this.stage) * this.perks.thirst; }
  get creditMul() { return MOOD_MUL[this.mood] + (this.mood === 'content' || this.mood === 'euphoric' ? this.perks.credit : 0); }

  /** The forest stands up: the Ancient is born at stage 1. */
  rise(line: string) {
    if (this.awake) return;
    this.awake = true;
    this.stage = Math.max(1, this.stage);
    this.growth = Math.max(this.growth, this.def.needs[0] ?? 0);
    this.mood = 'thirsty';
    this.speakText(line, 'wake');
  }

  /** Rain landing on the Ancient. Growth only counts fully when it isn't starving and its forest is alive. */
  feed(litres: number, humidity: number) {
    if (!this.awake) return;
    const eff = Math.max(0.25, Math.min(1.2, (humidity - 12) / 30));
    this.growth += litres * eff * this.perks.growth * this.perks.forest;
    // the final form needs a forest worthy of it: until then growth stops just short of it
    const last = this.maxStage - 1;
    if (this.perks.lockFinal && this.stage === last) this.growth = Math.min(this.growth, this.def.needs[last] - 0.01);
    while (!this.done && this.growth >= this.def.needs[this.stage]) {
      if (this.perks.lockFinal && this.stage === last) { this.growth = this.def.needs[last] - 0.01; break; }
      this.stage++;
      this.bus.emit({ type: 'stageUp', stage: this.stage, final: this.done });
      this.bus.emit({ type: 'sfx', name: 'roar' });
      this.say(this.done ? 'final' : 'stage', true);
    }
  }

  step(dt: number, humidity: number, targets: { target: number; base: number }, rainedIn: number, rainedOut: number) {
    const k = Math.min(1, dt * 1.2);
    this.fed += (rainedIn / dt - this.fed) * k;
    this.missed += (rainedOut / dt - this.missed) * k;
    const f = (humidity - targets.base) / (targets.target - targets.base);
    const prev = this.mood;
    this.mood = !this.awake ? 'sleeping'
      : f < 0.1 ? 'starving'
      : f < 0.45 ? 'thirsty'
      : f < 0.9 ? 'content' : 'euphoric';
    this.speakCd -= dt;
    if (!this.awake) return; // still a seed: the sim voices its whispers
    if (this.mood !== prev && prev !== 'sleeping') this.say(this.mood);
    else if (this.missed > 0.6 && this.fed < 0.2) this.say('missed');
    else if (this.speakCd < -16) this.say(this.fed < 0.02 ? 'idle' : this.mood);
  }

  /** react to something the renderer/controller saw */
  react(kind: 'lightning' | 'storm') { if (this.awake) this.say(kind); }

  say(kind: LineKind, force = false) {
    if (!force && this.speakCd > 0) return;
    const arr = LINES[kind];
    const i = (this.used.get(kind) ?? Math.floor(Math.random() * arr.length)) % arr.length;
    this.used.set(kind, i + 1);
    this.speakText(arr[i], kind);
  }

  speakText(text: string, kind: string, who?: string) {
    this.speakCd = 9;
    this.bus.emit({ type: 'speak', text, mood: this.mood, kind, who });
    this.bus.emit({ type: 'sfx', name: 'grumble' });
  }
}
