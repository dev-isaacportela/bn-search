# Plan: Consulta de estoque

**Spec:** `spec.md` · **Data:** 2026-11-11

> O COMO. As pendências da spec foram respondidas em 2026-11-11; a única
> premissa técnica em aberto é a da reserva (D-003, Riscos, T-016).

## Checagem de princípios

| Princípio | Toca? | Como atende |
|---|---|---|
| Spec antes de código | sim | `spec.md` aprovada em 2026-11-11, zero pendências |
| Backend escrito local, executado no sandbox | sim | `add-001-jdbc-winthor.mjs`, `add-002-estoque.mjs`, `add-003-perfil-acesso.mjs`; nada do `mitra-sdk` roda daqui |
| Migrations append-only | sim | `backend/migrations/` nunca é tocado; o projeto nem cria tabela |
| Leitura e escrita por Server Function | sim | 11 SFs: 8 SQL de leitura no WinThor; `cwSessao` e `cwProdutoFoto` (SQL de leitura) no banco do projeto; `cwFotosSincronizar` (JavaScript em cron) — a única que grava, e só no cache de fotos. Nenhuma escrita no ERP |
| Simulador cobre a feature | sim | tabelas PC* do WinThor semeadas em SQLite, mesmas `definitions`, `sim:check` verde |
| Testes automatizados obrigatórios | sim | mapa em **Testes**; `npm test` verde nos dois lados |
| Design tokens, sem cor literal | sim | kit `/benenutri:design` (modo Instalar); série de gráfico só de `--data-*` (§12) |
| Simplicidade | sim | sem tabela própria, sem cache, sem SF JavaScript; `recharts` é a única dependência além do kit (já prevista no design §1.2) |

## Contexto técnico

- **Frontend:** React 19 · Vite 7 · Tailwind 4 · react-router 7 · `mitra-interactions-sdk` · `recharts` (via `chart.tsx` do kit)
- **Backend:** só Server Functions SQL apontadas para a conexão JDBC **WinThor** (Oracle). O banco MySQL do projeto fica vazio.
- **Reuso identificado** (copiado de `../p-novo-sgc`, não importado — são repositórios separados):
  - `backend/add-003-jdbc-winthor.mjs` → `add-001-jdbc-winthor.mjs` (cria a conexão por nome, `jdbcIdWinthor()`)
  - `SQL_BLOQUEIOS_PRODUTO` de `add-013-compras-inteligentes.mjs` (R-130) → base de `cwEstoqueBloqueios`
  - `simulator/schema-winthor.mjs` (só as tabelas usadas), `simulator/mysql-dialect.mjs` (NVL, GREATEST, TO_CHAR, REGEXP_*), `simulator/winthor-oracle.mjs` (`SIMULATOR_WINTHOR=oracle` para medir contra o ERP real)
  - `frontend/src/lib/avisos-produto.ts` (cascata do motivo, RN-038 do SGC 2) → base de `motivoDoBloqueio()`
- **Dependência nova:** nenhuma fora do kit.
- **Pasta / portas:** `consultas-winthor` (vira `p-NNNNN` com P-007); simulador **3114**, Vite **5184** (livres no `mitra-hub`).
- **Prefixo de SF:** `cw`.

## Modelo de dados

Nenhuma tabela do projeto. Tudo é lido do WinThor na hora (D-001).

