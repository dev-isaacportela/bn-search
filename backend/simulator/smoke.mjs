// A suíte de testes do backend: as cw* reais (o mesmo SQL que é publicado)
// sobre um banco descartável, com assert do que a spec 001 exige.
// Um teste por linha "regra de negócio" da seção Testes do plan.
//
// Uso: cd backend && npm run sim:smoke   (ou npm test, que roda check + smoke)

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SEED } from './config.mjs';
import { seedDatabase, dataRelativa } from './seed.mjs';
import { registerMysqlFunctions } from './mysql-dialect.mjs';
import { loadDefinitions, createRunner } from './runtime.mjs';

const DB = join(tmpdir(), `bn-search-${SEED}-${process.pid}-smoke.db`);
seedDatabase(DB, { reset: true });

const db = new DatabaseSync(DB);
registerMysqlFunctions(db);
const { byName } = await loadDefinitions();
const execute = createRunner(db);

const linhas = async (nome, input, userId = 1) => {
  const definicao = byName.get(nome);
  assert.ok(definicao, `server function ${nome} nao existe em PUBLISH_ORDER`);
  return (await execute(definicao, input, userId)).rows;
};

const SEM_BUSCA = { codigo: 0, ean: '', termo1: '', termo2: '', termo3: '', codfilial: '' };
const buscar = (filtro, pagina = { limite: 50, offset: 0 }) => linhas('cwEstoqueBuscar', { ...SEM_BUSCA, ...filtro, ...pagina });
const total = async (filtro) => Number((await linhas('cwEstoqueBuscarTotal', { ...SEM_BUSCA, ...filtro }))[0].TOTAL);
const produto = (codprod, codfilial = '') => ({ codprod, codfilial });
/** Só os números da posição, na ordem total/disponível/reservado/bloqueado/avariado. */
const posicao = (l) => [l.QT_TOTAL, l.QT_DISPONIVEL, l.QT_RESERVADA, l.QT_BLOQUEADA, l.QT_AVARIADA].map(Number);

let feitos = 0;
const teste = async (titulo, fn) => {
  try {
    await fn();
  } catch (erro) {
    console.log(`  FALHOU  ${titulo}\n          ${erro.message}`);
    db.close();
    process.exit(1);
  }
  feitos += 1;
  console.log(`  ok  ${titulo}`);
};

await teste('sessão: :VAR_USER identifica quem chama, nunca o input', async () => {
  const [eu] = await linhas('cwSessao', { email: 'invasor@empresa.local' }, 2);
  assert.deepEqual([eu.NOME, eu.EMAIL], ['Comercial Local', 'comercial@benenutri.local']);
});

await teste('C-001: código, descrição e EAN encontram o 1001 com a soma das filiais', async () => {
  for (const filtro of [{ codigo: 1001 }, { termo1: 'WHEY', termo2: 'BAUN' }, { termo1: 'BAUN', termo2: 'WHEY' }, { ean: '7890000010010' }]) {
    const lista = await buscar(filtro);
    assert.equal(lista.length, 1, JSON.stringify(filtro));
    assert.equal(Number(lista[0].CODPROD), 1001);
    assert.deepEqual(posicao(lista[0]), [150, 105, 20, 15, 10]);
  }
  assert.equal((await buscar({ codigo: 1001 }))[0].DESCRICAO, 'WHEY PROTEIN BAUNILHA 900G');
});

await teste('C-002: busca sem resultado devolve zero; apóstrofo não quebra', async () => {
  assert.equal((await buscar({ termo1: 'XYZABC' })).length, 0);
  assert.equal(await total({ termo1: 'XYZABC' }), 0);
  const [agua] = await buscar({ termo1: "D'AGUA" });
  assert.equal(Number(agua.CODPROD), 3003);
  // Filtro todo desligado não devolve o catálogo inteiro.
  assert.equal((await buscar({})).length, 0);
});

