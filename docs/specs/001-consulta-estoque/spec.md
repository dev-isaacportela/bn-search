# Spec: Consulta de estoque

**ID:** 001-consulta-estoque · **Status:** aprovada · **Data:** 2026-11-11 · **Revisão:** 2026-11-11 — ficha simplificada: rosca por filial, lista única de lotes (RF-013), gráfico de validade retirado (RF-010), foto do produto vinda do Busca 360 (RF-014, C-012, RN-010)
**Sistema:** BN Search

> Primeira consulta de um sistema que vai reunir várias consultas ao ERP.
> Escrito para quem usa e para quem paga; o COMO está no `plan.md`.

## Problema

Para saber o estoque real de um produto hoje é preciso abrir o ERP, ter acesso
às rotinas certas e cruzar várias telas: o saldo de cada filial numa, os lotes
noutra, o motivo do bloqueio noutra. Comercial, compras, logística e qualidade
perguntam "tem? onde? de que lote? vence quando? por que está bloqueado?" várias
vezes por dia, e a resposta depende de quem sabe navegar no ERP. Número errado
aqui vira venda prometida sem produto, ou produto vencendo parado na prateleira.

## Resultado esperado

"Digito o produto e em segundos vejo, com o número do ERP neste momento, quanto
tem em cada filial, quanto está livre, o que está reservado e o que está
bloqueado — lote por lote, com vencimento e motivo."

## Usuários

| Perfil | O que precisa fazer | Frequência |
|---|---|---|
| Comercial / vendas | saber se pode prometer o produto e de qual filial | várias vezes ao dia |
| Compras | ver o estoque de todas as filiais antes de comprar ou transferir | diária |
| Logística / expedição | localizar o lote, ver o que está reservado e o que vence primeiro | diária |
| Qualidade | acompanhar lotes bloqueados e por quê | semanal |

## Cenários

**C-001 — Encontrar o produto**
- **Dado que** o produto 1001 "WHEY PROTEIN BAUNILHA 900G" (EAN 7890000010010) existe
- **Quando** a pessoa busca "1001", "whey baun" ou "7890000010010"
- **Então** o produto aparece na lista com o total de todas as filiais: total 150, disponível 105, reservado 20, bloqueado 15, avariado 10

**C-002 — Busca sem resultado e busca com apóstrofo**
- **Dado que** nenhum produto contém "xyzabc"
- **Quando** a pessoa busca "xyzabc"
- **Então** vê "Nenhum produto encontrado para xyzabc" e nenhuma linha; e a busca por "D'AGUA" encontra o produto "AGUA D'AGUA 500ML" sem erro

**C-003 — Estoque do produto em cada filial**
- **Dado que** o produto 1001 tem, na filial 1: total 100, bloqueado 10, avariado 5, reservado 15; na filial 2: total 50, bloqueado 5, avariado 5, reservado 5; na filial 3: tudo zero
- **Quando** a pessoa abre o produto
- **Então** vê os indicadores somados (total 150, disponível 105, reservado 20, bloqueado 15, avariado 10), uma rosca por filial dividida em disponível/reservado/bloqueado/avariado, com o total no centro e os quatro números escritos ao lado (filial 1: 70/15/10/5; filial 2: 35/5/5/5) e a filial 3 não aparece

**C-004 — Lotes com vencimento**
- **Dado que** hoje é 11/11/2026 e o produto 1001 na filial 1 tem os lotes L-A (40 un., vence 01/11/2026), L-B (35 un., vence 01/12/2026) e L-C (25 un., vence 01/06/2027)
- **Quando** a pessoa abre o produto
- **Então** vê, na lista de lotes, os lotes ordenados pelo vencimento mais próximo: L-A "Vencido há 10 dias", L-B "Vence em 20 dias", L-C "Vence em 202 dias", com a quantidade total, livre, reservada e bloqueada de cada um

**C-005 — Bloqueados com motivo**
- **Dado que** o lote L-A da filial 1 tem 6 un. bloqueadas pelo motivo 31 "AVARIA NO TRANSPORTE" lançado por MARIA SOUZA em 05/11/2026, e o lote L-B tem 4 un. bloqueadas sem motivo no histórico mas com a observação "AGUARDANDO LAUDO"
- **Quando** a pessoa abre o produto
- **Então** vê "Estoque bloqueado: 10 un. em 2 lotes" e, na linha de cada lote, L-A com "AVARIA NO TRANSPORTE", quem e quando; L-B com "AGUARDANDO LAUDO"; cada lote com o vencimento

