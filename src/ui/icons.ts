// Hand-made 12×12 pixel icons rendered as crisp inline SVG (no emoji, no image files).
const PAL: Record<string, string> = {
  k: '#160f0c', b: '#e2b24e', B: '#8a6224', y: '#ffe28a', s: '#a4aebb', S: '#58616e',
  w: '#5ab4e8', W: '#c8ecff', c: '#e6ecf4', C: '#8a96ac', o: '#ff8a2a', r: '#d8503a', g: '#7cc84e', G: '#3e7a2a',
};

const ICONS: Record<string, string[]> = {
  build: ['............', '..kkkkkk....', '.ksssssSk...', '.ksssssSSk..', '.kSSSSSSk...', '..kkkbbk....', '.....kbbk...', '......kbbk..', '.......kbbk.', '........kbbk', '.........kBk', '..........k.'],
  pipe: ['............', 'kkkkkkkk....', 'bbbbbbbbk...', 'yyyyyybbbk..', 'BBBBBBBbbk..', 'kkkkkkBbbk..', '.....kBbbk..', '.....kBbyk..', '....kkkkkkk.', '....kbbbbbk.', '....kkkkkkk.', '............'],
  up: ['.....kk.....', '....kyyk....', '...kyyyyk...', '..kyyyyyyk..', '.kkkyyyykkk.', '...kbbbbk...', '...kbbbbk...', '...kbbbbk...', '...kbbbbk...', '...kBBBBk...', '...kBBBBk...', '...kkkkkk...'],
  eye: ['............', '............', '....kkkk....', '..kkoooookk.', '.kooyykyyook', 'kooyykkkyyok', 'kooyykkkyyok', '.kooyykyyook', '..kkoooookk.', '....kkkk....', '............', '............'],
  home: ['............', '.kk.........', '.kSk........', '.kSk...kk...', '.kSk..kSSk..', '.kSkkkSSSSk.', 'kSSSSSSSSSSk', 'kSyySSyySSSk', 'kSyySSyySSSk', 'kSSSSSSSSSSk', 'kSSSSkkSSSSk', 'kkkkkkkkkkkk'],
  menu: ['............', '............', '.kkkkkkkkkk.', '.kbbbbbbbbk.', '.kkkkkkkkkk.', '............', '.kkkkkkkkkk.', '.kbbbbbbbbk.', '.kkkkkkkkkk.', '............', '.kkkkkkkkkk.', '.kbbbbbbbbk.'],
  coin: ['....kkkk....', '..kkbbbbkk..', '.kbbyyyybBk.', '.kbyybbbbBk.', 'kbyybkkbbbBk', 'kbybbkbbbbBk', 'kbybbkbbbbBk', 'kbybbkkbbbBk', '.kbbbbbbbBk.', '.kbBbbbbBBk.', '..kkBBBBkk..', '....kkkk....'],
  drop: ['.....kk.....', '.....kk.....', '....kwwk....', '....kwwk....', '...kwwwwk...', '..kwWwwwwk..', '..kwWwwwwk..', '.kwWwwwwwwk.', '.kwwwwwwwwk.', '.kwwwwwwwwk.', '..kwwwwwwk..', '...kkkkkk...'],
  steam: ['...kk..kk...', '..kcck.kck..', '..kck.kcck..', '...kck.kck..', '..kcck.kck..', '..kck.kcck..', '............', '.kkkkkkkkkk.', '.kooooooook.', '.kSSSSSSSSk.', '..kkkkkkkk..', '............'],
  cloud: ['............', '....kkkk....', '...kcccck...', '.kkcccccckk.', 'kcccccccccck', 'kcccccccccck', 'kCcccccccCCk', '.kCCCCCCCCk.', '..kkkkkkkk..', '............', '............', '............'],
  bucket: ['............', '...kkkkkk...', '..k......k..', '.kkkkkkkkkk.', '.kwwwwwwwwk.', '.kssssssssk.', '..kssssssk..', '..kSsssssk..', '..kSsssssk..', '...kSsssk...', '...kkkkkk...', '............'],
  fire: ['.....k......', '....kok.....', '....koyk....', '...koyok.k..', '..koyyok.ok.', '..koyyyokok.', '.koyyyyyook.', '.koyyyyyyok.', '.koyyyyyyok.', '..koyyyyok..', '...kooook...', '....kkkk....'],
  close: ['............', '.kk......kk.', '.krk....krk.', '..krk..krk..', '...krkkrk...', '....krrk....', '....krrk....', '...krkkrk...', '..krk..krk..', '.krk....krk.', '.kk......kk.', '............'],
  check: ['............', '..........kk', '.........kgk', '........kgk.', '.kk....kgk..', '.kgk..kgk...', '..kgkkgk....', '...kggk.....', '....kk......', '............', '............', '............'],
  scroll: ['............', '.kkkkkkkkkk.', 'kBbbbbbbbbBk', '.kbbbbbbbbk.', '.kbkkkkkkbk.', '.kbbbbbbbbk.', '.kbkkkkkbbk.', '.kbbbbbbbbk.', '.kbkkkkkkbk.', 'kBbbbbbbbbBk', '.kkkkkkkkkk.', '............'],
  pump: ['....kkk.....', '...kyyyk....', '....kSk.....', '..kkkkkkk...', '.kbbbbbbbk..', '.kbyybbbbkkk', '.kbbbbbbbkwk', '.kbbbbbbbkkk', '.kBBBBBBBk..', 'kkkkkkkkkkk.', 'kwwwwwwwwwwk', '.kkkkkkkkkk.'],
  tank: ['...kkkkkk...', '..kSSSSSSk..', '.ksssssssSk.', '.ksskkkksSk.', '.kskwwwwkSk.', '.kskwWwwkSk.', '.kskwwwwkSk.', '.kskwwwwkSk.', '.ksskkkksSk.', '.kSSSSSSSSk.', '..kk....kk..', '..kk....kk..'],
  valve: ['....kkkk....', '...krrrrk...', '....kkkk....', '.....kk.....', '....kbbk....', 'kkkkbbbbkkkk', 'ksssbyybsssk', 'kSSSbbbbSSSk', 'kkkkbbbbkkkk', '....kBBk....', '....kkkk....', '............'],
  gauge: ['....kkkk....', '..kkyyyykk..', '.kyyyyyyyyk.', '.kyyyyyykyk.', 'kyyyyyykyyyk', 'kyyyyykyyyyk', 'kyyyykkyyyyk', 'kyyyykkyyyyk', '.kyyyyyyyyk.', '.kbbbbbbbbk.', '..kkbbbbkk..', '....kkkk....'],
  boiler: ['......kk....', '......kSk...', '..kkkkkSk...', '.kbbbbbbkk..', 'kbyybbbbbbk.', 'kbbbbbykbbk.', 'kbbbbkkybbk.', 'kbbbbbbbbbk.', 'kkkkkkkkkkk.', 'krrkoooorrk.', 'krrkoyyorrk.', 'kkkkkkkkkkk.'],
  cond: ['...kkkkkk...', '..kssssssk..', '...kkkkkk...', '..kwWwwwwk..', '..kkkkkkkk..', '..kwwwwWwk..', '..kkkkkkkk..', '..kwWwwwwk..', '..kkkkkkkk..', '..kwwwwWwk..', '.kSSSSSSSSk.', '.kkkkkkkkkk.'],
  rain: ['...kkkkk....', '.kkcccccck..', 'kcccccccccck', 'kCcccccccCCk', '.kkkkkkkkkk.', '..w..w..w...', '.w..w..w....', '...w..w..w..', '..w..w..w...', '.w..w..w....', '............', '............'],
  bolt: ['......kkkk..', '.....kyyk...', '....kyyk....', '...kyyk.....', '..kyyykkk...', '.kyyyyyyk...', '..kkkyyk....', '....kyyk....', '...kyyk.....', '..kyk.......', '.kk.........', '............'],
  wind: ['............', '.......kk...', 'kkkkkkkcck..', 'cccccccccck.', 'kkkkkkkkk...', '............', 'kkkkkkkkkk..', 'ccccccccccck', 'kkkkkkkkcck.', '........kk..', '............', '............'],
  fan: ['....kkkk....', '..kkCcckk...', '.kCcckccck..', '.kcckSkcck..', 'kCckSSSkcck.', 'kckSSySSkck.', 'kcckSSSkcCk.', '.kcckSkccCk.', '.kCcckcCCk..', '..kkCCCkk...', '....kkkk....', '....kSSk....'],
  platform: ['............', '............', 'kkkkkkkkkkkk', 'kbbbbbbbbbbk', 'kBBkBBkBBkBk', 'kkkkkkkkkkkk', '.kSk....kSk.', '.kSk....kSk.', '.kSSk..kSSk.', '.kS.kkk..Sk.', '.kSk....kSk.', 'kkkkk..kkkkk'],
  star: ['.....kk.....', '.....kyk....', '....kyyk....', 'kkkkkyyykkkk', 'kyyyyyyyyyyk', '.kyyyyyyyyk.', '..kyyyyyyk..', '..kyyykyyk..', '.kyyk..kyyk.', '.kyk....kyk.', 'kk........kk', '............'],
  lock: ['............', '....kkkk....', '...kSSSSk...', '..kSk..kSk..', '..kSk..kSk..', '.kkkkkkkkkk.', '.kbbbbbbbbk.', '.kbbbkkbbbk.', '.kbbbkkbbbk.', '.kbbbbbbbbk.', '.kkkkkkkkkk.', '............'],
  leaf: ['............', '........kkk.', '......kkggk.', '....kkgggGk.', '...kggggGGk.', '..kgggGGGk..', '..kggGGGk...', '.kgGGGkk....', '.kGGkk......', 'kGkk........', 'kk..........', '............'],
};

export function icon(name: keyof typeof ICONS | string, size = 22): string {
  const rows = ICONS[name];
  if (!rows) return '';
  let rects = '';
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === '.') { x++; continue; }
      let w = 1;
      while (row[x + w] === ch) w++;
      rects += `<rect x="${x}" y="${y}" width="${w}" height="1" fill="${PAL[ch]}"/>`;
      x += w;
    }
  });
  return `<svg class="pi" viewBox="0 0 12 12" width="${size}" height="${size}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}
