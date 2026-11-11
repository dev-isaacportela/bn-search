// add-002 — Server Functions da spec 001 (consulta de estoque). Ver
// docs/specs/001-consulta-estoque/.
//
// cwSessao lê o INT_USER do banco do projeto (quem está logado). As outras 8
// são SQL de LEITURA no WinThor (Oracle): o jdbcId é resolvido por NOME
// (`jdbcIdWinthor`, add-001-jdbc-winthor.mjs) só na publicação real. No
// simulador o jdbcId é ignorado: rodam sobre as PC* de
// simulator/schema-winthor.mjs pelo dialeto Oracle -> SQLite.
//
// Nada aqui grava: o sistema só consulta o ERP (RNF-002).
//
// NAO EXECUTE DA MAQUINA LOCAL sem decisao explicita do usuario.
// Uso (no sandbox): cd backend && node add-002-estoque.mjs
//
// Oracle trata '' como NULL: filtro de texto desligado é sempre
// `('{{x}}' IS NULL OR '{{x}}' = '' OR ...)` e filtro ligado é
// `LENGTH('{{x}}') > 0` (falso com '' no Oracle, onde LENGTH('') é NULL, e no
// SQLite). `'{{x}}' <> ''` NÃO serve: no Oracle é sempre desconhecido.

import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { jdbcIdWinthor } from './add-001-jdbc-winthor.mjs';

/* ─────────────── fragmentos ─────────────── */

const filtroFilial = (coluna) => `('{{codfilial}}' IS NULL OR '{{codfilial}}' = '' OR ${coluna} = '{{codfilial}}')`;

// RN-001: disponível = total − bloqueado − avariado − reservado, nunca negativo (a regra do SGC 2).
const disponivel = (a, total = 'QTEST') => `GREATEST(0, NVL(${a}.${total}, 0) - NVL(${a}.QTBLOQUEADA, 0) - NVL(${a}.QTINDENIZ, 0) - NVL(${a}.QTRESERV, 0))`;

// RN-008: OBS2 preenchido marca o produto fora de linha (mesmo recorte do SGC 2).
const INATIVO = `CASE WHEN NVL(LENGTH(TRIM(P.OBS2)), 0) = 0 THEN 0 ELSE 1 END`;

const termo = (n) => `('{{termo${n}}}' IS NULL OR '{{termo${n}}}' = '' OR UPPER(P.DESCRICAO) LIKE '%' || '{{termo${n}}}' || '%')`;

// RF-001: código, EAN ou até 3 palavras da descrição em qualquer ordem. Os
// parâmetros saem de montarBusca() (frontend/src/lib/estoque.ts), já em
// maiúsculas e sem curinga.
const BUSCA = `(
    ({{codigo}} > 0 AND P.CODPROD = {{codigo}})
    OR (LENGTH('{{ean}}') > 0 AND TRIM(P.CODAUXILIAR) = '{{ean}}')
    OR (LENGTH('{{termo1}}') > 0 AND UPPER(P.DESCRICAO) LIKE '%' || '{{termo1}}' || '%' AND ${termo(2)} AND ${termo(3)})
  )`;

/* ─────────────── consultas ─────────────── */

const SQL_FILIAIS = `SELECT F.CODIGO AS CODFILIAL, F.RAZAOSOCIAL AS FILIAL
FROM PCFILIAL F
ORDER BY F.CODIGO`;

