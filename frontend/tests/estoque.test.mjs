// Regra de tela da consulta de estoque (spec 001): um test por linha "regra de
// tela" da seção Testes do plan. Função pura de src/lib/estoque.ts.
//
// Uso: cd frontend && npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  montarBusca, rotuloAtualizado, estadoDaLeitura, ERRO_ERP, somarPosicao, situacaoValidade, ordenarLotes,
  motivoDoBloqueio, SEM_MOTIVO, linhasDeBloqueio, resumoBloqueio, agruparReservas, detalharLotes,
  situacaoDoPedido, qtd,
} from '../src/lib/estoque.ts';

const HOJE = '2026-11-11';
const lote = (CODFILIAL, NUMLOTE, DTVALIDADE, QT, QTRESERV = 0, QTBLOQUEADA = 0) => ({ CODFILIAL, FILIAL: `FILIAL ${CODFILIAL}`, NUMLOTE, DTVALIDADE, QT, QTRESERV, QTBLOQUEADA });
const pedido = (NUMPED, CODFILIAL, NUMLOTE, QT_RESERVADA, DATA_PEDIDO) => ({ NUMPED, CODFILIAL, NUMLOTE, QT_RESERVADA, DATA_PEDIDO, POSICAO: 'L', CLIENTE: 'CLIENTE', VENDEDOR: 'VENDEDOR' });

test('C-002: o texto da busca vira parâmetros seguros; vazio ou curto não busca', () => {
  // Aspas seguem cruas: a plataforma liga o valor, escapar aqui gravaria o escape.
  assert.deepEqual(montarBusca("D'agua"), { codigo: 0, ean: '', termo1: "D'AGUA", termo2: '', termo3: '', ignoradas: 0 });
  assert.deepEqual(montarBusca('  whey   baun '), { codigo: 0, ean: '', termo1: 'WHEY', termo2: 'BAUN', termo3: '', ignoradas: 0 });
  assert.deepEqual(montarBusca('1001'), { codigo: 1001, ean: '1001', termo1: '', termo2: '', termo3: '', ignoradas: 0 });
  // EAN não cabe em código de produto: busca só por EAN.
  assert.deepEqual(montarBusca('7890000010010'), { codigo: 0, ean: '7890000010010', termo1: '', termo2: '', termo3: '', ignoradas: 0 });
  assert.equal(montarBusca(''), null);
  assert.equal(montarBusca('   '), null);
  assert.equal(montarBusca('a'), null);
  // Curinga do LIKE sai; acento sai (o ERP grava sem).
  assert.equal(montarBusca('100%')?.codigo, 100);
  assert.equal(montarBusca('pro_teína').termo1, 'PRO');
  assert.equal(montarBusca('proteína').termo1, 'PROTEINA');
  // Só as 3 primeiras palavras entram; a tela avisa das demais.
  assert.deepEqual(montarBusca('a1 b2 c3 d4 e5'), { codigo: 0, ean: '', termo1: 'A1', termo2: 'B2', termo3: 'C3', ignoradas: 2 });
});

test('C-003: os indicadores são a soma das filiais do recorte', () => {
  const filiais = [
    { CODFILIAL: '1', QT_TOTAL: 100, QT_DISPONIVEL: 70, QT_RESERVADA: 15, QT_BLOQUEADA: 10, QT_AVARIADA: 5 },
    { CODFILIAL: '2', QT_TOTAL: '50', QT_DISPONIVEL: '35', QT_RESERVADA: '5', QT_BLOQUEADA: '5', QT_AVARIADA: '5' },
  ];
  assert.deepEqual(somarPosicao(filiais), { total: 150, disponivel: 105, reservado: 20, bloqueado: 15, avariado: 10 });
  assert.deepEqual(somarPosicao([]), { total: 0, disponivel: 0, reservado: 0, bloqueado: 0, avariado: 0 });
  assert.equal(qtd(1234.5), '1.234,5');
});

test('C-007: pedidos entram sob o lote que reservaram e a soma bate com a reserva', () => {
  const lotes = [lote('1', 'L-A', '2026-11-01', 40), lote('1', 'L-B', '2026-12-01', 35, 10), lote('1', 'L-C', '2027-06-01', 25, 5), lote('2', 'L-D', '2027-01-15', 50, 5)];
  const pedidos = [pedido(50001, '1', 'L-B', 10, '2026-11-09'), pedido(50002, '1', 'L-C', 5, '2026-11-10'), pedido(50003, '2', 'L-D', 5, '2026-11-11')];
  const { grupos, semLote, total } = agruparReservas(lotes, pedidos);
  assert.deepEqual(grupos.map((g) => [g.codfilial, g.lote, g.validade, g.reservado, g.pedidos.map((p) => p.NUMPED), g.semPedido]), [
    ['1', 'L-B', '2026-12-01', 10, [50001], 0],
    ['2', 'L-D', '2027-01-15', 5, [50003], 0],
    ['1', 'L-C', '2027-06-01', 5, [50002], 0],
  ]);
  assert.equal(total, 20);
  assert.deepEqual(semLote, []);
  assert.equal(grupos[0].filial, 'FILIAL 1');
});

