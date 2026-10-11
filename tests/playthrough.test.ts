import { describe, expect, it } from 'vitest';
import { POUCH_GIVE, Sim, STEP } from '../src/sim/sim';
import type { Machine } from '../src/sim/types';

/**
 * A scripted player for level 1: starts by hand (bucket, bellows, a pouch of seeds), buys a pump,
 * automates stoking, builds an industrial cloud line, then the seed line (greenhouse → seeder)
 * fed by the old boiler. The forest must grow, the Ancient must rise from it and reach its final form.
 */
function playLevel1(log = false) {
  const s = new Sim(0);
  const boiler = s.machines.find(m => m.kind === 'boiler')!;
  const condY = s.biome.groundBase - s.biome.condAlt;
  let pump: Machine | null = null;
  let ind: Machine | null = null;
  let cond: Machine | null = null;
  let pump2: Machine | null = null;
  let gh: Machine | null = null;
  let seeder: Machine | null = null;
  let pump3: Machine | null = null;
  let fans = 0;
  let farFans = 0;
  const events: string[] = [];
  let t = 0;
  let awakenAt = -1;
  const say = (x: string) => { events.push(`${Math.round(t)}s ${x} | ₵${Math.round(s.credits)} vida=${(s.forest.vitality * 100).toFixed(0)}% coração=${s.forest.heartLife.toFixed(2)} H=${s.climate.humidity.toFixed(1)}`); };

  while (t < 4800 && !s.climate.won) {
    // manual play: one bucket every ~3 s and keep the fire going (until automated)
    if (!pump && Math.round(t) % 3 === 0) { s.fillBucket(); s.pourBucket(boiler); }
    if (s.mods.lvl('autoStoke') === 0 && boiler.fire < 2 && boiler.water > 1) s.stoke(boiler);
    // hand seeding: a handful into any cloud already heading out of the factory
    if (s.pouch >= POUCH_GIVE) {
      const c = s.clouds.clouds.find(q => q.x > s.biome.factoryEnd - 100 && q.x < s.biome.targetStart && q.seeds < 4);
      if (c) s.seedByHand(c.id);
    }

    if (!pump && s.credits >= 45) {
      pump = s.build('pump', 380, 0).machine ?? null;
      if (pump) { s.connect({ m: pump.id, port: 'out' }, { m: boiler.id, port: 'in' }); say('pump'); }
    }
    if (pump && s.mods.lvl('autoStoke') === 0 && s.credits >= s.upgradeCost('autoStoke')) { s.buyUpgrade('autoStoke'); say('autoStoke'); }
    if (pump && s.mods.lvl('autoStoke') && s.nodeLevel('s_ind') === 0 && s.credits >= s.nodeCost('s_ind') + 5) { s.research('s_ind'); say('research industrial'); }
    if (ind && s.nodeLevel('s_cond') === 0 && s.credits >= s.nodeCost('s_cond') + 5) { s.research('s_cond'); say('research condenser'); }
    if (pump && s.nodeLevel('s_ind') && !ind && s.credits >= 195) {
      ind = s.build('boiler_ind', 700, s.biome.groundBase).machine ?? null;
      if (ind && pump) { s.connect({ m: pump.id, port: 'out' }, { m: ind.id, port: 'in' }); say('industrial boiler'); }
    }
    if (ind && s.nodeLevel('s_cond') && !cond && s.credits >= 150) {
      cond = s.build('condenser', 820, s.biome.groundBase).machine ?? null;
      if (cond) {
        s.connect({ m: ind.id, port: 'out' }, { m: cond.id, port: 'in' });
        const f = s.machines.find(m => m.kind === 'fan')!;
        s.move(f.id, cond.x - 110, condY - 20, 0, false);
        say('condenser');
      }
    }
    if (cond && !pump2 && s.credits >= 50) {
      pump2 = s.build('pump', 320, 0).machine ?? null;
      if (pump2) { s.connect({ m: pump2.id, port: 'out' }, { m: ind!.id, port: 'in' }); say('pump2'); }
    }
    // the seed line: the old boiler now feeds a greenhouse instead of the sky
    if (pump2 && s.nodeLevel('g_estufa') === 0 && s.credits >= s.nodeCost('g_estufa') + 10) { s.research('g_estufa'); say('research greenhouse'); }
    if (s.nodeLevel('g_estufa') && !gh && s.credits >= 100) {
      gh = s.build('greenhouse', 480, s.biome.groundBase).machine ?? null;
      if (gh) {
        s.connect({ m: boiler.id, port: 'out' }, { m: gh.id, port: 'steam' });
        s.connect({ m: pump!.id, port: 'out' }, { m: gh.id, port: 'in' });
        say('greenhouse');
      }
    }
    if (gh && s.nodeLevel('g_seeder') === 0 && s.credits >= s.nodeCost('g_seeder') + 10) { s.research('g_seeder'); say('research seeder'); }
    if (gh && s.nodeLevel('g_seeder') && !seeder && s.credits >= 80) {
      seeder = s.build('seeder', 880, s.biome.groundBase).machine ?? null;
      if (seeder) { s.connect({ m: gh.id, port: 'out' }, { m: seeder.id, port: 'in' }); say('seeder'); }
    }
    if (seeder && !pump3 && s.credits >= 60) {
      pump3 = s.build('pump', 260, 0).machine ?? null;
      if (pump3) { s.connect({ m: pump3.id, port: 'out' }, { m: ind!.id, port: 'in' }); say('pump3'); }
    }
    fans = s.machines.filter(m => m.kind === 'fan').length;
    if (pump2 && seeder && fans < 7 && s.credits >= 35) {
      const x = Math.min(980 + (fans - 1) * 300, s.rootLimit() - 60);
      const f = x > 900 ? s.build('fan', x, condY - 20, 0).machine : null;
      if (f) say('fan');
    }
    // later: a line of gentle fans across the land carries the rain to the far parcels
    if (s.creature.awake && s.credits >= 120 && farFans < 8) {
      const x = s.creature.anchor + 120 + farFans * 260;
      if (x < s.biome.targetEnd - 150 && s.build('fan', x, condY - 30, 0, false, 0.5).ok) say('far fan');
      farFans++;
    }
    if (seeder && fans >= 3) {
      for (const k of ['g_seedrate', 'g_germ', 'g_pollen', 'k_roots'] as const) {
        const st = s.nodeState(k);
        if (st !== 'maxed' && st !== 'locked' && s.credits >= s.nodeCost(k) + 20) { s.research(k); say(`research ${k}`); }
      }
      for (const k of ['boilerRate', 'pumpRate', 'fanPower', 'precip'] as const) {
        if (s.credits >= s.upgradeCost(k) + 40) { s.buyUpgrade(k); say(`up ${k}`); }
      }
    }
    for (let i = 0; i < 1 / STEP; i++) s.step();
    t++;
    if (awakenAt < 0 && s.creature.awake) { awakenAt = t; say('AWAKEN'); }
    if (log && t % 240 === 0) events.push('   zonas ' + [0,1,2,3,4].map(z => (s.forest.zoneVitality(z)*100).toFixed(0)).join('/') + ' umid ' + [0,1,2,3,4].map(z => { const [a,b]=s.forest.zoneRange(z); let m=0; for (let i=a;i<b;i++) m+=s.forest.moist[i]; return (m/(b-a)).toFixed(2); }).join('/') + ' fans=' + s.machines.filter(m=>m.kind==='fan').map(m=>Math.round(m.x)).join(','));
    if (log && t % 120 === 0) say(`tick clouds=${s.clouds.clouds.length} rain/s=${s.rates.rain.toFixed(2)} seeds: feitas=${s.stats.seedsMade.toFixed(0)} solo=${s.stats.seedsRained.toFixed(0)} perdidas=${s.stats.seedsWasted.toFixed(0)} cobertura=${(s.forest.coverage * 100).toFixed(0)}% estágio=${s.creature.stage}`);
  }
  return { s, t, events, awakenAt };
}

describe('level 1 playthrough', () => {
  it('the forest grows from seeds and rain, the Ancient rises from it and completes the level', () => {
    const { s, t, events, awakenAt } = playLevel1(true);
    console.log(events.join('\n'));
    expect(awakenAt).toBeGreaterThan(600);  // the forest takes real work
    expect(s.climate.won).toBe(true);
    expect(t).toBeLessThan(3600);
    expect(t).toBeGreaterThan(900);        // not trivially short
  }, 120000);
});