| Entidade (spec) | Tabela WinThor | Campos usados |
|---|---|---|
| Produto | `PCPRODUT` (+ `PCFORNEC`) | `CODPROD`, `DESCRICAO`, `EMBALAGEM`, `UNIDADE`, `CODAUXILIAR`, `OBS2` (preenchido = inativo), `CODFORNEC` |
| Filial | `PCFILIAL` | `CODIGO`, `RAZAOSOCIAL`, `UF` |
| Posição de estoque | `PCEST` (+ `PCTABDEV`) | `QTEST`, `QTRESERV`, `QTBLOQUEADA`, `QTINDENIZ`, `CODDEVOL`, `MOTIVOBLOQESTOQUE` |
| Lote | `PCLOTE` | `NUMLOTE`, `DTVALIDADE`, `QT`, `QTRESERV`, `QTBLOQUEADA`, `QTINDENIZ`, `DTEXCLUSAO`, `OBS*` |
| Bloqueio | `PCMOVBLOQUEIO`, `PCBLOQUEIOEST`, `PCMOV`, `PCLOTELOG`, `PCEMPR`, `PCTABDEV` | os do SQL da R-130 |
| Reserva / Pedido de venda | `PCPEDI` + `PCPEDC` (+ `PCCLIENT`, `PCUSUARI`) | item: `NUMPED`, `CODPROD`, `QT`, `NUMLOTE`, `CODFILIALRETIRA`; pedido: `DATA`, `POSICAO`, `DTCANCEL`, `CODCLI`, `CODUSUR`, `CODFILIAL` |

Disponível (RN-001, P-002) = `GREATEST(0, NVL(QTEST,0) − NVL(QTBLOQUEADA,0) − NVL(QTINDENIZ,0) − NVL(QTRESERV,0))`, calculado no SQL, num único fragmento reutilizado nas SFs.

## Contratos de backend

Todas `SQL`. `cwSessao` roda no banco do projeto; as outras 8 têm `jdbcId` = conexão "WinThor" (resolvida por nome, lista `WINTHOR` do `add-002`) e SQL em dialeto Oracle.

| Nome (`add-002`) | Entrada (`{{param}}`) | Saída | Atende |
|---|---|---|---|
| `cwSessao` | — (`:VAR_USER`) | uma linha: `ID, NOME, EMAIL` | acesso (menu e tela de "Acesso não liberado") |
| `cwProdutoFoto` | `codprod` | zero ou uma linha: `URL` (cache `CW_PRODUTO_FOTO`, banco do projeto) | RF-014 |
| `cwFotosSincronizar` (JavaScript, cron `0 30 9 * * *`, fora do perfil) | `codprods` opcional (`'1,44'`) | uma linha: `OK, MENSAGEM, CONSULTADOS, COM_FOTO, TOTAL`; grava `CW_PRODUTO_FOTO` e o resultado em `CW_FOTOS_CONFIG` | RF-014, RN-010 |
| `cwFiliais` | — | `CODFILIAL, FILIAL` | RF-007 |
| `cwEstoqueBuscar` | `codigo` (0 = desligado), `ean` (''), `termo1`, `termo2`, `termo3` (''), `codfilial` ('' = todas), `limite`, `offset` | `CODPROD, DESCRICAO, EMBALAGEM, UNIDADE, CODAUXILIAR, FORNECEDOR, INATIVO (0/1), QT_TOTAL, QT_DISPONIVEL, QT_RESERVADA, QT_BLOQUEADA, QT_AVARIADA` | RF-001, RF-002, RN-008 |
| `cwEstoqueBuscarTotal` | os mesmos sem `limite`/`offset` | `TOTAL` | RF-002 |
| `cwEstoqueProduto` | `codprod` | uma linha: `CODPROD, DESCRICAO, EMBALAGEM, UNIDADE, CODAUXILIAR, FORNECEDOR, INATIVO` | RF-003 |
| `cwEstoqueFiliais` | `codprod`, `codfilial` ('') | por filial não zerada: `CODFILIAL, FILIAL, QT_TOTAL, QT_DISPONIVEL, QT_RESERVADA, QT_BLOQUEADA, QT_AVARIADA, MOTIVO_POSICAO` | RF-003, RF-007, RN-001, RN-002, RN-004 |
| `cwEstoqueLotes` | `codprod`, `codfilial` ('') | por lote vivo: `CODFILIAL, FILIAL, NUMLOTE, DTVALIDADE (YYYY-MM-DD), QT, QT_DISPONIVEL, QTRESERV, QTBLOQUEADA, QTINDENIZ` | RF-004, RF-006, RN-006 |
| `cwEstoqueReservas` | `codprod`, `codfilial` ('') | por item de pedido que reserva: `CODFILIAL, NUMLOTE, NUMPED, DATA_PEDIDO (YYYY-MM-DD), POSICAO, CODCLI, CLIENTE, CODUSUR, VENDEDOR, QT_RESERVADA` | RF-006, RN-009 |
| `cwEstoqueBloqueios` | `codprod`, `codfilial` ('') | as colunas do SQL da R-130 (lote, quantidades, `MOTIVO_BLOQUEIO`, `CODDEVOL`, `ORIGEM_MOTIVO`, `DTMOV_BLOQUEIO`, `LOG_RESPONSAVEL`, `OBS*`, `DTVALIDADE`) + `FILIAL` e `FUNCIONARIO_LANCAMENTO` (nome de quem lançou o bloqueio) | RF-005, RN-003 |