// Paginação por ROW_NUMBER: roda igual no Oracle e no SQLite (D-006 do plan).
const SQL_BUSCAR = `SELECT * FROM (
  SELECT Q.*, ROW_NUMBER() OVER (ORDER BY Q.DESCRICAO, Q.CODPROD) AS RN FROM (
    SELECT P.CODPROD, P.DESCRICAO, P.EMBALAGEM, P.UNIDADE, TRIM(P.CODAUXILIAR) AS CODAUXILIAR,
      F.FORNECEDOR, ${INATIVO} AS INATIVO,
      NVL(SUM(NVL(E.QTEST, 0)), 0) AS QT_TOTAL,
      NVL(SUM(${disponivel('E')}), 0) AS QT_DISPONIVEL,
      NVL(SUM(NVL(E.QTRESERV, 0)), 0) AS QT_RESERVADA,
      NVL(SUM(NVL(E.QTBLOQUEADA, 0)), 0) AS QT_BLOQUEADA,
      NVL(SUM(NVL(E.QTINDENIZ, 0)), 0) AS QT_AVARIADA
    FROM PCPRODUT P
    LEFT JOIN PCFORNEC F ON F.CODFORNEC = P.CODFORNEC
    LEFT JOIN PCEST E ON E.CODPROD = P.CODPROD AND ${filtroFilial('E.CODFILIAL')}
    WHERE ${BUSCA}
    GROUP BY P.CODPROD, P.DESCRICAO, P.EMBALAGEM, P.UNIDADE, P.CODAUXILIAR, F.FORNECEDOR, P.OBS2
  ) Q
) WHERE RN > {{offset}} AND RN <= {{offset}} + {{limite}}
ORDER BY RN`;

const SQL_BUSCAR_TOTAL = `SELECT COUNT(*) AS TOTAL
FROM PCPRODUT P
WHERE ${BUSCA}`;

const SQL_PRODUTO = `SELECT P.CODPROD, P.DESCRICAO, P.EMBALAGEM, P.UNIDADE, TRIM(P.CODAUXILIAR) AS CODAUXILIAR,
  F.FORNECEDOR, ${INATIVO} AS INATIVO
FROM PCPRODUT P
LEFT JOIN PCFORNEC F ON F.CODFORNEC = P.CODFORNEC
WHERE P.CODPROD = {{codprod}}`;

// RN-002: filial com tudo zerado não volta. MOTIVO_POSICAO alimenta a linha
// "Sem lote" da aba Bloqueados (RN-004).
const SQL_ESTOQUE_FILIAIS = `SELECT E.CODFILIAL, NVL(F.RAZAOSOCIAL, E.CODFILIAL) AS FILIAL,
  NVL(E.QTEST, 0) AS QT_TOTAL,
  ${disponivel('E')} AS QT_DISPONIVEL,
  NVL(E.QTRESERV, 0) AS QT_RESERVADA,
  NVL(E.QTBLOQUEADA, 0) AS QT_BLOQUEADA,
  NVL(E.QTINDENIZ, 0) AS QT_AVARIADA,
  COALESCE(D.MOTIVO, E.MOTIVOBLOQESTOQUE) AS MOTIVO_POSICAO
FROM PCEST E
LEFT JOIN PCFILIAL F ON F.CODIGO = E.CODFILIAL
LEFT JOIN PCTABDEV D ON D.CODDEVOL = E.CODDEVOL
WHERE E.CODPROD = {{codprod}}
  AND ${filtroFilial('E.CODFILIAL')}
  AND (NVL(E.QTEST, 0) <> 0 OR NVL(E.QTRESERV, 0) <> 0 OR NVL(E.QTBLOQUEADA, 0) <> 0 OR NVL(E.QTINDENIZ, 0) <> 0)
ORDER BY E.CODFILIAL`;

// RN-006: lote excluído ou zerado não volta. A ordem final é da tela (RN-007).
const SQL_LOTES = `SELECT L.CODFILIAL, NVL(F.RAZAOSOCIAL, L.CODFILIAL) AS FILIAL, L.NUMLOTE,
  TO_CHAR(L.DTVALIDADE, 'YYYY-MM-DD') AS DTVALIDADE,
  NVL(L.QT, 0) AS QT,
  ${disponivel('L', 'QT')} AS QT_DISPONIVEL,
  NVL(L.QTRESERV, 0) AS QTRESERV,
  NVL(L.QTBLOQUEADA, 0) AS QTBLOQUEADA,
  NVL(L.QTINDENIZ, 0) AS QTINDENIZ
FROM PCLOTE L
LEFT JOIN PCFILIAL F ON F.CODIGO = L.CODFILIAL
WHERE L.CODPROD = {{codprod}}
  AND ${filtroFilial('L.CODFILIAL')}
  AND L.DTEXCLUSAO IS NULL
  AND (NVL(L.QT, 0) > 0 OR NVL(L.QTRESERV, 0) > 0 OR NVL(L.QTBLOQUEADA, 0) > 0)
ORDER BY L.CODFILIAL, L.NUMLOTE`;

