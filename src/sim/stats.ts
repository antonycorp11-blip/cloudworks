// Machine parameters derived from base data + current upgrades. Single source of truth
// for every rate the simulation uses, so upgrades always change real behaviour.
import { MACHINES, WIND_STATS, type Fluid, type MachineKind } from '../data/machines';
import { UPGRADES, type ModKey, type PermKey } from '../data/upgrades';

export class Mods {
  levels: Record<ModKey, number> = Object.fromEntries(UPGRADES.map(u => [u.id, 0])) as Record<ModKey, number>;
  perm: Record<PermKey, number> = { startCredits: 0, starterPump: 0, globalEff: 0, industrialStart: 0, windMastery: 0 };

  lvl(k: ModKey) { return this.levels[k] ?? 0; }
  /** fractional bonus: level * per */
  m(k: ModKey) {
    const def = UPGRADES.find(u => u.id === k)!;
    return this.lvl(k) * def.per;
  }
  get global() { return 1 + 0.1 * this.perm.globalEff; }

  bucketSize() { return 5 + 4 * this.lvl('bucket'); }

  waterCap(kind: MachineKind) {
    const s = 1 + this.m('storage');
    switch (kind) {
      case 'pump': return 4;
      case 'pump_hp': return 12;
      case 'reservoir': return 200 * s;
      case 'valve': case 'splitter': return 3;
      case 'boiler': return 20 * (1 + this.m('boilerCap'));
      case 'boiler_ind': return 80 * (1 + this.m('boilerCap'));
      default: return 0;
    }
  }
  steamCap(kind: MachineKind) {
    switch (kind) {
      case 'boiler': return 6;
      case 'boiler_ind': return 16;
      case 'condenser': return 14 * (1 + this.m('storage'));
      default: return 0;
    }
  }
  cap(kind: MachineKind, fluid: Fluid) { return fluid === 'water' ? this.waterCap(kind) : this.steamCap(kind); }

  pumpRate(kind: MachineKind) { return (kind === 'pump_hp' ? 7 : 2) * (1 + this.m('pumpRate')); }

  /** Pressure head (world units of rise a source can push fluid up). */
  head(kind: MachineKind) {
    const h = 1 + this.m('pumpHead');
    switch (kind) {
      case 'pump': return 260 * h;
      case 'pump_hp': return 650 * h;
      case 'reservoir': return 60 * h;
      case 'valve': case 'splitter': return 200 * h;
      case 'boiler': case 'boiler_ind': return 600;
      default: return 0;
    }
  }

  pipeCap(fluid: Fluid) { return (fluid === 'water' ? 4 : 8) * (1 + this.m('pipeCap')); }

  boilerRate(kind: MachineKind) { return (kind === 'boiler_ind' ? 3.2 : 1) * (1 + this.m('boilerRate')) * this.global; }
  /** heating speed per second (fraction of full temperature) */
  heatRate(kind: MachineKind) { return (kind === 'boiler_ind' ? 1 / 6 : 1 / 3) * (1 + this.m('heatSpeed')); }
  fireDuration() { return 60 * (1 + this.m('heatSpeed')); }

  /** fraction of vapor that becomes cloud mass when vented into open air */
  ventEff() { return Math.min(0.75, 0.5 * (1 + this.m('formation'))); }
  condenserEff() { return Math.min(0.98, 0.82 + this.m('condenseEff')); }
  condenserRate() { return 6 * (1 + this.m('boilerRate') * 0.6) * this.global; }

  absorbMul() { return 1 + this.m('absorb'); }
  fusionMul() { return 1 + this.m('fusion'); }
  precipMul() { return 1 + this.m('precip'); }
  aeroMul() { return 1 + this.m('aero'); }
  evapMul() { return (1 - 0.15 * this.perm.windMastery) / (1 + this.m('aero') * 0.5); }

  wind(kind: MachineKind) {
    const w = WIND_STATS[kind];
    if (!w) return null;
    return {
      power: w.power * (1 + this.m('fanPower')) * this.global,
      range: w.range * (1 + this.m('fanRange')),
      spread: w.spread,
    };
  }
}

export const isWindMachine = (k: MachineKind) => MACHINES[k].placement === 'mast';