await teste('C-003: posição do 1001 por filial', async () => {
  const filiais = await linhas('cwEstoqueFiliais', produto(1001));
  assert.deepEqual(filiais.map((f) => f.CODFILIAL), ['1', '2']);
  assert.deepEqual(posicao(filiais[0]), [100, 70, 15, 10, 5]);
  assert.deepEqual(posicao(filiais[1]), [50, 35, 5, 5, 5]);
  assert.equal(filiais[0].FILIAL, 'BENENUTRI MATRIZ GOIANIA');
});

await teste('C-004: lotes do 1001 na filial 1 com validade e saldo', async () => {
  const lotes = await linhas('cwEstoqueLotes', produto(1001, '1'));
  assert.deepEqual(lotes.map((l) => [l.NUMLOTE, l.DTVALIDADE, Number(l.QT)]), [
    ['L-A', dataRelativa(-10), 40], ['L-B', dataRelativa(20), 35], ['L-C', dataRelativa(202), 25],
  ]);
  const b = lotes[1];
  assert.deepEqual([b.QT_DISPONIVEL, b.QTRESERV, b.QTBLOQUEADA, b.QTINDENIZ].map(Number), [21, 10, 4, 0]);
});

await teste('C-005: bloqueados do 1001 na filial 1 com motivo, quem e quando', async () => {
  const [a, b, ...resto] = await linhas('cwEstoqueBloqueios', produto(1001, '1'));
  assert.equal(resto.length, 0);
  assert.deepEqual([a.NUMLOTE, Number(a.QTBLOQUEADA), Number(a.CODDEVOL), a.MOTIVO_BLOQUEIO], ['L-A', 6, 31, 'AVARIA NO TRANSPORTE']);
  assert.equal(a.FUNCIONARIO_LANCAMENTO, 'MARIA SOUZA');
  assert.equal(a.DTMOV_BLOQUEIO, dataRelativa(-6));
  assert.equal(a.DTVALIDADE, dataRelativa(-10));
  assert.deepEqual([b.NUMLOTE, Number(b.QTBLOQUEADA), b.MOTIVO_BLOQUEIO, b.OBSBLOQUEIO], ['L-B', 4, null, 'AGUARDANDO LAUDO']);
});

await teste('C-006: produto sem lote traz o bloqueio e o motivo na posição da filial', async () => {
  const [f2] = await linhas('cwEstoqueFiliais', produto(2002));
  assert.deepEqual([f2.CODFILIAL, Number(f2.QT_BLOQUEADA), f2.MOTIVO_POSICAO], ['2', 8, 'PRODUTO EM ANALISE']);
  assert.equal((await linhas('cwEstoqueLotes', produto(2002))).length, 0);
  assert.equal((await linhas('cwEstoqueBloqueios', produto(2002))).length, 0);
  // O motivo da posição também sai do cadastro de motivos (CODDEVOL).
  const filiais1010 = await linhas('cwEstoqueFiliais', produto(1010));
  assert.equal(filiais1010.find((f) => f.CODFILIAL === '2').MOTIVO_POSICAO, 'DIVERGENCIA DE INVENTARIO');
});

await teste('C-007: reservas do 1001 por lote e os pedidos que reservaram', async () => {
  const lotes = (await linhas('cwEstoqueLotes', produto(1001))).filter((l) => Number(l.QTRESERV) > 0);
  assert.deepEqual(lotes.map((l) => [l.CODFILIAL, l.NUMLOTE, Number(l.QTRESERV)]), [['1', 'L-B', 10], ['1', 'L-C', 5], ['2', 'L-D', 5]]);
  assert.equal(lotes[2].DTVALIDADE, dataRelativa(65));

  const pedidos = await linhas('cwEstoqueReservas', produto(1001));
  assert.deepEqual(pedidos.map((p) => [Number(p.NUMPED), p.CODFILIAL, p.NUMLOTE, Number(p.QT_RESERVADA), p.POSICAO]), [
    [50001, '1', 'L-B', 10, 'L'], [50002, '1', 'L-C', 5, 'M'], [50003, '2', 'L-D', 5, 'B'],
  ]);
  assert.deepEqual([pedidos[0].CLIENTE, pedidos[0].VENDEDOR, pedidos[0].DATA_PEDIDO], ['HOSPITAL SAO LUCAS', 'CARLOS LIMA', dataRelativa(-2)]);
});

