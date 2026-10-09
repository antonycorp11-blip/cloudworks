// Procedural pixel-ish machine art, drawn in world units (context already transformed).
import { MACHINES, type Fluid, type MachineKind } from '../data/machines';
import type { Machine } from '../sim/types';

export const C = {
  ink: '#1d1f27', dark: '#3a3f4b', metal: '#646c7a', light: '#9aa4b2', shine: '#d5dde6',
  copper: '#b8733a', copperL: '#dc9a5c', brass: '#c9a24a', brassL: '#e8c76a', rust: '#7d4128',
  wood: '#8b5a2b', woodD: '#5e3a1a', brick: '#9b4a35', brickD: '#6e3122',
  fire: '#ff8a2a', fireL: '#ffd35a', water: '#3f8fd0', waterL: '#7cc7ff', steam: '#e8eef2',
  green: '#59c46a', red: '#e0524a', blue: '#5ab0ff', orange: '#e58a2e', teal: '#3fb6a8',
  seed: '#c8e06a', leaf: '#4f9a3c', leafL: '#7cc84e', glass: '#9fd4c8',
};

type Ctx = CanvasRenderingContext2D;

const R = (c: Ctx, col: string, x: number, y: number, w: number, h: number) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
const circ = (c: Ctx, col: string, x: number, y: number, r: number) => { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); };

function wheel(c: Ctx, x: number, y: number, r: number, a: number, col: string) {
  circ(c, C.ink, x, y, r + 1);
  circ(c, col, x, y, r);
  circ(c, C.dark, x, y, r * 0.55);
  c.strokeStyle = C.ink;
  c.lineWidth = Math.max(1, r * 0.22);
  c.beginPath();
  for (let i = 0; i < 4; i++) {
    const t = a + (i * Math.PI) / 2;
    c.moveTo(x, y);
    c.lineTo(x + Math.cos(t) * r, y + Math.sin(t) * r);
  }
  c.stroke();
  circ(c, C.light, x, y, r * 0.2);
}

function gauge(c: Ctx, x: number, y: number, r: number, v: number) {
  circ(c, C.ink, x, y, r + 1);
  circ(c, '#f4efe1', x, y, r);
  const a = Math.PI * 0.8 + v * Math.PI * 1.4;
  c.strokeStyle = C.red;
  c.lineWidth = Math.max(0.8, r * 0.25);
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8);
  c.stroke();
}

function tankLevel(c: Ctx, x: number, y: number, w: number, h: number, frac: number) {
  R(c, C.ink, x - 1, y - 1, w + 2, h + 2);
  R(c, '#20384f', x, y, w, h);
  const fh = Math.round(h * Math.max(0, Math.min(1, frac)));
  R(c, C.water, x, y + h - fh, w, fh);
  if (fh > 1) R(c, C.waterL, x, y + h - fh, w, 1);
}

export interface DrawOpts { t: number; waterFrac: number; steamFrac: number; active: boolean; ghost?: boolean; seedFrac?: number }

export function drawMachine(c: Ctx, m: Machine, o: DrawOpts, groundAt?: (x: number) => number) {
  const d = MACHINES[m.kind];
  const t = o.t;
  c.save();
  c.translate(m.x, m.y);
  if (d.placement === 'mast') {
    drawMast(c, m, groundAt);
    c.rotate(m.angle);
    drawWind(c, m.kind, t * (m.on ? 14 * (0.3 + m.power) : 0));
    c.restore();
    return;
  }
  if (m.flip) c.scale(-1, 1);
  switch (m.kind) {
    case 'pump': case 'pump_hp': drawPump(c, m.kind === 'pump_hp', m.on && o.active ? t : 0, o); break;
    case 'reservoir': drawReservoir(c, o); break;
    case 'valve': drawValve(c, m.on); break;
    case 'splitter': drawSplitter(c); break;
    case 'boiler': drawBoiler(c, m, o); break;
    case 'boiler_ind': drawBoilerInd(c, m, o); break;
    case 'condenser': drawCondenser(c, m, o); break;
    case 'divider': drawDivider(c, m, o); break;
    case 'platform': drawPlatform(c, m, groundAt); break;
    case 'greenhouse': drawGreenhouse(c, m, o); break;
    case 'seeder': drawSeeder(c, m, o); break;
    case 'compost': drawCompost(c, m, o); break;
  }
  c.restore();
}