Regras de SQL:
- **Oracle trata `''` como `NULL`** — filtro de texto desligado é `('{{x}}' IS NULL OR '{{x}}' = '' OR …)`; filtro ligado é `LENGTH('{{x}}') > 0` (`'{{x}}' <> ''` é sempre falso no Oracle). As duas formas valem no Oracle e no SQLite.
- **Busca** — `WHERE ({{codigo}} > 0 AND P.CODPROD = {{codigo}}) OR (LENGTH('{{ean}}') > 0 AND TRIM(P.CODAUXILIAR) = '{{ean}}') OR (LENGTH('{{termo1}}') > 0 AND UPPER(P.DESCRICAO) LIKE '%' || '{{termo1}}' || '%' AND (termo2 desligado OR …) AND (termo3 desligado OR …))`. Quem monta os parâmetros é `montarBusca()` no frontend (D-005).
- **Paginação** — `ROW_NUMBER() OVER (ORDER BY P.DESCRICAO, P.CODPROD) AS RN` na subconsulta e `WHERE RN > {{offset}} AND RN <= {{offset}} + {{limite}}`: roda igual no Oracle e no SQLite, sem shim (D-006).
- **Filtro de filial** — `('{{codfilial}}' IS NULL OR '{{codfilial}}' = '' OR E.CODFILIAL = '{{codfilial}}')` em todas, inclusive dentro de cada CTE do SQL de bloqueios (que hoje exige a filial).
- **Lote vivo** (RN-006) — `L.DTEXCLUSAO IS NULL AND (NVL(L.QT,0) > 0 OR NVL(L.QTRESERV,0) > 0 OR NVL(L.QTBLOQUEADA,0) > 0)`.
- **Reserva** (RN-009, premissa a validar no ERP — T-016) — `PCPEDI I JOIN PCPEDC C` com `C.POSICAO IN ('L','M','B') AND C.DTCANCEL IS NULL`; filial = `NVL(I.CODFILIALRETIRA, C.CODFILIAL)`; lote = `I.NUMLOTE` (nulo = pedido sem lote definido); ordenado por `C.DATA, C.NUMPED`. Vencimento e total reservado do lote não vêm daqui: vêm de `cwEstoqueLotes`.
- Datas saem como `TO_CHAR(..., 'YYYY-MM-DD')`; quantidades com `NVL(…, 0)`.
- Só `SELECT`; nenhuma SF de escrita (RNF-002).

## Superfície de interação