test('C-009: o selo mostra a hora da leitura', () => {
  assert.equal(rotuloAtualizado(new Date(2026, 10, 11, 14, 3, 7)), 'Atualizado às 14:03:07');
  assert.equal(rotuloAtualizado(new Date(2026, 10, 11, 0, 0, 0)), 'Atualizado às 00:00:00');
});

test('C-010: falha de leitura vira erro, sem número antigo', () => {
  assert.deepEqual(estadoDaLeitura({ dados: { total: 150 }, erro: new Error('ORA-12170') }), { tipo: 'erro', mensagem: 'Não foi possível consultar o WinThor agora' });
  assert.equal(ERRO_ERP, 'Não foi possível consultar o WinThor agora');
  assert.deepEqual(estadoDaLeitura({ dados: null, erro: null }), { tipo: 'carregando' });
  assert.deepEqual(estadoDaLeitura({ dados: [], erro: null }), { tipo: 'ok', dados: [] });
});

test('C-011: reserva além dos pedidos e pedido sem lote ficam à vista', () => {
  const { grupos, semLote } = agruparReservas([lote('1', 'L-R', '2027-03-11', 30, 10)], [pedido(50006, '1', 'L-R', 7, '2026-11-08'), pedido(50007, '1', null, 4, '2026-11-10')]);
  assert.equal(grupos.length, 1);
  assert.deepEqual([grupos[0].reservado, grupos[0].pedidos.map((p) => p.NUMPED), grupos[0].semPedido], [10, [50006], 3]);
  assert.deepEqual(semLote.map((p) => p.NUMPED), [50007]);
});

test('RN-003: motivo do histórico, depois as observações do lote, depois "Sem motivo vinculado"', () => {
  assert.equal(motivoDoBloqueio({ MOTIVO_BLOQUEIO: 'AVARIA NO TRANSPORTE', OBSBLOQUEIO: 'AGUARDANDO LAUDO' }), 'AVARIA NO TRANSPORTE');
  assert.equal(motivoDoBloqueio({ MOTIVO_BLOQUEIO: null, OBSBLOQUEIO: 'AGUARDANDO LAUDO', OBS1: 'X' }), 'AGUARDANDO LAUDO');
  assert.equal(motivoDoBloqueio({ OBSBLOQUEIO: '   ', OBSBLOQUEIOMANUAL: 'BLOQUEIO MANUAL', OBSANALISE: 'ANALISE' }), 'BLOQUEIO MANUAL');
  assert.equal(motivoDoBloqueio({ OBSANALISE: 'ANALISE', MOTIVOBLOQESTOQUE: 'M' }), 'ANALISE');
  assert.equal(motivoDoBloqueio({ MOTIVOBLOQESTOQUE: 'M', OBS1: 'O1' }), 'M');
  assert.equal(motivoDoBloqueio({ OBS1: 'O1', OBS2: 'O2' }), 'O1');
  assert.equal(motivoDoBloqueio({ OBS2: 'O2' }), 'O2');
  assert.equal(motivoDoBloqueio({}), 'Sem motivo vinculado');
  assert.equal(SEM_MOTIVO, 'Sem motivo vinculado');
});

