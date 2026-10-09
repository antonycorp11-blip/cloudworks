// Data-driven upgrade tree. Every effect key is read by a simulation system, so
// buying an upgrade changes real behaviour (rates, ranges, radii...).

export type UpgradeCategory = 'hydraulics' | 'steam' | 'clouds' | 'transport' | 'automation' | 'creature';

export type ModKey =
  | 'pumpRate' | 'pumpHead' | 'pipeCap' | 'storage' | 'bucket'
  | 'boilerRate' | 'boilerCap' | 'heatSpeed' | 'condenseEff'
  | 'formation' | 'absorb' | 'fusion' | 'precip'
  | 'fanPower' | 'fanRange' | 'aero'
  | 'autoStoke' | 'helper' | 'smartValves'
  | 'rootDepth' | 'lullaby' | 'patience';

export interface UpgradeDef {
  id: ModKey;
  category: UpgradeCategory;
  name: string;
  desc: string;
  baseCost: number;
  costMult: number;
  max: number;
  /** effect per level; meaning documented in `effectText` */
  per: number;
  effectText: (lvl: number) => string;
  requires?: { id: ModKey; lvl: number };
}

const pct = (per: number) => (l: number) => `+${Math.round(per * l * 100)}%`;

export const UPGRADES: UpgradeDef[] = [
  // Hidráulica
  { id: 'pumpRate', category: 'hydraulics', name: 'Vazão das bombas', desc: 'Bombas puxam mais água por segundo.', baseCost: 60, costMult: 1.7, max: 15, per: 0.3, effectText: pct(0.3) },
  { id: 'pumpHead', category: 'hydraulics', name: 'Pressão', desc: 'Bombas e reservatórios empurram água mais alto.', baseCost: 80, costMult: 1.8, max: 10, per: 0.35, effectText: pct(0.35) },
  { id: 'pipeCap', category: 'hydraulics', name: 'Tubulação larga', desc: 'Tubos conduzem mais litros por segundo.', baseCost: 70, costMult: 1.75, max: 12, per: 0.4, effectText: pct(0.4) },
  { id: 'storage', category: 'hydraulics', name: 'Armazenamento', desc: 'Reservatórios e tanques comportam mais.', baseCost: 90, costMult: 1.8, max: 10, per: 0.5, effectText: pct(0.5) },
  { id: 'bucket', category: 'hydraulics', name: 'Balde maior', desc: 'Cada coleta manual traz mais água.', baseCost: 15, costMult: 1.6, max: 10, per: 1, effectText: l => `+${l * 4} L` },
  // Vapor
  { id: 'boilerRate', category: 'steam', name: 'Produção de vapor', desc: 'Caldeiras evaporam mais água por segundo.', baseCost: 50, costMult: 1.7, max: 15, per: 0.25, effectText: pct(0.25) },
  { id: 'boilerCap', category: 'steam', name: 'Capacidade das caldeiras', desc: 'Caldeiras armazenam mais água.', baseCost: 40, costMult: 1.6, max: 10, per: 0.5, effectText: pct(0.5) },
  { id: 'heatSpeed', category: 'steam', name: 'Aquecimento rápido', desc: 'Caldeiras atingem temperatura mais rápido e o fogo dura mais.', baseCost: 35, costMult: 1.7, max: 8, per: 0.4, effectText: pct(0.4) },
  { id: 'condenseEff', category: 'steam', name: 'Eficiência de condensação', desc: 'Mais vapor vira nuvem (menos perda).', baseCost: 100, costMult: 1.9, max: 8, per: 0.06, effectText: pct(0.06) },
  // Nuvens
  { id: 'formation', category: 'clouds', name: 'Formação', desc: 'Mais massa de nuvem por litro de vapor liberado ao ar livre.', baseCost: 45, costMult: 1.75, max: 10, per: 0.1, effectText: pct(0.1) },
  { id: 'absorb', category: 'clouds', name: 'Absorção', desc: 'Nuvens captam vapor de mais longe e crescem mais.', baseCost: 60, costMult: 1.7, max: 10, per: 0.25, effectText: pct(0.25) },
  { id: 'fusion', category: 'clouds', name: 'Fusão', desc: 'Nuvens se fundem a maiores distâncias.', baseCost: 120, costMult: 1.8, max: 8, per: 0.2, effectText: pct(0.2) },
  { id: 'precip', category: 'clouds', name: 'Precipitação', desc: 'Nuvens maduras chovem com mais intensidade.', baseCost: 80, costMult: 1.75, max: 12, per: 0.25, effectText: pct(0.25) },
  // Transporte
  { id: 'fanPower', category: 'transport', name: 'Potência do vento', desc: 'Ventiladores sopram mais forte.', baseCost: 50, costMult: 1.7, max: 15, per: 0.25, effectText: pct(0.25) },
  { id: 'fanRange', category: 'transport', name: 'Alcance do vento', desc: 'Correntes de ar chegam mais longe.', baseCost: 60, costMult: 1.7, max: 12, per: 0.2, effectText: pct(0.2) },
  { id: 'aero', category: 'transport', name: 'Aerodinâmica', desc: 'Nuvens respondem mais rápido ao vento e perdem menos água no caminho.', baseCost: 90, costMult: 1.8, max: 10, per: 0.2, effectText: pct(0.2) },
  // Automação
  { id: 'autoStoke', category: 'automation', name: 'Alimentação contínua', desc: 'Caldeiras rudimentares mantêm o fogo aceso sozinhas.', baseCost: 40, costMult: 1, max: 1, per: 1, effectText: l => (l ? 'Ativo' : 'Inativo') },
  { id: 'helper', category: 'automation', name: 'Ajudante com balde', desc: 'Um ajudante leva baldes do mar até a caldeira rudimentar mais vazia.', baseCost: 30, costMult: 1.9, max: 8, per: 1, effectText: l => `${l} viagem(ns) a cada 6 s` },
  // Criatura
  { id: 'rootDepth', category: 'creature', name: 'Raízes profundas', desc: 'A Criatura cresce mais com cada litro.', baseCost: 80, costMult: 1.8, max: 8, per: 0.15, effectText: pct(0.15) },
  { id: 'lullaby', category: 'creature', name: 'Canção da chuva', desc: 'Satisfeita, a Criatura paga mais.', baseCost: 120, costMult: 1.85, max: 6, per: 0.12, effectText: pct(0.12) },
  { id: 'patience', category: 'creature', name: 'Paciência ancestral', desc: 'A sede da Criatura cresce mais devagar.', baseCost: 150, costMult: 1.9, max: 6, per: 0.08, effectText: l => `-${Math.round(l * 8)}% sede` },
  { id: 'smartValves', category: 'automation', name: 'Válvulas inteligentes', desc: 'Válvulas abertas só liberam água quando a máquina seguinte precisa, priorizando linhas vazias.', baseCost: 150, costMult: 1, max: 1, per: 1, effectText: l => (l ? 'Ativo' : 'Inativo') },
];