| Tela / rota | Responsabilidade | Do kit | Novos |
|---|---|---|---|
| `/login` | entrar (formulário do simulador em modo local) | tela de login §10.1 | — |
| layout | menu "Consultas" com o item **Estoque** (RF-012); próximas consultas entram como itens | `AdminLayout` §10 | a lista `MENU` no próprio `AdminLayout.tsx` |
| `/estoque` | campo de busca, filtro de filial, tabela paginada de produtos; linha abre a ficha | `PageHeader`, `Toolbar`, `SelectMenu`, `Table`, `Pagination`, `Status` | `pages/estoque/EstoquePage.tsx` |
| `/estoque/:codprod` | cabeçalho do produto, 4 `Kpi` (o total vai na legenda do Disponível — D-010), rosca por filial (D-012), lista única de lotes com motivo do bloqueio e pedido que reservou, em lista ou tabela (RF-013, D-013), selo "Atualizado às", botão Atualizar | `Kpi`, `PainelGrafico`, `PanelHeader`, `Table`, `Status`, `chart.tsx` | `pages/estoque/ProdutoPage.tsx`, `GraficoFiliais.tsx`, `series.ts`; em `page.tsx`: `AlternaLista`, `ItemLista`, `DetalheItem`, `GradeMultiplos`, `Multiplo`, `LegendaValores` |

Gráficos (design §12 + skill `dataviz`):
- **Estoque por filial** — uma rosca por filial (pequenos múltiplos), séries fixas Disponível / Reservado / Bloqueado / Avariado em `data-1…4` (`series.ts`), total no centro, os quatro valores escritos ao lado, tooltip, par Gráfico/Tabela; ordenado pelo total; o nome da filial filtra a tela.
- ~~**Validade**~~ — retirado com a RF-010 em 2026-11-11.

Regra pura em `src/lib/estoque.ts`: `montarBusca`, `situacaoValidade`, `motivoDoBloqueio`, `linhasDeBloqueio` (inclui as linhas "Sem lote"), `resumoBloqueio`, `agruparReservas`, `detalharLotes` (junta lote, bloqueio e reserva — RF-013), `ordenarLotes`, `rotuloAtualizado`, `somarPosicao`, `estadoDaLeitura`, `situacaoDoPedido`.

## Fluxo

1. `/estoque`: a pessoa digita; após 400 ms sem digitar e com 2+ caracteres (ou só dígitos), `montarBusca()` gera os parâmetros e a tela chama `cwEstoqueBuscar` + `cwEstoqueBuscarTotal`. `cwFiliais` carrega uma vez.
2. Clique na linha → `/estoque/:codprod?filial=`. A ficha chama em paralelo `cwEstoqueProduto`, `cwProdutoFoto` (uma vez por abertura, fora da releitura; falha vira "sem foto"), `cwEstoqueFiliais`, `cwEstoqueLotes`; `cwEstoqueBloqueios` só se alguma filial tem bloqueado > 0 e `cwEstoqueReservas` só se alguma tem reservado > 0.
3. A tela calcula indicadores (`somarPosicao`), a rosca e a lista de lotes: `linhasDeBloqueio` (com as linhas "Sem lote", D-004) e `agruparReservas` (lotes com `QTRESERV > 0` + os pedidos de `cwEstoqueReservas`, D-003) entram em `detalharLotes`, que devolve cada lote com o seu bloqueio e a sua reserva (D-013).
4. **Tempo real** (RF-008/009): o hook `useLeituraErp` guarda `{ dados, lidoEm, erro }`, expõe `atualizar()`, e refaz o passo 2 (menos `cwEstoqueProduto`) a cada 60 s só com `document.visibilityState === 'visible'`. Leitura que falha zera `dados` e mostra o erro (RF-011).
5. RNF-003: no máximo 4 chamadas/min por ficha aberta → 40 pessoas = 160/min, abaixo do teto de 300.

## Simulador

