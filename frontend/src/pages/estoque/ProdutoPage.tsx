// Ficha do produto: indicadores, rosca por filial e a lista única de lotes —
// cada lote com vencimento, motivo do bloqueio e pedido que reservou, em lista
// ou tabela (spec 001: C-003…C-011; RF-003…RF-011, RF-013).
import * as React from 'react';
import { useLocation, useParams, useSearchParams } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { linha, linhas } from '@/lib/mitra-api';
import { fmtData, hojeIso } from '@/lib/formato';
import {
  SEM_MOTIVO, agruparReservas, detalharLotes, estadoDaLeitura, linhasDeBloqueio, qtd, resumoBloqueio,
  rotuloAtualizado, situacaoDoPedido, situacaoValidade, somarPosicao,
} from '@/lib/estoque';
import type { Bloqueio, GrupoReserva } from '@/lib/estoque';
import { useLeituraErp } from '@/lib/useLeituraErp';
import { useFiliais } from '@/pages/estoque/filiais';
import { GraficoFiliais } from '@/pages/estoque/GraficoFiliais';
import { seriesDoEstoque } from '@/pages/estoque/series';
import { MonogramLoader } from '@/components/Logo';
import {
  AlternaLista, Badge, Button, Code, Dash, DetalheItem, EmptyState, FotoProduto, GradeKpi, ItemLista, Kpi, LinkRota,
  MetaDot, PageHeader, Panel, PanelHeader, Pilha, RowMeta, RowTitle, SelectMenu, Stat, Status, Table, Td, Th, Tr,
} from '@/components/page';

const INTERVALO_MS = 60_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>;

/** Data de validade com a situação embaixo (RN-005). */
function Validade({ data, hoje }: { data: string | null; hoje: string }) {
  const s = situacaoValidade(data, hoje);
  if (!data) return <RowMeta>{s.texto}</RowMeta>;
  return (
    <>
      {fmtData(data)}
      <RowMeta>
        {s.tom === 'neutro' ? s.texto : <Status tone={s.tom === 'leve' ? 'off' : s.tom}>{s.texto}</Status>}
      </RowMeta>
    </>
  );
}

/** O motivo do bloqueio, com quem e quando embaixo (RF-005, RN-003). */
function Motivo({ bloqueio }: { bloqueio: Bloqueio }) {
  const quemQuando = [bloqueio.quem, bloqueio.quando ? `em ${fmtData(bloqueio.quando)}` : ''].filter(Boolean).join(' · ');
  return (
    <>
      {bloqueio.motivo}
      {quemQuando ? <RowMeta>{quemQuando}</RowMeta> : null}
    </>
  );
}

/** O pedido que reservou: número e cliente; embaixo quantidade, vendedor, data e situação (RF-006). */
function Pedido({ pedido, comFilial }: { pedido: Linha; comFilial?: boolean }) {
  const resto = [
    `${qtd(pedido.QT_RESERVADA)} un.`,
    comFilial ? `filial ${pedido.CODFILIAL}` : '',
    pedido.VENDEDOR ? `vendedor ${pedido.VENDEDOR}` : '',
    pedido.DATA_PEDIDO ? fmtData(pedido.DATA_PEDIDO) : '',
    situacaoDoPedido(pedido.POSICAO),
  ];
  return (
    <div>
      <Code prefix="Pedido">{pedido.NUMPED}</Code> <MetaDot /> {pedido.CLIENTE || 'Cliente não informado'}
      <RowMeta>{resto.filter(Boolean).join(' · ')}</RowMeta>
    </div>
  );
}

/** Os pedidos de um lote e o que nenhum pedido explica (RN-009). */
function Reserva({ grupo }: { grupo: GrupoReserva<Linha> }) {
  return (
    <>
      {grupo.pedidos.map((p) => <Pedido key={p.NUMPED} pedido={p} />)}
      {grupo.semPedido > 0 ? <Status tone="attention">Sem pedido identificado: {qtd(grupo.semPedido)} un.</Status> : null}
    </>
  );
}

const nomeDoLote = (lote: string | null) => (lote === null ? 'Sem lote' : `Lote ${lote || 'sem número'}`);