**C-006 — Bloqueado sem lote**
- **Dado que** o produto 2002 não controla lote e tem 8 un. bloqueadas na filial 2 com o motivo "PRODUTO EM ANALISE"
- **Quando** a pessoa abre o produto
- **Então** vê, depois dos lotes, uma linha "Sem lote" da filial 2 com 8 un. e o motivo "PRODUTO EM ANALISE"; um bloqueio sem nenhum motivo registrado mostra "Sem motivo vinculado"

**C-007 — Reservados com lote, vencimento e quem reservou**
- **Dado que** o produto 1001 tem 15 un. reservadas na filial 1 — 10 no L-B pelo pedido 50001 (cliente HOSPITAL SAO LUCAS, vendedor CARLOS LIMA, 09/11/2026, liberado) e 5 no L-C pelo pedido 50002 (CLINICA VIDA, ANA COSTA, 10/11/2026, montado) — e 5 na filial 2, no L-D (vence 15/01/2027), pelo pedido 50003 (DROGARIA CENTRAL, CARLOS LIMA, 11/11/2026, bloqueado)
- **Quando** a pessoa abre o produto
- **Então** vê, na lista de lotes, três lotes com reserva — filial, lote, vencimento, quantidade reservada — somando 20 un., e em cada um o pedido que reservou: número, data, situação, cliente, vendedor e quantidade; o pedido 50004 (já faturado) e o 50005 (cancelado) do mesmo produto não aparecem

**C-011 — Reserva sem pedido identificado**
- **Dado que** o lote L-R do produto 5005 tem 10 un. reservadas e só o pedido 50006 (7 un.) aponta para ele, e o pedido 50007 reserva 4 un. do produto sem lote definido
- **Quando** a pessoa abre o produto
- **Então** o lote L-R mostra o pedido 50006 com 7 un. e a linha "Sem pedido identificado: 3 un."; o pedido 50007 aparece no grupo "Pedidos sem lote definido"

**C-008 — Filtrar por filial**
- **Dado que** o produto 1001 tem estoque nas filiais 1 e 2
- **Quando** a pessoa escolhe a filial 2
- **Então** a lista de produtos, os indicadores, o gráfico e a lista de lotes mostram só a filial 2 (total 50, disponível 35)

**C-009 — Número do momento**
- **Dado que** a pessoa está com o produto aberto há 3 minutos e alguém bloqueia 5 un. no ERP
- **Quando** ela clica em Atualizar (ou passa o intervalo de atualização automática)
- **Então** os números passam a incluir o novo bloqueio e o selo "Atualizado às HH:MM:SS" mostra a hora da nova leitura

**C-010 — ERP fora do ar**
- **Dado que** o ERP não responde
- **Quando** a pessoa busca ou abre um produto
- **Então** vê "Não foi possível consultar o WinThor agora" com o botão Tentar de novo, e nenhum número antigo é exibido como se fosse atual

**C-012 — Foto do produto**
- **Dado que** o Busca 360 tem duas fotos do produto 1001 (a segunda marcada como principal) e nenhuma do produto 1010
- **Quando** a atualização diária das fotos roda e a pessoa abre cada produto
- **Então** o 1001 mostra a foto principal no cabeçalho e o 1010 mostra a marca "sem foto"; com o Busca 360 fora do ar, as fotos já guardadas continuam aparecendo e a consulta de estoque funciona igual

## Requisitos funcionais

