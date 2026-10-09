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

const pipeTo = (s: Sim, k: string, fluid: 'water' | 'steam' | 'seed') =>
  s.pipes.some(p => p.fluid === fluid && s.byId.get(p.to.m)?.kind === k);
const life = (s: Sim) => s.forest.vitality;

export const MISSIONS: MissionDef[] = [
  { id: 'bellows', tutorial: true, text: 'Atice o fogo da caldeira', hint: 'Segure o dedo sobre a caldeira — o fole aviva as chamas e solta vapor.', reward: 1, check: s => s.stats.steam > 3 },
  { id: 'throw', tutorial: true, text: 'Faça chover sobre a terra seca', hint: 'Arraste a nuvem e solte com força para a direita, até passar das bandeiras →', reward: 2, check: s => s.firstRain },
  { id: 'seed', tutorial: true, text: 'Semeie uma nuvem', hint: 'Toque numa nuvem e aperte “Semear”. Chuva sem sementes só molha a poeira.', reward: 2, check: s => s.stats.seededByHand > 0 },
  { id: 'sprout', tutorial: true, text: 'Faça a terra brotar', hint: 'A nuvem semeada precisa chover entre as bandeiras. Semente em solo seco morre — chova de novo no mesmo lugar.', reward: 3, check: s => s.forest.sprouted },
  { id: 'refill', tutorial: true, text: 'Reabasteça a caldeira', hint: 'Toque no mar para encher o balde, depois toque na caldeira.', reward: 1, check: s => s.stats.pumped > 25 },
  { id: 'pump', tutorial: true, text: 'Construa uma bomba no mar', hint: 'Oficina → Bomba hidráulica. Ela só funciona sobre a água.', reward: 3, check: s => has(s, 'pump') || has(s, 'pump_hp') },
  { id: 'pipe', tutorial: true, text: 'Ligue a bomba à caldeira', hint: 'Tubos: arraste da saída azul da bomba até a entrada da caldeira.', reward: 3, check: s => pipeFrom(s, 'pump', 'water') },
  { id: 'upgrade', tutorial: true, text: 'Compre uma melhoria', hint: 'Abra a Árvore e pesquise Alimentação contínua: o fogo nunca mais apaga.', reward: 3, check: s => Object.keys(s.tree).length > 1 },
  { id: 'greenhouse', text: 'Construa uma Estufa', hint: 'Árvore › Floresta › Estufa. A bolsa de sementes não basta para uma floresta inteira.', reward: 4, check: s => has(s, 'greenhouse') },
  { id: 'gh_feed', text: 'Alimente a Estufa com vapor e água', hint: 'Ligue a saída branca de uma caldeira e uma linha de água na Estufa. Atenção: o vapor que vai para a Estufa não vira nuvem!', reward: 5, check: s => s.stats.seedsMade >= 1 },
  { id: 'seeder', text: 'Ligue a Estufa a um Semeador', hint: 'Pesquise o Semeador e ponha-o debaixo do caminho das nuvens. Tubo verde: da saída da Estufa até ele.', reward: 6, check: s => pipeTo(s, 'seeder', 'seed') && s.stats.seedsShot >= 1 },
  { id: 'life15', text: 'Leve a vida da terra a 15%', hint: 'Espalhe a chuva semeada por toda a terra — as parcelas mais distantes também contam.', reward: 6, check: s => life(s) >= 0.15 },
  { id: 'merge', text: 'Funda duas nuvens', hint: 'Jogue uma nuvem contra outra — elas se unem numa maior.', reward: 3, check: s => s.stats.merges >= 1 },
  { id: 'industrial', text: 'Construa uma caldeira industrial', hint: 'Uma caldeira para o céu, outra para a Estufa. Pesquise-a na Árvore (ramo Vapor).', reward: 6, check: s => has(s, 'boiler_ind') },
  { id: 'condenser', text: 'Ligue um condensador por tubo de vapor', hint: 'Pesquise o Condensador e ligue a saída branca da caldeira nele.', reward: 8, check: s => pipeTo(s, 'condenser', 'steam') },
  { id: 'life30', text: 'Leve a vida da terra a 30%', hint: 'Ventiladores sobre a terra levam a chuva às parcelas do fundo. Plantas maduras espalham sementes sozinhas.', reward: 10, check: s => life(s) >= 0.3 },
  { id: 'heart', text: 'Faça o coração virar árvore', hint: 'A Semente-Mãe só vira árvore no meio de uma floresta viva. Chova sobre ela e ao redor dela.', reward: 12, check: s => s.forest.heartLife >= 2.8 || s.creature.awake },
  { id: 'awaken', text: 'Desperte a floresta', hint: 'Vida da terra na meta e o coração de pé: a floresta inteira vai se levantar.', reward: 15, check: s => s.creature.awake },
  { id: 'stage3', text: 'Faça {C} crescer (estágio 3)', hint: 'Agora a chuva que cai sobre o corpo dele o alimenta. E a floresta ainda precisa de água.', reward: 15, check: s => s.creature.stage >= 3 },
  { id: 'storm', text: 'Forme uma nuvem de 40 L', hint: 'Junte vapor e fusões. Nuvens gigantes trazem tempestades.', reward: 12, check: s => s.clouds.clouds.some(c => c.mass >= 40) },
  { id: 'stage4', text: 'Leve {C} ao estágio 4', hint: 'Cada estágio dá mais sede — a ele e à floresta. Escale a fábrica para acompanhar.', reward: 18, check: s => s.creature.stage >= 4 },
];

export function activeMissions(s: Sim) {
  return MISSIONS.filter(m => !m.tutorial || s.biomeIndex === 0);
}
