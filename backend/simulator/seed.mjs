// Dados simulados do BN Search: as PC* do WinThor com um caso por cenário da
// spec 001 (docs/specs/001-consulta-estoque/spec.md).
//
// O SCHEMA não está aqui: sai de schema-winthor.mjs via schema.mjs.
// Determinístico. As DATAS são relativas a hoje (`dataRelativa`), de
// propósito: o lote vencido precisa continuar vencido amanhã. O smoke usa o
// mesmo `dataRelativa` para conferir.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { createSchema } from './schema.mjs';

const DIA = 86400000;
const hoje = () => new Date(`${new Date().toISOString().slice(0, 10)}T12:00:00Z`);
/** 'AAAA-MM-DD' a `dias` de hoje (negativo = passado). */
export const dataRelativa = (dias) => new Date(hoje().getTime() + dias * DIA).toISOString().slice(0, 10);

// Logins do simulador (senha única em config.mjs) e do painel do mitra-hub.
export const USUARIOS = [
  { nome: 'Consulta Local', email: 'consulta@benenutri.local', accessLevel: 'ADMIN' },
  { nome: 'Comercial Local', email: 'comercial@benenutri.local', accessLevel: 'MEMBER' },
];

const FILIAIS = [['1', 'BENENUTRI MATRIZ GOIANIA', 'GO'], ['2', 'BENENUTRI SAO PAULO', 'SP'], ['3', 'BENENUTRI BRASILIA', 'DF']];
const FORNECEDORES = [[10, 'NUTRI LABS INDUSTRIA'], [20, 'VITA FOODS DISTRIBUICAO']];
// PCTABDEV: motivos de bloqueio/devolução.
const MOTIVOS = [[31, 'AVARIA NO TRANSPORTE', 'B'], [32, 'VALIDADE CURTA', 'B'], [40, 'DIVERGENCIA DE INVENTARIO', 'B']];
const FUNCIONARIOS = [[101, 'MARIA SOUZA'], [102, 'JOAO PEREIRA'], [103, 'PEDRO ALVES']];
const CLIENTES = [[901, 'HOSPITAL SAO LUCAS'], [902, 'CLINICA VIDA'], [903, 'DROGARIA CENTRAL']];
const VENDEDORES = [[11, 'CARLOS LIMA'], [12, 'ANA COSTA']];

// [CODPROD, DESCRICAO, EMBALAGEM, UNIDADE, CODFORNEC, OBS2, CODAUXILIAR]
const PRODUTOS = [
  [1001, 'WHEY PROTEIN BAUNILHA 900G', 'POTE 900G', 'UN', 10, null, '7890000010010'], // C-001, C-003..C-005, C-007, C-008
  [1010, 'CREATINA MONOHIDRATADA 300G', 'POTE 300G', 'UN', 10, null, '7890000010102'], // 3 filiais, para o gráfico
  [2002, 'ESPESSANTE ALIMENTAR 125G', 'LATA 125G', 'UN', 20, null, '7890000020026'],   // C-006: sem lote
  [3003, "AGUA D'AGUA 500ML", 'GARRAFA 500ML', 'UN', 20, null, '7890000030032'],       // C-002: apóstrofo
  [4004, 'WHEY PROTEIN CHOCOLATE 900G', 'POTE 900G', 'UN', 10, 'FL', '7890000040048'], // RN-008: inativo
  [5005, 'COLAGENO HIDROLISADO 300G', 'POTE 300G', 'UN', 20, null, '7890000050054'],   // C-011
  [6006, 'BARRA PROTEICA 45G', 'CAIXA 12UN', 'CX', 10, null, '7890000060060'],         // RN-001: nunca negativo
];

// [CODPROD, CODFILIAL, QTEST, QTBLOQUEADA, QTINDENIZ, QTRESERV, CODDEVOL, MOTIVOBLOQESTOQUE]
const ESTOQUE = [
  [1001, '1', 100, 10, 5, 15, null, null],
  [1001, '2', 50, 5, 5, 5, null, null],
  [1001, '3', 0, 0, 0, 0, null, null],              // RN-002: filial zerada some
  [1010, '1', 240, 0, 0, 30, null, null],
  [1010, '2', 120, 12, 0, 0, 40, null],             // 12 bloqueadas sem lote, motivo pelo CODDEVOL
  [1010, '3', 60, 0, 6, 10, null, null],
  [2002, '2', 20, 8, 0, 0, null, 'PRODUTO EM ANALISE'],
  [3003, '1', 12, 0, 0, 0, null, null],
  [4004, '1', 3, 0, 0, 0, null, null],
  [5005, '1', 30, 0, 0, 14, null, null],
  [6006, '1', 5, 0, 0, 20, null, null],
];

