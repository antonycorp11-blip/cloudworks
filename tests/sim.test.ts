import { describe, expect, it } from 'vitest';
import { Sim, STEP } from '../src/sim/sim';
import { MACHINES } from '../src/data/machines';
import { cloudRadius } from '../src/sim/types';
import { loadGame, saveGame } from '../src/sim/save';
import { TREE } from '../src/data/tree';

/** research every machine (tests about mechanics, not progression) */
const researched = (lvl = 0) => { const s = new Sim(lvl); for (const n of TREE) if (n.unlock) s.tree[n.id] = 1; return s; };

const run = (s: Sim, seconds: number) => { for (let i = 0; i < seconds / STEP; i++) s.step(); };
const boilerOf = (s: Sim) => s.machines.find(m => m.kind === 'boiler')!;
const fanOf = (s: Sim) => s.machines.find(m => m.kind === 'fan')!;
/** skip the forest phase: the Ancient rises right away */
const rise = (s: Sim) => { s.creature.rise('…'); return s; };

class MemStore {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

describe('starting state', () => {
  it('has a sea, a rudimentary boiler and a fan, target far away', () => {
    const s = new Sim(0);
    expect(boilerOf(s)).toBeTruthy();
    expect(fanOf(s)).toBeTruthy();
    expect(s.biome.targetStart - boilerOf(s).x).toBeGreaterThan(800);
  });
});

describe('manual cycle: water → steam → cloud → rain → humidity → credits', () => {
  it('boiler only makes steam when it has water and fire', () => {
    const s = new Sim(0);
    const b = boilerOf(s);
    expect(b.water).toBeGreaterThan(10); // starts full
    b.water = 0;
    run(s, 5);
    expect(s.stats.steam).toBe(0);
    s.fillBucket();
    s.pourBucket(b);
    expect(b.water).toBeCloseTo(5);
    run(s, 5);
    expect(s.stats.steam).toBe(0); // no fire
    s.stoke(b);
    run(s, 10);
    expect(s.stats.steam).toBeGreaterThan(3);
    expect(b.water).toBeLessThan(2);
    expect(s.clouds.clouds.length).toBeGreaterThan(0);
  });

  it('first rain reaches the target quickly with the starter fan, raising humidity and paying credits', () => {
    const s = new Sim(0);
    const b = boilerOf(s);
    const h0 = s.climate.humidity;
    const c0 = s.credits;
    for (let i = 0; i < 3; i++) { s.fillBucket(); s.pourBucket(b); }
    s.stoke(b);
    let t = 0;
    while (!s.firstRain && t < 180) { run(s, 1); t++; }
    expect(s.firstRain).toBe(true);
    expect(t).toBeLessThan(100);
    run(s, 20);
    const control = new Sim(0);
    run(control, t + 20);
    expect(h0).toBeGreaterThan(0);
    expect(s.climate.humidity).toBeGreaterThan(control.climate.humidity + 0.3);
    expect(s.forest.meanMoist).toBeGreaterThan(control.forest.meanMoist);
    expect(s.creature.awake).toBe(false); // rain alone doesn't wake it: the forest has to grow first
    expect(s.credits).toBeGreaterThan(c0);
  });
});

describe('rain only counts inside the target region', () => {
  it('a saturated cloud over the factory rains but does not raise target humidity', () => {
    const s = new Sim(0);
    const h0 = s.climate.humidity;
    s.clouds.spawn(500, s.biome.groundBase - 400, 200);
    // remove the fan so the cloud stays put-ish
    s.sell(fanOf(s).id);
    run(s, 15);
    expect(s.stats.rainWasted).toBeGreaterThan(10);
    expect(s.stats.rainTarget).toBe(0);
    expect(s.climate.humidity).toBeLessThanOrEqual(h0);
  });
  it('a cloud above the target rains on it', () => {
    const s = new Sim(0);
    const cx = (s.biome.targetStart + s.biome.targetEnd) / 2;
    s.clouds.spawn(cx, s.biome.groundBase - 380, 8);
    run(s, 10);
    expect(s.stats.rainTarget).toBeGreaterThan(4);
  });
});

describe('cloud physics conserves water', () => {
  it('fusion keeps ~all mass and makes one bigger cloud', () => {
    const s = new Sim(0);
    s.clouds.clouds = [];
    const y = s.biome.groundBase - 600;
    s.clouds.spawn(1500, y, 3);
    s.clouds.spawn(1520, y, 2);
    s.step();
    expect(s.clouds.clouds.length).toBe(1);
    expect(s.clouds.clouds[0].mass).toBeGreaterThan(4.9 - 0.1);
    expect(s.clouds.clouds[0].mass).toBeLessThanOrEqual(5);
  });
  it('the atmospheric divider splits a big cloud without creating water', () => {
    const s = researched();
    s.clouds.clouds = [];
    s.credits = 1e6;
    const r = s.build('divider', 1300, s.biome.groundBase);
    expect(r.ok).toBe(true);
    const d = r.machine!;
    s.clouds.spawn(d.x, s.biome.groundBase - 700, 40);
    const before = s.clouds.totalMass();
    s.step();
    expect(s.clouds.clouds.length).toBe(2);
    expect(s.clouds.totalMass()).toBeLessThanOrEqual(before);
    expect(s.clouds.totalMass()).toBeGreaterThan(before * 0.97);
  });
  it('cloud radius grows continuously with mass (no size cap)', () => {
    expect(cloudRadius(1)).toBeLessThan(cloudRadius(1.1));
    expect(cloudRadius(10000)).toBeGreaterThan(1000);
  });
});

describe('wind', () => {
  it('a fan changes cloud trajectories', () => {
    const mk = (withFan: boolean) => {
      const s = new Sim(0);
      s.clouds.clouds = [];
      s.sell(fanOf(s).id);
      s.credits = 1e6;
      const y = s.biome.groundBase - s.biome.condAlt;
      if (withFan) {
        const f = s.build('fan', 1200, y, -Math.PI / 2).machine!; // blowing up
        expect(f).toBeTruthy();
      }
      const c = s.clouds.spawn(1200, y - 60, 3);
      run(s, 3);
      return c.y;
    };
    expect(mk(true)).toBeLessThan(mk(false) - 30);
  });
});

describe('construction & hydraulics', () => {
  it('pump only works on the sea; pipes carry water up to the boiler', () => {
    const s = new Sim(0);
    s.credits = 1000;
    const bad = s.build('pump', 700, 1000);
    expect(bad.ok).toBe(false);
    const p = s.build('pump', 300, 1000);
    expect(p.ok).toBe(true);
    const b = boilerOf(s);
    expect(s.connect({ m: p.machine!.id, port: 'out' }, { m: b.id, port: 'in' }).ok).toBe(true);
    run(s, 5);
    expect(b.water).toBeGreaterThan(5);
  });
  it('rejects mismatched fluids and overlapping machines', () => {
    const s = researched();
    s.credits = 1000;
    const b = boilerOf(s);
    const c = s.build('condenser', b.x + 200, 1100).machine!;
    expect(s.connect({ m: b.id, port: 'in' }, { m: c.id, port: 'in' }).ok).toBe(false);
    expect(s.build('reservoir', b.x, 1100).ok).toBe(false);
  });
  it('pressure head limits how high water can climb', () => {
    const s = researched();
    s.credits = 1e6;
    const p = s.build('pump', 300, 1000).machine!;
    // tall stack of platforms far above the pump head
    const plat = s.build('platform', 780, s.biome.groundBase - 600).machine!;
    expect(plat).toBeTruthy();
    const res = s.build('reservoir', 780, plat.y - 20).machine!;
    expect(res.support).toBeLessThan(s.biome.groundBase - 500);
    s.connect({ m: p.id, port: 'out' }, { m: res.id, port: 'in' });
    run(s, 5);
    expect(res.water).toBe(0);
    s.mods.levels.pumpHead = 10;
    run(s, 5);
    expect(res.water).toBeGreaterThan(1);
  });
  it('steam piped to a condenser forms clouds more efficiently than venting', () => {
    const vented = researched();
    const piped = researched();
    for (const s of [vented, piped]) { s.clouds.clouds = []; s.sell(fanOf(s).id); s.credits = 1e6; s.mods.levels.autoStoke = 1; }
    const c = piped.build('condenser', boilerOf(piped).x + 120, 1100).machine!;
    expect(piped.connect({ m: boilerOf(piped).id, port: 'out' }, { m: c.id, port: 'in' }).ok).toBe(true);
    for (const s of [vented, piped]) { boilerOf(s).water = 20; s.stoke(boilerOf(s)); run(s, 30); }
    expect(piped.stats.formed).toBeGreaterThan(vented.stats.formed * 1.4);
  });
});

describe('upgrades change real behaviour', () => {
  it('pump rate upgrade increases pumped water', () => {
    const go = (lvl: number) => {
      const s = researched();
      s.credits = 1e6;
      s.mods.levels.pumpRate = lvl;
      const p = s.build('pump', 300, 1000).machine!;
      const r = s.build('reservoir', 780, 1100).machine!;
      s.connect({ m: p.id, port: 'out' }, { m: r.id, port: 'in' });
      s.mods.levels.pipeCap = 5;
      run(s, 10);
      return s.stats.pumped;
    };
    expect(go(3)).toBeGreaterThan(go(0) * 1.5);
  });
  it('buying costs credits and raises the level', () => {
    const s = new Sim(0);
    s.credits = 100;
    expect(s.buyUpgrade('bucket').ok).toBe(true);
    expect(s.mods.lvl('bucket')).toBe(1);
    expect(s.credits).toBeLessThan(100);
    expect(s.mods.bucketSize()).toBe(9);
  });
});

describe('save / load', () => {
  it('round-trips the full world', () => {
    const s = new Sim(0);
    s.credits = 1234;
    s.clouds.spawn(1000, 700, 12);
    const st = new MemStore();
    saveGame(s, st);
    const l = loadGame(st)!;
    expect(l.credits).toBe(1234);
    expect(l.machines.length).toBe(s.machines.length);
    expect(l.clouds.clouds.length).toBe(s.clouds.clouds.length);
    run(l, 2);
  });
});

describe('machine catalogue sanity', () => {
  it('all ports are on the machine body edges', () => {
    for (const d of Object.values(MACHINES)) for (const p of d.ports) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(d.w / 2 + 6);
      expect(-p.y).toBeLessThanOrEqual(d.h + 2);
    }
  });
});

