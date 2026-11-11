// add-004 — Foto do produto vinda do Busca 360 (spec 001: RF-014, D-014).
//
// O mesmo desenho do Mix Builder (p-60604, add-mix-fotos-produtos.mjs): quem
// usa a tela é BUSINESS, e SF JAVASCRIPT com acesso BUSINESS não grava. Então
// quem fala com o Busca 360 e grava o cache é uma SF em cron (roda como
// administrador), e a ficha só lê o cache por SF SQL.
//
// São as DUAS únicas tabelas do projeto, e nenhuma guarda estoque:
//   CW_PRODUTO_FOTO   o endereço da foto principal de cada produto (cache)
//   CW_FOTOS_CONFIG   a chave do Busca 360 e o resultado da última sincronização
// CW_FOTOS_CONFIG fica FORA do perfil (add-003 lê FORA_DO_PERFIL daqui): a
// chave nunca volta em resposta nenhuma e nunca vai para o frontend.
//
// A chave entra pelo .env do sandbox (BUSCA360_CHAVE), como as credenciais do
// WinThor: este script a grava em CW_FOTOS_CONFIG por DML sem migration.
//
// NAO EXECUTE DA MAQUINA LOCAL sem decisao explicita do usuario.
// Uso (no sandbox, depois do add-001 e antes do add-003): cd backend && node add-004-fotos.mjs

import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { jdbcIdWinthor } from './add-001-jdbc-winthor.mjs';

// O simulador lê estes dois blocos direto deste arquivo (simulator/schema.mjs).
const DDL = [
  `CREATE TABLE IF NOT EXISTS CW_PRODUTO_FOTO (
    CODPROD INT NOT NULL PRIMARY KEY,
    URL VARCHAR(1000) NOT NULL DEFAULT '',
    NOME_ARQUIVO VARCHAR(255) NULL,
    BUSCADO_EM VARCHAR(19) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS CW_FOTOS_CONFIG (
    CHAVE VARCHAR(40) NOT NULL PRIMARY KEY,
    VALOR VARCHAR(1000) NULL,
    ATUALIZADO_EM VARCHAR(19) NOT NULL
  )`,
];

const CRON_FOTOS = '0 30 9 * * *';
const MARCA_JDBC = '__JDBC_WINTHOR__';

