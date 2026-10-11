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
  /** final: forest vitality the land must reach before the Ancient can take its final form */
  forest: { dry: number; awaken: number; final: number };
  palette: Palette;
  intro: string;
}

export const BIOMES: BiomeDef[] = [
  {
    id: 'forest', name: 'Floresta', subtitle: 'Nível 1',
    width: 4900, groundBase: 1100, factoryEnd: 1500, targetStart: 1900, targetEnd: 4400,
    sea: { x0: -4000, x1: 440, depth: 190 },
    hills: { amp: 26, scale: 520, seed: 3 },
    mountains: [],
    wind: { base: 26, gust: 6, gustPeriod: 14, shelter: 0.35 },
    temp: { factory: 26, mid: 20, target: 5 },
    condAlt: 330, evap: 0.0015,
    humidity: { start: 14, base: 12, target: 55, loss: 0.012, gainPerL: 0.2, stabilize: 20 },
    creditPerL: 6, startCredits: 10, reward: 2, vegetation: 'forest', forest: { dry: 0.010, awaken: 0.5, final: 0.7 },
    intro: 'Dica: arremesse as nuvens até as bandeiras e semeie-as antes.',
    palette: {
      skyTop: '#3d7fd6', skyBottom: '#a9e0ff', dryTop: '#3a2f7a', dryBottom: '#f09a5e', haze: '#d98f8f', glow: '#ffb35c',
      groundDry: '#c08850', groundWet: '#8a5a32', dirt: '#6e4528',
      grassDry: '#c9b25a', grassWet: '#41c64f', farHills: '#7d8fd0', nearHills: '#56659e', rock: '#8a8a99', water: '#2f8fe8',
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
    creditPerL: 9, startCredits: 250, reward: 3, vegetation: 'fields', forest: { dry: 0.012, awaken: 0.5, final: 0.7 },
    intro: 'Os campos estão mais longe e o ar rouba umidade. Ventiladores mais fortes ajudam.',
    palette: {
      skyTop: '#4a8ee0', skyBottom: '#bfe6ff', dryTop: '#43306e', dryBottom: '#f5b060', haze: '#e0a080', glow: '#ffc65a',
      groundDry: '#c99a58', groundWet: '#90623a', dirt: '#74502e',
      grassDry: '#d4c060', grassWet: '#6fd04a', farHills: '#8a9ad0', nearHills: '#6070a8', rock: '#90909a', water: '#3a96e8',
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
    creditPerL: 14, startCredits: 600, reward: 4, vegetation: 'savanna', forest: { dry: 0.016, awaken: 0.48, final: 0.7 },
    intro: 'Calor e ventos que mudam de direção. Domine as correntes com sua própria engenharia.',
    palette: {
      skyTop: '#4a86d8', skyBottom: '#ffd9a8', dryTop: '#5a2a6a', dryBottom: '#ff9a50', haze: '#f09070', glow: '#ff8a3a',
      groundDry: '#c97a48', groundWet: '#9a6a3a', dirt: '#7a4a2a',
      grassDry: '#d8b050', grassWet: '#9ad04a', farHills: '#b08ab8', nearHills: '#7a6090', rock: '#9a8070', water: '#3a90e0',
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
    creditPerL: 20, startCredits: 1200, reward: 5, vegetation: 'alpine', forest: { dry: 0.013, awaken: 0.5, final: 0.7 },
    intro: 'Uma cordilheira bloqueia o caminho. As nuvens sobem, esfriam… e chovem cedo demais.',
    palette: {
      skyTop: '#3a78d0', skyBottom: '#b8e0ff', dryTop: '#2a3070', dryBottom: '#d88aa8', haze: '#a8a0c8', glow: '#ff9aa8',
      groundDry: '#a08060', groundWet: '#6a5a3e', dirt: '#5a4630',
      grassDry: '#b0a868', grassWet: '#4ab86a', farHills: '#8aa0d8', nearHills: '#5a6aa8', rock: '#9a9aae', water: '#3a8ae0',
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
    creditPerL: 35, startCredits: 3000, reward: 6, vegetation: 'desert', forest: { dry: 0.022, awaken: 0.45, final: 0.7 },
    intro: 'Distância enorme e evaporação brutal. Só tempestades gigantes chegam inteiras.',
    palette: {
      skyTop: '#4a90e0', skyBottom: '#ffe2b0', dryTop: '#5a3060', dryBottom: '#ffb060', haze: '#f0b080', glow: '#ffc040',
      groundDry: '#e0b070', groundWet: '#b08850', dirt: '#9a6a3a',
      grassDry: '#e0c070', grassWet: '#a8c050', farHills: '#d0a090', nearHills: '#a07070', rock: '#b09070', water: '#3a98e8',
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
    creditPerL: 55, startCredits: 8000, reward: 8, vegetation: 'volcanic', forest: { dry: 0.026, awaken: 0.45, final: 0.7 },
    intro: 'Calor extremo. Use toda a tecnologia climática para trazer vida às cinzas.',
    palette: {
      skyTop: '#5a70c0', skyBottom: '#f0b0a0', dryTop: '#3a1028', dryBottom: '#e0503a', haze: '#a04050', glow: '#ff6a2a',
      groundDry: '#6a4a44', groundWet: '#4a5a3a', dirt: '#3e2c2a',
      grassDry: '#8a6a52', grassWet: '#5ab04a', farHills: '#80506a', nearHills: '#5a3048', rock: '#6a6068', water: '#3a80d0',
    },
  },
];