- `config.mjs`: label "BN Search", porta 3114, `DDL_SOURCES` = `schema-winthor.mjs`, `PUBLISH_ORDER` = `['add-002-estoque.mjs']`. Não existe `setup-backend.mjs`: as duas tabelas da foto nascem no `add-004-fotos.mjs` e o simulador lê o DDL de lá (`DDL_SOURCES`).
- Datas do seed são relativas a hoje (`dataRelativa(n)`): as datas literais abaixo valem para 2026-11-11, o dia do exemplo da spec.
- `schema-winthor.mjs`: `PCPRODUT`, `PCFORNEC`, `PCFILIAL`, `PCEST`, `PCLOTE`, `PCTABDEV`, `PCEMPR`, `PCMOVBLOQUEIO`, `PCBLOQUEIOEST`, `PCMOV`, `PCLOTELOG`, `PCCLIENT`, `PCUSUARI` (cópia das definições do SGC 2) + `PCPEDC` e `PCPEDI` (novas, só as colunas do contrato).
- Seed (`seed.mjs`):
  - usuário `consulta@benenutri.local`; filiais 1 (GO), 2 (SP), 3 (DF)
  - **1001** WHEY PROTEIN BAUNILHA 900G, EAN 7890000010010 — `PCEST` f1 100/10/5/15, f2 50/5/5/5, f3 zerada; lotes f1 L-A (40, val. 2026-11-01, bloq. 6, aval. 5), L-B (35, 2026-12-01, bloq. 4, res. 10, `OBSBLOQUEIO` "AGUARDANDO LAUDO"), L-C (25, 2027-06-01, res. 5); f2 L-D (50, 2027-01-15, res. 5, bloq. 5); L-X excluído e L-Z zerado; `PCMOVBLOQUEIO` L-A motivo 31 por matrícula de MARIA SOUZA em 2026-11-05; `PCLOTELOG` L-B: bloqueio por JOAO PEREIRA e um desbloqueio parcial posterior
  - pedidos do 1001: 50001 (L, f1, L-B, 10, HOSPITAL SAO LUCAS, CARLOS LIMA, 2026-11-09), 50002 (M, f1, L-C, 5, CLINICA VIDA, ANA COSTA, 2026-11-10), 50003 (B, f2, L-D, 5, DROGARIA CENTRAL, CARLOS LIMA, 2026-11-11), 50004 (F, faturado) e 50005 (cancelado, `DTCANCEL` preenchida)
  - **5005** — `PCEST` f1 total 30, reservado 14; lote L-R reservado 10; pedidos 50006 (L, L-R, 7) e 50007 (L, sem lote, 4)
  - **2002** produto sem lote — `PCEST` f2 bloqueado 8, `MOTIVOBLOQESTOQUE` "PRODUTO EM ANALISE"
  - **3003** AGUA D'AGUA 500ML; **4004** inativo (`OBS2` preenchido); 120 produtos "ITEM PAGINACAO nnn" para RF-002
- `CHECK_INPUT`: `codigo: 1001, ean: '', termo1: 'WHEY', termo2: '', termo3: '', codfilial: '', codprod: 1001, limite: 50, offset: 0`.
- Dialeto: nenhuma função nova além das que o `mysql-dialect.mjs` do SGC 2 já cobre.
- `winthor-oracle.mjs` copiado: com `SIMULATOR_WINTHOR=oracle` e credenciais no `.env`, as `cw*` leem o ERP real (RNF-001 e conferência de P-002).

## Testes