export const UPGRADE_CATEGORIES: { id: UpgradeCategory; name: string; icon: string }[] = [
  { id: 'hydraulics', name: 'Hidráulica', icon: '💧' },
  { id: 'steam', name: 'Vapor', icon: '♨️' },
  { id: 'clouds', name: 'Nuvens', icon: '☁️' },
  { id: 'transport', name: 'Transporte', icon: '🌬️' },
  { id: 'automation', name: 'Automação', icon: '⚙️' },
];

// Permanent technologies (bought with patents earned by completing biomes; persist across levels).
export type PermKey = 'startCredits' | 'starterPump' | 'globalEff' | 'industrialStart' | 'windMastery';
export interface PermDef { id: PermKey; name: string; desc: string; cost: number; max: number }
export const PERMANENT: PermDef[] = [
  { id: 'startCredits', name: 'Investidores climáticos', desc: '+150 créditos iniciais por nível em cada bioma.', cost: 1, max: 5 },
  { id: 'starterPump', name: 'Kit hidráulico', desc: 'Começa cada bioma com uma bomba já ligada à caldeira.', cost: 1, max: 1 },
  { id: 'industrialStart', name: 'Herança industrial', desc: 'A caldeira inicial já é industrial, com condensador.', cost: 3, max: 1 },
  { id: 'globalEff', name: 'Engenharia refinada', desc: '+10% em produção de vapor e potência de vento, para sempre.', cost: 2, max: 5 },
  { id: 'windMastery', name: 'Meteorologia', desc: 'Nuvens perdem 15% menos água por evaporação.', cost: 2, max: 3 },
];