test('RN-004: bloqueado da filial além dos lotes vira a linha "Sem lote" com o motivo da posição', () => {
  const lotes = [{ CODFILIAL: '1', NUMLOTE: 'L-A', QTBLOQUEADA: 6 }, { CODFILIAL: '1', NUMLOTE: 'L-B', QTBLOQUEADA: 4 }];
  const comSobra = linhasDeBloqueio([{ CODFILIAL: '1', FILIAL: 'MATRIZ', QT_BLOQUEADA: 15, MOTIVO_POSICAO: 'PRODUTO EM ANALISE' }], lotes);
  const semLote = comSobra.find((l) => l.lote === null);
  assert.deepEqual([semLote.codfilial, semLote.filial, semLote.quantidade, semLote.motivo], ['1', 'MATRIZ', 5, 'PRODUTO EM ANALISE']);
  assert.equal(resumoBloqueio(comSobra), 'Estoque bloqueado: 15 un. em 2 lotes · 5 un. sem lote');

  const exato = linhasDeBloqueio([{ CODFILIAL: '1', QT_BLOQUEADA: 10 }], lotes);
  assert.ok(exato.every((l) => l.lote !== null));
  assert.equal(resumoBloqueio(exato), 'Estoque bloqueado: 10 un. em 2 lotes');

  // C-006: produto que não controla lote, e posição sem motivo algum.
  const soPosicao = linhasDeBloqueio([{ CODFILIAL: '2', QT_BLOQUEADA: 8, MOTIVO_POSICAO: 'PRODUTO EM ANALISE' }, { CODFILIAL: '3', QT_BLOQUEADA: 2, MOTIVO_POSICAO: null }], []);
  assert.deepEqual(soPosicao.map((l) => [l.codfilial, l.lote, l.quantidade, l.motivo]), [['2', null, 8, 'PRODUTO EM ANALISE'], ['3', null, 2, 'Sem motivo vinculado']]);
  assert.equal(resumoBloqueio(soPosicao), 'Estoque bloqueado: 10 un. sem lote');
  assert.equal(resumoBloqueio(linhasDeBloqueio([{ CODFILIAL: '1', QT_BLOQUEADA: 1 }], [{ CODFILIAL: '1', NUMLOTE: 'L', QTBLOQUEADA: 1 }])), 'Estoque bloqueado: 1 un. em 1 lote');
  assert.equal(resumoBloqueio([]), 'Nenhum estoque bloqueado');
});

test('RN-005: situação da validade', () => {
  assert.deepEqual(situacaoValidade('2026-11-01', HOJE), { dias: -10, texto: 'Vencido há 10 dias', tom: 'alert' });
  assert.deepEqual(situacaoValidade('2026-11-10', HOJE), { dias: -1, texto: 'Vencido há 1 dia', tom: 'alert' });
  assert.deepEqual(situacaoValidade('2026-11-11', HOJE), { dias: 0, texto: 'Vence hoje', tom: 'attention' });
  assert.deepEqual(situacaoValidade('2026-11-12', HOJE), { dias: 1, texto: 'Vence em 1 dia', tom: 'attention' });
  assert.deepEqual(situacaoValidade('2026-12-01', HOJE), { dias: 20, texto: 'Vence em 20 dias', tom: 'attention' });
  assert.equal(situacaoValidade('2026-12-11', HOJE).tom, 'attention'); // 30 dias
  assert.equal(situacaoValidade('2026-12-12', HOJE).tom, 'leve');      // 31 dias
  assert.deepEqual(situacaoValidade('2027-01-15', HOJE), { dias: 65, texto: 'Vence em 65 dias', tom: 'leve' });
  assert.equal(situacaoValidade('2027-02-09', HOJE).tom, 'leve');      // 90 dias
  assert.deepEqual(situacaoValidade('2027-06-01', HOJE), { dias: 202, texto: 'Vence em 202 dias', tom: 'neutro' });
  assert.deepEqual(situacaoValidade(null, HOJE), { dias: null, texto: 'Sem validade', tom: 'neutro' });
  assert.deepEqual(situacaoValidade('', HOJE), { dias: null, texto: 'Sem validade', tom: 'neutro' });
});