await teste('C-008: filtro de filial vale para busca, posição, lotes, bloqueios e reservas', async () => {
  assert.deepEqual(posicao((await buscar({ codigo: 1001, codfilial: '2' }))[0]), [50, 35, 5, 5, 5]);
  const filiais = await linhas('cwEstoqueFiliais', produto(1001, '2'));
  assert.deepEqual(filiais.map((f) => f.CODFILIAL), ['2']);
  assert.deepEqual((await linhas('cwEstoqueLotes', produto(1001, '2'))).map((l) => l.NUMLOTE), ['L-D']);
  assert.deepEqual((await linhas('cwEstoqueBloqueios', produto(1001, '2'))).map((l) => l.NUMLOTE), ['L-D']);
  assert.deepEqual((await linhas('cwEstoqueReservas', produto(1001, '2'))).map((p) => Number(p.NUMPED)), [50003]);
});

await teste('C-011: reserva com pedido parcial e pedido sem lote', async () => {
  const pedidos = await linhas('cwEstoqueReservas', produto(5005));
  assert.deepEqual(pedidos.map((p) => [Number(p.NUMPED), p.NUMLOTE, Number(p.QT_RESERVADA)]), [[50006, 'L-R', 7], [50007, null, 4]]);
  const [lote] = await linhas('cwEstoqueLotes', produto(5005));
  assert.deepEqual([lote.NUMLOTE, Number(lote.QTRESERV)], ['L-R', 10]);
});

await teste('RN-001: disponível = total − bloqueado − avariado − reservado, nunca negativo', async () => {
  const [f1] = await linhas('cwEstoqueFiliais', produto(1001, '1'));
  assert.equal(Number(f1.QT_DISPONIVEL), 70);
  const [barra] = await linhas('cwEstoqueFiliais', produto(6006));
  assert.deepEqual([Number(barra.QT_TOTAL), Number(barra.QT_RESERVADA), Number(barra.QT_DISPONIVEL)], [5, 20, 0]);
  assert.equal(Number((await buscar({ codigo: 6006 }))[0].QT_DISPONIVEL), 0);
});

await teste('RN-002: filial com tudo zerado não aparece', async () => {
  const filiais = await linhas('cwEstoqueFiliais', produto(1001));
  assert.ok(!filiais.some((f) => f.CODFILIAL === '3'));
  assert.equal((await linhas('cwEstoqueFiliais', produto(1001, '3'))).length, 0);
});

await teste('RN-003: motivo do histórico mais recente; quem bloqueou não é quem desbloqueou', async () => {
  const [a, b] = await linhas('cwEstoqueBloqueios', produto(1001, '1'));
  // L-A tem dois lançamentos: vale o de 6 dias atrás (31), não o de 40 (32, VALIDADE CURTA).
  assert.deepEqual([a.MOTIVO_BLOQUEIO, a.ORIGEM_MOTIVO, a.ROTINALANC], ['AVARIA NO TRANSPORTE', 'PCMOVBLOQUEIO', '1101']);
  assert.equal(a.LOG_RESPONSAVEL, 'MARIA SOUZA');
  // L-B: bloqueado por JOAO PEREIRA; PEDRO ALVES só desbloqueou parte depois.
  assert.equal(b.LOG_RESPONSAVEL, 'JOAO PEREIRA');
  assert.equal(b.DTMOV_BLOQUEIO, dataRelativa(-8));
  // L-D (filial 2): bloqueio sem histórico e sem observação — a tela dirá "Sem motivo vinculado".
  const [d] = await linhas('cwEstoqueBloqueios', produto(1001, '2'));
  assert.deepEqual([d.MOTIVO_BLOQUEIO, d.OBSBLOQUEIO, d.LOG_RESPONSAVEL], [null, null, null]);
});

