// As filiais do ERP para o filtro (RF-007). Lidas uma vez por tela; se a
// leitura falhar, o filtro fica só com "Todas as filiais".
import { useEffect, useState } from 'react';
import { linhas } from '@/lib/mitra-api';

interface Opcao {
  value: string;
  label: string;
}

export function useFiliais(): Opcao[] {
  const [filiais, setFiliais] = useState<Opcao[]>([]);
  useEffect(() => {
    let vivo = true;
    linhas('filiais')
      .then((rows) => {
        if (!vivo) return;
        const opcoes = rows.map((f) => ({ value: String(f.CODFILIAL), label: `${f.CODFILIAL} · ${f.FILIAL ?? ''}`.trim() }));
        // O código da filial é texto no ERP: '10' viria antes de '2'.
        setFiliais(opcoes.sort((a, b) => a.value.localeCompare(b.value, 'pt-BR', { numeric: true })));
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);
  return filiais;
}
