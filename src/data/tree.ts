// The Engineering Tree: a real node graph. Nodes either level up a modifier, unlock machines
// (research — permanent across biomes) or buy permanent tech with patents.
import type { MachineKind } from './machines';
import type { ModKey, PermKey } from './upgrades';

export type Branch = 'core' | 'hydraulics' | 'steam' | 'clouds' | 'transport' | 'creature' | 'legacy';

export interface TreeNode {
  id: string;
  name: string;
  desc: string;
  icon: string;
  branch: Branch;
  x: number;               // layout grid units (root at 0,0)
  y: number;
  requires: string[];      // all must have level ≥ 1
  mod?: ModKey;            // levels a modifier (resets each biome)
  unlock?: MachineKind[];  // research: permanent across biomes
  perm?: PermKey;          // permanent tech bought with patents
  cost?: number;           // for unlock nodes (credits) / perm nodes (patents)
}

/** machines you can build without any research */
export const STARTER: MachineKind[] = ['pump', 'boiler', 'fan'];

export const BRANCHES: Record<Branch, { name: string; color: string; icon: string }> = {
  core: { name: 'Oficina', color: '#f2d27e', icon: 'build' },
  hydraulics: { name: 'Hidráulica', color: '#5ab4e8', icon: 'drop' },
  steam: { name: 'Vapor', color: '#ff8a3a', icon: 'fire' },
  clouds: { name: 'Nuvens', color: '#cfd8ea', icon: 'cloud' },
  transport: { name: 'Transporte', color: '#7ad8c0', icon: 'wind' },
  creature: { name: 'Criatura', color: '#9ae86a', icon: 'eye' },
  legacy: { name: 'Legado', color: '#c89cff', icon: 'star' },
};

