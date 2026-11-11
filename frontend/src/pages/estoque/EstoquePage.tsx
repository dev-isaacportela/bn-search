// Busca de produtos com o estoque somado (spec 001: C-001, C-002, C-008;
// RF-001, RF-002, RF-007, RF-008, RF-011).
import * as React from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { linha, linhas } from '@/lib/mitra-api';
import { estadoDaLeitura, montarBusca, qtd, rotuloAtualizado } from '@/lib/estoque';
import { useLeituraErp } from '@/lib/useLeituraErp';
import { useFiliais } from '@/pages/estoque/filiais';
import {
  Buscando, Button, Code, EmptyState, Field, LinkRota, MetaDot, PageHeader, Pagination, Panel,
  RowMeta, SearchInput, SelectMenu, Status, Table, Td, Th, Toolbar, Tr,
} from '@/components/page';

const POR_PAGINA = 50;
const ESPERA_MS = 400;

export default function EstoquePage() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const [params, setParams] = useSearchParams();
  const busca = params.get('q') ?? '';
  const filial = params.get('filial') ?? '';
  const pagina = Math.max(1, Number(params.get('p')) || 1);
  const filiais = useFiliais();

  // O campo responde na hora; a busca espera a pessoa parar de digitar.
  const [texto, setTexto] = React.useState(busca);
  const mudar = React.useCallback(
    (mudancas: Record<string, string>) => {
      const novo = new URLSearchParams(params);
      for (const [chave, valor] of Object.entries(mudancas)) {
        if (valor) novo.set(chave, valor);
        else novo.delete(chave);
      }
      setParams(novo, { replace: true });
    },
    [params, setParams]
  );
  React.useEffect(() => {
    if (texto.trim() === busca) return;
    const espera = setTimeout(() => mudar({ q: texto.trim(), p: '' }), ESPERA_MS);
    return () => clearTimeout(espera);
  }, [texto, busca, mudar]);

  const filtro = React.useMemo(() => montarBusca(busca), [busca]);
  const ler = React.useCallback(async () => {
    if (!filtro) return { produtos: [], total: 0 };
    const { ignoradas, ...entrada } = filtro;
    void ignoradas;
    const comFilial = { ...entrada, codfilial: filial };
    const [produtos, total] = await Promise.all([
      linhas('estoqueBuscar', { ...comFilial, limite: POR_PAGINA, offset: (pagina - 1) * POR_PAGINA }),
      linha('estoqueBuscarTotal', comFilial),
    ]);
    return { produtos, total: Number(total?.TOTAL) || 0 };
  }, [filtro, filial, pagina]);
  const { dados, erro, lidoEm, lendo, atualizar } = useLeituraErp(ler);
  const estado = estadoDaLeitura({ dados, erro });
  // A ficha volta para esta mesma busca (termo, filial e página).
  const voltar = { voltar: search };

  const abrir = (codprod: unknown) => `/estoque/${codprod}${filial ? `?filial=${encodeURIComponent(filial)}` : ''}`;

  return (
    <>
      <PageHeader
        module="Consultas"
        title="Estoque"
        description="O saldo do WinThor neste momento, por filial, lote e validade."
        actions={
          <Button onClick={() => void atualizar()} disabled={!filtro || lendo}>
            <RefreshCw className={lendo ? 'animate-spin' : undefined} aria-hidden />
            Atualizar
          </Button>
        }
        meta={filtro && lidoEm && estado.tipo === 'ok' ? rotuloAtualizado(lidoEm) : null}
      />

      <Panel>
        <Toolbar>
          <Field label="Produto" className="min-w-64 flex-1" hint={filtro?.ignoradas ? 'Usando as 3 primeiras palavras.' : undefined}>
            <SearchInput
              autoFocus
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Código, descrição ou EAN"
              aria-label="Buscar produto por código, descrição ou EAN"
            />
          </Field>
          <Field label="Filial" className="w-full sm:w-64">
            <SelectMenu
              label="Filial"
              value={filial}
              onChange={(valor) => mudar({ filial: valor, p: '' })}
              options={[{ value: '', label: 'Todas as filiais' }, ...filiais]}
            />
          </Field>
        </Toolbar>

        {!filtro ? (
          <EmptyState
            title="Busque um produto"
            hint="Digite o código, parte da descrição ou o EAN. Duas letras já bastam; as palavras podem vir em qualquer ordem."
          />
        ) : estado.tipo === 'erro' ? (
          <EmptyState
            title={estado.mensagem}
            hint="A consulta ao ERP falhou. Nenhum número é mostrado enquanto a leitura não voltar."
            action={<Button variant="primary" onClick={() => void atualizar()}>Tentar de novo</Button>}
          />
        ) : estado.tipo === 'carregando' ? (
          <Buscando rotulo="Consultando o WinThor..." />
        ) : estado.dados.total === 0 ? (
          <EmptyState title={`Nenhum produto encontrado para ${busca}`} hint="Confira o código ou tente outra parte da descrição." />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Produto</Th>
                  <Th numeric>Total</Th>
                  <Th numeric>Disponível</Th>
                  <Th numeric>Reservado</Th>
                  <Th numeric>Bloqueado</Th>
                  <Th numeric>Avariado</Th>
                </tr>
              </thead>
              <tbody>
                {estado.dados.produtos.map((p) => (
                  <Tr key={p.CODPROD} className="cursor-pointer" onClick={() => navigate(abrir(p.CODPROD), { state: voltar })}>
                    <Td>
                      <LinkRota to={abrir(p.CODPROD)} state={voltar}>{p.DESCRICAO}</LinkRota>
                      <RowMeta>
                        <Code prefix="Cód.">{p.CODPROD}</Code>
                        {p.EMBALAGEM ? <> <MetaDot /> {p.EMBALAGEM}</> : null}
                        {p.FORNECEDOR ? <> <MetaDot /> {p.FORNECEDOR}</> : null}
                        {Number(p.INATIVO) ? <> <MetaDot /> <Status tone="off">Inativo</Status></> : null}
                      </RowMeta>
                    </Td>
                    <Td numeric>{qtd(p.QT_TOTAL)}</Td>
                    <Td numeric><strong>{qtd(p.QT_DISPONIVEL)}</strong></Td>
                    <Td numeric>{qtd(p.QT_RESERVADA)}</Td>
                    <Td numeric>{qtd(p.QT_BLOQUEADA)}</Td>
                    <Td numeric>{qtd(p.QT_AVARIADA)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pagination
              page={pagina}
              lastPage={Math.max(1, Math.ceil(estado.dados.total / POR_PAGINA))}
              total={estado.dados.total}
              unit={estado.dados.total === 1 ? 'produto' : 'produtos'}
              busy={lendo}
              onPrevious={() => mudar({ p: String(pagina - 1) })}
              onNext={() => mudar({ p: String(pagina + 1) })}
            />
          </>
        )}
      </Panel>
    </>
  );
}