| ID | Requisito | Critério de aceite | Prioridade |
|---|---|---|---|
| RF-001 | O sistema DEVE buscar produto por código, parte da descrição (palavras em qualquer ordem) ou EAN | C-001, C-002 | must |
| RF-002 | A lista DEVE mostrar, por produto, total, disponível, reservado, bloqueado e avariado da filial escolhida (ou de todas), 50 por página | C-001; página 2 de 120 resultados mostra os itens 51–100 | must |
| RF-003 | A ficha do produto DEVE mostrar os cinco indicadores somados e uma rosca por filial com as quatro parcelas, o total no centro e os números por escrito | C-003 | must |
| RF-004 | A lista de lotes DEVE mostrar os lotes com saldo, vencimento e situação de validade, do mais próximo de vencer ao mais distante | C-004 | must |
| RF-005 | A lista de lotes DEVE mostrar, em cada lote bloqueado (e no bloqueio sem lote), quantidade, motivo, quem e quando bloqueou, e vencimento | C-005, C-006 | must |
| RF-006 | A lista de lotes DEVE mostrar, em cada lote com reserva (filial, lote, quantidade reservada, vencimento), os pedidos que reservaram: número, data, situação, cliente, vendedor e quantidade | C-007, C-011 | must |
| RF-007 | O filtro de filial DEVE valer para lista de produtos, ficha, gráfico e lista de lotes ao mesmo tempo | C-008 | must |
| RF-008 | Toda tela DEVE ler o ERP no momento da consulta, mostrar a hora da leitura e ter o botão Atualizar | C-009 | must |
| RF-009 | A ficha aberta DEVE se atualizar sozinha a cada 60 s enquanto a aba do navegador estiver visível | C-009 | should |
| RF-010 | *Retirado em 2026-11-11, a pedido: a ficha fica com um gráfico só.* ~~Segundo gráfico com a quantidade por faixa de validade~~ | — | — |
| RF-011 | Falha de leitura do ERP DEVE mostrar a mensagem de erro e Tentar de novo, sem exibir número antigo | C-010 | must |
| RF-012 | O sistema DEVE ter um menu de consultas onde as próximas entrem sem mudar a navegação; nesta entrega, só "Estoque" | navegação com um item ativo | must |
| RF-013 | A lista de lotes DEVE ser uma só — cada lote com vencimento, disponível, motivo do bloqueio e pedido que reservou, sem abas — e poder ser vista em lista ou em tabela, com o mesmo conteúdo | C-004, C-005, C-006, C-007, C-011 nas duas visões | must |
| RF-014 | O cabeçalho da ficha DEVE mostrar a foto principal do produto, vinda do Busca 360 e renovada uma vez por dia; produto sem foto mostra uma marca neutra, e falha da foto não impede a consulta | C-012 | should |

## Requisitos não-funcionais

| ID | Requisito | Como se mede |
|---|---|---|
| RNF-001 | Busca e ficha (indicadores + gráfico) respondem em até 3 s; lista de lotes (com bloqueios e reservas) em até 5 s | cronômetro em produção, 10 produtos com mais lotes |
| RNF-002 | O sistema só lê o ERP; nenhuma ação altera dado do WinThor | revisão: nenhuma consulta de escrita no ERP |
| RNF-003 | Com 40 pessoas usando ao mesmo tempo, a atualização automática não estoura o limite de consultas da plataforma | conta: chamadas por minuto por ficha aberta × 40 < teto |
| RNF-004 | Funciona em tela de 1366 px e em celular (lista e ficha legíveis sem rolagem lateral) | verificação manual |
| RNF-005 | Segue o design system da Benenutri, tema claro e escuro | revisão do design system |

## Entidades do domínio

- **Produto** — o item vendável do ERP (código, descrição, embalagem, EAN, fornecedor, ativo/inativo).
- **Filial** — onde o estoque fica. Um produto tem uma posição de estoque por filial.
- **Posição de estoque** — por produto e filial: total, reservado, bloqueado, avariado e o disponível que sai deles.
- **Lote** — parte da posição com número e vencimento; tem as mesmas parcelas (total, reservado, bloqueado). Produto que não controla lote não tem lotes.
- **Bloqueio** — quantidade retida de um lote (ou da filial, sem lote), com motivo, quem e quando.
- **Reserva** — quantidade comprometida de um lote, ainda não expedida. Nasce de um pedido de venda.
- **Foto do produto** — o endereço da foto principal no Busca 360, guardado no sistema e renovado uma vez por dia. Junto com a chave de acesso ao Busca 360, é a única coisa que o sistema guarda.
- **Pedido de venda** — quem reservou: número, data, situação, cliente e vendedor. Um pedido pode reservar vários lotes; um lote pode ter vários pedidos.

## Regras de negócio