function drawPump(c: Ctx, hp: boolean, t: number, o: DrawOpts) {
  const s = hp ? 1.3 : 1;
  c.save();
  c.scale(s, s);
  // pontoon in water
  R(c, C.ink, -19, -14, 38, 12);
  R(c, C.woodD, -18, -13, 36, 10);
  R(c, C.wood, -18, -13, 36, 3);
  // body
  R(c, C.ink, -13, -34, 26, 22);
  R(c, hp ? C.orange : C.brass, -12, -33, 24, 20);
  R(c, hp ? '#f3b062' : C.brassL, -12, -33, 24, 3);
  // piston
  const bob = Math.sin(t * 6) * 4;
  R(c, C.ink, -3, -44 + bob, 6, 12);
  R(c, C.light, -2, -43 + bob, 4, 10);
  R(c, C.dark, -10, -46 + bob, 20, 4);
  // flywheel
  wheel(c, -6, -22, 6, t * 5, C.metal);
  // outlet
  R(c, C.ink, 10, -33, 14, 7);
  R(c, C.water, 11, -32, 12, 5);
  // level indicator lamp
  circ(c, o.active ? C.green : C.red, 7, -28, 2);
  c.restore();
}

function drawReservoir(c: Ctx, o: DrawOpts) {
  // legs
  for (const lx of [-28, -10, 8, 24]) R(c, C.woodD, lx, -22, 5, 22);
  R(c, C.wood, -32, -16, 64, 3);
  // tank
  R(c, C.ink, -33, -80, 66, 60);
  R(c, C.metal, -32, -79, 64, 58);
  R(c, C.light, -32, -79, 64, 3);
  for (const by of [-66, -50, -34]) R(c, C.dark, -32, by, 64, 2);
  tankLevel(c, -8, -74, 16, 48, o.waterFrac);
  // roof
  R(c, C.ink, -36, -84, 72, 6);
  R(c, C.dark, -35, -83, 70, 4);
  // inlet / outlet stubs
  R(c, C.dark, -38, -69, 6, 6);
  R(c, C.dark, 32, -15, 6, 6);
}

function drawValve(c: Ctx, open: boolean) {
  R(c, C.ink, -16, -17, 32, 9);
  R(c, C.metal, -15, -16, 30, 7);
  R(c, C.ink, -6, -22, 12, 18);
  R(c, C.brass, -5, -21, 10, 16);
  R(c, C.ink, -1, -26, 2, 6);
  c.fillStyle = open ? C.green : C.red;
  c.fillRect(-9, -28, 18, 4);
  R(c, C.dark, -4, -6, 8, 6);
}

function drawSplitter(c: Ctx) {
  R(c, C.ink, -18, -19, 36, 9);
  R(c, C.metal, -17, -18, 34, 7);
  R(c, C.ink, -5, -31, 10, 22);
  R(c, C.metal, -4, -30, 8, 20);
  R(c, C.ink, -9, -22, 18, 14);
  R(c, C.copper, -8, -21, 16, 12);
  R(c, C.copperL, -8, -21, 16, 2);
  R(c, C.dark, -4, -8, 8, 8);
}

function fireGlow(c: Ctx, x: number, y: number, w: number, h: number, intensity: number, t: number, blue = false) {
  if (intensity <= 0.02) { R(c, '#2a1d18', x, y, w, h); return; }
  R(c, '#2a1d18', x, y, w, h);
  const flick = 0.75 + 0.25 * Math.sin(t * 23) * Math.sin(t * 7.3);
  const fh = h * intensity * flick;
  R(c, blue ? '#3a7bff' : C.fire, x + 1, y + h - fh, w - 2, fh);
  R(c, blue ? '#a8d4ff' : C.fireL, x + w * 0.3, y + h - fh * 0.6, w * 0.4, fh * 0.6);
}