| Cenário / regra | Arquivo | O que o `assert` verifica |
|---|---|---|
| C-001 | `backend/simulator/smoke.mjs` | `cwEstoqueBuscar` com `codigo 1001`, com `termo1 'WHEY', termo2 'BAUN'` e com `ean '7890000010010'` → 1 linha, CODPROD 1001, 150/105/20/15/10 |
| C-002 | `smoke.mjs` | `termo1 'XYZABC'` → 0 linhas e `TOTAL` 0; `termo1 "D'AGUA"` → CODPROD 3003; filtro todo desligado → 0 linhas |
| C-002 | `frontend/tests/estoque.test.mjs` | `montarBusca("D'agua")` → `termo1 "D'AGUA"` (sem escape: a plataforma liga o valor); `"whey baun"` → 2 termos; `"1001"` → `codigo 1001`, `ean '1001'`; EAN de 13 dígitos → só `ean`; `""` e `"a"` → `null`; `%`, `_` e acento removidos |
| C-003 | `smoke.mjs` | `cwEstoqueFiliais(1001, '')` → 2 linhas: f1 100/70/15/10/5, f2 50/35/5/5/5 |
| C-004 | `smoke.mjs` | `cwEstoqueLotes(1001, '1')` → L-A, L-B, L-C com 40/35/25 e as datas |
| C-005 | `smoke.mjs` | `cwEstoqueBloqueios(1001, '1')` → L-A 6 un., `MOTIVO_BLOQUEIO` "AVARIA NO TRANSPORTE", `LOG_RESPONSAVEL`/funcionário MARIA SOUZA, 2026-11-05; L-B 4 un., `OBSBLOQUEIO` "AGUARDANDO LAUDO" |
| C-006 | `smoke.mjs` | `cwEstoqueFiliais(2002,'')` → f2 bloqueado 8, `MOTIVO_POSICAO` "PRODUTO EM ANALISE"; `cwEstoqueLotes` e `cwEstoqueBloqueios` → 0 linhas |
| C-007 | `smoke.mjs` | `cwEstoqueLotes(1001,'')` com `QTRESERV > 0` → L-B 10, L-C 5, L-D 5; `cwEstoqueReservas(1001,'')` → 3 linhas: 50001 (L-B, 10, HOSPITAL SAO LUCAS, CARLOS LIMA, L), 50002 (L-C, 5), 50003 (L-D, 5) |
| C-007 | `estoque.test.mjs` | `agruparReservas(lotes, pedidos)` → 3 lotes, cada um com o seu pedido, soma dos pedidos = reserva do lote, total 20 |
| C-011 | `smoke.mjs` | `cwEstoqueReservas(5005,'')` → 50006 (L-R, 7) e 50007 (`NUMLOTE` nulo, 4) |
| C-011 | `estoque.test.mjs` | `agruparReservas`: L-R 10 × pedidos 7 → `semPedido: 3`; 50007 no grupo `semLote` |
| C-008 | `smoke.mjs` | `cwEstoqueFiliais(1001,'2')` → só f2 50/35; `cwEstoqueLotes(1001,'2')` → só L-D; `cwEstoqueBuscar` com `codfilial '2'` → total 50 |
| C-009 | `estoque.test.mjs` | `rotuloAtualizado(new Date(2026,10,11,14,3,7))` → "Atualizado às 14:03:07" |
| C-010 | `estoque.test.mjs` | `estadoDaLeitura({ erro })` → `{ tipo: 'erro', mensagem: 'Não foi possível consultar o WinThor agora' }`, sem dados |
| RN-001 | `smoke.mjs` | f1 do 1001 → 70; produto de seed com total 5 e reserva 20 → 0 |
| RN-002 | `smoke.mjs` | filial 3 ausente de `cwEstoqueFiliais(1001,'')` |
| RN-003 | `smoke.mjs` | L-A traz o motivo do `PCMOVBLOQUEIO` mais recente; L-B: responsável JOAO PEREIRA, não o do desbloqueio |
| RN-003 | `estoque.test.mjs` | `motivoDoBloqueio()`: histórico → `OBSBLOQUEIO` → … → "Sem motivo vinculado" |
| RN-004 | `estoque.test.mjs` | `linhasDeBloqueio()`: filial 15 × lotes 10 → linha "Sem lote" de 5 com o motivo da posição; 10 × 10 → nenhuma |
| RN-005 | `estoque.test.mjs` | `situacaoValidade(data, '2026-11-11')` para os 6 casos da spec |
| RF-013 | `estoque.test.mjs` | `detalharLotes()`: L-A com o bloqueio, L-B com bloqueio e pedido, L-C só com pedido, na ordem do vencimento; sobra da posição e lote bloqueado fora da lista saem em `bloqueiosSoltos` |
| C-012 | `smoke.mjs` | `cwProdutoFoto`: 1001 devolve a foto do seed; 3003 (consultado, sem foto) e 2002 (nunca consultado) não devolvem linha |
| C-012 / RN-010 | `smoke.mjs` | `cwFotosSincronizar` contra um servidor HTTP local que imita o Busca 360: sem chave → aviso; chave errada → "recusou o acesso" e cache intacto; chave certa → principal do 1001, primeira do 2002, vazio para endereço sem https e para quem não tem foto; lotes de até 200; `codprods` sujo vira só os códigos válidos; a saída não contém a chave |
| RN-006 | `smoke.mjs` | L-X e L-Z fora de `cwEstoqueLotes(1001,'1')` |
| RN-007 | `estoque.test.mjs` | `ordenarLotes` (sem validade por último) e `ordenarBloqueios` (maior primeiro) |
| RN-008 | `smoke.mjs` | busca do 4004 → `INATIVO` 1 |
| RN-009 | `smoke.mjs` | 50004 (F) e 50005 (cancelado) ausentes de `cwEstoqueReservas(1001,'')`; L, M e B presentes; ordem por data |
| RN-009 | `estoque.test.mjs` | `agruparReservas`: lote 10 × pedidos 10 → `semPedido: 0`; pedidos do lote em ordem de data |
| RF-002 | `smoke.mjs` | `termo1 'PAGINACAO'`: `TOTAL` 120; `offset 50, limite 50` → 50 linhas, a primeira é a 051 |

