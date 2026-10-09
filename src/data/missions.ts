// Short objectives that keep the player moving forward. Data-driven: each has a check over sim state.
import type { Sim } from '../sim/sim';

export interface MissionDef {
  id: string;
  text: string;
  hint: string;
  reward: number;      // in units of the biome's creditPerL (scaled per level)
  tutorial?: boolean;  // only in the first biome
  check: (s: Sim) => boolean;
}

const has = (s: Sim, k: string) => s.machines.some(m => m.kind === k);
const pipeFrom = (s: Sim, k: string, fluid: 'water' | 'steam') =>
  s.pipes.some(p => p.fluid === fluid && s.byId.get(p.from.m)?.kind.startsWith(k));

export const MISSIONS: MissionDef[] = [
  { id: 'bellows', tutorial: true, text: 'Atice o fogo da caldeira', hint: 'Segure o dedo sobre a caldeira — o fole aviva as chamas e solta vapor.', reward: 1, check: s => s.stats.steam > 3 },
  { id: 'throw', tutorial: true, text: 'Acorde {C} com chuva', hint: 'Arraste a nuvem e solte com força na direção de {C} →', reward: 2, check: s => s.firstRain },
  { id: 'refill', tutorial: true, text: 'Reabasteça a caldeira', hint: 'Toque no mar para encher o balde, depois toque na caldeira.', reward: 1, check: s => s.stats.pumped > 25 },
  { id: 'pump', tutorial: true, text: 'Construa uma bomba no mar', hint: 'Construir → Bomba hidráulica. Ela só funciona sobre a água.', reward: 3, check: s => has(s, 'pump') || has(s, 'pump_hp') },
  { id: 'pipe', tutorial: true, text: 'Ligue a bomba à caldeira', hint: 'Tubos: arraste da saída azul da bomba até a entrada da caldeira.', reward: 3, check: s => pipeFrom(s, 'pump', 'water') },
  { id: 'merge', text: 'Funda duas nuvens', hint: 'Jogue uma nuvem contra outra — elas se unem numa maior.', reward: 3, check: s => s.stats.merges >= 1 },
  { id: 'upgrade', tutorial: true, text: 'Compre uma melhoria', hint: 'Abra a Árvore e pesquise Alimentação contínua: o fogo nunca mais apaga.', reward: 3, check: s => Object.keys(s.tree).length > 1 },
  { id: 'stage2', text: 'Faça {C} crescer (estágio 2)', hint: 'Ela só cresce bem quando não está faminta. Mantenha a chuva constante.', reward: 5, check: s => s.creature.stage >= 2 },
  { id: 'industrial', text: 'Construa uma caldeira industrial', hint: 'Pesquise-a na Árvore (ramo Vapor) e construa na Oficina.', reward: 6, check: s => has(s, 'boiler_ind') },
  { id: 'condenser', text: 'Ligue um condensador por tubo de vapor', hint: 'Pesquise o Condensador e ligue a saída branca da caldeira nele.', reward: 8, check: s => pipeFrom(s, 'boiler', 'steam') && has(s, 'condenser') },
  { id: 'storm', text: 'Forme uma nuvem de 40 L', hint: 'Junte vapor e fusões. Nuvens gigantes trazem tempestades.', reward: 10, check: s => s.clouds.clouds.some(c => c.mass >= 40) },
  { id: 'rain500', text: 'Entregue 500 L de chuva', hint: 'Escala! Mais bombas, caldeiras e uma cadeia de ventiladores.', reward: 12, check: s => s.stats.rainTarget >= 500 },
  { id: 'stage4', text: 'Leve {C} ao estágio 4', hint: 'Cada estágio dá mais sede. Escale a fábrica para acompanhar.', reward: 15, check: s => s.creature.stage >= 4 },
];

export function activeMissions(s: Sim) {
  return MISSIONS.filter(m => !m.tutorial || s.biomeIndex === 0);
}
