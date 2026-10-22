# Cloudworks — A Fábrica de Tempestades

Jogo incremental 2D (pixel art) para navegador e celular. Um Véu de cinzas cobriu o céu: sem sol, o mar não evapora e não chove. Você ferve água do mar, fabrica nuvens, **semeia** essas nuvens e faz chover sementes sobre a terra seca — até uma floresta inteira crescer em volta da Semente-Mãe. Quando a floresta respira, ela se levanta: é um Ancião. Leve-o à forma final e o Véu se rasga sobre aquela terra; ele entrega a semente do próximo Ancião.

## O ciclo

1. **Chuva** — caldeira → vapor → nuvem → arremesso/ventiladores → chuva sobre a terra (entre as bandeiras).
2. **Sementes** — chuva sem sementes só molha a poeira. Bolsa manual (botão *Semear* na nuvem) e, depois, a linha de sementes: caldeira → **Estufa** (vapor + água) → **Semeador** (dispara sementes nas nuvens que passam). O vapor que vai para a Estufa não vira nuvem: as duas cadeias disputam o mesmo vapor.
3. **Floresta** — a terra é dividida em células e 5 parcelas. Semente em solo úmido brota: capim → arbusto → árvore. Plantas maduras espalham sementes (chão e nuvens). Sem chuva, murcham. **Composteira** devolve folhas da floresta como adubo para as Estufas.
4. **Despertar** — vida da terra na meta + coração (Semente-Mãe) virou árvore → o Ancião se levanta. A partir daí a chuva sobre o corpo dele o faz crescer; ele exala nuvens, tem sede (e seca a floresta) e suas raízes avançam sobre a fábrica.
5. **Eventos** — *Nuvem-Mãe* (tempestade cheia de sementes que você precisa guiar) e *pulsos do Véu* (a terra seca 2× mais rápido por 45 s).
6. **Jornada** — 6 terras, cada uma com um capítulo da história do Véu (`src/data/story.ts`): sussurros antes do despertar, a fala do despertar, o diário e a entrega da próxima semente.

## Rodar

```bash
npm install
npm run dev      # servidor local (Vite)
npm test         # testes da simulação (Vitest), incluindo um bot que joga o nível 1
npm run build    # build de produção em dist/
```

## Arquitetura

- `src/sim/` — simulação pura (sem DOM), passo fixo de 30 Hz: hidráulica (água, vapor e sementes), nuvens, vento, clima, floresta (`forest.ts`), criatura, eventos, construção, economia, salvamento.
- `src/data/` — dados: biomas, máquinas, melhorias, árvore de engenharia, criaturas, missões, história (`story.ts`).
- `src/render/` — renderização Canvas 2D em baixa resolução (pixel art), iluminação e partículas.
- `src/ui/` — interface DOM (HUD, árvore, oficina, modais).
- `src/core/` — câmera e entrada (toque, pinça, mouse).

## ATHG — trava da plataforma

Este jogo só roda dentro da ATHG (https://athg.antonycorp11.workers.dev). **Não remova:**

- o `<script>` no topo do `index.html`: aberto fora de um iframe (link direto), redireciona para o player da ATHG (localhost/rede local continuam livres para testes);
- o `Content-Security-Policy: frame-ancestors` (em `public/_headers` e na config do host): só a ATHG pode exibir o jogo em iframe.
