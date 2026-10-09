# Cloudworks — A Fábrica de Tempestades

Jogo incremental 2D (pixel art) para navegador e celular: ferva água do mar, crie nuvens, arremesse-as e alimente a Criatura Ancestral que dorme sob a terra seca. Ela cresce a cada estágio — e suas raízes avançam sobre a sua fábrica.

## Rodar

```bash
npm install
npm run dev      # servidor local (Vite)
npm test         # testes da simulação (Vitest), incluindo um bot que joga o nível 1
npm run build    # build de produção em dist/
```

## Arquitetura

- `src/sim/` — simulação pura (sem DOM), passo fixo de 30 Hz: hidráulica, vapor, nuvens, vento, clima, criatura, construção, economia, salvamento.
- `src/data/` — dados: biomas, máquinas, melhorias, árvore de engenharia, criaturas, missões.
- `src/render/` — renderização Canvas 2D em baixa resolução (pixel art), iluminação e partículas.
- `src/ui/` — interface DOM (HUD, árvore, oficina, modais).
- `src/core/` — câmera e entrada (toque, pinça, mouse).
