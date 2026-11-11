# Project: consultas-winthor — BN Search (consultas ao WinThor)

App que roda dentro da plataforma **Mitra**: React 19 + TypeScript + Vite 7 +
Tailwind 4 no frontend; backend composto só por Server Functions SQL de
**leitura** apontadas para a conexão JDBC "WinThor" (Oracle do ERP),
provisionadas pelos scripts de `backend/` com `mitra-sdk`. O projeto **não
guarda estoque**: toda tela lê o ERP na hora. As duas únicas tabelas próprias
são da foto do produto (`CW_PRODUTO_FOTO`, cache dos endereços do Busca 360, e
`CW_FOTOS_CONFIG`, a chave), criadas pelo `add-004` e alimentadas por um cron.
Este clone é para **desenvolvimento local**: o backend é escrito aqui e
executado no sandbox do Mitra; o frontend roda aqui contra o simulador.

A pasta vira `p-NNNNN` quando o projeto for criado na plataforma.

## Leia antes de escrever a primeira linha

1. `docs/constitution.md` — o processo. `docs/design.md` — o sistema visual; é normativo.
2. A spec da feature: `docs/specs/NNN-slug/spec.md`, depois `plan.md`, depois `tasks.md`.
   Hoje só existe a `001-consulta-estoque`. Cada consulta nova é uma spec nova.

## Estrutura

```
frontend/                 React. Build SEMPRE daqui: cd frontend && npm run build
  src/lib/mitra-auth.ts     sessão e init do SDK (modo local x Mitra real); simulador na 3114
  src/lib/mitra-api.ts      transporte único: linhas()/linha() sobre executeServerFunctionMitra
  src/lib/server-functions.ts  contrato NOMES + IDS das Server Functions
  src/lib/useLeituraErp.ts  leitura "no momento": dados + hora da leitura + releitura a cada 60 s
  src/lib/estoque.ts        regra pura da consulta de estoque — é o que se testa
  src/components/ui/        primitivos do design system (não rode `shadcn add` por cima)
  src/components/page.tsx   vocabulário do produto; tela não escreve classe Tailwind solta
  src/components/AdminLayout.tsx  layout e o MENU: uma consulta nova = um item ali + uma rota no App
  src/pages/estoque/        busca, ficha do produto (rosca por filial + lista única de lotes)
  tests/*.test.mjs          testes do frontend (node --test), um por cenário/regra da spec
backend/                  scripts de provisionamento via mitra-sdk (.env vazio localmente)
  add-001-jdbc-winthor.mjs  cria a conexão JDBC "WinThor" (por nome; copiado do SGC 2)
  add-002-estoque.mjs       as cw* da spec 001; exporta `definitions` e `WINTHOR` (as que rodam no Oracle)
  add-003-perfil-acesso.mjs perfil business; roda por último no sandbox; FORA do PUBLISH_ORDER
  add-004-fotos.mjs         foto do Busca 360: as 2 tabelas, cwProdutoFoto (leitura) e cwFotosSincronizar (cron); exporta FORA_DO_PERFIL
  sync-server-function-map.mjs  leva os ids reais ao frontend após publicar
  simulator/                Mitra local em SQLite: executa as MESMAS definitions; PC* do WinThor imitadas
  simulator/smoke.mjs       suíte de testes do backend: SFs reais + assert por cenário da spec
  migrations/               GERADO PELO SISTEMA — não toque
docs/specs/               spec.md (o quê) · plan.md (como) · tasks.md (ordem)
```

## Como rodar

```bash
cd backend && npm test            # sim:check (o SQL roda?) + sim:smoke (o fluxo faz a coisa certa?)
cd frontend && npm test           # node --test sobre a regra pura de src/lib/
cd backend && npm run sim         # simulador em http://localhost:3114 (senha mitra123)
cd frontend && npm run dev -- --port 5184   # sem VITE_MITRA_AUTH_URL entra no simulador
cd frontend && npm run build && npm run lint  # obrigatório antes de subir
# SIMULATOR_WINTHOR=oracle no backend/.env: as cw* leem o WinThor REAL (só onde há acesso ao Oracle; ver simulator/README.md)
```

Ou tudo junto pelo painel: `node ../mitra-hub/server.mjs` (login `consulta@benenutri.local`).

## Regras deste projeto

1. **O sistema só lê o ERP.** Nenhuma Server Function grava no WinThor; o
   executor do Oracle no simulador recusa o que não for `SELECT`/`WITH`.
2. **SQL das `cw*` é Oracle.** `''` é `NULL` no Oracle: filtro de texto
   desligado é `('{{x}}' IS NULL OR '{{x}}' = '' OR ...)`; filtro ligado é
   `LENGTH('{{x}}') > 0`. `'{{x}}' <> ''` é sempre falso lá. Paginação por
   `ROW_NUMBER()`. Função Oracle nova precisa de shim em
   `simulator/mysql-dialect.mjs` com o MESMO significado.