await teste('RN-006: lote excluído e lote zerado não voltam', async () => {
  const lotes = (await linhas('cwEstoqueLotes', produto(1001, '1'))).map((l) => l.NUMLOTE);
  assert.ok(!lotes.includes('L-X') && !lotes.includes('L-Z'), lotes.join(','));
});

await teste('RN-008: produto inativo volta marcado', async () => {
  assert.equal(Number((await buscar({ codigo: 4004 }))[0].INATIVO), 1);
  assert.equal(Number((await buscar({ codigo: 1001 }))[0].INATIVO), 0);
  assert.equal(Number((await linhas('cwEstoqueProduto', produto(4004)))[0].INATIVO), 1);
});

await teste('RN-009: pedido faturado e cancelado não contam como reserva; ordem por data', async () => {
  const pedidos = await linhas('cwEstoqueReservas', produto(1001));
  const numeros = pedidos.map((p) => Number(p.NUMPED));
  assert.ok(!numeros.includes(50004) && !numeros.includes(50005), numeros.join(','));
  assert.deepEqual(pedidos.map((p) => p.POSICAO).sort(), ['B', 'L', 'M']);
  assert.deepEqual(pedidos.map((p) => p.DATA_PEDIDO), [dataRelativa(-2), dataRelativa(-1), dataRelativa(0)]);
});

await teste('RF-002: paginação de 120 resultados, 50 por página, por descrição', async () => {
  assert.equal(await total({ termo1: 'PAGINACAO' }), 120);
  const pagina2 = await buscar({ termo1: 'PAGINACAO' }, { limite: 50, offset: 50 });
  assert.equal(pagina2.length, 50);
  assert.equal(pagina2[0].DESCRICAO, 'ITEM PAGINACAO 051');
  assert.equal(pagina2[49].DESCRICAO, 'ITEM PAGINACAO 100');
  assert.equal((await buscar({ termo1: 'PAGINACAO' }, { limite: 50, offset: 100 })).length, 20);
});

await teste('RF-003/RF-007: cabeçalho do produto e lista de filiais', async () => {
  const [p] = await linhas('cwEstoqueProduto', produto(1001));
  assert.deepEqual([p.DESCRICAO, p.EMBALAGEM, p.CODAUXILIAR, p.FORNECEDOR], ['WHEY PROTEIN BAUNILHA 900G', 'POTE 900G', '7890000010010', 'NUTRI LABS INDUSTRIA']);
  assert.equal((await linhas('cwEstoqueProduto', produto(999999))).length, 0);
  assert.deepEqual((await linhas('cwFiliais', {})).map((f) => f.CODFILIAL), ['1', '2', '3']);
});

await teste('RF-014: a ficha lê a foto do cache; produto sem foto ou nunca consultado não devolve linha', async () => {
  const [foto] = await linhas('cwProdutoFoto', { codprod: 1001 });
  assert.match(foto.URL, /^data:image\/svg/);
  assert.equal((await linhas('cwProdutoFoto', { codprod: 3003 })).length, 0); // consultado, sem foto
  assert.equal((await linhas('cwProdutoFoto', { codprod: 2002 })).length, 0); // nunca consultado
});

