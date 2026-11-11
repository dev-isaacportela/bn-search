# BN Search

Consultas ao WinThor para quem não vive dentro do ERP. A primeira é a de
**estoque**: busca o produto por código, descrição ou EAN e mostra, com o
número do ERP naquele momento, quanto há em cada filial, o que está
disponível, reservado, bloqueado e avariado — lote por lote, com vencimento,
motivo do bloqueio e o pedido que reservou.

O sistema só lê. Não guarda cópia do estoque e não altera nada no WinThor.

## Rodar local

```bash
cd backend && npm install && npm run sim       # simulador em http://localhost:3114
cd frontend && npm install && npm run dev -- --port 5184
```

Entre com `consulta@benenutri.local`, senha `mitra123`. O simulador imita as
tabelas do WinThor com um caso por cenário da spec (experimente os produtos
1001, 1010, 2002 e 5005).

```bash
cd backend && npm test     # as consultas reais contra o banco simulado
cd frontend && npm test    # a regra de tela
```

## Documentação

| O quê | Onde |
|---|---|
| Regras para quem altera o código | [CLAUDE.md](CLAUDE.md) |
| O que a consulta de estoque faz e por quê | [docs/specs/001-consulta-estoque/spec.md](docs/specs/001-consulta-estoque/spec.md) |
| Como foi feita | [docs/specs/001-consulta-estoque/plan.md](docs/specs/001-consulta-estoque/plan.md) |
| O que falta | [docs/specs/001-consulta-estoque/tasks.md](docs/specs/001-consulta-estoque/tasks.md) |
| Sistema visual | [docs/design.md](docs/design.md) |
| Simulador e WinThor real | [backend/simulator/README.md](backend/simulator/README.md) |

## Próximas consultas

Cada consulta nova é uma spec em `docs/specs/`, um `add-NNN-*.mjs` no backend,
um item no menu (`frontend/src/components/AdminLayout.tsx`) e uma pasta em
`frontend/src/pages/`.
