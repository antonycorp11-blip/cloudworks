// The Ancients: immobile creatures rooted in each destination. Rain feeds them; they grow, get thirstier and talk.

export type Mood = 'sleeping' | 'starving' | 'thirsty' | 'content' | 'euphoric';

export interface CreatureDef {
  name: string;
  title: string;
  /** cumulative effective litres needed to reach stage 1..N (last = final form).
   *  Stage 1 is reached by the forest itself (the Ancient rises from it), so needs[0] is the growth it starts with. */
  needs: number[];
  skin: { stone: string; stoneLight: string; moss: string; eye: string };
}

/** One Ancient per biome (same index as BIOMES). */
export const CREATURES: CreatureDef[] = [
  { name: 'Bramo', title: 'o Bebedor de Tempestades', needs: [0, 550, 1450, 2900, 4800], skin: { stone: '#3b3430', stoneLight: '#5a5048', moss: '#4f8a3a', eye: '#ffb347' } },
  { name: 'Ceifa', title: 'a Guardiã dos Campos', needs: [0, 450, 1100, 2100, 3400], skin: { stone: '#4a3c30', stoneLight: '#6a5a46', moss: '#7aa844', eye: '#ffd36a' } },
  { name: 'Ossudo', title: 'o Rei da Savana Seca', needs: [0, 650, 1550, 2900, 4700], skin: { stone: '#5a4030', stoneLight: '#7a5a40', moss: '#94a848', eye: '#ff8a3a' } },
  { name: 'Granito', title: 'o Pico que Dorme', needs: [0, 1000, 2350, 4250, 6700], skin: { stone: '#4a4a52', stoneLight: '#6e6e78', moss: '#5a9a5a', eye: '#8ad8ff' } },
  { name: 'Duna', title: 'a Sede sem Fim', needs: [0, 1700, 3800, 6900, 11000], skin: { stone: '#7a5a3a', stoneLight: '#a07a50', moss: '#8a9c46', eye: '#ffe06a' } },
  { name: 'Brasa', title: 'o Coração de Cinzas', needs: [0, 2700, 6050, 10700, 16800], skin: { stone: '#2a2020', stoneLight: '#4a3632', moss: '#5c8c48', eye: '#ff5a2a' } },
];

export const MOOD_LABEL: Record<Mood, string> = {
  sleeping: 'Dormente', starving: 'Faminta', thirsty: 'Sedenta', content: 'Satisfeita', euphoric: 'Eufórica',
};

/** credit multiplier: a happy Ancient rewards you better */
export const MOOD_MUL: Record<Mood, number> = { sleeping: 1, starving: 0.75, thirsty: 1, content: 1.15, euphoric: 1.35 };

export type LineKind = 'wake' | 'stage' | 'final' | 'starving' | 'thirsty' | 'content' | 'euphoric' | 'missed' | 'lightning' | 'storm' | 'idle' | 'sleeping';

export const LINES: Record<LineKind, string[]> = {
  sleeping: [
    'Zzz… seca… sempre a seca… zzz…',
    'Zzz… cem anos… sem uma gota… zzz…',
  ],
  wake: [
    'Hm…? Água? Depois de um século de poeira… QUEM OUSA ME ACORDAR? …Faça de novo.',
  ],
  stage: [
    'Sinto meus ossos rangendo. Estou CRESCENDO. E com mais sede.',
    'Minhas raízes tocaram o rio morto. Ele ainda lembra de mim.',
    'Estou mais alto que as suas chaminés, engenheiro. Alimente à altura.',
    'Cresço, logo bebo. Bebo, logo cresço. Entendeu o problema?',
  ],
  final: [
    'Agora sou grande o bastante para chamar a chuva sozinho. Vá, pequeno engenheiro. Outros como eu ainda dormem.',
  ],
  starving: [
    'Vocês chamam ISSO de chuva?',
    'Minha garganta é um deserto. Tragam tempestades.',
    'Se eu pudesse andar, iria eu mesmo buscar. Não posso. Então ANDEM.',
    'Estou secando de novo… e fico de mau humor quando seco.',
  ],
  thirsty: [
    'Uma gota aqui, outra ali… sou uma montanha, não um vaso de planta.',
    'Suas caldeiras cospem fumaça. Eu queria nuvens.',
    'Mais. Eu sei que você consegue mais.',
  ],
  content: [
    'Hmm. Aceitável.',
    'O som da chuva… quase tinha esquecido.',
    'Continue. Não pare. Nunca pare.',
    'O musgo voltou às minhas costas. Faz cócegas.',
  ],
  euphoric: [
    'SIM! TROVÕES! MAIS TROVÕES!',
    'A floresta canta de novo. Eu canto junto. Mal, mas canto.',
    'Afogue-me em tempestades, engenheiro! HA!',
  ],
  missed: [
    'Isso caiu LONGE de mim.',
    'Errou. Eu fico aqui, ó. Literalmente sempre aqui.',
    'Está regando pedras? Eu SOU a pedra que importa.',
  ],
  lightning: [
    'Ahh… esse estalo nos dentes.',
    'Raios! Lembram da minha juventude.',
  ],
  storm: [
    'Vejo uma nuvem gorda chegando… venha… venha…',
    'Que bela tempestade você fabricou. Traga para cá.',
  ],
  idle: [
    'Silêncio demais. Prefiro o barulho das suas caldeiras.',
    'Não posso me mexer, sabe. Tenho tempo de sobra para reclamar.',
  ],
};