// Corpo de cwFotosSincronizar. String.raw: o que está escrito aqui é o que roda lá.
const SINCRONIZAR = String.raw`const { runDmlMitra, runQueryMitra } = require('mitra-sdk');

const projectId = Number(process.env.MITRA_PROJECT_ID);
// A publicação troca a marca pelo id da conexão "WinThor"; no simulador ela
// fica como está e a consulta cai nas PC* imitadas.
const jdbcWinthor = Number('__JDBC_WINTHOR__') || 0;
const PADRAO = 'https://busca360.benenutri.com/api/admin/product-images';
const LOTE = 200;
const agora = new Date().toISOString().slice(0, 19);

const sqlTexto = (valor, max) => "'" + String(valor ?? '').trim().slice(0, max).replace(/\\/g, '\\\\').replace(/'/g, "''") + "'";
const linhas = async (sql, jdbcId) => (await runQueryMitra({ projectId, sql, ...(jdbcId ? { jdbcId } : {}) }))?.result?.rows || [];

async function gravarStatus(chave, valor) {
  await runDmlMitra({
    projectId,
    sql: 'INSERT INTO CW_FOTOS_CONFIG (CHAVE, VALOR, ATUALIZADO_EM) VALUES (' + sqlTexto(chave, 40) + ', ' + sqlTexto(valor, 1000) + ", '" + agora + "') " +
      'ON DUPLICATE KEY UPDATE VALOR = VALUES(VALOR), ATUALIZADO_EM = VALUES(ATUALIZADO_EM)',
  });
}

// Foto principal; sem marca de principal, a primeira; sem foto, endereço vazio.
function escolherFoto(imagens) {
  const validas = (Array.isArray(imagens) ? imagens : []).filter((i) => typeof i?.url === 'string');
  const escolhida = validas.find((i) => i.isMain === true) ?? validas[0];
  if (!escolhida || !/^https:\/\/\S+$/.test(escolhida.url) || escolhida.url.length > 1000) return { url: '', nome: '' };
  return { url: escolhida.url, nome: String(escolhida.fileName ?? '') };
}

// ponytail: só produto com algo em estoque (a condição da RN-002), em páginas de
// 1.000 porque a leitura volta no máximo 2.000 linhas. Catálogo inteiro = trocar
// o SELECT de dentro por PCPRODUT, se faltar foto em produto zerado.
async function produtosComEstoque() {
  const todos = [];
  for (let de = 0; ; de += 1000) {
    const pagina = (await linhas(
      'SELECT CODPROD FROM (SELECT C.CODPROD, ROW_NUMBER() OVER (ORDER BY C.CODPROD) AS RN FROM (' +
      'SELECT DISTINCT E.CODPROD FROM PCEST E WHERE NVL(E.QTEST, 0) <> 0 OR NVL(E.QTRESERV, 0) <> 0 OR NVL(E.QTBLOQUEADA, 0) <> 0 OR NVL(E.QTINDENIZ, 0) <> 0' +
      ') C) WHERE RN > ' + de + ' AND RN <= ' + (de + 1000),
      jdbcWinthor,
    )).map((l) => Number(l.CODPROD)).filter((c) => Number.isInteger(c) && c > 0);
    todos.push(...pagina);
    if (pagina.length < 1000) break;
  }
  return todos;
}

const config = Object.fromEntries((await linhas(
  "SELECT CHAVE, VALOR FROM CW_FOTOS_CONFIG WHERE CHAVE IN ('FOTOS_URL', 'FOTOS_CHAVE')",
)).map((l) => [l.CHAVE, l.VALOR]));
if (!config.FOTOS_CHAVE) {
  return { rows: [{ OK: false, MENSAGEM: 'Chave do Busca 360 não cadastrada (BUSCA360_CHAVE no .env do sandbox + add-004).' }] };
}

const pedidos = String(event?.codprods ?? '').split(',').map((c) => c.trim()).filter((c) => /^\d{1,9}$/.test(c)).map(Number).filter((c) => c > 0);
const codigos = pedidos.length ? [...new Set(pedidos)] : await produtosComEstoque();

let consultados = 0;
let comFoto = 0;
let erro = '';
for (let i = 0; i < codigos.length; i += LOTE) {
  const lote = codigos.slice(i, i + LOTE);
  let dados;
  try {
    const resposta = await fetch(String(config.FOTOS_URL || PADRAO) + '?codProds=' + lote.join(','), {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + config.FOTOS_CHAVE, Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (!resposta.ok) {
      erro = resposta.status === 401 || resposta.status === 403 ? 'O Busca 360 recusou o acesso' : 'O Busca 360 respondeu ' + resposta.status;
      break;
    }
    dados = (await resposta.json())?.data;
  } catch {
    erro = 'O Busca 360 não respondeu';
    break;
  }
  if (!Array.isArray(dados)) {
    erro = 'Resposta do Busca 360 fora do formato';
    break;
  }

  // Falha no meio deixa intactas as fotos já guardadas dos lotes seguintes.
  const porCodigo = new Map(dados.map((d) => [Number(d?.codProd), d?.images]));
  const valores = lote.map((codprod) => {
    const foto = escolherFoto(porCodigo.get(codprod));
    if (foto.url) comFoto += 1;
    return '(' + codprod + ', ' + sqlTexto(foto.url, 1000) + ', ' + sqlTexto(foto.nome, 255) + ", '" + agora + "')";
  });
  await runDmlMitra({
    projectId,
    sql: 'INSERT INTO CW_PRODUTO_FOTO (CODPROD, URL, NOME_ARQUIVO, BUSCADO_EM) VALUES ' + valores.join(', ') + ' ' +
      'ON DUPLICATE KEY UPDATE URL = VALUES(URL), NOME_ARQUIVO = VALUES(NOME_ARQUIVO), BUSCADO_EM = VALUES(BUSCADO_EM)',
  });
  consultados += lote.length;
}

await gravarStatus('LAST_ERROR', erro);
if (!erro) await gravarStatus('LAST_SUCCESS_AT', agora);

return { rows: [{ OK: !erro, MENSAGEM: erro || 'Fotos atualizadas', CONSULTADOS: consultados, COM_FOTO: comFoto, TOTAL: codigos.length }] };
`;

