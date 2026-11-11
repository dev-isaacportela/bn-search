// Estoque do produto por filial (RF-003, C-003): uma rosca por filial,
// dividida em disponível, reservado, bloqueado e avariado, com o total no
// centro e os quatro números escritos ao lado. Clicar no nome da filial
// filtra a tela por ela (design.md §9.7).
//
// Rosca é exceção consciente ao §12.3 do design (plan D-012): por isso cada
// valor está por escrito ao lado e a visão em tabela continua a um clique.
import * as React from 'react';
import { Label, Pie, PieChart } from 'recharts';
import { qtd } from '@/lib/estoque';
import {
  AlternaVisao, ChartContainer, ChartTooltip, ChartTooltipContent, EmptyState, GradeMultiplos,
  LegendaValores, MioloRolavel, Multiplo, PainelGrafico, Table, Td, Th, Tr,
} from '@/components/page';
import { seriesDoEstoque } from '@/pages/estoque/series';

const ORDEM = Object.keys(seriesDoEstoque) as (keyof typeof seriesDoEstoque)[];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>;

export function GraficoFiliais({ filiais, onFilial }: { filiais: Linha[]; onFilial: (codfilial: string) => void }) {
  const [visao, setVisao] = React.useState<'grafico' | 'tabela'>('grafico');
  const dados = [...filiais]
    .sort((a, b) => Number(b.QT_TOTAL) - Number(a.QT_TOTAL))
    .map((f) => ({
      codfilial: String(f.CODFILIAL),
      nome: String(f.FILIAL ?? ''),
      disponivel: Number(f.QT_DISPONIVEL) || 0,
      reservado: Number(f.QT_RESERVADA) || 0,
      bloqueado: Number(f.QT_BLOQUEADA) || 0,
      avariado: Number(f.QT_AVARIADA) || 0,
      total: Number(f.QT_TOTAL) || 0,
    }));

  return (
    <PainelGrafico
      titulo="Estoque por filial"
      hint="Clique no nome da filial para ver só ela"
      altura="auto"
      acoes={<AlternaVisao visao={visao} onVisao={setVisao} />}
    >
      {dados.length === 0 ? (
        <EmptyState title="Sem estoque" hint="Nenhuma filial tem saldo, reserva ou bloqueio deste produto." />
      ) : visao === 'tabela' ? (
        <MioloRolavel>
          <Table>
            <thead>
              <tr>
                <Th>Filial</Th>
                <Th numeric>Total</Th>
                <Th numeric>Disponível</Th>
                <Th numeric>Reservado</Th>
                <Th numeric>Bloqueado</Th>
                <Th numeric>Avariado</Th>
              </tr>
            </thead>
            <tbody>
              {dados.map((f) => (
                <Tr key={f.codfilial}>
                  <Td>{f.codfilial} · {f.nome}</Td>
                  <Td numeric>{qtd(f.total)}</Td>
                  <Td numeric>{qtd(f.disponivel)}</Td>
                  <Td numeric>{qtd(f.reservado)}</Td>
                  <Td numeric>{qtd(f.bloqueado)}</Td>
                  <Td numeric>{qtd(f.avariado)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </MioloRolavel>
      ) : (
        <GradeMultiplos>
          {dados.map((f) => (
            <Multiplo
              key={f.codfilial}
              titulo={`${f.codfilial} · ${f.nome}`}
              onClick={() => onFilial(f.codfilial)}
              grafico={
                <ChartContainer config={seriesDoEstoque} className="aspect-square size-32 shrink-0">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent nameKey="serie" hideLabel />} />
                    <Pie
                      data={ORDEM.map((serie) => ({ serie, valor: f[serie], fill: `var(--color-${serie})` }))}
                      dataKey="valor"
                      nameKey="serie"
                      innerRadius={40}
                      outerRadius={62}
                      stroke="var(--card)"
                      strokeWidth={2}
                      isAnimationActive={false}
                    >
                      {/* O total da filial no centro: tinta do tema (§12.4). */}
                      <Label
                        content={({ viewBox }) =>
                          viewBox && 'cx' in viewBox && 'cy' in viewBox ? (
                            <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                              <tspan x={viewBox.cx} dy="-0.2em" className="fill-foreground font-title text-xl font-bold">{qtd(f.total)}</tspan>
                              <tspan x={viewBox.cx} dy="1.5em" className="fill-muted-foreground text-[11px]">em estoque</tspan>
                            </text>
                          ) : null
                        }
                      />
                    </Pie>
                  </PieChart>
                </ChartContainer>
              }
            >
              <LegendaValores
                itens={ORDEM.map((serie) => ({ cor: seriesDoEstoque[serie].color, rotulo: seriesDoEstoque[serie].label, valor: qtd(f[serie]) }))}
              />
            </Multiplo>
          ))}
        </GradeMultiplos>
      )}
    </PainelGrafico>
  );
}
