// Configuracao do simulador local do Mitra — BN Search (consultas ao WinThor).
//
// Unico arquivo do simulador que muda de projeto para projeto.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

/* ── identidade ── */

export const PROJECT_LABEL = 'BN Search — Simulador local';
// Semente fixa: NAO muda quando o p-NNNNN do projeto nascer na plataforma.
export const SEED = 3114;

/* ── rede ── */

// 3114 / 5184 no mitra-hub.
export const PORT = Number(process.env.SIMULATOR_PORT || 3114);
export const PROJECT_ID = Number(process.env.SIMULATOR_PROJECT_ID || 1);
export const DEFAULT_PASSWORD = process.env.SIMULATOR_PASSWORD || 'mitra123';

/* ── banco ── */

export const DB_PATH = process.env.SIMULATOR_DB_PATH || join(HERE, 'data', 'mitra-sim.db');

// Nao existe setup-backend.mjs: o schema do simulador sao as PC* do WinThor,
// imitadas em schema-winthor.mjs, mais as duas tabelas da foto (add-004).
export const DDL_SOURCES = [join(HERE, 'schema-winthor.mjs'), join(HERE, '..', 'add-004-fotos.mjs')];

export const HEALTH_TABLE = 'PCPRODUT';

/* ── server functions ── */

// add-001-jdbc-winthor.mjs nao tem definitions; add-003-perfil-acesso.mjs
// executa no import e so roda no sandbox — os dois ficam fora.
export const PUBLISH_ORDER = ['add-002-estoque.mjs', 'add-004-fotos.mjs'];

export const FRONTEND_MAP = join(HERE, '..', '..', 'frontend', 'src', 'lib', 'server-functions.ts');
export const MAP_NAMES = 'SERVER_FUNCTION_NAMES';
export const MAP_IDS = 'SERVER_FUNCTIONS';

// Entrada plausivel para o `sim:check` executar as leituras.
export const CHECK_INPUT = {
  codigo: '1001', ean: '', termo1: 'WHEY', termo2: '', termo3: '',
  codfilial: '', codprod: '1001', limite: '50', offset: '0',
};