- **RN-001 — Disponível.** Disponível = total − bloqueado − avariado − reservado, nunca negativo (a mesma regra do SGC 2, para os dois sistemas mostrarem o mesmo número). Total 100, bloqueado 10, avariado 5, reservado 15 → 70; total 5, reservado 20 → 0.
- **RN-002 — Filial aparece se tem algo.** Filial com total, reservado, bloqueado e avariado todos zero não aparece no gráfico nem na tabela de filiais.
- **RN-003 — Motivo do bloqueio.** Por lote, o motivo vem do histórico de bloqueio mais recente; sem histórico, das observações do lote; sem nada, "Sem motivo vinculado". Quem bloqueou vem do registro que aumentou o bloqueio, nunca de um desbloqueio. Mesma regra do SGC 2 (R-130).
- **RN-004 — Bloqueado sem lote.** Se o bloqueado da filial é maior que a soma dos lotes bloqueados, a diferença aparece como uma linha "Sem lote" com o motivo registrado na posição da filial.
- **RN-005 — Situação da validade.** Dias = vencimento − hoje. Negativo: "Vencido há N dias" (destaque de erro); 0: "Vence hoje"; 1–30: "Vence em N dias" (alerta); 31–90: alerta leve; acima: neutro. Sem vencimento: "Sem validade".
- **RN-006 — Lote que não conta.** Lote excluído no ERP ou com todas as parcelas zeradas não aparece.
- **RN-007 — Ordem.** Lotes: vencimento mais próximo primeiro, sem validade por último. Depois dos lotes vêm os bloqueios sem lote, maior quantidade primeiro, e por fim os pedidos sem lote definido. Lista de produtos: descrição.
- **RN-008 — Produto inativo.** Aparece na busca com o selo "Inativo".
- **RN-009 — Quem reservou.** Um pedido conta como reserva enquanto está liberado, montado ou bloqueado; faturado e cancelado não contam *(situações a confirmar no ERP antes de publicar)*. A quantidade reservada do lote é sempre a do ERP: se os pedidos do lote somam menos, a diferença aparece como "Sem pedido identificado: N un."; pedido sem lote entra no grupo "Pedidos sem lote definido". Dentro do lote, pedido mais antigo primeiro.
- **RN-010 — Foto.** Vale a foto marcada como principal no Busca 360; sem marca, a primeira; endereço que não seja seguro (https) não entra. Só tem a foto buscada o produto com algo em estoque em alguma filial (o recorte da RN-002). A chave de acesso ao Busca 360 nunca chega ao navegador nem aparece em resposta.

## Testes

| Cenário / regra | Evidência automática exigida | Camada |
|---|---|---|
| C-001 | busca "1001", "whey baun" e "7890000010010" devolvem só o 1001 com total 150, disponível 105, reservado 20, bloqueado 15, avariado 10 | regra de negócio |
| C-002 | busca "xyzabc" devolve 0 linhas e total 0; "D'AGUA" devolve 1 linha sem erro | regra de negócio |
| C-002 | texto de busca "D'AGUA" vira um termo seguro para a consulta; texto vazio não dispara busca | regra de tela |
| C-003 | posição do 1001 devolve as filiais 1 (70/15/10/5) e 2 (35/5/5/5) e não devolve a 3 | regra de negócio |
| C-004 | lotes do 1001 na filial 1 devolvem L-A, L-B, L-C nessa ordem com as quantidades do cenário | regra de negócio |
| C-005 | bloqueios do 1001 na filial 1: L-A 6 un. motivo "AVARIA NO TRANSPORTE", MARIA SOUZA; L-B 4 un. "AGUARDANDO LAUDO" | regra de negócio |
| C-006 | produto 2002 na filial 2: bloqueado 8, nenhum lote, motivo da posição "PRODUTO EM ANALISE" | regra de negócio |
| C-007 | lotes do 1001 em todas as filiais com reserva > 0: L-B 10, L-C 5, L-D 5 = 20; reservas do 1001 devolvem os pedidos 50001 (L-B, 10, HOSPITAL SAO LUCAS, CARLOS LIMA, liberado), 50002 (L-C, 5) e 50003 (L-D, 5), sem o 50004 e o 50005 | regra de negócio |
| C-007 | os pedidos são agrupados sob o lote certo, com a soma por lote igual à reserva do lote | regra de tela |
| C-011 | reservas do 5005 devolvem o 50006 (L-R, 7) e o 50007 (sem lote, 4) | regra de negócio |
| C-011 | lote com 10 reservadas e pedidos somando 7 → "Sem pedido identificado: 3 un."; pedido sem lote → grupo "Pedidos sem lote definido" | regra de tela |
| C-008 | posição e lotes do 1001 filtrados pela filial 2 devolvem só a filial 2 (total 50, disponível 35) | regra de negócio |
| C-009 | a ficha monta "Atualizado às 14:03:07" a partir da hora da leitura | regra de tela |
| C-010 | falha de leitura vira o estado de erro com a mensagem "Não foi possível consultar o WinThor agora" e sem números | regra de tela |
| C-012 | a ficha lê a foto guardada do 1001; produto consultado sem foto e produto nunca consultado não devolvem foto | regra de negócio |
| C-012 / RN-010 | contra um Busca 360 de teste: sem chave e com chave recusada a atualização avisa e não mexe no que está guardado; com a chave certa guarda a principal do 1001 (não a primeira), a única do 2002, nada para endereço sem https, e a resposta não contém a chave | regra de negócio |
| RN-001 | 100/10/5/15 → 70; 5 com reserva 20 → 0 | regra de negócio |
| RN-002 | filial 3 do 1001 (tudo zero) fora do resultado | regra de negócio |
| RN-003 | lote com histórico devolve o motivo do registro mais recente; quem bloqueou é JOAO PEREIRA (bloqueio), não quem fez o desbloqueio parcial depois | regra de negócio |
| RN-003 | sem motivo de histórico, o texto vem da observação do lote ("AGUARDANDO LAUDO"); sem nada, "Sem motivo vinculado" | regra de tela |
| RN-004 | filial com bloqueado 15 e lotes bloqueados 10 → linha "Sem lote" de 5; com 10 e 10 → nenhuma | regra de tela |
| RN-005 | em 11/11/2026: 01/11/2026 → "Vencido há 10 dias"; 11/11 → "Vence hoje"; 01/12 → "Vence em 20 dias" (alerta); 15/01/2027 → 65 dias (alerta leve); 01/06/2027 → neutro; vazio → "Sem validade" | regra de tela |
| RF-013 | cada lote sai com o seu bloqueio e a sua reserva, na ordem do vencimento; o bloqueio sem lote (e o de lote que não veio na lista) sai à parte, sem sumir | regra de tela |
| RN-006 | lote excluído e lote zerado não voltam | regra de negócio |
| RN-007 | ordem dos lotes e dos bloqueados conforme a regra | regra de tela |
| RN-008 | produto inativo volta com a marca de inativo | regra de negócio |
| RN-009 | pedido faturado e pedido cancelado fora; liberado, montado e bloqueado dentro; lote com 10 e pedidos somando 10 → nenhuma linha "Sem pedido identificado"; pedidos do lote em ordem de data | regra de negócio + regra de tela |