// RN-003: os lotes bloqueados com o motivo — o SQL do SGC 2 (R-130,
// sgcWintBloqueiosProduto), com a filial opcional. O motivo vem, nesta ordem,
// do último PCMOVBLOQUEIO, do último PCBLOQUEIOEST, da última PCMOV com
// CODDEVOL e do PCEST; PCLOTELOG responde só QUEM e QUANDO bloqueou (a
// MATRICULA do OBSAPLICACAO '6366:<n>' em PCEMPR), e só o evento que AUMENTOU
// o bloqueio. As observações do lote seguem cruas: a cascata até "Sem motivo
// vinculado" é da tela (motivoDoBloqueio).
const SQL_BLOQUEIOS = `WITH HIST_MOV_BLOQ AS (
  SELECT * FROM (SELECT M.CODFILIAL, M.CODPROD, M.NUMLOTE, M.MOTIVO AS CODDEVOL, D.MOTIVO AS MOTIVO_BLOQUEIO, D.TIPO AS TIPO_MOTIVO,
      M.CODOPER, M.CODFUNCLANC, M.ROTINALANC, M.DTMOV,
      ROW_NUMBER() OVER (PARTITION BY M.CODFILIAL, M.CODPROD, NVL(M.NUMLOTE,'-') ORDER BY M.DTMOV DESC) AS RN
    FROM PCMOVBLOQUEIO M LEFT JOIN PCTABDEV D ON D.CODDEVOL = M.MOTIVO
    WHERE M.CODPROD = {{codprod}} AND ${filtroFilial('M.CODFILIAL')}) WHERE RN = 1
), HIST_BLOQ_EST AS (
  SELECT * FROM (SELECT B.CODFILIAL, B.CODPROD, B.NUMLOTE, B.CODMOTIVO AS CODDEVOL, D.MOTIVO AS MOTIVO_BLOQUEIO, D.TIPO AS TIPO_MOTIVO,
      B.CODROTINA, B.CODOPER, B.CODFUNCLANC, B.DATA, B.DTLANC, B.TIPOBLOQ, B.OBS,
      ROW_NUMBER() OVER (PARTITION BY B.CODFILIAL, B.CODPROD, NVL(B.NUMLOTE,'-') ORDER BY NVL(B.DATA, B.DTLANC) DESC) AS RN
    FROM PCBLOQUEIOEST B LEFT JOIN PCTABDEV D ON D.CODDEVOL = B.CODMOTIVO
    WHERE B.CODPROD = {{codprod}} AND ${filtroFilial('B.CODFILIAL')}) WHERE RN = 1
), HIST_MOV AS (
  SELECT * FROM (SELECT M.CODFILIAL, M.CODPROD, M.NUMLOTE, M.CODDEVOL, D.MOTIVO AS MOTIVO_BLOQUEIO, D.TIPO AS TIPO_MOTIVO,
      M.CODOPER, M.ROTINALANC, M.DTMOV, M.QT, M.QTBLOQUEADA,
      ROW_NUMBER() OVER (PARTITION BY M.CODFILIAL, M.CODPROD, NVL(M.NUMLOTE,'-') ORDER BY M.DTMOV DESC, ABS(NVL(M.QTBLOQUEADA,0)) DESC) AS RN
    FROM PCMOV M LEFT JOIN PCTABDEV D ON D.CODDEVOL = M.CODDEVOL
    WHERE M.CODPROD = {{codprod}} AND ${filtroFilial('M.CODFILIAL')} AND M.CODDEVOL IS NOT NULL AND NVL(M.QTBLOQUEADA,0) <> 0) WHERE RN = 1
), HIST_LOTELOG AS (
  SELECT * FROM (SELECT PL.CODFILIAL, PL.CODPROD, PL.NUMLOTE,
      CASE WHEN REGEXP_LIKE(REGEXP_SUBSTR(PL.OBSAPLICACAO,'[^:]+',1,2),'^[0-9]+$') THEN TO_NUMBER(REGEXP_SUBSTR(PL.OBSAPLICACAO,'[^:]+',1,2)) END AS MATRICULA,
      PL.DATA, PL.PROGRAMA, PL.USUARIO, PL.OBSAPLICACAO, PL.QTBLOQUEADA_ANT, PL.QTBLOQUEADA,
      ROW_NUMBER() OVER (PARTITION BY PL.CODFILIAL, PL.CODPROD, NVL(PL.NUMLOTE,'-') ORDER BY PL.DATA DESC) AS RN
    FROM PCLOTELOG PL
    WHERE PL.CODPROD = {{codprod}} AND ${filtroFilial('PL.CODFILIAL')} AND NVL(PL.QTBLOQUEADA,0) > NVL(PL.QTBLOQUEADA_ANT,0)) WHERE RN = 1
), HIST_EST AS (
  SELECT E.CODFILIAL, E.CODPROD, E.CODDEVOL, COALESCE(D.MOTIVO, E.MOTIVOBLOQESTOQUE) AS MOTIVO_BLOQUEIO, D.TIPO AS TIPO_MOTIVO, E.MOTIVOBLOQESTOQUE
  FROM PCEST E LEFT JOIN PCTABDEV D ON D.CODDEVOL = E.CODDEVOL
  WHERE E.CODPROD = {{codprod}} AND ${filtroFilial('E.CODFILIAL')} AND NVL(E.QTBLOQUEADA,0) > 0
)
SELECT L.CODPROD, L.CODFILIAL, NVL(FI.RAZAOSOCIAL, L.CODFILIAL) AS FILIAL, L.NUMLOTE,
  NVL(L.QT,0) AS QT, NVL(L.QTBLOQUEADA,0) AS QTBLOQUEADA, NVL(L.QTRESERV,0) AS QTRESERV, NVL(L.QTINDENIZ,0) AS QTINDENIZ,
  COALESCE(HMB.CODDEVOL, HBE.CODDEVOL, HM.CODDEVOL, HE.CODDEVOL) AS CODDEVOL,
  COALESCE(HMB.MOTIVO_BLOQUEIO, HBE.MOTIVO_BLOQUEIO, HM.MOTIVO_BLOQUEIO, HE.MOTIVO_BLOQUEIO) AS MOTIVO_BLOQUEIO,
  CASE WHEN HMB.MOTIVO_BLOQUEIO IS NOT NULL THEN 'PCMOVBLOQUEIO' WHEN HBE.MOTIVO_BLOQUEIO IS NOT NULL THEN 'PCBLOQUEIOEST'
       WHEN HM.MOTIVO_BLOQUEIO IS NOT NULL THEN 'PCMOV' WHEN HE.MOTIVO_BLOQUEIO IS NOT NULL THEN 'PCEST' END AS ORIGEM_MOTIVO,
  COALESCE(HMB.ROTINALANC, HM.ROTINALANC, TO_CHAR(HBE.CODROTINA), HLL.PROGRAMA) AS ROTINALANC,
  TO_CHAR(COALESCE(HMB.DTMOV, HBE.DATA, HBE.DTLANC, HM.DTMOV, HLL.DATA),'YYYY-MM-DD') AS DTMOV_BLOQUEIO,
  HBE.OBS AS OBS_BLOQUEIOEST,
  HLL.USUARIO AS LOG_USUARIO, FB.NOME AS LOG_RESPONSAVEL,
  FL.NOME AS FUNCIONARIO_LANCAMENTO,
  L.MOTIVOBLOQESTOQUE, L.OBS1, L.OBS2, L.OBSANALISE, L.OBSBLOQUEIO, L.OBSBLOQUEIOMANUAL,
  TO_CHAR(L.DTVALIDADE,'YYYY-MM-DD') AS DTVALIDADE
FROM PCLOTE L
LEFT JOIN PCFILIAL FI ON FI.CODIGO = L.CODFILIAL
LEFT JOIN HIST_MOV_BLOQ HMB ON HMB.CODPROD = L.CODPROD AND HMB.CODFILIAL = L.CODFILIAL AND NVL(HMB.NUMLOTE,'-') = NVL(L.NUMLOTE,'-')
LEFT JOIN HIST_BLOQ_EST HBE ON HBE.CODPROD = L.CODPROD AND HBE.CODFILIAL = L.CODFILIAL AND NVL(HBE.NUMLOTE,'-') = NVL(L.NUMLOTE,'-')
LEFT JOIN HIST_MOV HM ON HM.CODPROD = L.CODPROD AND HM.CODFILIAL = L.CODFILIAL AND NVL(HM.NUMLOTE,'-') = NVL(L.NUMLOTE,'-')
LEFT JOIN HIST_LOTELOG HLL ON HLL.CODPROD = L.CODPROD AND HLL.CODFILIAL = L.CODFILIAL AND NVL(HLL.NUMLOTE,'-') = NVL(L.NUMLOTE,'-')
LEFT JOIN PCEMPR FB ON FB.MATRICULA = HLL.MATRICULA
LEFT JOIN PCEMPR FL ON FL.MATRICULA = COALESCE(HMB.CODFUNCLANC, HBE.CODFUNCLANC)
LEFT JOIN HIST_EST HE ON HE.CODPROD = L.CODPROD AND HE.CODFILIAL = L.CODFILIAL
WHERE L.CODPROD = {{codprod}} AND ${filtroFilial('L.CODFILIAL')} AND L.DTEXCLUSAO IS NULL AND NVL(L.QTBLOQUEADA,0) > 0
ORDER BY L.CODFILIAL, L.NUMLOTE`;

