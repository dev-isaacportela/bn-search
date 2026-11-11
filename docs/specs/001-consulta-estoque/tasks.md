# Tasks: Consulta de estoque

**Plan:** `plan.md` · **Data:** 2026-11-11

> `[P]` = paralelizável. Spec aprovada em 2026-11-11. Estado em 2026-11-11: tudo feito menos T-016, T-031 (primeira carga das fotos no sandbox), T-092 (parcial) e T-093.
> T-017 foi escrita com a premissa da RN-009; T-016 confirma ou corrige.

## Esqueleto do projeto (Fluxo B da skill)

- [x] **T-001** — Copiar `assets/backend/` da skill para `backend/`; `npm install`; `config.mjs` com porta 3114 → `backend/`
- [x] **T-002** — Criar o frontend (Vite react-ts, Tailwind 4, router, `mitra-interactions-sdk`), copiar `assets/frontend/*.ts` para `src/lib/` e `tests/`; script `test` → `frontend/`
- [x] **T-003** — Instalar o design system com `/benenutri:design` (modo Instalar): tokens, fontes, logos, primitivos, `page.tsx`, `AdminLayout`, login, `chart.tsx` + `recharts` → `frontend/src/`
- [x] **T-004** `[P]` — `README.md`, `CLAUDE.md`, `AGENTS.md`, `.gitignore`, `.env.example` (dois lados), `docs/templates/`, `docs/constitution.md`, `docs/design.md` → raiz e `docs/`
- [x] **T-005** `[P]` — Registrar no `../mitra-hub/server.mjs` (sim 3114, Vite 5184) e no README do hub

## Backend

- [x] **T-010** — `add-001-jdbc-winthor.mjs` a partir de `../p-novo-sgc/backend/add-003-jdbc-winthor.mjs` → `backend/`
- [x] **T-011** — `simulator/schema-winthor.mjs` (15 tabelas do plan; `PCPEDC`/`PCPEDI` novas), `mysql-dialect.mjs` e `winthor-oracle.mjs` copiados do SGC 2; `DDL_SOURCES` → `backend/simulator/`
- [x] **T-012** — `add-002-estoque.mjs`: `cwFiliais`, `cwEstoqueBuscar`, `cwEstoqueBuscarTotal`, `cwEstoqueProduto`, `cwEstoqueFiliais`, `cwEstoqueLotes` (RF-001…004, 006, 007; RN-001, 002, 006, 008) → `backend/`
- [x] **T-013** — `cwEstoqueBloqueios`: SQL da R-130 com filial opcional em cada CTE + `FILIAL` (RF-005, RN-003) → `backend/add-002-estoque.mjs`
- [ ] **T-016** — **(pendente: exige máquina com acesso ao Oracle)** Com `SIMULATOR_WINTHOR=oracle`: conferir em 5 produtos com reserva quais situações de pedido somam o reservado e se o item traz o lote; ajustar a regra de reserva do plan se divergir (RN-009)
- [x] **T-017** — `cwEstoqueReservas` (RF-006, RN-009) → `backend/add-002-estoque.mjs`
- [x] **T-014** — `add-003-perfil-acesso.mjs`: perfil business "Consulta" com as 8 SFs (fora do `PUBLISH_ORDER`) → `backend/`
- [x] **T-015** — Seed do plan (1001, 2002, 3003, 4004, 5005, pedidos 50001–50007, 120 de paginação, usuário), `PUBLISH_ORDER`, `CHECK_INPUT`; `npm run sim:seed && npm run sim:check` → `backend/simulator/`

## Frontend

- [x] **T-020** — `SERVER_FUNCTION_NAMES`/`SERVER_FUNCTIONS` com as 8 `cw*` → `frontend/src/lib/server-functions.ts`
- [x] **T-021** — Regra pura do plan (`montarBusca`, `situacaoValidade`, `faixasDeValidade`, `motivoDoBloqueio`, `bloqueiosSemLote`, `resumoBloqueio`, `agruparReservas`, `ordenarLotes`, `ordenarBloqueios`, `rotuloAtualizado`, `somarPosicao`, `estadoDaLeitura`) → `frontend/src/lib/estoque.ts`
- [x] **T-022** — `useLeituraErp`: leitura, `lidoEm`, `atualizar()`, intervalo de 60 s com aba visível, erro zera dados (RF-008, 009, 011) → `frontend/src/lib/useLeituraErp.ts`
- [x] **T-023** — Menu de consultas com o item Estoque e rotas (RF-012) → `frontend/src/consultas.ts`, `App.tsx`, `AdminLayout`
- [x] **T-024** — Lista: busca com espera de 400 ms, filtro de filial, tabela, paginação, vazio e erro (RF-001, 002, 007) → `frontend/src/pages/estoque/EstoquePage.tsx`
- [x] **T-025** — Ficha: cabeçalho, 5 KPIs, selo "Atualizado às", Atualizar, abas Lotes / Bloqueados / Reservados (RF-003…008) → `frontend/src/pages/estoque/ProdutoPage.tsx`
- [x] **T-026** `[P]` — Gráfico de estoque por filial (RF-003) → `frontend/src/pages/estoque/GraficoFiliais.tsx`
- [x] **T-027** `[P]` — ~~Gráfico de validade (RF-010)~~ — feito e depois retirado com a RF-010 (T-028)
- [x] **T-028** — Ficha simplificada (revisão de 2026-11-11): rosca por filial no lugar das barras (D-012), gráfico de validade e abas retirados, lista única de lotes com motivo do bloqueio e pedido que reservou, em lista ou tabela (RF-013, D-013) → `ProdutoPage.tsx`, `GraficoFiliais.tsx`, `series.ts`, `components/page.tsx`
- [x] **T-029** — `detalharLotes` em `frontend/src/lib/estoque.ts` + `test('RF-013: …')` em `frontend/tests/estoque.test.mjs`
- [x] **T-030** — Foto do produto vinda do Busca 360 (RF-014, D-014): tabelas `CW_PRODUTO_FOTO` e `CW_FOTOS_CONFIG`, `cwProdutoFoto`, `cwFotosSincronizar` em cron → `backend/add-004-fotos.mjs`; tabela da chave e SF de sincronização fora do perfil → `add-003-perfil-acesso.mjs`; seed e dois `teste('RF-014: …')` → `simulator/seed.mjs`, `simulator/smoke.mjs`; foto no cabeçalho → `ProdutoPage.tsx`, `FotoProduto` e `PageHeader media` em `page.tsx`
- [ ] **T-031** — **(pendente: só no sandbox)** `BUSCA360_CHAVE` no `.env`, `node add-004-fotos.mjs`, executar `cwFotosSincronizar` uma vez e conferir: a leitura do WinThor por `jdbcId` dentro da SF funciona, a carga termina (tempo e total), `LAST_ERROR` vazio e a foto de 5 produtos aparece na ficha

