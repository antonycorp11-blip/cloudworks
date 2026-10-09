// Data-driven biome (level) definitions. Add a new entry to add a new level.
// Coordinates: world units, x grows right, y grows DOWN (screen-like). groundBase is the reference ground line.

export interface Palette {
  /** sky when the land is restored */
  skyTop: string; skyBottom: string;
  /** sky during the drought (start of the level) */
  dryTop: string; dryBottom: string;
  haze: string;
  /** low horizon glow (dying sun behind the storm) */
  glow: string;
  groundDry: string; groundWet: string; dirt: string;
  grassDry: string; grassWet: string;
  farHills: string; nearHills: string; rock: string; water: string;
}

export type Vegetation = 'forest' | 'fields' | 'savanna' | 'alpine' | 'desert' | 'volcanic';

export interface BiomeDef {
  id: string;
  name: string;
  subtitle: string;
  width: number;
  groundBase: number;
  factoryEnd: number;      // the flat, sheltered factory ground ends here (you may still build up to the forest)
  targetStart: number;     // region C
  targetEnd: number;
  /** the sea on the left: x1 is the shoreline, it extends beyond the map edge */
  sea: { x0: number; x1: number; depth: number };
  hills: { amp: number; scale: number; seed: number };
  mountains: { x: number; w: number; h: number }[];
  wind: { base: number; gust: number; gustPeriod: number; shelter: number };
  temp: { factory: number; mid: number; target: number };
  condAlt: number;         // condensation altitude above groundBase
  evap: number;            // cloud evaporation coefficient (per second, scaled by heat)
  humidity: { start: number; base: number; target: number; loss: number; gainPerL: number; stabilize: number };
  creditPerL: number;
  startCredits: number;
  reward: number;          // patents (permanent tech points) on completion
  vegetation: Vegetation;
  /** the land to reforest: soil drying per second, and the forest vitality (0..1) that wakes the Ancient */
  forest: { dry: number; awaken: number };
  palette: Palette;
  intro: string;
}