// RN-009 — PREMISSA A VALIDAR NO ERP (T-016 do tasks.md): conta como reserva o
// item de pedido liberado (L), montado (M) ou bloqueado (B) e não cancelado, e
// o item traz o lote em NUMLOTE (nulo = sem lote definido). O total reservado
// do lote e o vencimento NÃO vêm daqui: vêm de cwEstoqueLotes (D-003).
const FILIAL_DO_ITEM = `NVL(I.CODFILIALRETIRA, C.CODFILIAL)`;
const SQL_RESERVAS = `SELECT ${FILIAL_DO_ITEM} AS CODFILIAL, I.NUMLOTE, C.NUMPED,
  TO_CHAR(C.DATA, 'YYYY-MM-DD') AS DATA_PEDIDO, C.POSICAO,
  C.CODCLI, CL.CLIENTE, C.CODUSUR, U.NOME AS VENDEDOR,
  NVL(I.QT, 0) AS QT_RESERVADA
FROM PCPEDI I
JOIN PCPEDC C ON C.NUMPED = I.NUMPED
LEFT JOIN PCCLIENT CL ON CL.CODCLI = C.CODCLI
LEFT JOIN PCUSUARI U ON U.CODUSUR = C.CODUSUR
WHERE I.CODPROD = {{codprod}}
  AND C.POSICAO IN ('L', 'M', 'B')
  AND C.DTCANCEL IS NULL
  AND ${filtroFilial(FILIAL_DO_ITEM)}
ORDER BY C.DATA, C.NUMPED`;

