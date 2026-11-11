// Tema claro/escuro — design.md §2.1.
//
// O tema é uma classe `.dark` no <html>; os tokens de `index.css` fazem o
// resto. Três estados: 'light', 'dark' e 'system' (segue o SO). A escolha vai
// para localStorage para acompanhar a pessoa entre telas e sessões; o script
// inline do index.html aplica a classe ANTES do React montar, para a tela não
// piscar clara e depois escurecer.
//
// Sincronia com o Painel Benenutri (SKILL.md, "Tema sincronizado"): o sistema
// abre num iframe do painel. O painel manda o tema no endereço (`?tema=`, que o
// script inline do index.html grava) e por `postMessage`
// ({ tipo: 'mitra-tema', tema }); este módulo escuta essas mensagens
// (`escutarPainel`) e devolve a mesma mensagem quando a troca nasce aqui
// (`setTheme`), nunca quando veio do painel — senão vira laço. A origem do
// painel fica em sessionStorage porque `document.referrer` se perde ao navegar.

export type Theme = 'light' | 'dark' | 'system';

export const THEME_KEY = 'theme';
/** sessionStorage: origem (scheme+host) do painel que abriu este iframe. */
export const PAINEL_KEY = 'painel-origem';
export const MENSAGEM_TEMA = 'mitra-tema';

function prefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function getTheme(): Theme {
  try {
    const salvo = localStorage.getItem(THEME_KEY);
    if (salvo === 'light' || salvo === 'dark' || salvo === 'system') return salvo;
  } catch {
    /* storage indisponível: cai no padrão */
  }
  return 'light';
}

/** Tema efetivamente aplicado (resolve 'system'). */
export function resolvedTheme(theme: Theme = getTheme()): 'light' | 'dark' {
  return theme === 'system' ? (prefersDark() ? 'dark' : 'light') : theme;
}

export function applyTheme(theme: Theme = getTheme()): void {
  document.documentElement.classList.toggle('dark', resolvedTheme(theme) === 'dark');
}

/**
 * Grava e aplica. Quando a troca nasce no sistema, avisa o painel; quando veio
 * dele (`doPainel`), só aplica — o painel já sabe.
 */
export function setTheme(theme: Theme, { doPainel = false } = {}): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* sem storage, vale só para esta página */
  }
  applyTheme(theme);
  if (!doPainel) avisarPainel(resolvedTheme(theme));
}

/** Alterna entre claro e escuro a partir do que está na tela agora. */
export function toggleTheme(): Theme {
  const proximo: Theme = resolvedTheme() === 'dark' ? 'light' : 'dark';
  setTheme(proximo);
  return proximo;
}

/** Em 'system', acompanha mudanças do SO enquanto a página está aberta. */
export function watchSystemTheme(): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => { if (getTheme() === 'system') applyTheme('system'); };
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

// --- Painel Benenutri -------------------------------------------------------

function dentroDeIframe(): boolean {
  return typeof window !== 'undefined' && window.parent !== window;
}

/**
 * Origem do painel que abriu este iframe, ou null fora do painel. O script
 * inline do index.html grava na primeira carga; aqui só se lê (com o mesmo
 * fallback para o referrer, caso o script não tenha rodado).
 */
export function origemDoPainel(): string | null {
  if (!dentroDeIframe()) return null;
  try {
    const guardada = sessionStorage.getItem(PAINEL_KEY);
    if (guardada) return guardada;
    if (document.referrer) {
      const origem = new URL(document.referrer).origin;
      sessionStorage.setItem(PAINEL_KEY, origem);
      return origem;
    }
  } catch {
    /* sem storage ou referrer inválido */
  }
  return null;
}

function avisarPainel(tema: 'light' | 'dark'): void {
  const origem = origemDoPainel();
  if (origem) window.parent.postMessage({ tipo: MENSAGEM_TEMA, tema }, origem);
}

let ouvindoPainel = false;

/**
 * Escuta o painel: aceita só mensagens da origem guardada com
 * { tipo: 'mitra-tema', tema: 'dark' | 'light' } e aplica na hora, sem
 * recarregar e sem devolver ao painel. Idempotente: o `ThemeToggle` chama, e
 * quem tem tela sem ele (login) chama uma vez no main.tsx. Fora do painel não
 * faz nada.
 */
export function escutarPainel(): () => void {
  if (ouvindoPainel || !origemDoPainel()) return () => {};
  ouvindoPainel = true;
  const onMessage = (e: MessageEvent) => {
    if (e.origin !== origemDoPainel()) return;
    const d = e.data as { tipo?: unknown; tema?: unknown } | null;
    if (!d || d.tipo !== MENSAGEM_TEMA) return;
    if (d.tema !== 'dark' && d.tema !== 'light') return;
    if (resolvedTheme() !== d.tema) setTheme(d.tema, { doPainel: true });
  };
  window.addEventListener('message', onMessage);
  return () => { window.removeEventListener('message', onMessage); ouvindoPainel = false; };
}

/**
 * Leva o `?tema=` do endereço atual para `destino` — para a rota /sso manter o
 * tema no redirecionamento depois de validar o ticket.
 */
export function manterTema(destino: string): string {
  const tema = new URLSearchParams(window.location.search).get('tema');
  if (tema !== 'dark' && tema !== 'light') return destino;
  const url = new URL(destino, window.location.href);
  url.searchParams.set('tema', tema);
  return url.origin === window.location.origin ? url.pathname + url.search + url.hash : url.href;
}