// [CODPROD, CODFILIAL, NUMLOTE, validade em dias a partir de hoje, QT, QTBLOQUEADA, QTRESERV, QTINDENIZ, OBSBLOQUEIO, excluído?]
const LOTES = [
  [1001, '1', 'L-A', -10, 40, 6, 0, 5, null, false],
  [1001, '1', 'L-B', 20, 35, 4, 10, 0, 'AGUARDANDO LAUDO', false],
  [1001, '1', 'L-C', 202, 25, 0, 5, 0, null, false],
  [1001, '1', 'L-X', 300, 9, 0, 0, 0, null, true],  // RN-006: excluído
  [1001, '1', 'L-Z', 300, 0, 0, 0, 0, null, false], // RN-006: zerado
  [1001, '2', 'L-D', 65, 50, 5, 5, 5, null, false], // bloqueio sem motivo algum
  [1010, '1', 'CR-01', 45, 90, 0, 30, 0, null, false],
  [1010, '1', 'CR-02', 150, 150, 0, 0, 0, null, false],
  [1010, '2', 'CR-03', 400, 120, 0, 0, 0, null, false],
  [1010, '3', 'CR-04', 12, 60, 0, 10, 6, null, false],
  [5005, '1', 'L-R', 120, 30, 0, 10, 0, null, false],
];

// [NUMPED, dias a partir de hoje, POSICAO, cancelado?, CODCLI, CODUSUR, CODFILIAL, CODPROD, QT, NUMLOTE]
const PEDIDOS = [
  [50001, -2, 'L', false, 901, 11, '1', 1001, 10, 'L-B'],
  [50002, -1, 'M', false, 902, 12, '1', 1001, 5, 'L-C'],
  [50003, 0, 'B', false, 903, 11, '2', 1001, 5, 'L-D'],
  [50004, -5, 'F', false, 901, 11, '1', 1001, 3, 'L-B'],  // RN-009: faturado não conta
  [50005, -4, 'C', true, 902, 12, '1', 1001, 8, 'L-C'],   // RN-009: cancelado não conta
  [50006, -3, 'L', false, 901, 11, '1', 5005, 7, 'L-R'],  // C-011: 7 das 10 reservadas do lote
  [50007, -1, 'L', false, 902, 12, '1', 5005, 4, null],   // C-011: sem lote definido
  [50008, -1, 'L', false, 903, 12, '1', 1010, 30, 'CR-01'],
  [50009, 0, 'M', false, 901, 11, '3', 1010, 10, 'CR-04'],
];