/* ─────────────── a lista publicada ─────────────── */

const PARAMS_BUSCA = 'codigo int (0 = desligado), ean string, termo1..termo3 string (maiúsculas, \'\' = desligado), codfilial string (\'\' = todas)';

export const definitions = [
  { name: 'cwFiliais', code: SQL_FILIAIS, resumo: 'RF-007 - filiais do ERP para o filtro. Sem parâmetros' },
  { name: 'cwEstoqueBuscar', code: SQL_BUSCAR, resumo: `RF-001/RF-002/RN-008 - produtos por código, EAN ou descrição, com total, disponível, reservado, bloqueado e avariado somados. Params: ${PARAMS_BUSCA}, limite int, offset int` },
  { name: 'cwEstoqueBuscarTotal', code: SQL_BUSCAR_TOTAL, resumo: `RF-002 - total de produtos da busca. Params: ${PARAMS_BUSCA}` },
  { name: 'cwEstoqueProduto', code: SQL_PRODUTO, resumo: 'RF-003 - cabeçalho do produto (uma linha). Params: codprod int' },
  { name: 'cwEstoqueFiliais', code: SQL_ESTOQUE_FILIAIS, resumo: 'RF-003/RN-001/RN-002/RN-004 - posição do produto por filial não zerada, com o motivo de bloqueio da posição. Params: codprod int, codfilial string (\'\' = todas)' },
  { name: 'cwEstoqueLotes', code: SQL_LOTES, resumo: 'RF-004/RF-006/RN-006 - lotes vivos do produto com validade, saldo, reservado e bloqueado. Params: codprod int, codfilial string (\'\' = todas)' },
  { name: 'cwEstoqueBloqueios', code: SQL_BLOQUEIOS, resumo: 'RF-005/RN-003 - lotes bloqueados com motivo (PCMOVBLOQUEIO, PCBLOQUEIOEST, PCMOV, PCEST), quem e quando bloqueou e validade; SQL da R-130 do SGC 2. Params: codprod int, codfilial string (\'\' = todas)' },
  { name: 'cwEstoqueReservas', code: SQL_RESERVAS, resumo: 'RF-006/RN-009 - itens de pedido de venda que reservam o produto (liberado, montado ou bloqueado), com lote, cliente e vendedor. Params: codprod int, codfilial string (\'\' = todas)' },
].map((f) => ({ name: f.name, type: 'SQL', description: f.resumo, code: f.code }));