## Testes

- [x] **T-080** — `teste('C-001: …')` em `smoke.mjs`: busca por código, descrição e EAN → 1001 com 150/105/20/15/10
- [x] **T-081** — `teste('C-002: …')` em `smoke.mjs`: sem resultado (0 e total 0) e apóstrofo (3003)
- [x] **T-082** — `teste('C-003: …')`, `teste('RN-001: …')`, `teste('RN-002: …')` em `smoke.mjs`: posição por filial, disponível nunca negativo, filial zerada fora
- [x] **T-083** — `teste('C-004: …')`, `teste('RN-006: …')` em `smoke.mjs`: lotes da filial 1, excluído e zerado fora
- [x] **T-084** — `teste('C-005: …')`, `teste('RN-003: …')` em `smoke.mjs`: motivo, responsável e observação por lote
- [x] **T-085** — `teste('C-006: …')` em `smoke.mjs`: produto sem lote com motivo da posição
- [x] **T-086** — `teste('C-007: …')`, `teste('C-008: …')`, `teste('C-011: …')`, `teste('RN-009: …')` em `smoke.mjs`: reservas por lote, pedidos que reservaram (faturado e cancelado fora), pedido sem lote, filtro de filial
- [x] **T-087** — `teste('RN-008: …')`, `teste('RF-002: …')` em `smoke.mjs`: inativo e paginação 120/50
- [x] **T-088** `[P]` — `test('C-002: …')`, `test('C-007: …')`, `test('C-009: …')`, `test('C-010: …')`, `test('C-011: …')`, `test('RN-009: …')` em `frontend/tests/estoque.test.mjs`
- [x] **T-089** `[P]` — `test('RN-003: …')`, `test('RN-004: …')`, `test('RN-005: …')`, `test('RN-007: …')` em `frontend/tests/estoque.test.mjs`

## Verificação

- [x] **T-090** — `cd backend && npm test` verde (`sim:check` + `sim:smoke`)
- [x] **T-091** — `cd frontend && npm test` verde; `npm run build` e `npm run lint` limpos
- [ ] **T-092** — No simulador (refeito depois da T-028): rosca e lista de lotes, em lista e em tabela, nos temas claro e escuro ✔; produtos 1001, 2002 (sem lote) e 5005 (sem pedido identificado, pedido sem lote) ✔; 1366 px e celular (375 px) ✔; estado de erro com o simulador parado ✔; clique na filial filtra ✔ — **falta** observar a atualização automática parando com a aba oculta
- [ ] **T-093** — **(pendente: exige máquina com acesso ao Oracle)** Com `SIMULATOR_WINTHOR=oracle`: tempos da RNF-001 e 5 produtos conferidos lado a lado com o WinThor (P-002)

## Dependências

```
T-001 → T-010 → T-011 → T-012 → T-013 → T-016 → T-017 → T-015 → T-080…T-087 → T-090
T-002 → T-003 → T-020 → T-021 → T-022 → T-023 → T-024 → T-025 → T-026/T-027 [P]
T-021 → T-088/T-089 [P] → T-091
T-015 + T-025 → T-092 → T-093
T-004, T-005, T-014 [P] independentes
```

## Rastreabilidade

| Requisito / cenário | Tasks | Teste |
|---|---|---|
| RF-001, RF-002 / C-001, C-002, RN-008 | T-012, T-021, T-024 | T-080, T-081, T-087, T-088 |
| RF-003 / C-003, RN-001, RN-002 | T-012, T-025, T-026 | T-082, T-092 |
| RF-004 / C-004, RN-005, RN-006, RN-007 | T-012, T-021, T-025 | T-083, T-089 |
| RF-005 / C-005, C-006, RN-003, RN-004 | T-013, T-021, T-025 | T-084, T-085, T-089 |
| RF-006 / C-007, C-011, RN-009 | T-012, T-016, T-017, T-021, T-025 | T-086, T-088 |
| RF-007 / C-008 | T-012, T-024, T-025 | T-086 |
| RF-008, RF-009 / C-009 | T-022, T-025 | T-088, T-092 |
| RF-010 (retirado) | T-027, T-028 | — |
| RF-013 | T-028, T-029 | T-029, T-092 |
| RF-014 / C-012, RN-010 | T-030 | T-030 (smoke), T-031 |
| RF-011 / C-010 | T-022, T-024, T-025 | T-088 |
| RF-012 | T-023 | T-092 |
| RNF-001 | T-093 | — (medição manual) |
| RNF-002, RNF-003 | T-012, T-013, T-022 | revisão do `add-002` e da conta do plan |
| RNF-004, RNF-005 | T-003, T-024, T-025 | T-092 |