describe('touch play: throwing clouds and bellows', () => {
  it('a thrown cloud flies far; heavy clouds fly less', () => {
    const throwIt = (mass: number) => {
      const s = new Sim(0);
      s.clouds.clouds = [];
      const y = s.biome.groundBase - s.biome.condAlt;
      const c = s.clouds.spawn(600, y, mass);
      s.grabCloud(c.id, 600, y);
      s.dragCloud(640, y);
      run(s, 0.3);
      s.releaseCloud(900, 0);
      run(s, 4);
      return c.x;
    };
    const light = throwIt(4), heavy = throwIt(60);
    expect(light).toBeGreaterThan(1200);
    expect(heavy).toBeLessThan(light - 300);
  });
  it('a thrown starter cloud can make it rain on the forest within seconds', () => {
    const s = new Sim(0);
    const b = boilerOf(s);
    for (let i = 0; i < 6 / STEP; i++) { s.setBoost(b.id); s.step(); }
    const c = s.clouds.clouds.sort((p, q) => q.mass - p.mass)[0];
    expect(c.mass).toBeGreaterThan(2);
    s.grabCloud(c.id, c.x, c.y);
    s.dragCloud(c.x + 60, c.y);
    run(s, 0.2);
    s.releaseCloud(1000, 0);
    let t = 0;
    while (!s.firstRain && t < 40) { run(s, 0.5); t += 0.5; }
    expect(s.firstRain).toBe(true);
    expect(t).toBeLessThan(25);
  });
  it('holding the boiler (bellows) makes more steam', () => {
    const go = (hold: boolean) => {
      const s = new Sim(0);
      const b = boilerOf(s);
      s.stoke(b);
      for (let i = 0; i < 8 / STEP; i++) { if (hold) s.setBoost(b.id); s.step(); }
      return s.stats.steam;
    };
    expect(go(true)).toBeGreaterThan(go(false) * 1.6);
  });
});