function drawBoiler(c: Ctx, m: Machine, o: DrawOpts) {
  // brick firebox
  R(c, C.ink, -27, -20, 54, 20);
  R(c, C.brick, -26, -19, 52, 19);
  for (let i = 0; i < 4; i++) R(c, C.brickD, -26, -15 + i * 4, 52, 1);
  for (let i = 0; i < 6; i++) R(c, C.brickD, -24 + i * 9 + ((i % 2) * 4), -19, 1, 19);
  fireGlow(c, -9, -15, 18, 13, Math.min(1, m.fire > 0 ? 0.4 + m.heat * 0.6 : m.heat * 0.5), o.t);
  // chimney
  R(c, C.ink, 7, -86, 11, 32);
  R(c, C.dark, 8, -85, 9, 30);
  R(c, C.ink, 5, -88, 15, 4);
  // drum
  R(c, C.ink, -27, -58, 54, 40);
  R(c, C.copper, -26, -57, 52, 38);
  R(c, C.copperL, -26, -57, 52, 4);
  R(c, C.rust, -26, -22, 52, 3);
  for (const rx of [-22, -10, 2, 14]) { R(c, C.brassL, rx, -54, 2, 2); R(c, C.brassL, rx + 4, -26, 2, 2); }
  tankLevel(c, -21, -50, 6, 22, o.waterFrac);
  gauge(c, 10, -40, 7, m.heat);
  // inlet / outlet
  R(c, C.dark, -32, -41, 6, 6);
  R(c, C.light, 26, -51, 6, 6);
}

function drawBoilerInd(c: Ctx, m: Machine, o: DrawOpts) {
  // base
  R(c, C.ink, -41, -14, 82, 14);
  R(c, C.dark, -40, -13, 80, 13);
  for (let i = -36; i < 40; i += 10) R(c, '#f2c230', i, -13, 5, 3);
  fireGlow(c, -16, -12, 32, 11, m.heat, o.t, true);
  // chimney
  R(c, C.ink, 15, -118, 15, 36);
  R(c, C.metal, 16, -117, 13, 34);
  R(c, '#d84b3a', 16, -110, 13, 3);
  R(c, C.ink, 13, -121, 19, 5);
  // vessel
  R(c, C.ink, -38, -86, 76, 73);
  R(c, C.metal, -37, -85, 74, 71);
  R(c, C.light, -37, -85, 74, 4);
  R(c, C.shine, -33, -80, 3, 60);
  for (const by of [-68, -48, -28]) R(c, C.dark, -37, by, 74, 2);
  tankLevel(c, -28, -76, 8, 50, o.waterFrac);
  gauge(c, 8, -62, 9, m.heat);
  gauge(c, 24, -38, 6, o.steamFrac);
  // pipes detail
  R(c, C.copper, -14, -36, 4, 22);
  R(c, C.copper, -14, -36, 14, 4);
  R(c, C.dark, -44, -31, 7, 7);
  R(c, C.light, 37, -75, 7, 7);
}

function drawCondenser(c: Ctx, m: Machine, o: DrawOpts) {
  const on = o.active && m.on;
  R(c, C.ink, -21, -14, 42, 14);
  R(c, C.dark, -20, -13, 40, 13);
  R(c, C.ink, -17, -100, 34, 88);
  R(c, '#5b7486', -16, -99, 32, 86);
  for (let i = 0; i < 9; i++) {
    const glow = on ? 0.5 + 0.5 * Math.sin(o.t * 4 - i * 0.7) : 0;
    c.fillStyle = on ? `rgba(120,210,255,${0.35 + glow * 0.6})` : '#3d5160';
    c.fillRect(-16, -94 + i * 9, 32, 3);
  }
  R(c, C.shine, -13, -97, 2, 80);
  // nozzle crown
  R(c, C.ink, -12, -112, 24, 14);
  R(c, C.light, -11, -111, 22, 12);
  const spin = o.t * (on ? 8 : 0);
  for (let i = 0; i < 3; i++) R(c, C.dark, -10 + ((i * 7 + spin * 3) % 20), -109, 3, 8);
  R(c, C.dark, -31, -25, 7, 7);
}