// As que rodam no Oracle do ERP (recebem o jdbcId na publicação; no simulador
// com SIMULATOR_WINTHOR=oracle, são as que saem do SQLite).
export const WINTHOR = definitions.map((d) => d.name);

// A sessão fica no banco do projeto: `:VAR_USER` é o INT_USER.ID de quem chama.
definitions.unshift({
  name: 'cwSessao',
  type: 'SQL',
  description: 'Usuário da sessão pelo INT_USER (banco do projeto). Sem parâmetros',
  code: `SELECT IU.ID, IU.NOME, IU.DESCR AS EMAIL
FROM INT_USER IU
WHERE IU.ID = :VAR_USER`,
});

function isEntrypoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isEntrypoint()) {
  if (!process.env.MITRA_BASE_URL) throw new Error('MITRA_BASE_URL ausente: este script roda no sandbox do Mitra, com o .env real.');
  const sdk = await import('mitra-sdk');
  sdk.configureSdkMitra({
    baseURL: process.env.MITRA_BASE_URL,
    token: process.env.MITRA_TOKEN,
    integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
  });
  const projectId = Number(process.env.MITRA_PROJECT_ID);
  const jdbcId = await jdbcIdWinthor(projectId);

  const lista = (await sdk.listServerFunctionsMitra({ projectId })).result ?? [];
  const mapa = new Map(lista.map((f) => [f.name, f.id]));

  for (const definicao of definitions) {
    const corpo = {
      projectId, name: definicao.name, type: definicao.type, code: definicao.code, description: definicao.description,
      ...(WINTHOR.includes(definicao.name) ? { jdbcId } : {}),
    };
    const id = mapa.get(definicao.name);
    if (id) await sdk.updateServerFunctionMitra({ ...corpo, serverFunctionId: id });
    else await sdk.createServerFunctionMitra(corpo);
    console.log(`${id ? 'atualizada' : 'criada'}: ${definicao.name}`);
  }

  console.log(`Pronto: ${definitions.length} server functions da spec 001 (consulta de estoque).`);
  console.log('Rode `node sync-server-function-map.mjs` para levar os ids ao frontend.');
}
