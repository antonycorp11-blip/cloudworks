// The story of the Véu: why it stopped raining, what the Ancients are, and why the engineer
// carries a Semente-Mãe from land to land. One chapter per biome (same index as BIOMES).

/** The premise, shown on the title screen and at the very first intro. */
export const PREMISE =
  'Há cem anos, um Véu de cinzas cobriu o céu. O sol ainda chega — fraco demais para aquecer o mar. ' +
  'Sem vapor não há nuvens. Sem nuvens, não chove. Você é o último engenheiro da Oficina da Seca: ' +
  'se o céu não faz chuva, você vai fabricá-la.';

export interface Chapter {
  /** shown in the intro modal when the biome starts */
  title: string;
  intro: string;
  /** button that starts the biome */
  go: string;
  /** voice from under the soil before the Ancient rises, in order of forest progress */
  whispers: string[];
  /** the Ancient's first words when the forest stands up */
  awaken: string;
  /** what the engineer writes in the journal when the Véu tears open here */
  journal: string;
  /** the Ancient's farewell: it hands over the next Semente-Mãe and says where to plant it */
  handoff: string;
}

export const CHAPTERS: Chapter[] = [
  {
    title: 'A semente sob a poeira',
    intro:
      'Na beira do mar morto você encontrou uma semente do tamanho de uma rocha, rachada e ainda morna. ' +
      'Você a enterrou na terra seca, a leste da oficina. Ela precisa de chuva — e de sementes ao redor, ' +
      'porque nada nasce sozinho numa terra que esqueceu como brotar. Faça uma floresta inteira crescer em volta dela.',
    go: 'Plantar a Semente-Mãe',
    whispers: [
      '…água… depois de tanto tempo… mas a terra não lembra mais como brotar… traga sementes…',
      '…isso… uma folha… eu sinto as raízes dela tocando as minhas…',
      '…mais… espalhe-as… uma floresta não é uma árvore… é uma multidão…',
      '…eu já fui grande… lembro do peso das nuvens nas minhas costas…',
      '…o meu coração está criando casca… falta pouco… não deixe a terra secar…',
      '…eu acordo… quando a floresta inteira respirar junto…',
    ],
    awaken: 'Hm…? Cem anos de poeira… e quem me acorda é um engenheiro com um balde. A floresta que você plantou… sou eu. Agora me dê de beber.',
    journal:
      'Diário do engenheiro — Ela não estava enterrada na floresta. Ela ERA a floresta. Bramo me contou: os Anciões eram o ciclo da água do mundo. ' +
      'Suas florestas respiravam as nuvens. Quando o Véu caiu, eles se encolheram em sementes para esperar. Esperaram demais. ' +
      'Hoje, sobre a floresta, o Véu rasgou. Vi o sol de verdade pela primeira vez na vida.',
    handoff: '“Leve esta semente. Minha irmã, Ceifa, secou nos Campos. Sem ela, minhas raízes não fecham o círculo — e um rasgo só não abre o céu.”',
  },
  {
    title: 'Os campos de cinza',
    intro:
      'Os Campos ficam longe do mar e o ar rouba umidade no caminho. Bramo disse que Ceifa dorme aqui — ' +
      'a semente que você trouxe pulsa mais forte perto do centro dos campos. Plante-a e faça os campos voltarem.',
    go: 'Plantar a semente de Ceifa',
    whispers: [
      '…Bramo…? Não… é outro cheiro… fumaça de caldeira…',
      '…os campos… eu cobria tudo isso de ouro… trigo selvagem até o horizonte…',
      '…a cinza no meu solo… não é de vulcão, engenheiro… é cinza de árvore…',
      '…alguém queimou florestas inteiras… o Véu é feito delas…',
      '…mais chuva… minhas raízes estão lembrando o caminho…',
      '…quase… sinto o vento dos campos de novo…',
    ],
    awaken: 'Você cheira a fornalha, engenheiro. Como eles cheiravam. Mas você planta em vez de queimar. Estranho. Continue.',
    journal:
      'Diário do engenheiro — A cinza do Véu é cinza de floresta. Ceifa lembra das fornalhas antigas: cidades inteiras que queimavam madeira dia e noite. ' +
      'A fumaça subiu e não desceu mais. Minha oficina queima carvão. Eu nunca tinha pensado de onde vinha.',
    handoff: '“Ossudo dorme na Savana, onde o calor é cruel e o vento muda de ideia. Leve-o de volta. Ele sabe mais do que eu sobre as fornalhas.”',
  },
  {
    title: 'A savana dos ventos',
    intro:
      'Calor e rajadas que mudam de direção. A semente de Ossudo é dura como osso. ' +
      'Domine as correntes com a sua engenharia e faça a savana inteira brotar ao redor dela.',
    go: 'Plantar a semente de Ossudo',
    whispers: [
      '…quente… quente demais… ainda…',
      '…os homens das fornalhas vinham aqui buscar lenha… árvores de mil anos…',
      '…eu vi a primeira coluna de fumaça… achei que era uma nuvem… estava errado…',
      '…o vento aqui não obedece… mas pode ser convencido…',
      '…meu coração está quase de pé… não pare agora…',
      '…ouço os outros… estão acordando um por um…',
    ],
    awaken: 'Engenheiro. Os seus antepassados derrubaram as minhas árvores para ferver água. Você ferve água para me fazer árvores. O mundo dá voltas.',
    journal:
      'Diário do engenheiro — Ossudo viu tudo. As fornalhas queimaram as florestas dos Anciões para fazer vapor, e o vapor movia as máquinas. ' +
      'A cinza formou o Véu. Mas uma coisa não encaixa: por que os Anciões, que faziam chover em continentes inteiros, não lavaram o céu?',
    handoff: '“Granito sabe a resposta. Ele dorme nas Montanhas e nunca gostou de mim. Diga a ele que o céu está abrindo — ele vai querer saber.”',
  },
  {
    title: 'O pico que dorme',
    intro:
      'Uma cordilheira bloqueia o caminho: as nuvens sobem, esfriam e chovem cedo demais. ' +
      'A semente de Granito precisa de chuva do outro lado da montanha. Leve-a até lá.',
    go: 'Plantar a semente de Granito',
    whispers: [
      '…quem…? Bramo mandou você…? Teimoso…',
      '…você quer saber por que não lavamos o céu… porque não quisemos…',
      '…antes do Véu… o sol inchou… queimava tudo… os mares ferviam sozinhos…',
      '…o Véu nos protegeu… nós deixamos a cinza ficar… nós a seguramos lá em cima…',
      '…e dormimos para segurá-la… cem anos…',
      '…se você me acordar… o Véu aqui se abre… e eu não sei se o sol já se acalmou…',
    ],
    awaken: 'Então foi você. Você está rasgando o escudo, pequeno engenheiro. Espero que saiba o que está fazendo. Eu… também espero que o sol tenha mudado.',
    journal:
      'Diário do engenheiro — O Véu não foi só um acidente. As fornalhas fizeram a cinza; os Anciões decidiram mantê-la. ' +
      'O sol tinha enlouquecido, e o Véu foi o escudo. Eles dormiram para segurá-lo. Cada Ancião que eu acordo abre um buraco no escudo. ' +
      'O sol que passou pelo rasgo de Granito era morno. Só morno. Acho que ele se acalmou. Acho.',
    handoff: '“Duna dorme no Deserto. Ela sempre foi a que vigiava o sol. Se alguém sabe se ele se acalmou, é ela.”',
  },
  {
    title: 'A sede sem fim',
    intro:
      'Distância enorme e evaporação brutal: só tempestades gigantes chegam inteiras. ' +
      'Duna vigiava o sol antes do Véu. Plante a semente dela no coração do deserto.',
    go: 'Plantar a semente de Duna',
    whispers: [
      '…areia… só areia… há cem anos…',
      '…eu contava os dias do sol… cada mancha… cada labareda…',
      '…as labaredas pararam faz tempo… setenta anos, talvez…',
      '…dormimos demais… a sede nos prendeu dentro das sementes…',
      '…não era mais medo, engenheiro… era só sede…',
      '…me acorde… e eu digo aos outros que o sol é seguro…',
    ],
    awaken: 'O sol está calmo, engenheiro. Está calmo há setenta anos. Nós só não tínhamos água para acordar e ver. Obrigada.',
    journal:
      'Diário do engenheiro — Duna confirmou: o sol se acalmou há décadas. O escudo não protege mais nada — só prende o frio, a seca e os próprios Anciões. ' +
      'Falta uma. Brasa, o Coração de Cinzas, dorme sob o vulcão. Foi ele quem segurou a maior parte do Véu.',
    handoff: '“Brasa segura o centro do Véu. Ele está cansado e com raiva. Quando ele acordar, o céu inteiro cai — ou abre. Vá.”',
  },
  {
    title: 'O coração de cinzas',
    intro:
      'Calor extremo e cinza por toda parte. É daqui que o Véu é segurado. ' +
      'Use toda a sua engenharia para trazer vida às cinzas e acordar o último Ancião.',
    go: 'Plantar a última semente',
    whispers: [
      '…fornalha… eu sinto o cheiro de fornalha… VÁ EMBORA…',
      '…não… espere… você trouxe água… quem traz água para um vulcão…?',
      '…eu seguro o céu há cem anos… meus braços são de cinza…',
      '…Duna disse que o sol está calmo… eu quero acreditar nela…',
      '…se eu soltar o Véu… ele vai chover… cinza e água… e depois só água…',
      '…mais um pouco… e eu solto…',
    ],
    awaken: 'Eu solto o céu agora, engenheiro. Olhe para cima.',
    journal:
      'Diário do engenheiro — O Véu caiu como uma chuva cinzenta que durou três dias. Depois, só chuva. ' +
      'O sol esquentou o mar e o mar fez as próprias nuvens. Pela primeira vez em cem anos choveu sem que ninguém acendesse uma caldeira. ' +
      'Desliguei a oficina. Os Anciões cuidam do céu agora. Eu cuido deles.',
    handoff: '“Os seis respiram de novo. O círculo está fechado. Descanse, engenheiro — ou plante outra vez, se tiver saudade do barulho das caldeiras.”',
  },
];

export const chapter = (i: number) => CHAPTERS[Math.min(i, CHAPTERS.length - 1)];