/** a glass house on a brick base: steam fogs the panes, sprouts grow in trays inside */
function drawGreenhouse(c: Ctx, m: Machine, o: DrawOpts) {
  const on = o.active && m.on;
  R(c, C.ink, -37, -14, 74, 14);
  R(c, C.brick, -36, -13, 72, 12);
  for (let i = 0; i < 6; i++) R(c, C.brickD, -34 + i * 12, -8, 1, 7);
  // glass body with a pitched roof
  c.fillStyle = C.ink;
  c.beginPath(); c.moveTo(-35, -13); c.lineTo(-35, -44); c.lineTo(0, -66); c.lineTo(35, -44); c.lineTo(35, -13); c.closePath(); c.fill();
  c.fillStyle = on ? 'rgba(170,225,205,0.9)' : 'rgba(120,150,150,0.9)';
  c.beginPath(); c.moveTo(-33, -14); c.lineTo(-33, -43); c.lineTo(0, -63); c.lineTo(33, -43); c.lineTo(33, -14); c.closePath(); c.fill();
  // trays of sprouts
  const grow = Math.min(1, (o.seedFrac ?? 0) * 1.2 + (on ? 0.25 : 0));
  for (let i = 0; i < 6; i++) {
    const x = -28 + i * 10;
    R(c, C.woodD, x - 3, -20, 8, 4);
    const h = 3 + 9 * grow * (0.6 + 0.4 * Math.sin(i * 1.9));
    R(c, C.leaf, x, -20 - h, 2, h);
    R(c, C.leafL, x - 2 + Math.sin(o.t * 2 + i) * 0.6, -20 - h, 3, 2);
    R(c, C.leafL, x + 1, -20 - h * 0.6, 3, 2);
  }
  // iron frame
  c.strokeStyle = C.dark; c.lineWidth = 1.6;
  c.beginPath();
  for (const x of [-22, -11, 0, 11, 22]) { c.moveTo(x, -14); c.lineTo(x, x === 0 ? -63 : -43 - (22 - Math.abs(x)) * 0.6); }
  c.moveTo(-33, -32); c.lineTo(33, -32);
  c.stroke();
  // steam fogging the glass
  if (on) {
    c.fillStyle = `rgba(240,248,250,${0.25 + 0.15 * Math.sin(o.t * 1.5)})`;
    c.beginPath(); c.ellipse(-12, -48, 14, 6, 0, 0, 7); c.ellipse(12, -40, 12, 5, 0, 0, 7); c.fill();
  }
  R(c, C.shine, -30, -42, 2, 26);
  // seed hopper on the outlet side
  R(c, C.ink, 30, -30, 10, 16);
  R(c, C.brass, 31, -29, 8, 14);
  const sf = Math.max(0, Math.min(1, o.seedFrac ?? 0));
  R(c, C.seed, 32, -16 - 11 * sf, 6, 11 * sf);
}

/** a short mortar pointing at the sky: it fires seed pods into the cloud above */
function drawSeeder(c: Ctx, m: Machine, o: DrawOpts) {
  const firing = o.active && m.on;
  R(c, C.ink, -19, -14, 38, 14);
  R(c, C.woodD, -18, -13, 36, 12);
  R(c, C.wood, -18, -13, 36, 3);
  // hopper
  R(c, C.ink, -18, -30, 14, 17);
  R(c, C.brass, -17, -29, 12, 15);
  const sf = Math.max(0, Math.min(1, o.seedFrac ?? 0));
  R(c, C.seed, -16, -15 - 12 * sf, 10, 12 * sf);
  // barrel
  const kick = firing ? Math.abs(Math.sin(o.t * 9)) * 2 : 0;
  R(c, C.ink, -7, -58 + kick, 16, 46);
  R(c, C.metal, -6, -57 + kick, 14, 44);
  R(c, C.light, -4, -56 + kick, 3, 42);
  R(c, C.copper, -8, -46 + kick, 18, 4);
  R(c, C.copper, -8, -26 + kick, 18, 4);
  R(c, C.ink, -5, -59 + kick, 12, 3);
  if (firing) {
    for (let i = 0; i < 3; i++) {
      const ph = (o.t * 1.6 + i / 3) % 1;
      R(c, C.seed, -1 + Math.sin(i * 2.1) * 3, -62 - ph * 40, 3, 3);
    }
  }
}

