# Simulador local do Mitra — BN Search (consultas ao WinThor)

Ambiente de teste **deste projeto**, com banco SQLite proprio e dados simulados.
Roda sem dependencias externas (`node:sqlite` do Node 22+). Vai no git — so
`simulator/data/` (o banco gerado) fica de fora; na primeira execucao ele nasce sozinho.

## O que ele executa

**Nao existe handler reimplementado aqui.** O simulador carrega as `definitions`
dos scripts `backend/add-*.mjs` (ordem em `config.mjs`) — as mesmas que a
publicacao envia ao Mitra — e executa o SQL literal das funcoes `type: 'SQL'` e o
corpo literal das `type: 'JAVASCRIPT'`. Um bug que existiria em producao aparece
aqui; a correcao testada aqui e a que vai publicada.

O projeto nao tem tabela propria. O schema do simulador sao as tabelas PC* do
WinThor, imitadas em `schema-winthor.mjs` so com as colunas que as `cw*` leem;
`seed.mjs` poe nelas um caso por cenario da spec 001. As `cw*` sao SQL Oracle:
`mysql-dialect.mjs` (copiado do SGC 2) traduz Oracle -> SQLite.

## WinThor real (opcional)

Com `SIMULATOR_WINTHOR=oracle` e `WINTHOR_JDBC_URL`/`WINTHOR_USER`/`WINTHOR_PASSWORD`
no `backend/.env`, `npm run sim` manda as `cw*` (menos `cwSessao`) ao Oracle do
ERP em vez do SQLite — so SELECT, e so numa maquina com acesso ao banco e com o
Oracle Instant Client (`ORACLE_CLIENT_LIB_DIR`). E como se mede o tempo real das
consultas e se confere a regra de reserva (T-016 e T-093 da spec 001). `sim:check`
e `sim:smoke` ignoram a chave: os testes sao sempre no SQLite.

## Uso

```bash
cd backend && npm test            # sim:check + sim:smoke — obrigatorio antes de marcar task ou publicar
cd backend && npm run sim:check   # as funcoes SQL de leitura rodam?
cd backend && npm run sim:smoke   # o fluxo faz a coisa certa? SFs reais + assert por cenario da spec
cd backend && npm run sim:seed    # regera o banco do zero
cd backend && npm run sim         # sobe o servidor em http://localhost:3114
```

`smoke.mjs` e a suite de testes do backend: cada cenario C-00N e regra RN-00N
da spec tem um `teste()` com o id no titulo. Sem ele verde, a feature nao esta
pronta.

Com o simulador no ar, `cd frontend && npm run dev`. Sem `VITE_MITRA_AUTH_URL`
no `.env` do frontend, o app entra em modo local sozinho.

## Logins (senha unica: `mitra123`)

| E-mail | Nivel | Persona |
|---|---|---|
| `consulta@benenutri.local` | ADMIN | quem consulta |
| `comercial@benenutri.local` | MEMBER | quem consulta |

Produtos do seed: 1001 (todos os casos), 1010 (3 filiais), 2002 (bloqueio sem
lote), 3003 (apostrofo), 4004 (inativo), 5005 (reserva sem pedido), 6006
(disponivel zerado), 7001-7120 (paginacao).

## Endpoints

| Rota | Uso |
|---|---|
| `POST /auth/login` | login local (e-mail + senha) |
| `GET /auth/users` | usuarios disponiveis (usado pelo mitra-hub) |
| `POST /interactions/executeServerFunction` | `executeServerFunctionMitra` do SDK |
| `POST /interactions/runQuery`, `/interactions/integrations/call` | SQL de leitura direto no SQLite |
| `GET /interactions/records/:tabela` | `listRecordsMitra` |
| `POST /functions/execute` | alias do fallback de `mitra-api.ts` |
| `GET /health` | status, contagens, ids sem definicao e erros |

## Voltar para o Mitra real

Defina `VITE_MITRA_AUTH_URL` e `VITE_MITRA_PROJECT_ID` no `.env` do frontend.
Com essas variaveis presentes o app usa o fluxo Mitra normal e ignora o
simulador — nenhuma alteracao de codigo e necessaria para alternar.
