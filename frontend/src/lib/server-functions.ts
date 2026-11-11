// Mapa das server functions do projeto.
//
// SERVER_FUNCTION_NAMES e escrito a mao e e o contrato com `backend/add-*.mjs`:
// mudou o nome la, muda aqui.
//
// SERVER_FUNCTIONS sao os ids da plataforma. Antes de publicar, os valores
// sao os do simulador local (qualquer numero unico serve); depois de publicar
// no Mitra, `cd backend && npm run sync:function-map` reescreve este bloco
// com os ids reais. O simulador resolve pelo NOME, entao funciona antes e depois.
//
// Formato dos dois blocos e rigido (uma linha `chave: 'valor',` por entrada,
// sem comentario dentro): o sync e o simulador fazem parse por texto.

export const SERVER_FUNCTION_NAMES = {
  sessao: 'cwSessao',
  filiais: 'cwFiliais',
  estoqueBuscar: 'cwEstoqueBuscar',
  estoqueBuscarTotal: 'cwEstoqueBuscarTotal',
  estoqueProduto: 'cwEstoqueProduto',
  estoqueFiliais: 'cwEstoqueFiliais',
  estoqueLotes: 'cwEstoqueLotes',
  estoqueBloqueios: 'cwEstoqueBloqueios',
  estoqueReservas: 'cwEstoqueReservas',
  produtoFoto: 'cwProdutoFoto',
};

export const SERVER_FUNCTIONS = {
  sessao: '1',
  filiais: '2',
  estoqueBuscar: '3',
  estoqueBuscarTotal: '4',
  estoqueProduto: '5',
  estoqueFiliais: '6',
  estoqueLotes: '7',
  estoqueBloqueios: '8',
  estoqueReservas: '9',
  produtoFoto: '10',
};
