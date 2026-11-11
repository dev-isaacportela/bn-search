// As quatro parcelas do estoque. A ordem é o contrato das séries: a cor não
// anda (design.md §8.7) — a rosca e as marcas da lista de lotes leem daqui.
import { corDeSerie } from '@/components/page';
import type { ChartConfig } from '@/components/page';

export const seriesDoEstoque = {
  disponivel: { label: 'Disponível', color: corDeSerie(0) },
  reservado: { label: 'Reservado', color: corDeSerie(1) },
  bloqueado: { label: 'Bloqueado', color: corDeSerie(2) },
  avariado: { label: 'Avariado', color: corDeSerie(3) },
} satisfies ChartConfig;