await teste('RF-014: a sincronização guarda a foto principal dos produtos com estoque e nunca devolve a chave', async () => {
  const sincronizar = async (input = {}) => (await linhas('cwFotosSincronizar', input))[0];
  assert.deepEqual(await sincronizar(), { OK: false, MENSAGEM: 'Chave do Busca 360 não cadastrada (BUSCA360_CHAVE no .env do sandbox + add-004).' });

  // Um Busca 360 de mentira: confere a chave e responde no formato do de verdade.
  const CHAVE = 'chave-de-teste-123';
  const pedidos = [];
  const busca360 = createServer((req, res) => {
    if (req.headers.authorization !== `Bearer ${CHAVE}`) { res.writeHead(401).end(); return; }
    const codigos = new URL(req.url, 'http://x').searchParams.get('codProds').split(',').map(Number);
    pedidos.push(codigos);
    const fotos = {
      1001: [{ url: 'https://fotos.exemplo/1001-verso.jpg', isMain: false }, { url: 'https://fotos.exemplo/1001-frente.jpg', isMain: true, fileName: 'frente.jpg' }],
      2002: [{ url: 'https://fotos.exemplo/2002.jpg' }],
      5005: [{ url: 'http://sem-https.exemplo/5005.jpg', isMain: true }],
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: codigos.filter((c) => fotos[c]).map((c) => ({ codProd: c, images: fotos[c] })) }));
  }).listen(0, '127.0.0.1');
  await new Promise((pronto) => busca360.once('listening', pronto));
  const gravar = db.prepare("INSERT INTO CW_FOTOS_CONFIG (CHAVE, VALOR, ATUALIZADO_EM) VALUES (?, ?, '') ON CONFLICT (CHAVE) DO UPDATE SET VALOR = excluded.VALOR");
  gravar.run('FOTOS_URL', `http://127.0.0.1:${busca360.address().port}/api/admin/product-images`);
  const urlDe = (codprod) => db.prepare('SELECT URL FROM CW_PRODUTO_FOTO WHERE CODPROD = ?').get(codprod)?.URL;

  try {
    // Chave errada: o erro aparece e o cache fica como estava.
    gravar.run('FOTOS_CHAVE', 'chave-errada-456');
    assert.deepEqual(await sincronizar(), { OK: false, MENSAGEM: 'O Busca 360 recusou o acesso', CONSULTADOS: 0, COM_FOTO: 0, TOTAL: (await sincronizar()).TOTAL });
    assert.match(urlDe(1001), /^data:image\/svg/);

    gravar.run('FOTOS_CHAVE', CHAVE);
    const saida = await sincronizar();
    assert.equal(saida.OK, true, saida.MENSAGEM);
    assert.equal(saida.CONSULTADOS, saida.TOTAL);
    assert.equal(saida.COM_FOTO, 2);
    assert.ok(!JSON.stringify(saida).includes(CHAVE));
    // Só produto com algo em estoque é consultado (RN-002): o 3003 tem estoque, o 999999 não existe.
    const consultados = pedidos.flat();
    assert.ok(consultados.includes(1001) && consultados.includes(2002) && !consultados.includes(999999));
    assert.ok(pedidos.every((lote) => lote.length <= 200));

    assert.equal(urlDe(1001), 'https://fotos.exemplo/1001-frente.jpg'); // a principal, não a primeira
    assert.equal(urlDe(2002), 'https://fotos.exemplo/2002.jpg');        // sem principal: a primeira
    assert.equal(urlDe(5005), '');                                      // endereço sem https não entra
    assert.equal(urlDe(1010), '');                                      // consultado, sem foto
    assert.equal((await linhas('cwProdutoFoto', { codprod: 2002 }))[0].URL, 'https://fotos.exemplo/2002.jpg');
    assert.equal(db.prepare("SELECT VALOR FROM CW_FOTOS_CONFIG WHERE CHAVE = 'LAST_ERROR'").get().VALOR, '');

    // Só os códigos pedidos, e entrada suja não vira consulta.
    pedidos.length = 0;
    assert.equal((await sincronizar({ codprods: '1001, 1001,abc,0' })).TOTAL, 1);
    assert.deepEqual(pedidos, [[1001]]);
  } finally {
    busca360.close();
  }
});

console.log(`\n  ${feitos} verificacoes passaram.`);
db.close();
for (const sufixo of ['', '-wal', '-shm']) rmSync(`${DB}${sufixo}`, { force: true });