/** a wooden bin heaped with leaves from the forest */
function drawCompost(c: Ctx, m: Machine, o: DrawOpts) {
  R(c, C.ink, -31, -32, 62, 32);
  R(c, C.woodD, -30, -31, 60, 30);
  for (let i = 0; i < 4; i++) R(c, C.wood, -30, -29 + i * 8, 60, 5);
  // the heap
  c.fillStyle = '#4a3a1c';
  c.beginPath(); c.ellipse(0, -31, 27, 10, 0, Math.PI, Math.PI * 2); c.fill();
  for (let i = 0; i < 9; i++) {
    c.fillStyle = i % 3 === 0 ? '#c8a040' : i % 3 === 1 ? C.leaf : '#8a6a2a';
    c.fillRect(-22 + i * 5, -34 - Math.abs(Math.sin(i * 1.7)) * 6, 4, 3);
  }
  if (m.on && o.active) {
    c.fillStyle = `rgba(220,230,200,${0.25 + 0.15 * Math.sin(o.t * 2)})`;
    c.beginPath(); c.arc(-6, -46 - (o.t * 6) % 10, 4, 0, 7); c.arc(8, -50 - (o.t * 5) % 12, 3, 0, 7); c.fill();
  }
}

function drawDivider(c: Ctx, m: Machine, o: DrawOpts) {
  R(c, C.ink, -29, -16, 58, 16);
  R(c, C.dark, -28, -15, 56, 15);
  R(c, C.ink, -6, -48, 12, 34);
  R(c, C.metal, -5, -47, 10, 32);
  for (let i = 0; i < 4; i++) R(c, C.copper, -8, -44 + i * 7, 16, 3);
  circ(c, C.ink, 0, -50, 9);
  circ(c, m.on ? '#b27cff' : C.metal, 0, -50, 8);
  if (m.on && (Math.sin(o.t * 17) > 0.6 || m.anim > 0)) {
    c.strokeStyle = '#e8d4ff';
    c.lineWidth = 1.5;
    c.beginPath();
    let x = 0, y = -56;
    c.moveTo(x, y);
    for (let i = 0; i < 4; i++) { x += Math.sin(o.t * 31 + i) * 6; y -= 7; c.lineTo(x, y); }
    c.stroke();
  }
}

function drawPlatform(c: Ctx, m: Machine, groundAt?: (x: number) => number) {
  const d = MACHINES.platform;
  if (groundAt) {
    for (const lx of [-d.w / 2 + 8, d.w / 2 - 14]) {
      const g = groundAt(m.x + lx + 3) - m.y;
      if (g > 2) {
        R(c, C.ink, lx - 1, 0, 8, g);
        R(c, C.metal, lx, 0, 6, g);
        for (let y = 10; y < g; y += 22) R(c, C.dark, lx, y, 6, 2);
      }
    }
    const gm = groundAt(m.x) - m.y;
    if (gm > 40) {
      c.strokeStyle = C.dark;
      c.lineWidth = 2;
      c.beginPath();
      for (let y = 0; y < gm - 20; y += 40) {
        c.moveTo(-d.w / 2 + 12, y); c.lineTo(d.w / 2 - 10, y + 40);
        c.moveTo(d.w / 2 - 10, y); c.lineTo(-d.w / 2 + 12, y + 40);
      }
      c.stroke();
    }
  }
  R(c, C.ink, -d.w / 2, -d.h, d.w, d.h);
  R(c, C.wood, -d.w / 2 + 1, -d.h + 1, d.w - 2, d.h - 3);
  for (let x = -d.w / 2 + 10; x < d.w / 2; x += 16) R(c, C.woodD, x, -d.h + 1, 1, d.h - 3);
  R(c, '#b07a40', -d.w / 2 + 1, -d.h + 1, d.w - 2, 2);
}

