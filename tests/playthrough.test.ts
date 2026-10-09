import { describe, expect, it } from 'vitest';
import { Sim, STEP } from '../src/sim/sim';
import type { Machine } from '../src/sim/types';

/**
 * A scripted player for level 1: starts by hand, buys a pump, automates stoking,
 * then builds an industrial line (boiler + condenser) with fans. Must win in reasonable time.
 */
function playLevel1(log = false) {
  const s = new Sim(0);
  const boiler = s.machines.find(m => m.kind === 'boiler')!;
  const condY = s.biome.groundBase - s.biome.condAlt;
  let pump: Machine | null = null;
  let ind: Machine | null = null;
  let cond: Machine | null = null;
  let pump2: Machine | null = null;
  let fans = 0;
  const events: string[] = [];
  let t = 0;
  const say = (x: string) => { events.push(`${Math.round(t)}s ${x} | ₵${Math.round(s.credits)} H=${s.climate.humidity.toFixed(1)}`); };

  while (t < 1800 && !s.climate.won) {
    // manual play: one bucket every ~3 s and keep the fire going (until automated)
    if (!pump && Math.round(t) % 3 === 0) { s.fillBucket(); s.pourBucket(boiler); }
    if (s.mods.lvl('autoStoke') === 0 && boiler.fire < 2 && boiler.water > 1) s.stoke(boiler);

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
        // move the starter fan behind the condenser plume so clouds leave before they get too heavy
        const f = s.machines.find(m => m.kind === 'fan')!;
        s.move(f.id, cond.x - 110, condY - 20, 0, false);
        say('condenser');
      }
    }
    if (cond && !pump2 && s.credits >= 50) {
      pump2 = s.build('pump', 320, 0).machine ?? null;
      if (pump2) { s.connect({ m: pump2.id, port: 'out' }, { m: ind!.id, port: 'in' }); say('pump2'); }
    }
    fans = s.machines.filter(m => m.kind === 'fan').length;
    if (pump2 && fans < 3 && s.credits >= 35) {
      const x = Math.min(980 + (fans - 1) * 260, s.rootLimit() - 60);
      const f = x > 900 ? s.build('fan', x, condY - 20, 0).machine : null;
      if (f) say('fan');
    }
    if (pump2 && fans >= 2) {
      if (s.nodeState('k_roots') !== 'maxed' && s.nodeState('k_roots') !== 'locked' && s.credits >= s.nodeCost('k_roots') + 20) { s.research('k_roots'); say('research roots'); }
      for (const k of ['boilerRate', 'pumpRate', 'fanPower', 'precip'] as const) {
        if (s.credits >= s.upgradeCost(k) + 20) { s.buyUpgrade(k); say(`up ${k}`); }
      }
    }
    for (let i = 0; i < 1 / STEP; i++) s.step();
    t++;
    if (log && t % 60 === 0) say(`tick clouds=${s.clouds.clouds.length} rain/s=${s.rates.rain.toFixed(2)} lost=${s.stats.lost.toFixed(0)} wasted=${s.stats.rainWasted.toFixed(0)}`);
  }
  return { s, t, events };
}

describe('level 1 playthrough', () => {
  it('can be completed by starting manually and automating', () => {
    const { s, t, events } = playLevel1(true);
    console.log(events.join('\n'));
    expect(s.climate.won).toBe(true);
    expect(t).toBeLessThan(1500);
    expect(t).toBeGreaterThan(420); // not trivially short
  }, 60000);
});