export default function ProdutoPage() {
  const codprod = Number(useParams().codprod) || 0;
  const { state } = useLocation();
  const [params, setParams] = useSearchParams();
  const filial = params.get('filial') ?? '';
  const filiais = useFiliais();
  const [modo, setModo] = React.useState<'lista' | 'tabela'>('lista');
  const hoje = hojeIso();

  // RF-014: a foto vem do cache do Busca 360, uma leitura por abertura da
  // ficha (fora da releitura de 60 s). Sem foto, ou se a leitura falhar, a
  // ficha segue sem ela — foto não derruba consulta de estoque.
  const lerProduto = React.useCallback(async () => {
    const [produto, foto] = await Promise.all([linha('estoqueProduto', { codprod }), linha('produtoFoto', { codprod }).catch(() => null)]);
    return { produto, foto: foto?.URL ? String(foto.URL) : null };
  }, [codprod]);
  const cabecalho = useLeituraErp(lerProduto);
  const produto = cabecalho.dados?.produto ?? null;
  const foto = cabecalho.dados?.foto ?? null;

  // RF-008/RF-009: a posição é relida a cada minuto com a aba visível. Os
  // bloqueios e os pedidos só são consultados quando há o que explicar.
  const lerEstoque = React.useCallback(async () => {
    const entrada = { codprod, codfilial: filial };
    const [posicao, lotes] = await Promise.all([linhas('estoqueFiliais', entrada), linhas('estoqueLotes', entrada)]);
    const [bloqueios, pedidos] = await Promise.all([
      posicao.some((f) => Number(f.QT_BLOQUEADA) > 0) ? linhas('estoqueBloqueios', entrada) : [],
      posicao.some((f) => Number(f.QT_RESERVADA) > 0) ? linhas('estoqueReservas', entrada) : [],
    ]);
    return { posicao, lotes, bloqueios, pedidos };
  }, [codprod, filial]);
  const { dados, erro, lidoEm, lendo, atualizar } = useLeituraErp(lerEstoque, { intervaloMs: INTERVALO_MS });
  const estado = estadoDaLeitura({ dados, erro: erro || cabecalho.erro });

  const mudarFilial = (valor: string) => setParams(valor ? { filial: valor } : {}, { replace: true });
  const voltar = `/estoque${(state as { voltar?: string } | null)?.voltar ?? ''}`;

  const cabecalhoDaTela = (
    <PageHeader
      module="Estoque"
      media={produto ? <FotoProduto key={foto} src={foto} alt={`Foto de ${produto.DESCRICAO}`} /> : null}
      title={produto?.DESCRICAO ?? `Produto ${codprod}`}
      description={
        produto ? (
          <>
            <Code prefix="Cód.">{produto.CODPROD}</Code>
            {produto.CODAUXILIAR ? <> <MetaDot /> <Code prefix="EAN">{produto.CODAUXILIAR}</Code></> : null}
            {produto.EMBALAGEM ? <> <MetaDot /> {produto.EMBALAGEM}</> : null}
            {produto.FORNECEDOR ? <> <MetaDot /> {produto.FORNECEDOR}</> : null}
            {Number(produto.INATIVO) ? <> <MetaDot /> <Badge>Inativo</Badge></> : null}
          </>
        ) : null
      }
      actions={
        <>
          <SelectMenu
            label="Filial"
            className="w-56"
            value={filial}
            onChange={mudarFilial}
            options={[{ value: '', label: 'Todas as filiais' }, ...filiais]}
          />
          <Button onClick={() => void atualizar()} disabled={lendo}>
            <RefreshCw className={lendo ? 'animate-spin' : undefined} aria-hidden />
            Atualizar
          </Button>
        </>
      }
      meta={
        <>
          <LinkRota to={voltar}>Voltar à busca</LinkRota>
          {lidoEm && estado.tipo === 'ok' ? (
            <>
              <MetaDot /> {rotuloAtualizado(lidoEm)} <MetaDot /> atualiza sozinho a cada minuto
            </>
          ) : null}
        </>
      }
    />
  );

  if (estado.tipo === 'erro') {
    return (
      <>
        {cabecalhoDaTela}
        <Panel>
          <EmptyState
            title={estado.mensagem}
            hint="A consulta ao ERP falhou. Nenhum número é mostrado enquanto a leitura não voltar."
            action={<Button variant="primary" onClick={() => { void cabecalho.atualizar(); void atualizar(); }}>Tentar de novo</Button>}
          />
        </Panel>
      </>
    );
  }

  if (estado.tipo === 'carregando' || !cabecalho.dados) {
    return (
      <>
        {cabecalhoDaTela}
        <MonogramLoader rotulo="Consultando o WinThor" />
      </>
    );
  }

  if (!produto) {
    return (
      <>
        {cabecalhoDaTela}
        <Panel>
          <EmptyState title={`Produto ${codprod} não existe no WinThor`} hint="Confira o código ou volte à busca." action={<LinkRota to={voltar}>Voltar à busca</LinkRota>} />
        </Panel>
      </>
    );
  }

  const { posicao, bloqueios, pedidos } = estado.dados;
  const lotes = estado.dados.lotes as Parameters<typeof agruparReservas>[0];
  const soma = somarPosicao(posicao as Parameters<typeof somarPosicao>[0]);
  const bloqueados = linhasDeBloqueio(posicao as Parameters<typeof linhasDeBloqueio>[0], bloqueios as Parameters<typeof linhasDeBloqueio>[1]);
  const reservas = agruparReservas(lotes, pedidos as Linha[] as Parameters<typeof agruparReservas>[1]);
  const { linhas: linhasDeLote, bloqueiosSoltos } = detalharLotes(lotes as Linha[] as Parameters<typeof agruparReservas>[0], bloqueados, reservas.grupos);
  const lotesBloqueados = bloqueados.filter((b) => b.lote !== null).length;
  const contar = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
  const cor = { bloqueado: seriesDoEstoque.bloqueado.color, reservado: seriesDoEstoque.reservado.color, avariado: seriesDoEstoque.avariado.color };
  const resumo = [bloqueados.length ? resumoBloqueio(bloqueados) : '', soma.reservado ? `Reservado: ${qtd(soma.reservado)} un.` : ''].filter(Boolean).join(' · ');
  const nadaParaListar = linhasDeLote.length === 0 && bloqueiosSoltos.length === 0 && reservas.semLote.length === 0;

  return (
    <>
      {cabecalhoDaTela}
      <Pilha>
        <GradeKpi>
          <Kpi rotulo="Disponível" valor={qtd(soma.disponivel)} hint={`de ${qtd(soma.total)} no total`} />
          <Kpi
            rotulo="Reservado"
            valor={qtd(soma.reservado)}
            hint={soma.reservado ? `em ${contar(reservas.grupos.length, 'lote', 'lotes')} · ${contar(pedidos.length, 'pedido', 'pedidos')}` : 'nenhuma reserva'}
          />
          <Kpi
            rotulo="Bloqueado"
            valor={qtd(soma.bloqueado)}
            hint={soma.bloqueado ? (lotesBloqueados ? `em ${contar(lotesBloqueados, 'lote', 'lotes')}` : 'sem lote') : 'nenhum bloqueio'}
          />
          <Kpi rotulo="Avariado" valor={qtd(soma.avariado)} hint={soma.avariado ? 'separado para indenização' : 'nenhuma avaria'} />
        </GradeKpi>

        <GraficoFiliais filiais={posicao} onFilial={mudarFilial} />

        <Panel>
          <PanelHeader title="Lotes" hint={resumo || 'Vencimento, motivo do bloqueio e pedido que reservou'}>
            <AlternaLista modo={modo} onModo={setModo} />
          </PanelHeader>

          {nadaParaListar ? (
            <EmptyState title="Nenhum lote com saldo" hint="O produto não controla lote ou não tem saldo, bloqueio nem reserva neste recorte." />
          ) : modo === 'lista' ? (
            <>
              {linhasDeLote.map(({ lote: l, bloqueio, reserva }) => (
                <ItemLista
                  key={`${l.CODFILIAL}|${l.NUMLOTE}`}
                  titulo={
                    <>
                      <RowTitle>{nomeDoLote(l.NUMLOTE ?? '')}</RowTitle>
                      <span>{l.CODFILIAL} · {l.FILIAL}</span>
                      <Validade data={l.DTVALIDADE} hoje={hoje} />
                    </>
                  }
                  lado={<><Stat>{qtd(l.QT_DISPONIVEL)}</Stat> disponíveis de {qtd(l.QT)}</>}
                >
                  {Number(l.QTBLOQUEADA) > 0 ? (
                    <DetalheItem cor={cor.bloqueado} rotulo={`Bloqueado ${qtd(l.QTBLOQUEADA)}`}>
                      {bloqueio ? <Motivo bloqueio={bloqueio} /> : SEM_MOTIVO}
                    </DetalheItem>
                  ) : null}
                  {reserva ? (
                    <DetalheItem cor={cor.reservado} rotulo={`Reservado ${qtd(reserva.reservado)}`}>
                      <Reserva grupo={reserva} />
                    </DetalheItem>
                  ) : null}
                  {Number(l.QTINDENIZ) > 0 ? <DetalheItem cor={cor.avariado} rotulo={`Avariado ${qtd(l.QTINDENIZ)}`} /> : null}
                </ItemLista>
              ))}
              {bloqueiosSoltos.map((b) => (
                <ItemLista key={b.chave} titulo={<><RowTitle>{nomeDoLote(b.lote)}</RowTitle><span>{b.codfilial} · {b.filial}</span></>}>
                  <DetalheItem cor={cor.bloqueado} rotulo={`Bloqueado ${qtd(b.quantidade)}`}>
                    <Motivo bloqueio={b} />
                  </DetalheItem>
                </ItemLista>
              ))}
              {reservas.semLote.length ? (
                <ItemLista titulo={<RowTitle>Pedidos sem lote definido</RowTitle>}>
                  {reservas.semLote.map((p) => (
                    <DetalheItem key={String(p.NUMPED)} cor={cor.reservado} rotulo={`Reservado ${qtd(p.QT_RESERVADA)}`}>
                      <Pedido pedido={p} comFilial />
                    </DetalheItem>
                  ))}
                </ItemLista>
              ) : null}
            </>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Lote</Th>
                  <Th>Filial</Th>
                  <Th>Validade</Th>
                  <Th numeric>Disponível</Th>
                  <Th>Bloqueado · motivo</Th>
                  <Th>Reservado · pedido</Th>
                  <Th numeric>Avariado</Th>
                </tr>
              </thead>
              <tbody>
                {linhasDeLote.map(({ lote: l, bloqueio, reserva }) => (
                  <Tr key={`${l.CODFILIAL}|${l.NUMLOTE}`}>
                    <Td><RowTitle>{l.NUMLOTE || <Dash />}</RowTitle></Td>
                    <Td>{l.CODFILIAL} · {l.FILIAL}</Td>
                    <Td><Validade data={l.DTVALIDADE} hoje={hoje} /></Td>
                    <Td numeric>
                      <strong>{qtd(l.QT_DISPONIVEL)}</strong>
                      <RowMeta>de {qtd(l.QT)}</RowMeta>
                    </Td>
                    <Td>
                      <strong>{qtd(l.QTBLOQUEADA)}</strong>
                      {Number(l.QTBLOQUEADA) > 0 ? <> <MetaDot /> {bloqueio ? <Motivo bloqueio={bloqueio} /> : SEM_MOTIVO}</> : null}
                    </Td>
                    <Td>
                      <strong>{qtd(l.QTRESERV)}</strong>
                      {reserva ? <Reserva grupo={reserva} /> : null}
                    </Td>
                    <Td numeric>{qtd(l.QTINDENIZ)}</Td>
                  </Tr>
                ))}
                {bloqueiosSoltos.map((b) => (
                  <Tr key={b.chave}>
                    <Td>{b.lote === null ? <Status tone="off">Sem lote</Status> : <RowTitle>{b.lote || <Dash />}</RowTitle>}</Td>
                    <Td>{b.codfilial} · {b.filial}</Td>
                    <Td><Dash /></Td>
                    <Td numeric><Dash /></Td>
                    <Td><strong>{qtd(b.quantidade)}</strong> <MetaDot /> <Motivo bloqueio={b} /></Td>
                    <Td><Dash /></Td>
                    <Td numeric><Dash /></Td>
                  </Tr>
                ))}
                {reservas.semLote.map((p) => (
                  <Tr key={`sem-lote|${p.NUMPED}`}>
                    <Td><Status tone="attention">Pedido sem lote definido</Status></Td>
                    <Td>{p.CODFILIAL}</Td>
                    <Td><Dash /></Td>
                    <Td numeric><Dash /></Td>
                    <Td><Dash /></Td>
                    <Td><strong>{qtd(p.QT_RESERVADA)}</strong><Pedido pedido={p} /></Td>
                    <Td numeric><Dash /></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>
      </Pilha>
    </>
  );
}
