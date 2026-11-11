// Leitura do ERP "no momento" (RF-008, RF-009, RF-011): guarda os dados e a
// hora em que foram lidos, relê quando pedem e, com `intervaloMs`, relê
// sozinha enquanto a aba do navegador está visível.
import { useCallback, useEffect, useRef, useState } from 'react';

interface Leitura<T> {
  dados: T | null;
  erro: unknown;
  lidoEm: Date | null;
  /** A função que produziu este resultado: resultado de outra `ler` é velho. */
  de: unknown;
}

const VAZIA = { dados: null, erro: null, lidoEm: null, de: null };

/**
 * `ler` precisa ser estável (useCallback): quando ela muda (outro produto,
 * outra filial, outra página), a leitura anterior é descartada e a tela volta
 * a "carregando". Falha zera os dados — número antigo não fica na tela como
 * se fosse atual (C-010).
 */
export function useLeituraErp<T>(ler: () => Promise<T>, { intervaloMs = 0 }: { intervaloMs?: number } = {}) {
  const [leitura, setLeitura] = useState<Leitura<T>>(VAZIA);
  const [lendo, setLendo] = useState(false);
  const atual = useRef(ler);

  const buscar = useCallback(() => {
    atual.current = ler;
    return ler()
      .then((dados) => ({ dados, erro: null }))
      .catch((erro: unknown) => ({ dados: null, erro: erro ?? new Error('Falha na leitura.') }))
      .then((resultado) => {
        setLendo(false);
        // Resposta de uma leitura que já foi trocada por outra não entra.
        if (atual.current === ler) setLeitura({ ...resultado, lidoEm: new Date(), de: ler });
      });
  }, [ler]);

  /** Releitura pedida pela pessoa: é a única que gira o botão Atualizar. */
  const atualizar = useCallback(() => {
    setLendo(true);
    return buscar();
  }, [buscar]);

  useEffect(() => {
    void buscar();
    if (!intervaloMs) return;
    // RF-009 / RNF-003: só relê com a aba visível, para não gastar o teto de
    // execuções da plataforma com tela que ninguém está olhando.
    const relogio = setInterval(() => {
      if (document.visibilityState === 'visible') void buscar();
    }, intervaloMs);
    return () => clearInterval(relogio);
  }, [buscar, intervaloMs]);

  const vigente = leitura.de === ler ? leitura : (VAZIA as Leitura<T>);
  return { dados: vigente.dados, erro: vigente.erro, lidoEm: vigente.lidoEm, lendo, atualizar };
}