test('RF-013: cada lote traz o seu bloqueio e a sua reserva; bloqueio sem lote fica à vista', () => {
  // C-005 + C-007 na mesma lista: L-A bloqueado, L-B bloqueado e reservado, L-C só reservado.
  const lotes = [lote('1', 'L-C', '2027-06-01', 25, 5), lote('1', 'L-A', '2026-11-01', 40, 0, 6), lote('1', 'L-B', '2026-12-01', 35, 10, 4)];
  const bloqueios = linhasDeBloqueio(
    [{ CODFILIAL: '1', QT_BLOQUEADA: 15, MOTIVO_POSICAO: 'PRODUTO EM ANALISE' }],
    [{ CODFILIAL: '1', NUMLOTE: 'L-A', QTBLOQUEADA: 6, MOTIVO_BLOQUEIO: 'AVARIA NO TRANSPORTE' }, { CODFILIAL: '1', NUMLOTE: 'L-B', QTBLOQUEADA: 4, OBSBLOQUEIO: 'AGUARDANDO LAUDO' }, { CODFILIAL: '1', NUMLOTE: 'L-Z', QTBLOQUEADA: 2 }],
  );
  const { grupos } = agruparReservas(lotes, [pedido(50001, '1', 'L-B', 10, '2026-11-09'), pedido(50002, '1', 'L-C', 5, '2026-11-10')]);
  const { linhas, bloqueiosSoltos } = detalharLotes(lotes, bloqueios, grupos);
  assert.deepEqual(linhas.map((l) => [l.lote.NUMLOTE, l.bloqueio?.motivo ?? null, l.reserva?.pedidos.map((p) => p.NUMPED) ?? null]), [
    ['L-A', 'AVARIA NO TRANSPORTE', null],
    ['L-B', 'AGUARDANDO LAUDO', [50001]],
    ['L-C', null, [50002]],
  ]);
  // O que sobra: a diferença da posição (15 − 12 = 3, "Sem lote") e o lote bloqueado que não veio na lista de lotes.
  assert.deepEqual(bloqueiosSoltos.map((b) => [b.lote, b.quantidade, b.motivo]), [[null, 3, 'PRODUTO EM ANALISE'], ['L-Z', 2, 'Sem motivo vinculado']]);
  assert.deepEqual(detalharLotes([], [], []), { linhas: [], bloqueiosSoltos: [] });
});

test('RN-007: lotes pelo vencimento mais próximo (sem validade por último); bloqueados pela maior quantidade', () => {
  const lotes = [lote('1', 'L-C', '2027-06-01', 1), lote('2', 'L-S', null, 1), lote('1', 'L-A', '2026-11-01', 1), lote('10', 'L-Y', '2026-12-01', 1), lote('2', 'L-X', '2026-12-01', 1)];
  assert.deepEqual(ordenarLotes(lotes).map((l) => l.NUMLOTE), ['L-A', 'L-X', 'L-Y', 'L-C', 'L-S']);
  const bloqueios = linhasDeBloqueio([], [{ CODFILIAL: '1', NUMLOTE: 'P', QTBLOQUEADA: 4 }, { CODFILIAL: '1', NUMLOTE: 'G', QTBLOQUEADA: 6 }, { CODFILIAL: '2', NUMLOTE: 'M', QTBLOQUEADA: 5 }]);
  assert.deepEqual(bloqueios.map((l) => l.lote), ['G', 'M', 'P']);
});

test('RN-009: lote explicado inteiro não mostra sobra; pedidos do lote em ordem de data', () => {
  const { grupos } = agruparReservas([lote('1', 'L-B', '2026-12-01', 35, 10)], [pedido(50020, '1', 'L-B', 4, '2026-11-10'), pedido(50010, '1', 'L-B', 6, '2026-11-09'), pedido(50099, '2', 'L-B', 9, '2026-11-01')]);
  assert.equal(grupos[0].semPedido, 0);
  assert.deepEqual(grupos[0].pedidos.map((p) => p.NUMPED), [50010, 50020]);
  // Pedidos somando MAIS que o lote não geram sobra negativa.
  assert.equal(agruparReservas([lote('1', 'L', null, 5, 2)], [pedido(1, '1', 'L', 9, '2026-11-01')]).grupos[0].semPedido, 0);
  assert.deepEqual(['L', 'M', 'B', 'X', null].map(situacaoDoPedido), ['Liberado', 'Montado', 'Bloqueado', 'X', 'Sem situação']);
});

test('RN-003/C-005: a linha do bloqueio diz quem e quando', () => {
  const [a, b] = linhasDeBloqueio([], [
    { CODFILIAL: '1', FILIAL: 'MATRIZ', NUMLOTE: 'L-A', QTBLOQUEADA: 6, MOTIVO_BLOQUEIO: 'AVARIA NO TRANSPORTE', LOG_RESPONSAVEL: 'MARIA SOUZA', LOG_USUARIO: 'MARIA', DTMOV_BLOQUEIO: '2026-11-05', DTVALIDADE: '2026-11-01' },
    { CODFILIAL: '1', NUMLOTE: 'L-B', QTBLOQUEADA: 4, OBSBLOQUEIO: 'AGUARDANDO LAUDO', LOG_USUARIO: 'JOAO' },
  ]);
  assert.deepEqual([a.lote, a.quantidade, a.motivo, a.quem, a.quando, a.validade, a.filial], ['L-A', 6, 'AVARIA NO TRANSPORTE', 'MARIA SOUZA', '2026-11-05', '2026-11-01', 'MATRIZ']);
  assert.deepEqual([b.motivo, b.quem, b.quando, b.validade, b.filial], ['AGUARDANDO LAUDO', 'JOAO', '', null, '1']);
});