describe('missions', () => {
  it('advance and pay rewards', () => {
    const s = new Sim(0);
    expect(s.currentMission()?.id).toBe('bellows');
    const c0 = s.credits;
    const b = boilerOf(s);
    for (let i = 0; i < 8 / STEP; i++) { s.setBoost(b.id); s.step(); }
    expect(s.missionIdx).toBeGreaterThan(0);
    expect(s.credits).toBeGreaterThan(c0);
  });
});

describe('the forest', () => {
  const above = (s: Sim, x: number, mass: number, seeds = 0) => { const c = s.clouds.spawn(x, s.biome.groundBase - 380, mass); c.seeds = seeds; return c; };
  it('rain without seeds only wets the dust; seeded rain makes the land sprout', () => {
    const dry = new Sim(0), seeded = new Sim(0);
    const x = dry.forest.x0 + 200;
    for (let i = 0; i < 6; i++) { above(dry, x, 10); above(seeded, x, 10, 12); run(dry, 8); run(seeded, 8); }
    expect(dry.forest.meanMoist).toBeGreaterThan(0);
    expect(dry.forest.sprouted).toBe(false);
    expect(seeded.forest.sprouted).toBe(true);
    expect(seeded.forest.lifeAt(x)).toBeGreaterThan(0.5);
    expect(seeded.stats.seedsRained).toBeGreaterThan(30);
  });
  it('the Semente-Mãe sprouts with water alone but needs a living forest to become a tree', () => {
    const s = new Sim(0);
    for (let i = 0; i < 40; i++) { above(s, s.forest.heartX, 8); run(s, 8); }
    expect(s.forest.heartLife).toBeGreaterThan(0.5);
    expect(s.forest.heartLife).toBeLessThan(2);
  });
  it('the hand pouch seeds a cloud and refills slowly', () => {
    const s = new Sim(0);
    const c = above(s, 900, 4);
    const p0 = s.pouch;
    expect(s.seedByHand(c.id).ok).toBe(true);
    expect(c.seeds).toBeGreaterThan(0);
    expect(s.pouch).toBeLessThan(p0);
    run(s, 25);
    expect(s.pouch).toBeGreaterThan(p0 - 6);
  });
  it('plants wilt when the soil stays dry', () => {
    const s = new Sim(0);
    s.forest.life.fill(1.5);
    s.forest.moist.fill(0);
    run(s, 120);
    expect(s.forest.vitality).toBeLessThan(0.5);
  });
  it('the Ancient rises when the land is alive and the heart is a tree', () => {
    const s = new Sim(0);
    let risen = false;
    s.bus.on(e => { if (e.type === 'awaken') risen = true; });
    s.forest.life.fill(s.biome.forest.awaken * 3 + 0.05);
    s.forest.life[s.forest.heart] = 3;
    s.forest.moist.fill(1);
    s.step();
    expect(risen).toBe(true);
    expect(s.creature.awake).toBe(true);
    expect(s.creature.stage).toBe(1);
  });
});