export function seedDatabase(dbPath, { reset = false } = {}) {
  if (reset) {
    for (const sufixo of ['', '-wal', '-shm']) rmSync(`${dbPath}${sufixo}`, { force: true });
  }
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new DatabaseSync(dbPath);
  createSchema(db);
  const counts = {};
  const inserir = (tabela, colunas, linhas) => {
    const stmt = db.prepare(`INSERT INTO ${tabela} (${colunas.join(', ')}) VALUES (${colunas.map(() => '?').join(', ')})`);
    for (const linha of linhas) stmt.run(...linha);
    counts[tabela] = (counts[tabela] ?? 0) + linhas.length;
  };

  inserir('INT_USER', ['DESCR', 'NOME', 'ACCESS_LEVEL', 'ATIVO'], USUARIOS.map((u) => [u.email, u.nome, u.accessLevel, 1]));
  inserir('PCFILIAL', ['CODIGO', 'RAZAOSOCIAL', 'UF'], FILIAIS);
  inserir('PCFORNEC', ['CODFORNEC', 'FORNECEDOR'], FORNECEDORES);
  inserir('PCTABDEV', ['CODDEVOL', 'MOTIVO', 'TIPO'], MOTIVOS);
  inserir('PCEMPR', ['MATRICULA', 'NOME'], FUNCIONARIOS);
  inserir('PCCLIENT', ['CODCLI', 'CLIENTE'], CLIENTES);
  inserir('PCUSUARI', ['CODUSUR', 'NOME'], VENDEDORES);

  // RF-002: 120 produtos para a paginação (50 por página).
  const paginacao = Array.from({ length: 120 }, (_, i) => {
    const n = String(i + 1).padStart(3, '0');
    return [7000 + i + 1, `ITEM PAGINACAO ${n}`, 'UN', 'UN', 20, null, `78900007${n}00`];
  });
  inserir('PCPRODUT', ['CODPROD', 'DESCRICAO', 'EMBALAGEM', 'UNIDADE', 'CODFORNEC', 'OBS2', 'CODAUXILIAR'], [...PRODUTOS, ...paginacao]);
  inserir('PCEST', ['CODPROD', 'CODFILIAL', 'QTEST', 'QTBLOQUEADA', 'QTINDENIZ', 'QTRESERV', 'CODDEVOL', 'MOTIVOBLOQESTOQUE'],
    [...ESTOQUE, ...paginacao.map(([codprod], i) => [codprod, '1', i + 1, 0, 0, 0, null, null])]);

  // RF-014: o cache de fotos como o cron o deixaria — o 1001 com foto (um
  // desenho embutido, para a tela local não depender do Busca 360) e o 3003
  // já consultado e sem foto. Os demais nunca foram consultados.
  const fotoExemplo = `data:image/svg+xml,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'><rect width='96' height='96' fill='#eef2eb'/><rect x='34' y='14' width='28' height='10' rx='2' fill='#7c8579'/><rect x='24' y='24' width='48' height='60' rx='8' fill='#b9c2b4'/><rect x='24' y='42' width='48' height='22' fill='#156b16'/></svg>")}`;
  inserir('CW_PRODUTO_FOTO', ['CODPROD', 'URL', 'NOME_ARQUIVO', 'BUSCADO_EM'], [[1001, fotoExemplo, 'exemplo.svg', `${dataRelativa(0)}T09:30:00`], [3003, '', null, `${dataRelativa(0)}T09:30:00`]]);

  inserir('PCLOTE', ['CODPROD', 'CODFILIAL', 'NUMLOTE', 'DTVALIDADE', 'QT', 'QTBLOQUEADA', 'QTRESERV', 'QTINDENIZ', 'OBSBLOQUEIO', 'DTEXCLUSAO'],
    LOTES.map(([codprod, filial, lote, dias, qt, bloq, reserv, indeniz, obs, excluido]) =>
      [codprod, filial, lote, dataRelativa(dias), qt, bloq, reserv, indeniz, obs, excluido ? dataRelativa(-30) : null]));

  // C-005/RN-003: L-A tem dois lançamentos de bloqueio; vale o mais recente
  // (motivo 31, MARIA SOUZA). L-B não tem histórico de motivo, só o log de quem
  // bloqueou (JOAO PEREIRA) e um desbloqueio parcial posterior (PEDRO ALVES),
  // que não pode virar "quem bloqueou".
  inserir('PCMOVBLOQUEIO', ['CODFILIAL', 'CODPROD', 'NUMLOTE', 'MOTIVO', 'CODOPER', 'CODFUNCLANC', 'ROTINALANC', 'DTMOV'], [
    ['1', 1001, 'L-A', 32, 'EB', 103, '1101', `${dataRelativa(-40)} 08:00:00`],
    ['1', 1001, 'L-A', 31, 'EB', 101, '1101', `${dataRelativa(-6)} 10:00:00`],
  ]);
  inserir('PCLOTELOG', ['CODFILIAL', 'CODPROD', 'NUMLOTE', 'DATA', 'PROGRAMA', 'USUARIO', 'OBSAPLICACAO', 'QTBLOQUEADA_ANT', 'QTBLOQUEADA'], [
    ['1', 1001, 'L-A', `${dataRelativa(-6)} 10:00:00`, 'PCSIS1101', 'MARIA', '6366:101', 0, 6],
    ['1', 1001, 'L-B', `${dataRelativa(-8)} 09:00:00`, 'PCSIS1101', 'JOAO', '6366:102', 0, 6],
    ['1', 1001, 'L-B', `${dataRelativa(-5)} 15:00:00`, 'PCSIS1101', 'PEDRO', '6366:103', 6, 4],
  ]);

  inserir('PCPEDC', ['NUMPED', 'DATA', 'POSICAO', 'DTCANCEL', 'CODCLI', 'CODUSUR', 'CODFILIAL'],
    PEDIDOS.map(([numped, dias, posicao, cancelado, codcli, codusur, filial]) =>
      [numped, dataRelativa(dias), posicao, cancelado ? dataRelativa(dias + 1) : null, codcli, codusur, filial]));
  inserir('PCPEDI', ['NUMPED', 'CODPROD', 'QT', 'NUMLOTE', 'CODFILIALRETIRA'],
    PEDIDOS.map(([numped, , , , , , , codprod, qt, lote]) => [numped, codprod, qt, lote, null]));

  db.close();
  return counts;
}