export const BIOMES: BiomeDef[] = [
  {
    id: 'forest', name: 'Floresta', subtitle: 'Nível 1',
    width: 3800, groundBase: 1100, factoryEnd: 1500, targetStart: 1900, targetEnd: 3400,
    sea: { x0: -4000, x1: 440, depth: 190 },
    hills: { amp: 26, scale: 520, seed: 3 },
    mountains: [],
    wind: { base: 26, gust: 6, gustPeriod: 14, shelter: 0.35 },
    temp: { factory: 26, mid: 20, target: 5 },
    condAlt: 330, evap: 0.0015,
    humidity: { start: 14, base: 12, target: 55, loss: 0.012, gainPerL: 0.2, stabilize: 20 },
    creditPerL: 6, startCredits: 10, reward: 2, vegetation: 'forest', forest: { dry: 0.010, awaken: 0.5 },
    intro: 'Dica: arremesse as nuvens até as bandeiras e semeie-as antes.',
    palette: {
      skyTop: '#132a3a', skyBottom: '#5d8a8a', dryTop: '#0b0f1c', dryBottom: '#38425a', haze: '#3e4a60', glow: '#d0743a',
      groundDry: '#55432f', groundWet: '#2c4a2e', dirt: '#24190f',
      grassDry: '#6e6640', grassWet: '#3f8f4c', farHills: '#232a3c', nearHills: '#171b26', rock: '#4a4844', water: '#2a6a8e',
    },
  },
  {
    id: 'fields', name: 'Campos', subtitle: 'Nível 2',
    width: 4800, groundBase: 1100, factoryEnd: 1600, targetStart: 2900, targetEnd: 4500,
    sea: { x0: -4000, x1: 480, depth: 190 },
    hills: { amp: 40, scale: 700, seed: 11 },
    mountains: [],
    wind: { base: 18, gust: 8, gustPeriod: 18, shelter: 0.4 },
    temp: { factory: 27, mid: 22, target: 14 },
    condAlt: 380, evap: 0.003,
    humidity: { start: 10, base: 10, target: 55, loss: 0.014, gainPerL: 0.14, stabilize: 25 },
    creditPerL: 9, startCredits: 250, reward: 3, vegetation: 'fields', forest: { dry: 0.012, awaken: 0.5 },
    intro: 'Os campos estão mais longe e o ar rouba umidade. Ventiladores mais fortes ajudam.',
    palette: {
      skyTop: '#182c44', skyBottom: '#7a9296', dryTop: '#0d101e', dryBottom: '#424058', haze: '#4a4a62', glow: '#e0a040',
      groundDry: '#5e4a30', groundWet: '#3a5a2a', dirt: '#2a1e12',
      grassDry: '#7e7244', grassWet: '#5aa046', farHills: '#272a3e', nearHills: '#1a1c28', rock: '#555048', water: '#2e709a',
    },
  },
  {
    id: 'savanna', name: 'Savana', subtitle: 'Nível 3',
    width: 5400, groundBase: 1100, factoryEnd: 1600, targetStart: 3400, targetEnd: 5100,
    sea: { x0: -4000, x1: 460, depth: 190 },
    hills: { amp: 30, scale: 600, seed: 21 },
    mountains: [],
    wind: { base: 9, gust: 22, gustPeriod: 22, shelter: 0.5 },
    temp: { factory: 32, mid: 30, target: 22 },
    condAlt: 400, evap: 0.005,
    humidity: { start: 8, base: 8, target: 50, loss: 0.016, gainPerL: 0.1, stabilize: 30 },
    creditPerL: 14, startCredits: 600, reward: 4, vegetation: 'savanna', forest: { dry: 0.016, awaken: 0.48 },
    intro: 'Calor e ventos que mudam de direção. Domine as correntes com sua própria engenharia.',
    palette: {
      skyTop: '#2a1e3a', skyBottom: '#a07a6a', dryTop: '#120c1a', dryBottom: '#4e3448', haze: '#5a3a4a', glow: '#f07a30',
      groundDry: '#6a4a30', groundWet: '#4a5a2a', dirt: '#2e1e14',
      grassDry: '#8a7040', grassWet: '#7aa040', farHills: '#2e2234', nearHills: '#1e1622', rock: '#5a4a42', water: '#2e6a90',
    },
  },
  {
    id: 'mountains', name: 'Montanhas', subtitle: 'Nível 4',
    width: 5800, groundBase: 1100, factoryEnd: 1700, targetStart: 3900, targetEnd: 5500,
    sea: { x0: -4000, x1: 480, depth: 190 },
    hills: { amp: 40, scale: 500, seed: 31 },
    mountains: [{ x: 2700, w: 800, h: 480 }, { x: 3500, w: 500, h: 260 }],
    wind: { base: 20, gust: 10, gustPeriod: 16, shelter: 0.4 },
    temp: { factory: 24, mid: 16, target: 14 },
    condAlt: 380, evap: 0.003,
    humidity: { start: 10, base: 10, target: 55, loss: 0.015, gainPerL: 0.088, stabilize: 30 },
    creditPerL: 20, startCredits: 1200, reward: 5, vegetation: 'alpine', forest: { dry: 0.013, awaken: 0.5 },
    intro: 'Uma cordilheira bloqueia o caminho. As nuvens sobem, esfriam… e chovem cedo demais.',
    palette: {
      skyTop: '#15233e', skyBottom: '#7a8aa8', dryTop: '#0a0e1c', dryBottom: '#3a3e5a', haze: '#4a4c68', glow: '#d06a7a',
      groundDry: '#4e4436', groundWet: '#2e4a36', dirt: '#221c16',
      grassDry: '#6a6448', grassWet: '#4a8a56', farHills: '#22283e', nearHills: '#171a28', rock: '#5a5a66', water: '#2a62a0',
    },
  },
  {
    id: 'desert', name: 'Deserto', subtitle: 'Nível 5',
    width: 7200, groundBase: 1100, factoryEnd: 1800, targetStart: 5200, targetEnd: 7000,
    sea: { x0: -4000, x1: 440, depth: 190 },
    hills: { amp: 60, scale: 400, seed: 41 },
    mountains: [],
    wind: { base: 16, gust: 12, gustPeriod: 20, shelter: 0.5 },
    temp: { factory: 34, mid: 38, target: 30 },
    condAlt: 420, evap: 0.008,
    humidity: { start: 4, base: 4, target: 40, loss: 0.02, gainPerL: 0.048, stabilize: 40 },
    creditPerL: 35, startCredits: 3000, reward: 6, vegetation: 'desert', forest: { dry: 0.022, awaken: 0.45 },
    intro: 'Distância enorme e evaporação brutal. Só tempestades gigantes chegam inteiras.',
    palette: {
      skyTop: '#1e2a48', skyBottom: '#b09a80', dryTop: '#140e1c', dryBottom: '#5a3e4a', haze: '#6a4a4a', glow: '#f0a040',
      groundDry: '#8a6440', groundWet: '#5a5a30', dirt: '#3e2a18',
      grassDry: '#a08450', grassWet: '#7a8a40', farHills: '#3a2836', nearHills: '#281c24', rock: '#6a5440', water: '#3070a0',
    },
  },
  {
    id: 'volcanic', name: 'Região Vulcânica', subtitle: 'Nível 6',
    width: 7800, groundBase: 1100, factoryEnd: 1800, targetStart: 5700, targetEnd: 7600,
    sea: { x0: -4000, x1: 440, depth: 190 },
    hills: { amp: 50, scale: 350, seed: 51 },
    mountains: [{ x: 3800, w: 600, h: 300 }],
    wind: { base: 14, gust: 14, gustPeriod: 12, shelter: 0.5 },
    temp: { factory: 30, mid: 40, target: 36 },
    condAlt: 420, evap: 0.012,
    humidity: { start: 3, base: 3, target: 40, loss: 0.025, gainPerL: 0.032, stabilize: 45 },
    creditPerL: 55, startCredits: 8000, reward: 8, vegetation: 'volcanic', forest: { dry: 0.026, awaken: 0.45 },
    intro: 'Calor extremo. Use toda a tecnologia climática para trazer vida às cinzas.',
    palette: {
      skyTop: '#22182a', skyBottom: '#7a5a5a', dryTop: '#080406', dryBottom: '#3a1414', haze: '#4a1e1a', glow: '#ff4a1a',
      groundDry: '#2e2422', groundWet: '#2a4030', dirt: '#140e0c',
      grassDry: '#4a3a32', grassWet: '#4a7a40', farHills: '#1e1216', nearHills: '#140c0e', rock: '#2e2828', water: '#2e5a88',
    },
  },
];