describe('the seed line', () => {
  it('a greenhouse turns steam and water into seeds — and that steam no longer becomes clouds', () => {
    const s = researched();
    s.credits = 1e4;
    const b = boilerOf(s);
    const gh = s.build('greenhouse', 480, s.biome.groundBase).machine!;
    expect(gh).toBeTruthy();
    expect(s.connect({ m: b.id, port: 'out' }, { m: gh.id, port: 'steam' }).ok).toBe(true);
    gh.water = 20;
    b.water = 20;
    s.stoke(b);
    run(s, 40);
    expect(s.stats.seedsMade).toBeGreaterThan(3);
    expect(gh.seeds).toBeGreaterThan(3);
    expect(s.stats.formed).toBeLessThan(0.5); // the boiler's steam went into the greenhouse
  });
  it('a seeder shoots its seeds into the cloud above it', () => {
    const s = researched();
    s.credits = 1e4;
    const sd = s.build('seeder', 880, s.biome.groundBase).machine!;
    expect(sd).toBeTruthy();
    sd.seeds = 10;
    const c = s.clouds.spawn(880, s.biome.groundBase - 330, 6);
    c.vx = 0;
    s.step();
    expect(c.seeds).toBeGreaterThan(0);
    run(s, 4);
    expect(sd.seeds).toBeLessThan(10);
  });
  it('seeds travel through pipes from the greenhouse to the seeder', () => {
    const s = researched();
    s.credits = 1e4;
    const gh = s.build('greenhouse', 480, s.biome.groundBase).machine!;
    const sd = s.build('seeder', 880, s.biome.groundBase).machine!;
    expect(s.connect({ m: gh.id, port: 'out' }, { m: sd.id, port: 'in' }).ok).toBe(true);
    gh.seeds = 10;
    run(s, 2);
    expect(sd.seeds + s.stats.seedsShot).toBeGreaterThan(2);
  });
});

describe('the Ancient', () => {
  it('only grows once risen, in stages, and gets thirstier', () => {
    const s = new Sim(0);
    expect(s.creature.mood).toBe('sleeping');
    s.creature.feed(500, 60);
    expect(s.creature.growth).toBe(0);
    rise(s);
    const cx = s.creature.geometry().cx;
    const thirst0 = s.creature.thirst;
    for (let i = 0; i < 40; i++) { s.clouds.spawn(cx, s.biome.groundBase - 380, 30); run(s, 6); }
    expect(s.creature.stage).toBeGreaterThanOrEqual(2);
    expect(s.creature.thirst).toBeGreaterThan(thirst0);
  });
  it('reaching the final form completes the level', () => {
    const s = rise(new Sim(0));
    let won = false;
    s.bus.on(e => { if (e.type === 'levelComplete') won = true; });
    s.climate.humidity = 60;
    s.creature.feed(1e5, 60);
    s.step();
    expect(s.creature.done).toBe(true);
    expect(won).toBe(true);
  });
});