3. **Coluna do WinThor só entra em SQL depois de conferida** no ERP real ou
   num SQL do SGC 2 (`../p-novo-sgc`) que já roda em produção. A regra de
   reserva (`cwEstoqueReservas`) ainda é premissa: ver T-016 da spec 001.
4. **Teto de 300 execuções de SF por minuto no projeto inteiro.** Releitura
   automática só pelo `useLeituraErp` (60 s, aba visível); nada de polling próprio.
5. **Falha de leitura não mostra número antigo** (`estadoDaLeitura`).
6. **A chave do Busca 360 só existe em `CW_FOTOS_CONFIG`.** Entra pelo
   `BUSCA360_CHAVE` do `.env` do sandbox (o `add-004` grava por DML sem
   migration); nunca em `VITE_*`, nunca em resposta de SF, nunca em arquivo
   commitado. A tabela e a `cwFotosSincronizar` ficam fora do perfil
   (`FORA_DO_PERFIL`); a tela só lê o cache por `cwProdutoFoto`.

## Regras que quebram produção se ignoradas

1. **Não existe staging.** Com `VITE_MITRA_AUTH_URL` preenchido, toda Server
   Function chamada do `localhost` bate em produção. Localmente, trabalhe no simulador.
2. **Nunca execute `add-*.mjs` ou qualquer escrita do `mitra-sdk` da máquina
   local** sem decisão explícita do usuário: aplica em produção **sem gerar
   migration**. Os scripts são escritos aqui; a execução acontece no sandbox.
3. **Não crie, edite nem `git add` em `backend/migrations/` ou `migrations.yaml`.**
4. **`.env` nunca é commitado.** Credenciais do WinThor e a chave do Busca 360 só no `.env` do
   sandbox (ou da máquina com acesso ao Oracle). Toda `VITE_*` vai para o bundle público.
5. **Alteração mínima.** Não mude tela, fluxo ou componente que não foi pedido.
6. **Commit sem assinatura de agente.** Nunca `Co-Authored-By: Claude …` nem outro trailer de IA.
7. **Sem teste não está pronto.** Cada cenário C-00N e regra RN-00N da spec
   tem um `teste()` em `backend/simulator/smoke.mjs` ou um `test()` em
   `frontend/tests/`, com o id no título.

## Como o frontend fala com o backend

- Frontend importa **`mitra-interactions-sdk`**; nunca `mitra-sdk`, nunca `fetch` replicando o SDK.
- Toda leitura vai por Server Function, via `linhas()`/`linha()` de `src/lib/mitra-api.ts`.
- Parâmetro é **`input:`**. A plataforma liga o valor: **não escape aspas no
  frontend** (`montarBusca` só tira curinga e acento). Numérico nunca vazio (`0` = desligado).
- Retorno com **colunas em UPPERCASE**. Datas chegam como `AAAA-MM-DD`.
- Nome novo de SF: entra em `add-NNN-*.mjs` **e** em `SERVER_FUNCTION_NAMES`
  (+ id local em `SERVER_FUNCTIONS`); se roda no Oracle, na lista `WINTHOR`.

## Como subir para o Mitra

1. `npm test` verde em `backend/` e em `frontend/`; build e lint limpos.
2. `git fetch origin && git merge origin/main --no-edit`; leia o diff.
3. **Um** commit + `git push origin main` (`tipo: descrição`, sem trailer de agente).
4. No chat do projeto no Mitra, peça ao agente: *"sincronize com a main e rode
   `cd backend && node add-001-jdbc-winthor.mjs && node add-002-estoque.mjs && node add-004-fotos.mjs && node add-003-perfil-acesso.mjs && node sync-server-function-map.mjs`,
   depois execute a server function `cwFotosSincronizar` uma vez, build e share"*.
   O `.env` do sandbox precisa de `WINTHOR_JDBC_URL`, `WINTHOR_USER` e
   `WINTHOR_PASSWORD` na primeira vez (cria a conexão JDBC) e de
   `BUSCA360_CHAVE` (a chave das fotos; sem ela a ficha fica sem foto).
5. De volta aqui: `git pull` para receber migrations e o mapa de ids.

## Armadilhas de build

- `verbatimModuleSyntax`: nunca importe `interface`/`type` de outro arquivo (use `import type` ou defina local).
- `npm run build` roda `tsc -b`: erro de tipo derruba o build.
- `base: './'` no `vite.config.ts` faz o app funcionar em subpath. Não mexa.
- `eslint-plugin-react-hooks` 7 recusa `setState` síncrono dentro de `useEffect`.

## Antes de dizer que terminou

- [ ] `npm test` verde em `backend/` (check + smoke) e em `frontend/`
- [ ] `npm run build` e `npm run lint` limpos em `frontend/`
- [ ] O que teste não cobre (layout, tema claro e escuro, celular) aberto no simulador
- [ ] Nenhuma cor literal; nenhuma classe solta que devia ser nome do `page.tsx`
- [ ] `backend/migrations/` intocado; `.env` fora do commit
- [ ] Spec/plan/tasks atualizados; pedido original relido item a item
