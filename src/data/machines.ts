// Data-driven machine catalogue. Ports are in local coords relative to the machine's
// bottom-center (y negative = up). Mirrored machines negate port x.

export type Fluid = 'water' | 'steam';
export type MachineKind =
  | 'pump' | 'pump_hp' | 'reservoir' | 'valve' | 'splitter'
  | 'boiler' | 'boiler_ind' | 'condenser'
  | 'fan' | 'fan_ind' | 'turbine'
  | 'platform' | 'divider';

export interface PortDef { id: string; fluid: Fluid; dir: 'in' | 'out'; x: number; y: number }

export type Placement = 'ground' | 'water' | 'mast' | 'free';
export type Category = 'water' | 'steam' | 'cloud' | 'wind' | 'struct';

export interface MachineDef {
  kind: MachineKind;
  name: string;
  desc: string;
  cost: number;
  w: number;
  h: number;
  category: Category;
  placement: Placement;
  ports: PortDef[];
  rotatable?: boolean;     // free 360° rotation (wind machines)
  regionB?: boolean;       // may be built in the transport region
  unlockLevel?: number;    // biome index where it becomes available
  /** where vapor is released (local), for emitters */
  vent?: { x: number; y: number };
}

export const MACHINES: Record<MachineKind, MachineDef> = {
  pump: {
    kind: 'pump', name: 'Bomba hidráulica', desc: 'Puxa água do mar automaticamente. Deve ficar sobre a água.',
    cost: 25, w: 40, h: 44, category: 'water', placement: 'water',
    ports: [{ id: 'out', fluid: 'water', dir: 'out', x: 24, y: -30 }],
  },
  pump_hp: {
    kind: 'pump_hp', name: 'Bomba de alta pressão', desc: 'Grande vazão e pressão para vencer alturas.',
    cost: 450, w: 54, h: 58, category: 'water', placement: 'water',
    ports: [{ id: 'out', fluid: 'water', dir: 'out', x: 31, y: -40 }],
  },
  reservoir: {
    kind: 'reservoir', name: 'Reservatório', desc: 'Armazena água e abastece várias linhas.',
    cost: 60, w: 70, h: 80, category: 'water', placement: 'ground',
    ports: [
      { id: 'in', fluid: 'water', dir: 'in', x: -38, y: -66 },
      { id: 'out', fluid: 'water', dir: 'out', x: 38, y: -12 },
    ],
  },
  valve: {
    kind: 'valve', name: 'Válvula', desc: 'Abre ou fecha o fluxo de uma linha.',
    cost: 15, w: 26, h: 26, category: 'water', placement: 'ground',
    ports: [
      { id: 'in', fluid: 'water', dir: 'in', x: -16, y: -13 },
      { id: 'out', fluid: 'water', dir: 'out', x: 16, y: -13 },
    ],
  },
  splitter: {
    kind: 'splitter', name: 'Divisor hidráulico', desc: 'Divide a água igualmente entre duas linhas.',
    cost: 20, w: 30, h: 30, category: 'water', placement: 'ground',
    ports: [
      { id: 'in', fluid: 'water', dir: 'in', x: -18, y: -15 },
      { id: 'out', fluid: 'water', dir: 'out', x: 18, y: -15 },
      { id: 'out2', fluid: 'water', dir: 'out', x: 0, y: -31 },
    ],
  },
  boiler: {
    kind: 'boiler', name: 'Caldeira rudimentar', desc: 'Ferve água com fogo manual. Segure para atiçar o fogo com o fole.',
    cost: 40, w: 56, h: 60, category: 'steam', placement: 'ground',
    ports: [
      { id: 'in', fluid: 'water', dir: 'in', x: -32, y: -38 },
      { id: 'out', fluid: 'steam', dir: 'out', x: 32, y: -48 },
    ],
    vent: { x: 12, y: -84 },
  },
  boiler_ind: {
    kind: 'boiler_ind', name: 'Caldeira industrial', desc: 'Aquecimento automático e grande produção de vapor.',
    cost: 180, w: 80, h: 90, category: 'steam', placement: 'ground',
    ports: [
      { id: 'in', fluid: 'water', dir: 'in', x: -44, y: -28 },
      { id: 'out', fluid: 'steam', dir: 'out', x: 44, y: -72 },
    ],
    vent: { x: 22, y: -116 },
  },
  condenser: {
    kind: 'condenser', name: 'Condensador', desc: 'Converte vapor em nuvem com alta eficiência, liberando-a mais alto.',
    cost: 140, w: 50, h: 104, category: 'cloud', placement: 'ground',
    ports: [{ id: 'in', fluid: 'steam', dir: 'in', x: -28, y: -22 }],
    vent: { x: 0, y: -112 },
  },
  divider: {
    kind: 'divider', name: 'Divisor atmosférico', desc: 'Ioniza a coluna de ar acima: nuvens grandes se dividem em duas.',
    cost: 900, w: 60, h: 54, category: 'cloud', placement: 'ground', regionB: true,
    ports: [],
  },
  fan: {
    kind: 'fan', name: 'Ventilador básico', desc: 'Corrente de vento fraca. Gire e posicione em qualquer altura.',
    cost: 20, w: 40, h: 40, category: 'wind', placement: 'mast', rotatable: true, regionB: true,
    ports: [],
  },
  fan_ind: {
    kind: 'fan_ind', name: 'Ventilador industrial', desc: 'Desloca nuvens maiores com mais alcance.',
    cost: 350, w: 64, h: 64, category: 'wind', placement: 'mast', rotatable: true, regionB: true,
    ports: [],
  },
  turbine: {
    kind: 'turbine', name: 'Turbina direcional', desc: 'Corrente de ar fortíssima e longa.',
    cost: 2500, w: 92, h: 72, category: 'wind', placement: 'mast', rotatable: true, regionB: true,
    ports: [],
  },
  platform: {
    kind: 'platform', name: 'Plataforma', desc: 'Suporte elevado para construir em altura.',
    cost: 25, w: 140, h: 12, category: 'struct', placement: 'free', regionB: true,
    ports: [],
  },
};

export const SHOP_ORDER: MachineKind[] = [
  'pump', 'reservoir', 'splitter', 'valve', 'pump_hp',
  'boiler', 'boiler_ind', 'condenser',
  'fan', 'fan_ind', 'turbine',
  'divider', 'platform',
];

/** Fan-like wind machine base parameters. */
export const WIND_STATS: Partial<Record<MachineKind, { power: number; range: number; spread: number }>> = {
  fan: { power: 70, range: 380, spread: 0.32 },
  fan_ind: { power: 150, range: 650, spread: 0.34 },
  turbine: { power: 320, range: 1000, spread: 0.28 },
};
