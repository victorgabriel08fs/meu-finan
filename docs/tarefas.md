# Tarefas

O que falta fazer, em ordem de prioridade. Cada tarefa passa pelos agentes do projeto (CLAUDE.md › Agents): `arquiteto` planeja, `dev` implementa, `qa-ui-ux` revisa as telas e `testador-documentador-versionador` testa, documenta e commita. Ao entregar, marque aqui o que ficou pronto e mova para o README o que a pessoa já pode usar.

## 1. Extrato: filtros por conta e por categoria não funcionam

**Bug relatado pelo dono (02/11/2026).** No Extrato (doc 02 §6.4), escolher uma conta ou uma categoria no filtro não filtra a lista. Os outros filtros (tipo, status, busca) não foram citados.

### O que investigar

- O caminho inteiro do filtro: a folha de filtros escreve `conta` e `categoria` na URL, `parseStatementParams` lê, a página só aceita ids da própria pessoa (`src/app/(app)/extrato/page.tsx`) e `listTransactions` (`src/server/domain/transactions.ts`) aplica o filtro e os totais.
- Reproduzir na demo (Ana e Bruno), no celular e no desktop, com e sem `mes=`, e com conta arquivada, cartão de crédito, transferência (a conta pode estar na outra perna) e categoria com subcategorias (filtrar a categoria mãe deve trazer as filhas, se o doc 02 pedir).

### Pronto quando

- Filtrar por conta e por categoria mostra só os lançamentos certos, com os totais do cabeçalho batendo com a lista; o filtro aparece escolhido na tela, dá para tirá-lo e ele continua valendo ao recarregar a página.
- Id de outra conta ou categoria na URL é ignorado, como hoje.
- Teste de integração da consulta com cada filtro e e2e do Extrato filtrando por conta e por categoria (o e2e precisa falhar antes da correção).

## 2. Início personalizável — etapa 2: blocos dos relatórios

**Continuação da tarefa entregue em 04/11/2026** (veja Entregue, no fim). O catálogo já reserva os ids, sem entrada: `cash-flow`, `category-breakdown`, `income-expense` e `net-worth` (`src/lib/home/blocks.ts`).

### O que entra

- Um bloco por commit, cada um com loader próprio em `src/app/(app)/inicio/blocks.tsx`, skeleton com a altura medida, erro de bloco e convite quando vazio, reaproveitando as consultas e os componentes dos Relatórios:
  - **Fluxo de caixa** (`cashFlowReport` + `CashFlowCard`), largo.
  - **Para onde foi o dinheiro** (`categoryBreakdown` + `CategoryRanking` com 5 categorias).
  - **Receitas × despesas** (`monthlySeries(ctx, range, 6)`).
  - **Patrimônio** (`netWorthSeries(ctx, range, 7)`).
- Os blocos novos entram fora do padrão, com "Novo" por 30 dias, e uma novidade "Mais blocos para o Início" (`when: { flag: "inicio_personalizavel" }`).

### Pendências pequenas da etapa 1

- Skeletons de Contas (148 → 156 px) e Metas (180 → 188 px), medidos pelo `qa-ui-ux`.
- O breakpoint solto `min-[26.25rem]` nos skeletons de Receitas/Despesas e Orçamento: virar um breakpoint do tema ou sair.
- axe no e2e (`@axe-core/playwright` não está instalado): `/inicio` com a folha fechada e aberta e `/ajustes/preferencias`.
- A dispensa do Destaque fica em `localStorage` sem a chave da pessoa (CLAUDE.md › One device, several accounts).
- Decidir (o dono ainda não decidiu) se Receitas e despesas vão para a coluna do Saldo quando ele divide a linha com um bloco largo (`hero-wide`).

### Pronto quando

- Cada bloco aparece na folha "Personalizar o Início", carrega sozinho, respeita `?mes=` e o modo discreto, e o `qa-ui-ux` aprova em 360/430 px e desktop, escuro e claro.
- Testes de unidade dos componentes, integração dos loaders e e2e de ligar um bloco novo.
- README, doc 02 §6.3 e a novidade atualizados.

## Entregue

### Início personalizável (etapa 1) — 04/11/2026

Atrás da flag `inicio_personalizavel` (desligada por padrão; a demo liga para a Ana). Catálogo tipado de blocos com o **Calendário de gastos**, escolha na conta (`user_settings.home_layout`) lida a cada requisição, folha "Personalizar o Início" (no Início e em Preferências) com Subir/Descer, interruptor, "Restaurar padrão" com desfazer, `<Suspense>` e erro por bloco, desktop num fluxo que segue a ordem, dica e novidade. De quebra: próximas contas sempre a partir de hoje e o calendário sem ler valores no modo discreto. Testes de unidade, integração e e2e (`e2e/inicio-personalizavel.spec.ts`). Detalhes: README, doc 02 §6.3 e doc 01 §8 e §11.10.