export const definitions = [
  {
    name: 'cwProdutoFoto',
    type: 'SQL',
    description: 'RF-014 - endereço da foto principal do produto, lido do cache CW_PRODUTO_FOTO (banco do projeto). Sem linha = sem foto. Params: codprod int',
    code: `SELECT F.URL
FROM CW_PRODUTO_FOTO F
WHERE F.CODPROD = {{codprod}}
  AND F.URL <> ''`,
  },
  {
    name: 'cwFotosSincronizar',
    type: 'JAVASCRIPT',
    description: 'RF-014 - busca no Busca 360 a foto principal dos produtos com estoque no WinThor (ou dos codprods informados) e atualiza CW_PRODUTO_FOTO. Cron diário; fora do perfil. Nunca devolve a chave. Params: codprods string opcional (\'1,44,714\')',
    code: SINCRONIZAR,
    cron: CRON_FOTOS,
  },
];

// O que o perfil dos usuários NÃO recebe (add-003): a tabela da chave e a SF que grava.
export const FORA_DO_PERFIL = { tabelas: ['CW_FOTOS_CONFIG'], funcoes: ['cwFotosSincronizar'] };

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

  for (const sql of DDL) await sdk.runDdlMitra({ projectId, sql });
  console.log('tabelas ok: CW_PRODUTO_FOTO, CW_FOTOS_CONFIG');

  // A chave vai por DML SEM migration: não pode parar num arquivo commitado.
  const chave = String(process.env.BUSCA360_CHAVE ?? '').trim();
  if (!chave) {
    console.log('BUSCA360_CHAVE ausente no .env: a chave gravada (se houver) não foi alterada.');
  } else {
    if (chave.length < 10 || chave.length > 500) throw new Error('BUSCA360_CHAVE com tamanho inesperado (esperado entre 10 e 500 caracteres).');
    const texto = (valor) => `'${valor.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
    await sdk.runDmlMitra({
      projectId,
      sql: `INSERT INTO CW_FOTOS_CONFIG (CHAVE, VALOR, ATUALIZADO_EM) VALUES ('FOTOS_CHAVE', ${texto(chave)}, '${new Date().toISOString().slice(0, 19)}') ` +
        'ON DUPLICATE KEY UPDATE VALOR = VALUES(VALOR), ATUALIZADO_EM = VALUES(ATUALIZADO_EM)',
    });
    console.log('chave do Busca 360 gravada em CW_FOTOS_CONFIG.');
  }

  const jdbcId = await jdbcIdWinthor(projectId);
  const listar = async () => new Map(((await sdk.listServerFunctionsMitra({ projectId })).result ?? []).map((f) => [f.name, f.id]));
  let mapa = await listar();
  for (const definicao of definitions) {
    const corpo = {
      projectId, name: definicao.name, type: definicao.type, description: definicao.description,
      code: definicao.code.replace(MARCA_JDBC, String(jdbcId)),
    };
    const id = mapa.get(definicao.name);
    if (id) await sdk.updateServerFunctionMitra({ ...corpo, serverFunctionId: id });
    else await sdk.createServerFunctionMitra(corpo);
    console.log(`${id ? 'atualizada' : 'criada'}: ${definicao.name}`);
  }
  // O cron entra por update, com o id relido (como no Mix Builder).
  mapa = await listar();
  for (const definicao of definitions.filter((d) => d.cron)) {
    await sdk.updateServerFunctionMitra({ projectId, serverFunctionId: mapa.get(definicao.name), cronExpression: definicao.cron });
    console.log(`cron ${definicao.cron}: ${definicao.name}`);
  }

  console.log('Pronto. Rode `node add-003-perfil-acesso.mjs` e `node sync-server-function-map.mjs`;');
  console.log('depois execute cwFotosSincronizar uma vez para a primeira carga das fotos.');
}
