// Water & steam: machine production and volume/flow-based pipe transport with pressure head.
import { MACHINES, type Fluid } from '../data/machines';
import { findPort, portWorld } from './build';
import { Mods } from './stats';
import type { Machine, Pipe } from './types';

export interface FluidHost {
  mods: Mods;
  machines: Machine[];
  pipes: Pipe[];
  byId: Map<number, Machine>;
  isPumpValid(m: Machine): boolean;
  onFireOut?(m: Machine): void;
  vent(m: Machine, cloudMass: number): void;
  /** seeder: shoot seeds into a cloud right above; returns how many were taken */
  seedCloud(m: Machine, seeds: number): number;
  /** greenhouse production multiplier (compost) */
  greenhouseMul(): number;
  stats: { pumped: number; steam: number; seedsMade: number };
}

const buf = (m: Machine, f: Fluid) => (f === 'water' ? m.water : f === 'steam' ? m.steam : m.seeds);
const add = (m: Machine, f: Fluid, v: number) => { if (f === 'water') m.water += v; else if (f === 'steam') m.steam += v; else m.seeds += v; };

/** Fluid a machine pushes out through its 'out' ports. */
const outFluid = (m: Machine): Fluid | null => {
  const p = MACHINES[m.kind].ports.find(p => p.dir === 'out');
  return p ? p.fluid : null;
};

export function stepMachines(h: FluidHost, dt: number, pipesOut: Map<number, Pipe[]>) {
  const { mods } = h;
  for (const m of h.machines) {
    m.anim += dt;
    let made = 0;
    switch (m.kind) {
      case 'pump':
      case 'pump_hp': {
        if (!m.on || !h.isPumpValid(m)) break;
        const cap = mods.waterCap(m.kind);
        made = Math.min(mods.pumpRate(m.kind) * dt, cap - m.water);
        if (made > 0) { m.water += made; h.stats.pumped += made; }
        break;
      }
      case 'boiler':
      case 'boiler_ind': {
        const ind = m.kind === 'boiler_ind';
        if (!ind) {
          if (m.fire <= 0.5 && mods.lvl('autoStoke') > 0 && m.water > 0.5 && m.on) m.fire = mods.fireDuration();
          // the fire only burns fuel while there is water to boil
          if (m.fire > 0 && m.water > 0.05) {
            m.fire = Math.max(0, m.fire - dt);
            if (m.fire === 0) h.onFireOut?.(m);
          }
        }
        // bellows: the player holding the boiler fans the flames
        if (m.boost > 0 && !ind) m.fire = Math.max(m.fire, 2);
        const burning = m.on && (ind || m.fire > 0);
        const hr = mods.heatRate(m.kind);
        m.heat = burning ? Math.min(1, m.heat + hr * dt * (1 + 3 * m.boost)) : Math.max(0, m.heat - dt / 8);
        if (m.heat > 0.3 && m.water > 0) {
          const scap = mods.steamCap(m.kind) * (1 + m.boost);
          made = Math.min(m.water, mods.boilerRate(m.kind) * (1 + 1.5 * m.boost) * ((m.heat - 0.3) / 0.7) * dt, Math.max(0, scap - m.steam));
          m.water -= made;
          m.steam += made;
          h.stats.steam += made;
        }
        m.boost = Math.max(0, m.boost - dt * 3);
        // No steam pipe connected → vent the steam into open air (inefficient condensation).
        if (!(pipesOut.get(m.id)?.length) && m.steam > 0) {
          h.vent(m, m.steam * mods.ventEff());
          m.steam = 0;
        }
        break;
      }
      case 'condenser': {
        if (!m.on) break;
        made = Math.min(m.steam, mods.condenserRate() * dt);
        if (made > 0) {
          m.steam -= made;
          h.vent(m, made * mods.condenserEff());
        }
        break;
      }
      case 'greenhouse': {
        // warm steam + water → seeds; production stops when the seed store is full
        if (!m.on) break;
        const room = mods.seedCap(m.kind) - m.seeds;
        const n = Math.min(
          mods.seedRate() * h.greenhouseMul() * dt, room,
          m.steam / Mods.STEAM_PER_SEED, m.water / Mods.WATER_PER_SEED,
        );
        if (n > 0) {
          m.steam -= n * Mods.STEAM_PER_SEED;
          m.water -= n * Mods.WATER_PER_SEED;
          m.seeds += n;
          h.stats.seedsMade += n;
          made = n;
        }
        break;
      }
      case 'seeder': {
        if (!m.on || m.seeds < 0.01) break;
        made = h.seedCloud(m, Math.min(m.seeds, mods.seederRate() * dt));
        m.seeds -= made;
        break;
      }
      default:
        break;
    }
    m.rate += (made / dt - m.rate) * Math.min(1, dt * 2);
  }
}

/** Head factor: full flow until the climb approaches the source's pressure head. */
export function headFactor(head: number, rise: number) {
  if (rise <= 0) return 1;
  return Math.max(0, Math.min(1, (head - rise) / (head * 0.25)));
}

export function stepPipes(h: FluidHost, dt: number, pipesOut: Map<number, Pipe[]>) {
  const { mods, byId } = h;
  const smart = mods.lvl('smartValves') > 0;
  for (const [srcId, pipes] of pipesOut) {
    const src = byId.get(srcId);
    if (!src) continue;
    const fluid = outFluid(src);
    if (!fluid) continue;
    if (src.kind === 'valve' && !src.on) { for (const p of pipes) p.flow *= 0.9; continue; }
    const avail = buf(src, fluid);
    const head = mods.head(src.kind);
    const pc = mods.pipeCap(fluid) * dt;
    let total = 0;
    const demand: number[] = [];
    for (const p of pipes) {
      const dst = byId.get(p.to.m);
      const sp = findPort(src, p.from.port), dp = dst && findPort(dst, p.to.port);
      if (!dst || !sp || !dp) { demand.push(0); continue; }
      const a = portWorld(src, sp), b = portWorld(dst, dp);
      // highest point along the pipe determines the climb
      let top = b.y;
      for (const pt of p.path) top = Math.min(top, pt.y);
      const rise = a.y - top;
      const space = Math.max(0, mods.cap(dst.kind, fluid) - buf(dst, fluid));
      let dmd = Math.min(pc * headFactor(head, rise), space);
      // smart valves prioritise emptier machines downstream
      if (smart && src.kind === 'valve') dmd = Math.min(space, dmd * (0.5 + space / Math.max(1, mods.cap(dst.kind, fluid))));
      demand.push(dmd);
      total += dmd;
    }
    const give = Math.min(avail, total);
    for (let i = 0; i < pipes.length; i++) {
      const p = pipes[i];
      const v = total > 0 ? (demand[i] * give) / total : 0;
      if (v > 0) {
        add(src, fluid, -v);
        add(byId.get(p.to.m)!, fluid, v);
      }
      p.flow += (v / dt - p.flow) * Math.min(1, dt * 3);
      p.phase += p.flow * dt * 6;
    }
  }
}