describe('boilers never stop silently', () => {
  it('the fire is not wasted while the boiler is empty, and lasts a minute of boiling', () => {
    const s = new Sim(0);
    const b = boilerOf(s);
    b.water = 0;
    s.stoke(b);
    const f0 = b.fire;
    run(s, 20);
    expect(b.fire).toBeCloseTo(f0, 5); // nothing to boil → fuel preserved
    expect(s.boilerStatus(b)).toBe('nowater');
    b.water = 20;
    run(s, 25);
    expect(b.fire).toBeGreaterThan(0);
    expect(s.stats.steam).toBeGreaterThan(10);
  });
  it('reports why a boiler is idle and warns when the fire goes out', () => {
    const s = new Sim(0);
    const b = boilerOf(s);
    const toasts: string[] = [];
    s.bus.on(e => { if (e.type === 'toast') toasts.push(e.text); });
    expect(s.boilerStatus(b)).toBe('nofire');
    s.stoke(b);
    b.fire = 1;
    b.water = 20;
    run(s, 3);
    expect(b.fire).toBe(0);
    expect(toasts.some(t => t.includes('apagou'))).toBe(true);
    s.toggle(b.id);
    expect(s.boilerStatus(b)).toBe('off');
  });
  it('an industrial boiler fed by one pump is flagged as short on water, not off', () => {
    const s = researched();
    s.credits = 1e6;
    const p = s.build('pump', 300, 0).machine!;
    const b = s.build('boiler_ind', 760, 1100).machine!;
    s.connect({ m: p.id, port: 'out' }, { m: b.id, port: 'in' });
    run(s, 40);
    expect(b.on).toBe(true);
    expect(b.rate).toBeGreaterThan(1.5);
    expect(s.boilerStatus(b)).toBe('lowwater');
  });
});

describe('engineering tree', () => {
  it('advanced machines need research; research is permanent across biomes', () => {
    const s = new Sim(0);
    s.credits = 1e6;
    expect(s.build('boiler_ind', 760, 1100).ok).toBe(false);
    expect(s.research('s_ind').ok).toBe(false); // needs s_stoke first
    expect(s.research('s_stoke').ok).toBe(true);
    expect(s.research('s_ind').ok).toBe(true);
    expect(s.build('boiler_ind', 760, 1100).ok).toBe(true);
    s.climate.won = true;
    s.completeLevel();
    expect(s.isUnlocked('boiler_ind')).toBe(true);   // research kept
    expect(s.nodeLevel('s_stoke')).toBe(0);         // modifiers reset
    expect(s.mods.lvl('autoStoke')).toBe(0);
  });
  it('creature perks change growth', () => {
    const grow = (lvl: number) => {
      const s = rise(new Sim(0));
      s.mods.levels.rootDepth = lvl;
      s.step();
      s.creature.feed(20, 40);
      return s.creature.growth;
    };
    expect(grow(4)).toBeGreaterThan(grow(0) * 1.5);
  });
});

describe('the Ancient grows into the factory', () => {
  it('its roots uproot machines in the way (refunded) and block building there', () => {
    const s = rise(researched());
    s.credits = 1e6;
    const y = s.biome.groundBase - s.biome.condAlt;
    const fan = s.build('fan', 1340, y).machine!;
    expect(fan).toBeTruthy();
    const before = s.credits;
    s.climate.humidity = 60;
    for (let i = 0; i < 60 && s.creature.stage < 3; i++) {
      s.climate.humidity = 60;
      s.clouds.spawn(s.creature.geometry().cx, y, 60);
      for (let k = 0; k < 30 * 8; k++) s.step();
    }
    expect(s.creature.stage).toBeGreaterThanOrEqual(3);
    expect(s.machines.find(m => m.id === fan.id)).toBeUndefined();
    expect(s.credits).toBeGreaterThan(before);
    expect(s.build('fan', 1340, y).ok).toBe(false);
  });
  it('its body is an obstacle: clouds are pushed over it', () => {
    const s = rise(new Sim(0));
    s.creature.stage = 4;
    const g = s.creature.geometry();
    expect(s.groundAt(g.cx)).toBeLessThan(s.terrain.groundY(g.cx) - 200);
  });
});