function drawMast(c: Ctx, m: Machine, groundAt?: (x: number) => number) {
  const d = MACHINES[m.kind];
  const bottom = (m.support || (groundAt ? groundAt(m.x) : m.y + 200)) - m.y;
  if (bottom <= d.h / 2) return;
  const top = d.h * 0.3;
  c.fillStyle = C.ink;
  c.fillRect(-5, top, 2, bottom - top);
  c.fillRect(3, top, 2, bottom - top);
  c.strokeStyle = C.dark;
  c.lineWidth = 1.2;
  c.beginPath();
  for (let y = top; y < bottom - 8; y += 14) { c.moveTo(-4, y); c.lineTo(4, y + 14); c.moveTo(4, y); c.lineTo(-4, y + 14); }
  c.stroke();
  R(c, C.dark, -10, bottom - 4, 20, 4);
}

/** Wind machine head, drawn pointing along +x (context already rotated). */
export function drawWind(c: Ctx, kind: MachineKind, spin: number) {
  const d = MACHINES[kind];
  const w = d.w, h = d.h;
  const body = kind === 'fan' ? C.teal : kind === 'fan_ind' ? C.orange : '#c9cbd6';
  // housing
  R(c, C.ink, -w / 2, -h * 0.32, w * 0.55, h * 0.64);
  R(c, body, -w / 2 + 1, -h * 0.32 + 1, w * 0.55 - 2, h * 0.64 - 2);
  R(c, 'rgba(255,255,255,0.35)', -w / 2 + 1, -h * 0.32 + 1, w * 0.55 - 2, 2);
  if (kind === 'turbine') { R(c, C.dark, -w / 2 - 8, -6, 10, 12); for (let i = 0; i < 3; i++) R(c, C.metal, -w / 2 + 8 + i * 10, -h * 0.3, 3, h * 0.6); }
  // ring
  R(c, C.ink, w * 0.04, -h / 2, w * 0.14, h);
  R(c, C.dark, w * 0.05, -h / 2 + 1, w * 0.12, h - 2);
  // spinning blades seen from the side: segments oscillating along the ring
  c.fillStyle = C.shine;
  for (let i = 0; i < 3; i++) {
    const a = spin + (i * Math.PI * 2) / 3;
    const y = Math.sin(a) * h * 0.42;
    const len = Math.abs(Math.cos(a)) * h * 0.1 + 2;
    c.fillRect(w * 0.18, y - len / 2, w * 0.08, len);
  }
  R(c, C.metal, w * 0.18, -h * 0.47, 2, h * 0.94);
  // nozzle
  c.fillStyle = 'rgba(255,255,255,0.12)';
  c.beginPath();
  c.moveTo(w * 0.28, -h * 0.45);
  c.lineTo(w * 0.55, -h * 0.3);
  c.lineTo(w * 0.55, h * 0.3);
  c.lineTo(w * 0.28, h * 0.45);
  c.fill();
}

/** Ports: blue = water, white = steam; filled = output, ring = input. */
export function drawPort(c: Ctx, x: number, y: number, fluid: Fluid, dir: 'in' | 'out', size: number, hot = false) {
  const col = fluid === 'water' ? C.blue : fluid === 'seed' ? C.seed : C.steam;
  R(c, C.ink, x - size - 1, y - size - 1, size * 2 + 2, size * 2 + 2);
  R(c, dir === 'out' ? col : C.ink, x - size, y - size, size * 2, size * 2);
  if (dir === 'in') { c.strokeStyle = col; c.lineWidth = Math.max(1, size * 0.5); c.strokeRect(x - size * 0.6, y - size * 0.6, size * 1.2, size * 1.2); }
  if (hot) { c.strokeStyle = '#ffe066'; c.lineWidth = Math.max(1, size * 0.35); c.strokeRect(x - size - 3, y - size - 3, size * 2 + 6, size * 2 + 6); }
}