Verificação manual:
- [x] C-003 / RF-013 — rosca por filial e lista de lotes (lista e tabela) legíveis em tema claro e escuro, cores do design system (conferido no simulador em 2026-11-11)
- [ ] RF-009 — a ficha se atualiza sozinha e para quando a aba do navegador fica oculta
- [ ] RNF-004 — lista e ficha em 1366 px e em celular
- [ ] RNF-001 — tempo das consultas medido contra o WinThor real
- [ ] C-012 — primeira carga das fotos no ambiente real: quantos produtos, quanto tempo, e a foto de 5 produtos conferida na ficha

## Fora de escopo

- [ ] Qualquer alteração no ERP (bloquear, desbloquear, reservar, transferir) — o sistema só consulta.
- [ ] O pedido completo (outros itens, preço, valor, condição de pagamento) — a aba mostra só quem reservou e quanto.
- [ ] Endereço do lote no armazém (rua, prédio, apartamento).
- [ ] Estoque em trânsito, pedido de compra e previsão de chegada.
- [ ] Histórico de movimentação, giro, cobertura, curva ABC, custo e preço.
- [ ] Exportar para Excel/PDF.
- [ ] Alertas por e-mail de vencimento ou bloqueio.
- [ ] Restringir filiais por usuário (todos veem todas — P-004).
- [ ] As próximas consultas (vendas, clientes, títulos…): cada uma terá sua spec.
- [ ] Guardar cópia do estoque no sistema: a leitura é sempre direta no ERP.
- [ ] As outras fotos do produto (galeria), ampliar a foto e foto na lista de busca — a ficha mostra só a principal.

## Pendências

Todas respondidas em 2026-11-11.

- [x] **P-001** — nome do sistema: **BN Search** (decidido em 2026-11-11; "BN Search · Estoque", depois "BN Search · Vendas"…).
- [x] **P-002** — disponível igual ao SGC 2 (RN-001).
- [x] **P-003** — Reservados completo: lote, vencimento e o pedido que reservou, com cliente e vendedor (C-007, C-011, RN-009).
- [x] **P-004** — todos veem todas as filiais.
- [x] **P-005** — não há filial a esconder; aparecem as que têm estoque (RN-002).
- [x] **P-006** — faixas de validade 30/90/180 dias.
- [x] **P-007** — o projeto ainda será criado na Mitra; até lá a pasta segue como `consultas-winthor`.
- [x] **P-008** — foto do produto (RF-014): guardar a chave do Busca 360 e o endereço das fotos no próprio sistema, como o Mix Builder (decidido em 2026-11-11).

## Checklist de revisão

- [x] Nenhuma menção a tecnologia, tabela ou componente (RN-003 cita o SGC 2 só como referência de regra)
- [x] Todo RF tem critério de aceite verificável
- [x] Seção "Fora de escopo" preenchida
- [x] Cenários cobrem caminho de erro (C-002, C-006, C-010, C-011)
- [x] Seção "Testes" preenchida: todo C-00N e toda RN-00N com evidência concreta
- [x] Zero `[NEEDS CLARIFICATION]` em aberto
