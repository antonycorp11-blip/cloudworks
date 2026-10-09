import type { Fluid, MachineKind } from '../data/machines';
import type { Vec } from './util';

export interface Machine {
  id: number;
  kind: MachineKind;
  /** bottom-center for ground/water/free machines; head center for mast machines */
  x: number;
  y: number;
  angle: number;   // radians (wind machines)
  flip: boolean;   // mirrored (ports swap sides)
  on: boolean;
  power: number;   // 0..1 intensity (wind machines)
  water: number;
  steam: number;
  heat: number;    // 0..1 boiler temperature
  fire: number;    // seconds of fire left (rudimentary boiler)
  emitted: number; // vapor waiting to condense into a cloud
  rate: number;    // EMA throughput (L/s) for display
  boost: number;   // 0..1 bellows (player holding the boiler)
  support: number; // y of the surface it rests on (for masts / legs)
  anim: number;
}

export interface PipeEnd { m: number; port: string }

export interface Pipe {
  id: number;
  fluid: Fluid;
  from: PipeEnd; // an 'out' port
  to: PipeEnd;   // an 'in' port
  path: Vec[];
  length: number;
  flow: number;  // EMA L/s
  phase: number; // animation offset
}

export interface Cloud {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;   // litres of water held
  temp: number;   // °C
  raining: boolean;
  rainRate: number; // L/s (last step)
  seed: number;
  age: number;
  splitCd: number;
  pulse: number;  // visual wobble after merge/split
  held?: boolean; // grabbed by the player's finger
}

export const cloudRadius = (mass: number) => 12 + 15 * Math.sqrt(Math.max(0, mass));
