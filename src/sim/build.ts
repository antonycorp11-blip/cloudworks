// Free construction: placement resolution (snapping to supports), validity rules, ports and pipe routing.
import { MACHINES, type MachineKind, type PortDef } from '../data/machines';
import type { BiomeDef } from '../data/biomes';
import type { Terrain } from './terrain';
import type { Machine } from './types';
import type { Vec } from './util';

export interface Box { x0: number; y0: number; x1: number; y1: number }

export function machineBox(kind: MachineKind, x: number, y: number): Box {
  const d = MACHINES[kind];
  if (d.placement === 'mast') return { x0: x - d.w / 2, y0: y - d.h / 2, x1: x + d.w / 2, y1: y + d.h / 2 };
  return { x0: x - d.w / 2, y0: y - d.h, x1: x + d.w / 2, y1: y };
}

export function portWorld(m: Pick<Machine, 'x' | 'y' | 'flip'>, p: PortDef): Vec {
  return { x: m.x + (m.flip ? -p.x : p.x), y: m.y + p.y };
}

export function findPort(m: Machine, id: string) {
  return MACHINES[m.kind].ports.find(p => p.id === id);
}

const overlap = (a: Box, b: Box, tol = 1) =>
  a.x0 < b.x1 - tol && a.x1 > b.x0 + tol && a.y0 < b.y1 - tol && a.y1 > b.y0 + tol;

export interface Placement {
  x: number;
  y: number;
  support: number;
  ok: boolean;
  reason?: string;
}

const GRID = 5;
const snap = (v: number) => Math.round(v / GRID) * GRID;
export const MAX_HEIGHT = 720;

/**
 * Turn a desired position (finger) into a physically valid one: machines rest on the
 * ground or on platforms below the finger, pumps sit on the sea, fans get a mast.
 */
export function resolvePlacement(
  biome: BiomeDef, terrain: Terrain, machines: Machine[],
  kind: MachineKind, wantX: number, wantY: number, ignoreId = -1, blockedFrom = Infinity,
): Placement {
  const d = MACHINES[kind];
  const x = snap(wantX);
  const half = d.w / 2;
  const x0 = x - half, x1 = x + half;
  const ground = terrain.maxGroundUnder(x0, x1);
  const platforms = machines.filter(m => m.kind === 'platform' && m.id !== ignoreId);
  let y = snap(wantY);
  let support = ground;
  let reason: string | undefined;

  // support surface: closest platform top at/below the finger, else ground
  const surfaceBelow = (fingerY: number, needFull: boolean) => {
    let best = ground;
    for (const p of platforms) {
      const pd = MACHINES.platform;
      const px0 = p.x - pd.w / 2, px1 = p.x + pd.w / 2;
      const top = p.y - pd.h;
      const fits = needFull ? x0 >= px0 - 4 && x1 <= px1 + 4 : x >= px0 && x <= px1;
      if (fits && top >= fingerY - 30 && top < best) best = top;
    }
    return best;
  };

  switch (d.placement) {
    case 'water':
      y = terrain.seaLevel + 12;
      support = y;
      if (!terrain.isSea(x0) || !terrain.isSea(x1)) reason = 'A bomba precisa ficar sobre o mar';
      break;
    case 'ground': {
      support = surfaceBelow(wantY, true);
      y = support;
      if (support === ground) {
        if (terrain.isSea(x0) || terrain.isSea(x1) || (x0 < terrain.sea.x1 && x1 > terrain.sea.x0)) reason = 'Não dá para construir dentro do mar';
        let lo = Infinity;
        for (let sx = x0; sx <= x1; sx += 4) lo = Math.min(lo, terrain.groundY(sx));
        let hi = -Infinity;
        for (let sx = x0; sx <= x1; sx += 4) hi = Math.max(hi, terrain.groundY(sx));
        if (hi - lo > 26 && !reason) reason = 'Terreno muito inclinado — use uma plataforma';
      }
      break;
    }
    case 'mast': {
      support = surfaceBelow(wantY + d.h / 2, false);
      if (support === ground) support = terrain.groundY(x);
      y = Math.min(y, support - d.h / 2 - 4);
      y = Math.max(y, support - MAX_HEIGHT);
      break;
    }
    case 'free': {
      const g = terrain.groundY(x);
      support = g;
      y = Math.min(y, g);
      y = Math.max(y, g - MAX_HEIGHT);
      if (x0 < terrain.sea.x1 && x1 > terrain.sea.x0 && y > terrain.seaLevel - 20) reason = 'Muito perto da água';
      break;
    }
  }

  if (!reason) {
    if (x0 < 0 || x1 > biome.width) reason = 'Fora do mapa';
    else if (x1 > blockedFrom) reason = 'As raízes da Criatura tomaram este solo';
    else if (x1 > biome.targetStart - 60) reason = 'Não é permitido construir na região-alvo';
    else if (x1 > biome.factoryEnd && !d.regionB) reason = 'Só pode ser construído na área da fábrica';
  }
  if (!reason) {
    const box = machineBox(kind, x, y);
    for (const m of machines) {
      if (m.id === ignoreId) continue;
      if (overlap(box, machineBox(m.kind, m.x, m.y))) { reason = 'Sobreposto a outra máquina'; break; }
    }
  }
  return { x, y, support, ok: !reason, reason };
}

/** Orthogonal plumbing route between two ports. */
export function routePipe(a: Vec, b: Vec): Vec[] {
  if (Math.abs(a.x - b.x) < 3 || Math.abs(a.y - b.y) < 3) return [{ ...a }, { ...b }];
  const mx = Math.round((a.x + b.x) / 2);
  return [{ ...a }, { x: mx, y: a.y }, { x: mx, y: b.y }, { ...b }];
}

export function pathLength(p: Vec[]) {
  let l = 0;
  for (let i = 1; i < p.length; i++) l += Math.abs(p[i].x - p[i - 1].x) + Math.abs(p[i].y - p[i - 1].y);
  return l;
}

export const pipeCost = (len: number) => Math.max(1, Math.ceil(len / 40));

export function distToPath(p: Vec[], x: number, y: number) {
  let best = Infinity;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1], b = p[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2));
    const px = a.x + dx * t, py = a.y + dy * t;
    best = Math.min(best, Math.hypot(x - px, y - py));
  }
  return best;
}
