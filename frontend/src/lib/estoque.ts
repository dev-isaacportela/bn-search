// Regra pura da consulta de estoque (spec 001). Sem React, sem SDK: é o que
// frontend/tests/estoque.test.mjs testa com `node --test`.
//
// As linhas chegam do backend com colunas em UPPERCASE (add-002-estoque.mjs).

/* ─────────────── busca (RF-001, C-002) ─────────────── */

export interface Busca {
  codigo: number;
  ean: string;
  termo1: string;
  termo2: string;
  termo3: string;
  /** Palavras além da terceira, que a consulta não usa. */
  ignoradas: number;
}

/**
 * Texto digitado → parâmetros de cwEstoqueBuscar. Só dígitos é código ou EAN;
 * o resto vira até 3 palavras da descrição, em maiúsculas e sem acento (como
 * o ERP grava). Aspas NÃO são escapadas: a plataforma liga o valor como
 * parâmetro. `%` e `_` saem porque são curinga do LIKE. `null` = não buscar.
 */
export function montarBusca(texto: string): Busca | null {
  const limpo = String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[%_]/g, ' ')
    .toUpperCase()
    .trim()
    .slice(0, 80);
  if (!limpo) return null;
  const vazia = { codigo: 0, ean: '', termo1: '', termo2: '', termo3: '', ignoradas: 0 };
  if (/^\d+$/.test(limpo)) {
    // CODPROD cabe em 9 dígitos; acima disso é só EAN.
    return { ...vazia, codigo: limpo.length <= 9 ? Number(limpo) : 0, ean: limpo };
  }
  if (limpo.length < 2) return null;
  const palavras = limpo.split(/\s+/);
  return {
    ...vazia,
    termo1: palavras[0],
    termo2: palavras[1] ?? '',
    termo3: palavras[2] ?? '',
    ignoradas: Math.max(0, palavras.length - 3),
  };
}

/* ─────────────── formato ─────────────── */