- **Seed extra para o smoke:** nenhum — o seed do simulador já carrega os cenários.

## Decisões

| # | Decisão | Alternativa descartada | Por quê |
|---|---|---|---|
| D-001 | SF SQL direto no Oracle a cada leitura, sem tabela nem cache | copiar o estoque para o MySQL por cron | "tempo real" é o pedido; cópia envelhece e dobra o trabalho |
| D-002 | Copiar do SGC 2 (JDBC, SQL de bloqueios, schema simulado, dialeto) | pacote compartilhado | um consumidor novo não justifica biblioteca; revisitar na 3ª cópia |
| D-003 | Reservados: o lote e a quantidade vêm de `PCLOTE` (verdade do ERP); os pedidos vêm de `cwEstoqueReservas` e são casados na tela, com a sobra como "Sem pedido identificado" | um SQL só, partindo do pedido | o pedido nem sempre aponta o lote; partir do lote garante que a soma da aba bate com o indicador Reservado |
| D-004 | "Bloqueado sem lote" calculado na tela (posição − lotes) | `UNION` no SQL de bloqueios | mantém o SQL da R-130 quase intacto e a regra testável em `node --test` |
| D-005 | Termos da busca montados no frontend (`montarBusca`), 3 parâmetros fixos; só dígitos = código ou EAN | SF JavaScript montando SQL | a plataforma liga o valor de `'{{x}}'`, então aspas não se escapam (escapar gravaria o escape); a função tira curinga e acento; mais de 3 palavras são ignoradas e a tela avisa |
| D-006 | Paginação por `ROW_NUMBER()` | `OFFSET … FETCH` | roda em qualquer versão do Oracle e no SQLite sem shim |
| D-007 | Atualização automática a cada 60 s só com a aba visível | websocket / 5 s | a plataforma não empurra dado; 60 s cabe no teto de 300 SF/min com folga |
| D-008 | Ficha é rota própria (`/estoque/:codprod`) | painel lateral na lista | link compartilhável no chat ("olha esse produto") |
| D-009 | `cwSessao` (INT_USER do banco do projeto) fora do WinThor | ler o nome do token | é o padrão do kit: dá o nome no menu e a tela de "Acesso não liberado" quando falta perfil |
| D-010 | Quatro cartões de indicador: Disponível (com "de N no total"), Reservado, Bloqueado, Avariado | cinco cartões | o design system limita a faixa a quatro (§9.7); os cinco números da RF-003 continuam na tela |
| D-011 | Gráfico sem animação | animação padrão do recharts | a ficha se relê a cada minuto; desenho crescendo de novo a cada leitura distrai (design §13) |
| D-012 | Estoque por filial em **rosca**, uma por filial | barras empilhadas (a versão anterior), colunas lado a lado, blocos | escolha do dono do produto em 2026-11-11, vendo as três opções no canvas. É exceção consciente ao design §12.3 ("pizza não entra em tela operacional"): por isso o total vai no centro, os quatro valores vão escritos ao lado e a visão em tabela continua a um clique |
| D-013 | Lista única de lotes, sem abas: cada lote traz o motivo do bloqueio e o pedido que reservou; visão em lista (padrão, lê no celular) ou tabela | três abas Lotes / Bloqueados / Reservados | pedido de 2026-11-11 por uma ficha mais simples; a pergunta do usuário é "o que há neste lote", e as abas obrigavam a cruzar três tabelas pelo número do lote |
| D-014 | Foto: cache `CW_PRODUTO_FOTO` + chave em `CW_FOTOS_CONFIG`, sincronizados por SF JavaScript em cron diário; a ficha só lê o cache por SF SQL. A chave entra pelo `.env` do sandbox (`BUSCA360_CHAVE`) e o `add-004` a grava por DML sem migration. Só produto com algo em estoque é consultado | buscar a foto a cada abertura da ficha; tela de administração para a chave; catálogo inteiro | é o desenho do Mix Builder, que já roda: SF JavaScript com acesso business não grava e a tabela da chave fica fora do perfil, então quem fala com o Busca 360 é o cron (administrador). `.env` do sandbox evita uma tela só para colar a chave. Produto sem estoque não tem o que consultar — se fizer falta, é trocar um SELECT (`ponytail:` no código). Decisão de 2026-11-11 (P-008) |

## Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| SQL de bloqueios lento em produto com muito histórico | lista de lotes > 5 s | só chama com bloqueado > 0; medir com `SIMULATOR_WINTHOR=oracle` antes de publicar |
| Busca por descrição com `LIKE '%…%'` varre `PCPRODUT` | busca lenta | mínimo de 2 caracteres; medir; se preciso, restringir a ativos |
| Fórmula do disponível diferente da que o time confere no ERP (P-002) | desconfiança no número | conferir 5 produtos lado a lado com o WinThor antes de liberar |
| Conexão JDBC WinThor ainda não existe no projeto novo | SFs não publicam | `add-001-jdbc-winthor.mjs` roda primeiro no sandbox, com as credenciais no `.env` de lá |
| As situações de pedido que compõem a reserva e o preenchimento do lote no item (`PCPEDI.NUMLOTE`) são premissa — nenhum projeto nosso consulta isso ainda | pedidos faltando ou sobrando na aba | T-016: conferir no WinThor real (5 produtos com reserva) antes de fechar o SQL; a linha "Sem pedido identificado" deixa a divergência visível em vez de escondê-la |
| `cwFotosSincronizar` lê o WinThor por `runQueryMitra` com `jdbcId` de dentro de uma SF JavaScript em cron, e faz a carga inteira numa execução — a tipagem do SDK aceita, mas nenhum projeto nosso faz isso ainda e o tempo limite de uma SF é desconhecido | sem foto nenhuma, ou carga pela metade | T-031: rodar uma vez no sandbox e olhar `LAST_ERROR`/`LAST_SUCCESS_AT` em `CW_FOTOS_CONFIG`; cada lote de 200 grava ao terminar, então carga interrompida não perde o que já veio; `codprods` permite carga em pedaços |
| 4ª palavra da busca ignorada | resultado mais largo que o esperado | aceitável; a tela avisa "usando as 3 primeiras palavras" |

## Complexity Tracking

Vazio.