export const TREE: TreeNode[] = [
  { id: 'core', name: 'Oficina da Seca', desc: 'Um balde, uma caldeira remendada e muita teimosia. Tudo começa aqui.', icon: 'build', branch: 'core', x: 0, y: 0, requires: [] },

  // ── Hidráulica (left) ──
  { id: 'h_pump', name: 'Vazão das bombas', desc: 'Bombas puxam mais água do mar.', icon: 'pump', branch: 'hydraulics', x: -1.2, y: 0.2, requires: ['core'], mod: 'pumpRate' },
  { id: 'h_bucket', name: 'Balde maior', desc: 'Cada coleta manual traz mais água.', icon: 'bucket', branch: 'hydraulics', x: -1, y: 1.3, requires: ['core'], mod: 'bucket' },
  { id: 'h_reservoir', name: 'Reservatórios', desc: 'Pesquisa: tanques para armazenar água e alimentar várias linhas.', icon: 'tank', branch: 'hydraulics', x: -2.4, y: 0, requires: ['h_pump'], unlock: ['reservoir'], cost: 50 },
  { id: 'h_pipes', name: 'Tubulação larga', desc: 'Tubos conduzem mais litros por segundo.', icon: 'pipe', branch: 'hydraulics', x: -2.3, y: 1.2, requires: ['h_pump'], mod: 'pipeCap' },
  { id: 'h_helper', name: 'Ajudante com balde', desc: 'Um ajudante carrega baldes do mar até a caldeira rudimentar.', icon: 'bucket', branch: 'hydraulics', x: -1.9, y: 2.3, requires: ['h_bucket'], mod: 'helper' },
  { id: 'h_split', name: 'Divisores e válvulas', desc: 'Pesquisa: divida e controle o fluxo entre linhas.', icon: 'valve', branch: 'hydraulics', x: -3.6, y: -0.3, requires: ['h_reservoir'], unlock: ['splitter', 'valve'], cost: 60 },
  { id: 'h_head', name: 'Pressão', desc: 'Bombas e reservatórios empurram água mais alto.', icon: 'gauge', branch: 'hydraulics', x: -3.5, y: 1.1, requires: ['h_pipes'], mod: 'pumpHead' },
  { id: 'h_storage', name: 'Armazenamento', desc: 'Reservatórios e tanques comportam mais.', icon: 'tank', branch: 'hydraulics', x: -4.8, y: -0.4, requires: ['h_split'], mod: 'storage' },
  { id: 'h_hp', name: 'Bomba de alta pressão', desc: 'Pesquisa: vazão enorme e pressão para vencer alturas.', icon: 'pump', branch: 'hydraulics', x: -4.7, y: 1.1, requires: ['h_head'], unlock: ['pump_hp'], cost: 380 },
  { id: 'h_smart', name: 'Válvulas inteligentes', desc: 'Válvulas priorizam as máquinas mais vazias.', icon: 'valve', branch: 'hydraulics', x: -5.9, y: 0.3, requires: ['h_storage', 'h_hp'], mod: 'smartValves' },

  // ── Vapor (upper left) ──
  { id: 's_stoke', name: 'Alimentação contínua', desc: 'O fogo das caldeiras rudimentares nunca apaga.', icon: 'fire', branch: 'steam', x: -0.9, y: -1.1, requires: ['core'], mod: 'autoStoke' },
  { id: 's_rate', name: 'Produção de vapor', desc: 'Caldeiras evaporam mais água por segundo.', icon: 'steam', branch: 'steam', x: -1.9, y: -1.7, requires: ['s_stoke'], mod: 'boilerRate' },
  { id: 's_ind', name: 'Caldeira industrial', desc: 'Pesquisa: fogo automático e três vezes mais vapor.', icon: 'boiler', branch: 'steam', x: -1.5, y: -2.9, requires: ['s_stoke'], unlock: ['boiler_ind'], cost: 140 },
  { id: 's_heat', name: 'Aquecimento rápido', desc: 'Atinge a temperatura mais rápido; o fogo dura mais.', icon: 'gauge', branch: 'steam', x: -3.1, y: -1.9, requires: ['s_rate'], mod: 'heatSpeed' },
  { id: 's_cond', name: 'Condensador', desc: 'Pesquisa: vapor por tubo vira nuvem com muito menos perda.', icon: 'cond', branch: 'steam', x: -2.6, y: -3.6, requires: ['s_ind'], unlock: ['condenser'], cost: 200 },
  { id: 's_cap', name: 'Capacidade das caldeiras', desc: 'Caldeiras armazenam mais água.', icon: 'tank', branch: 'steam', x: -4.2, y: -2.4, requires: ['s_heat'], mod: 'boilerCap' },
  { id: 's_eff', name: 'Eficiência de condensação', desc: 'Mais vapor vira nuvem.', icon: 'cond', branch: 'steam', x: -3.8, y: -3.8, requires: ['s_cond'], mod: 'condenseEff' },

  // ── Nuvens (up) ──
  { id: 'c_form', name: 'Formação', desc: 'Mais massa de nuvem por litro de vapor liberado ao ar.', icon: 'cloud', branch: 'clouds', x: 0.1, y: -1.4, requires: ['core'], mod: 'formation' },
  { id: 'c_absorb', name: 'Absorção', desc: 'Nuvens captam vapor de mais longe e crescem mais.', icon: 'cloud', branch: 'clouds', x: -0.3, y: -2.6, requires: ['c_form'], mod: 'absorb' },
  { id: 'c_precip', name: 'Precipitação', desc: 'Nuvens maduras chovem com mais intensidade.', icon: 'rain', branch: 'clouds', x: 0.9, y: -2.6, requires: ['c_form'], mod: 'precip' },
  { id: 'c_fusion', name: 'Fusão', desc: 'Nuvens se fundem a maiores distâncias.', icon: 'cloud', branch: 'clouds', x: -0.6, y: -3.9, requires: ['c_absorb'], mod: 'fusion' },
  { id: 'c_divider', name: 'Divisor atmosférico', desc: 'Pesquisa: ioniza o ar e divide nuvens gigantes em duas.', icon: 'bolt', branch: 'clouds', x: 0.6, y: -4.2, requires: ['c_fusion', 'c_precip'], unlock: ['divider'], cost: 700 },

  // ── Transporte (right) ──
  { id: 't_power', name: 'Potência do vento', desc: 'Ventiladores sopram mais forte.', icon: 'wind', branch: 'transport', x: 1.2, y: -0.4, requires: ['core'], mod: 'fanPower' },
  { id: 't_platform', name: 'Andaimes', desc: 'Pesquisa: plataformas para construir em altura.', icon: 'platform', branch: 'transport', x: 1.3, y: 0.9, requires: ['core'], unlock: ['platform'], cost: 25 },
  { id: 't_range', name: 'Alcance do vento', desc: 'Correntes de ar chegam mais longe.', icon: 'wind', branch: 'transport', x: 2.5, y: -0.9, requires: ['t_power'], mod: 'fanRange' },
  { id: 't_ind', name: 'Ventilador industrial', desc: 'Pesquisa: desloca nuvens maiores, com mais alcance.', icon: 'fan', branch: 'transport', x: 2.3, y: 0.4, requires: ['t_power'], unlock: ['fan_ind'], cost: 260 },
  { id: 't_aero', name: 'Aerodinâmica', desc: 'Nuvens respondem mais rápido ao vento e evaporam menos.', icon: 'wind', branch: 'transport', x: 3.7, y: -1.2, requires: ['t_range'], mod: 'aero' },
  { id: 't_turbine', name: 'Turbina direcional', desc: 'Pesquisa: corrente de ar fortíssima e longa.', icon: 'fan', branch: 'transport', x: 3.6, y: 0.3, requires: ['t_ind'], unlock: ['turbine'], cost: 2200 },

  // ── Criatura (down) ──
  { id: 'k_roots', name: 'Raízes profundas', desc: 'A Criatura aproveita mais cada litro: cresce mais rápido.', icon: 'leaf', branch: 'creature', x: 0.2, y: 1.5, requires: ['core'], mod: 'rootDepth' },
  { id: 'k_song', name: 'Canção da chuva', desc: 'Satisfeita, a Criatura recompensa ainda mais.', icon: 'eye', branch: 'creature', x: 1.3, y: 2.4, requires: ['k_roots'], mod: 'lullaby' },
  { id: 'k_patience', name: 'Paciência ancestral', desc: 'A sede da Criatura cresce mais devagar.', icon: 'drop', branch: 'creature', x: -0.4, y: 2.7, requires: ['k_roots'], mod: 'patience' },

  // ── Legado (patents, permanent) ──
  { id: 'p_credits', name: 'Investidores climáticos', desc: 'Permanente: +150 créditos iniciais por nível em cada bioma.', icon: 'coin', branch: 'legacy', x: 0.6, y: 3.9, requires: ['k_song'], perm: 'startCredits', cost: 1 },
  { id: 'p_pump', name: 'Kit hidráulico', desc: 'Permanente: começa cada bioma com uma bomba ligada à caldeira.', icon: 'pump', branch: 'legacy', x: -0.9, y: 3.9, requires: ['k_patience'], perm: 'starterPump', cost: 1 },
  { id: 'p_eff', name: 'Engenharia refinada', desc: 'Permanente: +10% em vapor e vento.', icon: 'gauge', branch: 'legacy', x: 2.0, y: 3.5, requires: ['p_credits'], perm: 'globalEff', cost: 2 },
  { id: 'p_ind', name: 'Herança industrial', desc: 'Permanente: começa com caldeira industrial e condensador.', icon: 'boiler', branch: 'legacy', x: -2.2, y: 3.6, requires: ['p_pump'], perm: 'industrialStart', cost: 3 },
  { id: 'p_meteo', name: 'Meteorologia', desc: 'Permanente: nuvens perdem menos água por evaporação.', icon: 'cloud', branch: 'legacy', x: 0, y: 5, requires: ['p_credits', 'p_pump'], perm: 'windMastery', cost: 2 },
];

export const NODE = Object.fromEntries(TREE.map(n => [n.id, n])) as Record<string, TreeNode>;