/** Quantidade em pt-BR, até 3 casas (o ERP guarda fração para kg e litro). */
export function qtd(valor: unknown): string {
  return (Number(valor) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

/** C-009: a hora da leitura, do relógio de quem está vendo. */
export function rotuloAtualizado(lidoEm: Date): string {
  const dois = (n: number) => String(n).padStart(2, '0');
  return `Atualizado às ${dois(lidoEm.getHours())}:${dois(lidoEm.getMinutes())}:${dois(lidoEm.getSeconds())}`;
}

/* ─────────────── leitura (RF-011, C-010) ─────────────── */

export const ERRO_ERP = 'Não foi possível consultar o WinThor agora';

type Estado<T> = { tipo: 'carregando' } | { tipo: 'erro'; mensagem: string } | { tipo: 'ok'; dados: T };

/** Com erro, nenhum dado antigo é exibido como se fosse atual. */
export function estadoDaLeitura<T>(leitura: { dados?: T | null; erro?: unknown }): Estado<T> {
  if (leitura.erro) return { tipo: 'erro', mensagem: ERRO_ERP };
  if (leitura.dados === null || leitura.dados === undefined) return { tipo: 'carregando' };
  return { tipo: 'ok', dados: leitura.dados };
}

/* ─────────────── posição (RF-003) ─────────────── */

interface LinhaFilial {
  CODFILIAL: string;
  FILIAL?: string | null;
  QT_TOTAL: unknown;
  QT_DISPONIVEL: unknown;
  QT_RESERVADA: unknown;
  QT_BLOQUEADA: unknown;
  QT_AVARIADA: unknown;
  MOTIVO_POSICAO?: string | null;
}

/** Os cinco indicadores: a soma das filiais do recorte. */
export function somarPosicao(filiais: LinhaFilial[]) {
  const soma = (coluna: keyof LinhaFilial) => filiais.reduce((total, f) => total + (Number(f[coluna]) || 0), 0);
  return {
    total: soma('QT_TOTAL'),
    disponivel: soma('QT_DISPONIVEL'),
    reservado: soma('QT_RESERVADA'),
    bloqueado: soma('QT_BLOQUEADA'),
    avariado: soma('QT_AVARIADA'),
  };
}

/* ─────────────── validade (RN-005, RN-007, RF-010) ─────────────── */

const DIA = 86400000;
const emDias = (iso: string) => Math.round(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DIA);

type TomValidade = 'alert' | 'attention' | 'leve' | 'neutro';

/** RN-005. `hoje` e `validade` em AAAA-MM-DD. */
export function situacaoValidade(validade: string | null | undefined, hoje: string): { dias: number | null; texto: string; tom: TomValidade } {
  if (!validade) return { dias: null, texto: 'Sem validade', tom: 'neutro' };
  const dias = emDias(validade) - emDias(hoje);
  const plural = (n: number) => `${n} ${n === 1 ? 'dia' : 'dias'}`;
  if (dias < 0) return { dias, texto: `Vencido há ${plural(-dias)}`, tom: 'alert' };
  if (dias === 0) return { dias, texto: 'Vence hoje', tom: 'attention' };
  return { dias, texto: `Vence em ${plural(dias)}`, tom: dias <= 30 ? 'attention' : dias <= 90 ? 'leve' : 'neutro' };
}

interface LinhaLote {
  CODFILIAL: string;
  FILIAL?: string | null;
  NUMLOTE: string | null;
  DTVALIDADE: string | null;
  QT: unknown;
  QT_DISPONIVEL?: unknown;
  QTRESERV: unknown;
  QTBLOQUEADA: unknown;
  QTINDENIZ?: unknown;
}

/** RN-007: vencimento mais próximo primeiro; sem validade por último. */
export function ordenarLotes<T extends { DTVALIDADE: string | null; CODFILIAL: string; NUMLOTE: string | null }>(lotes: T[]): T[] {
  const chave = (l: T) => `${l.DTVALIDADE || '9999-12-31'}|${l.CODFILIAL.padStart(4, '0')}|${l.NUMLOTE ?? ''}`;
  return [...lotes].sort((a, b) => chave(a).localeCompare(chave(b)));
}

/* ─────────────── bloqueados (RF-005, RN-003, RN-004, RN-007) ─────────────── */

export const SEM_MOTIVO = 'Sem motivo vinculado';

interface LinhaBloqueio {
  CODFILIAL: string;
  FILIAL?: string | null;
  NUMLOTE: string | null;
  QTBLOQUEADA: unknown;
  QTRESERV?: unknown;
  CODDEVOL?: unknown;
  MOTIVO_BLOQUEIO?: string | null;
  DTMOV_BLOQUEIO?: string | null;
  LOG_RESPONSAVEL?: string | null;
  FUNCIONARIO_LANCAMENTO?: string | null;
  LOG_USUARIO?: string | null;
  OBSBLOQUEIO?: string | null;
  OBSBLOQUEIOMANUAL?: string | null;
  OBSANALISE?: string | null;
  MOTIVOBLOQESTOQUE?: string | null;
  OBS1?: string | null;
  OBS2?: string | null;
  DTVALIDADE?: string | null;
}

const texto = (valor: unknown) => String(valor ?? '').trim();

/** RN-003: motivo do histórico; senão as observações do lote, nesta ordem; senão "Sem motivo vinculado". */
export function motivoDoBloqueio(lote: LinhaBloqueio): string {
  const candidatos = [lote.MOTIVO_BLOQUEIO, lote.OBSBLOQUEIO, lote.OBSBLOQUEIOMANUAL, lote.OBSANALISE, lote.MOTIVOBLOQESTOQUE, lote.OBS1, lote.OBS2];
  return candidatos.map(texto).find(Boolean) ?? SEM_MOTIVO;
}

export interface Bloqueio {
  chave: string;
  codfilial: string;
  filial: string;
  /** null = bloqueio da posição da filial, sem lote (RN-004). */
  lote: string | null;
  quantidade: number;
  motivo: string;
  quem: string;
  quando: string;
  validade: string | null;
}

/**
 * As linhas da aba Bloqueados: um por lote bloqueado e, onde o bloqueado da
 * filial passa da soma dos lotes, uma linha "Sem lote" com a diferença e o
 * motivo da posição (RN-004). Maior quantidade primeiro (RN-007).
 */
export function linhasDeBloqueio(filiais: LinhaFilial[], lotes: LinhaBloqueio[]): Bloqueio[] {
  const linhas: Bloqueio[] = lotes.map((l) => ({
    chave: `${l.CODFILIAL}|${l.NUMLOTE ?? ''}`,
    codfilial: l.CODFILIAL,
    filial: texto(l.FILIAL) || l.CODFILIAL,
    lote: l.NUMLOTE ?? '',
    quantidade: Number(l.QTBLOQUEADA) || 0,
    motivo: motivoDoBloqueio(l),
    quem: [l.LOG_RESPONSAVEL, l.FUNCIONARIO_LANCAMENTO, l.LOG_USUARIO].map(texto).find(Boolean) ?? '',
    quando: texto(l.DTMOV_BLOQUEIO),
    validade: l.DTVALIDADE || null,
  }));
  for (const f of filiais) {
    const nosLotes = lotes.filter((l) => l.CODFILIAL === f.CODFILIAL).reduce((s, l) => s + (Number(l.QTBLOQUEADA) || 0), 0);
    const semLote = (Number(f.QT_BLOQUEADA) || 0) - nosLotes;
    if (semLote <= 0) continue;
    linhas.push({
      chave: `${f.CODFILIAL}|sem-lote`,
      codfilial: f.CODFILIAL,
      filial: texto(f.FILIAL) || f.CODFILIAL,
      lote: null,
      quantidade: semLote,
      motivo: texto(f.MOTIVO_POSICAO) || SEM_MOTIVO,
      quem: '',
      quando: '',
      validade: null,
    });
  }
  return linhas.sort((a, b) => b.quantidade - a.quantidade || a.chave.localeCompare(b.chave));
}

/** "Estoque bloqueado: 10 un. em 2 lotes" (+ " · 5 un. sem lote"). */
export function resumoBloqueio(linhas: Bloqueio[]): string {
  const total = linhas.reduce((s, l) => s + l.quantidade, 0);
  const lotes = linhas.filter((l) => l.lote !== null);
  const semLote = total - lotes.reduce((s, l) => s + l.quantidade, 0);
  if (total === 0) return 'Nenhum estoque bloqueado';
  if (lotes.length === 0) return `Estoque bloqueado: ${qtd(total)} un. sem lote`;
  const base = `Estoque bloqueado: ${qtd(total)} un. em ${lotes.length} ${lotes.length === 1 ? 'lote' : 'lotes'}`;
  return semLote > 0 ? `${base} · ${qtd(semLote)} un. sem lote` : base;
}

/* ─────────────── reservados (RF-006, RN-009) ─────────────── */

interface LinhaPedido {
  CODFILIAL: string;
  NUMLOTE: string | null;
  NUMPED: unknown;
  DATA_PEDIDO: string | null;
  POSICAO: string | null;
  CLIENTE?: string | null;
  VENDEDOR?: string | null;
  QT_RESERVADA: unknown;
}

const POSICOES: Record<string, string> = { L: 'Liberado', M: 'Montado', B: 'Bloqueado', P: 'Pendente', F: 'Faturado', C: 'Cancelado' };
export const situacaoDoPedido = (posicao: string | null | undefined) => POSICOES[texto(posicao)] ?? (texto(posicao) || 'Sem situação');

export interface GrupoReserva<P> {
  chave: string;
  codfilial: string;
  filial: string;
  lote: string;
  validade: string | null;
  reservado: number;
  pedidos: P[];
  /** Reservado do lote que nenhum pedido explica (RN-009). */
  semPedido: number;
}

/**
 * A aba Reservados: o lote e a quantidade vêm do ERP (cwEstoqueLotes), e os
 * pedidos de cwEstoqueReservas entram embaixo do lote que apontam. O que o
 * lote tem reservado além dos pedidos vira `semPedido`; pedido sem lote (ou
 * apontando lote que não tem reserva) vai para `semLote` — nada some.
 */
export function agruparReservas<P extends LinhaPedido>(lotes: LinhaLote[], pedidos: P[]): { grupos: GrupoReserva<P>[]; semLote: P[]; total: number } {
  const porData = (a: P, b: P) => texto(a.DATA_PEDIDO).localeCompare(texto(b.DATA_PEDIDO)) || Number(a.NUMPED) - Number(b.NUMPED);
  const reservados = ordenarLotes(lotes.filter((l) => (Number(l.QTRESERV) || 0) > 0));
  const usados = new Set<P>();
  const grupos = reservados.map((l) => {
    const doLote = pedidos.filter((p) => p.CODFILIAL === l.CODFILIAL && p.NUMLOTE !== null && p.NUMLOTE === l.NUMLOTE).sort(porData);
    doLote.forEach((p) => usados.add(p));
    const reservado = Number(l.QTRESERV) || 0;
    const explicado = doLote.reduce((s, p) => s + (Number(p.QT_RESERVADA) || 0), 0);
    return {
      chave: `${l.CODFILIAL}|${l.NUMLOTE ?? ''}`,
      codfilial: l.CODFILIAL,
      filial: texto(l.FILIAL) || l.CODFILIAL,
      lote: l.NUMLOTE ?? '',
      validade: l.DTVALIDADE || null,
      reservado,
      pedidos: doLote,
      semPedido: Math.max(0, reservado - explicado),
    };
  });
  return {
    grupos,
    semLote: pedidos.filter((p) => !usados.has(p)).sort(porData),
    total: grupos.reduce((s, g) => s + g.reservado, 0),
  };
}

/* ─────────────── a lista única da ficha (RF-004, RF-005, RF-006) ─────────────── */

/**
 * Cada lote com o seu bloqueio e a sua reserva ao lado, no vencimento mais
 * próximo primeiro (RN-007). O bloqueio que não tem lote onde pendurar — o da
 * posição da filial (RN-004) ou o de um lote que a consulta de lotes não
 * trouxe — sai em `bloqueiosSoltos`: nada some.
 */
export function detalharLotes<L extends LinhaLote, P>(lotes: L[], bloqueios: Bloqueio[], grupos: GrupoReserva<P>[]) {
  const chave = (l: LinhaLote) => `${l.CODFILIAL}|${l.NUMLOTE ?? ''}`;
  const bloqueioDe = new Map(bloqueios.filter((b) => b.lote !== null).map((b) => [b.chave, b]));
  const reservaDe = new Map(grupos.map((g) => [g.chave, g]));
  const linhas = ordenarLotes(lotes).map((lote) => ({ lote, bloqueio: bloqueioDe.get(chave(lote)) ?? null, reserva: reservaDe.get(chave(lote)) ?? null }));
  const pendurados = new Set(linhas.map((l) => l.bloqueio));
  return { linhas, bloqueiosSoltos: bloqueios.filter((b) => !pendurados.has(b)) };
}
