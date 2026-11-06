# Tarefas

O que falta fazer, em ordem de prioridade. Cada tarefa passa pelos agentes do projeto (CLAUDE.md › Agents): `arquiteto` planeja, `dev` implementa, `qa-ui-ux` revisa as telas e `testador-documentador-versionador` testa, documenta e commita. Ao entregar, marque aqui o que ficou pronto e mova para o README o que a pessoa já pode usar.

## 2. Início e Relatórios — melhorias

Pendências achadas na etapa 2 do Início personalizável (05/11/2026):

- **Mês anterior a qualquer lançamento** (`?mes=2024-01`): o Fluxo de caixa e o Patrimônio mostram o saldo projetado para trás, como se já houvesse dinheiro. Mostrar "Sem registros em {mês}" nos dois lugares, no bloco do Início e no relatório.
- Receitas × despesas: no tema claro, as colunas dos meses não selecionados ficam com contraste baixo.
- Resumo falado com variação zero diz "ficou estável de R$ 5.150 para R$ 5.150": dizer "ficou estável em R$ 5.150".
- Rótulos dos marcadores truncados no gráfico do Fluxo de caixa ("Curso de…").
- Skeleton por fase do mês também em Receitas/Despesas, Orçamento e Receitas × despesas por mês (hoje só o Fluxo de caixa muda com a fase).
- axe no tema claro (o e2e roda o axe só no escuro).
- `?mes=` nos relatórios por período (Visão geral, Categorias, Patrimônio): o link "Ver relatório" dos blocos não leva o mês do Início, e o toque no aviso Resumo mensal abre a Visão geral no período atual, não no mês que fechou. Quando ela aceitar `?mes=`, o link do aviso passa a levar o mês (`src/server/reminders.ts`).

## 3. Notificações — próximos avisos

Ficaram de fora da primeira leva de avisos (05/11/2026) e saíram da tela (a lista "Em breve" de Ajustes › Notificações). Cada um entra como mais um interruptor em Avisos, no mesmo passo `sendReminders` (doc 01 §9), com a mesma regra de uma vez por pessoa e por dia e sem valores quando "Mostrar valores nas notificações" estiver desligado:

- **Fatura fechando**: dias antes do fechamento, com o total até agora (doc 02 §10.3).
- **Orçamento a 80% e a 100%**: quando o total ou uma categoria chega lá; uma vez por limite e por mês.
- **Meta atingida**: quando o saldo da meta chega ao alvo.
- **Central de notificações no sino** (doc 02 §6.15): a lista dos avisos, com "Marcar todas como lidas". Com ela, abrir o app deixa de marcar tudo como lido e o número no ícone passa a seguir a central.

## 4. Acessibilidade e textos

Achados do `qa-ui-ux` nas Notificações (05/11/2026) que valem para o app inteiro:

- **Texto a 200% em 360 px**: títulos cortados, descrições passando por baixo dos interruptores e a barra inferior truncando os rótulos. Sugestões: empilhar o interruptor abaixo do texto por container query; barra só com ícones (e `aria-label`) acima de um tamanho de texto; títulos que quebram linha em vez de cortar.
- **Botão de ação dos toasts** ("Desfazer", "Tentar de novo") com 36 px de altura, abaixo dos 44 px de doc 02 §11.
- **Concordância no toast das flags**: "Notificações ligado para Bruno" (`src/components/admin/flags-manager.tsx`, `onOff`); o rótulo da flag é feminino ou plural.
- **Contraste do `Switch` desligado no tema claro**: a trilha fica fraca contra a superfície; medir e ajustar o token (doc 02 §3.1).
- **Valores a partir de R$ 1 mi a 200% em 360 px**: o resumo e as linhas do Extrato quebram de linha, mas um valor muito longo ainda pode passar do cartão (o `Money` não quebra).
- **Melhoria**: no resumo "Agendados" do Extrato a 200%, o "·" entre as informações pode começar a linha; mantê-lo junto da palavra anterior (`&nbsp;` antes dele).

## 5. Categorias — próximos passos

Ficaram de fora das subcategorias (05/11/2026):

- **Mesclar categorias** (doc 02 §6.14): mover os lançamentos de uma para outra. Ao mesclar uma mãe, as subcategorias vão para o destino se ele for uma categoria principal; senão, a mesclagem é recusada com o motivo. Orçamentos e regras aprendidas da categoria mesclada precisam de regra própria.
- **Reordenar categorias** (`sort_order` já existe): subir e descer, na árvore, sem tirar a subcategoria de baixo da mãe.
- **Detalhe da categoria com as subcategorias** (doc 02 §6.12): os relatórios somam as subcategorias na mãe (doc 03 §12); aqui entra a divisão por subcategoria.

## Entregue

### Extrato: melhorias e subcategorias — 05/11/2026

Pendências do Extrato (04/11/2026) e o pedido do dono de criar subcategorias pelo app:

- [x] **"Limpar" à vista**: fora da linha rolável, no fim da linha de chips, a 360 e 430 px com os quatro filtros, a 100% e a 200%.
- [x] **Busca nas folhas de conta e de categoria** (mais de 8 opções, doc 02 §4.4), sem acento e pelo nome inteiro; o código da busca é compartilhado com a folha de categorias da Nova transação (`src/lib/format/search.ts`, `SheetSearch`).
- [x] **Valores inteiros a 200%**: resumo (nos três modos), linhas e total do dia quebram de linha em vez de cortar.
- [x] **Subcategoria arquivada** entra no filtro da mãe; categoria arquivada filtra pela URL (o link do ranking e o do insight, que caíam no Extrato sem filtro) e a folha tem o grupo "Arquivadas". O detalhe e o select de edição mostram "Mercado › Padaria (arquivada)", em vez de "Sem categoria".
- [x] **Subcategorias** (decisões do dono, 05/11/2026): um nível só, mesma pessoa e mesmo tipo da mãe; criar e mover em Ajustes › Categorias ("Subcategoria de"); arquivar a mãe arquiva as filhas, e o Desfazer restaura em par; categoria com orçamento neste mês ou nos próximos não vira subcategoria. **D1**: o orçamento fica só em categoria principal e soma as subcategorias. **D2**: relatórios, resumos e insights somam as subcategorias na mãe. Novidade "Subcategorias" (`novidade-subcategorias`, sem flag). Demo: Mercado › Feira e Mercado › Padaria (arquivada) para a Ana.
- [x] **Toque rápido numa folha reaberta enquanto a anterior sai**: o toque que começou antes da reabertura não fecha mais a folha nova (`src/components/ui/sheet.tsx`, para todas as folhas). O defeito real estava só no **detalhe do lançamento do Extrato** e na **Nova transação**; as telas que usam `useSheetTarget` (Categorias, Orçamentos, Metas, Flags, Usuários) não tinham, porque remontam o conteúdo com `key`.

Testes de unidade (`search`, `hierarchy`, `statementCategoryIds`, `filterOptionGroups`, mensagens de Categorias), integração contra o PGlite (`categories.integration.test.ts`: regras da mãe, concorrência, arquivar e restaurar em par, isolamento entre contas; `category-rollup.integration.test.ts`: orçamento e relatórios; filtro da mãe em `domain.integration.test.ts`) e e2e (`e2e/extrato-filtros.spec.ts`, `e2e/categorias.spec.ts` com axe no escuro e no claro, `tips.spec.ts`, `novidades-flags.spec.ts`). Detalhes: README, doc 01 (modelo de categorias), doc 02 §5.7, §5.8, §6.4, §6.5, §6.6, §6.14 e §6.16, doc 03 §11 e §12.

Ficou para depois, nas pendências abaixo: mesclar e reordenar categorias, o detalhe da categoria com subcategorias, valores a partir de R$ 1 mi a 200% e o "·" do resumo "Agendados".

### Notificações: avisos pelo cron diário — 05/11/2026

Pedido do dono (04/11/2026), conteúdo aprovado em 05/11/2026. O passo `sendReminders` envia, uma vez por dia entre 06:00 e 06:59 de Brasília, os avisos que cada pessoa ligou em Ajustes › Notificações › Avisos:

- [x] **Resumo do dia** (desligado por padrão): saldo em contas, o que vence hoje, quanto dá para gastar hoje pelo orçamento e quanto saiu ontem.
- [x] **Contas a vencer** (ligado; 1 dia antes): pendentes e faturas, com a antecedência escolhida (No dia · 1 dia · 3 dias); cada conta avisada uma vez antes e uma vez vencida (até 7 dias).
- [x] **Próxima receita** (desligado): todo dia nos 7 dias antes, com quanto dá para gastar por dia até lá (o menor entre a previsão e o "pode gastar por dia" do orçamento).
- [x] **Resumo semanal** (ligado): na segunda, a semana anterior, as categorias que mais pesaram e a comparação com a média das 4 semanas anteriores (só semanas com despesa).
- [x] **Resumo mensal** (ligado): no 1º dia do mês financeiro (`month_start_day`), o mês fechado e os orçamentos cumpridos e estourados.

Também entraram: "Mostrar valores nas notificações" (desligado por padrão: sem R$ na tela bloqueada), "Enviar prévia dos avisos" para administradores, o número no ícone que zera ao abrir o app, a limpeza dos avisos lidos há mais de 90 dias, a novidade "Avisos todo dia pela manhã" (`when: { flag: "notificacoes_push" }`) e a correção da nota "Vale só para este aparelho", que nunca aparecia. Tudo atrás da flag `notificacoes_push`; `job_runs` só com contagens.

Testes de unidade (`src/lib/notifications`, `spendablePerDay`, `compareToAverage`, datas), integração contra o PGlite (`src/server/reminders.integration.test.ts`: quem recebe, isolamento, execuções simultâneas, push com erro e aparelho removido, contas de uma semana inteira, prazo, `runDailyJob`, fuso do Havaí, número no ícone e prévia; preferências e action em `src/server/domain/preferences.integration.test.ts`) e e2e (`e2e/notificacoes.spec.ts` com axe no escuro e no claro, `tips.spec.ts`, `novidades-flags.spec.ts`). Detalhes: README (Notificações, Notificações no celular, Cron diário), doc 01 §6.3, §9, §10 e §11.10, doc 02 §6.14 e §10.3, doc 03 §12.

### Início personalizável (etapa 2): blocos dos relatórios — 05/11/2026

Quatro blocos novos no catálogo, fora do padrão e com "Novo" por 30 dias: **Fluxo de caixa** (largo, só o menor saldo previsto, skeleton pela fase do mês), **Para onde foi o dinheiro**, **Receitas × despesas por mês** e **Patrimônio**. Cada um segue `?mes=`, leva ao relatório e mostra um convite quando não há o que mostrar. Novidade "Mais blocos para o Início" (`when: { flag: "inicio_personalizavel" }`). Títulos dos blocos com o nome da folha ("Calendário de gastos", "Patrimônio").

Também entraram:

- Gráficos sem falar valores no modo discreto (resumos, percorrer e colunas dizem "valor oculto").
- O Fluxo de caixa e o Saldo leem contas, faturas e pendentes uma vez por requisição (`request-reads.ts`).
- Tabelas com rolagem recebem foco pelo teclado.

Pendências pequenas da etapa 1, resolvidas:

- Skeletons de Contas (156 px) e Metas (188 px) com a altura do cabeçalho.
- O breakpoint solto `min-[26.25rem]` saiu: os skeletons medem pela largura do bloco (container queries).
- axe no e2e (`@axe-core/playwright`, `e2e/axe.ts`): `/inicio` com os 4 blocos, a folha aberta e a tabela do Fluxo, e `/ajustes/preferencias`, no tema escuro, sem violações.
- A dispensa do Destaque passou a ser por pessoa no aparelho (chave com o id da pessoa).
- Mantido, por decisão do dono: quando o Saldo divide a linha com um bloco largo (`hero-wide`), a tela segue a ordem da folha.

Testes de unidade, integração dos carregadores (`src/app/(app)/inicio/blocks.integration.test.tsx`) e e2e (`e2e/inicio-personalizavel.spec.ts`, `tips.spec.ts`, `novidades-flags.spec.ts`). Detalhes: README, doc 02 §5.17, §5.20, §6.3 e §9.5, doc 01 §8.

### Extrato: filtros de conta, categoria e tipo — 04/11/2026

Bug relatado pelo dono: escolher conta ou categoria na folha não filtrava, e o Tipo também estava quebrado. O servidor estava certo; a folha, ao fechar, voltava um passo no histórico e desfazia a troca de URL. Agora a URL muda depois que a folha fecha (`afterSheetsClose` em `use-back-to-close.ts`), Voltar desfaz o filtro, filtrar a categoria mãe traz as filhas, id inválido na URL não acende chip e limpar um filtro deixa o foco num chip. Também corrigido (05/11/2026), e já existia antes: no toque, tocar no próximo chip enquanto a folha anterior ainda saía abria e fechava a nova na hora; agora cada filtro tem a sua folha. Testes de unidade, integração de cada filtro (`listTransactions`, `periodTotals`) e e2e (`e2e/extrato-filtros.spec.ts`, que falhava antes da correção). Detalhes: doc 02 §6.4.

### Início personalizável (etapa 1) — 04/11/2026

Atrás da flag `inicio_personalizavel` (desligada por padrão; a demo liga para a Ana). Catálogo tipado de blocos com o **Calendário de gastos**, escolha na conta (`user_settings.home_layout`) lida a cada requisição, folha "Personalizar o Início" (no Início e em Preferências) com Subir/Descer, interruptor, "Restaurar padrão" com desfazer, `<Suspense>` e erro por bloco, desktop num fluxo que segue a ordem, dica e novidade. De quebra: próximas contas sempre a partir de hoje e o calendário sem ler valores no modo discreto. Testes de unidade, integração e e2e (`e2e/inicio-personalizavel.spec.ts`). Detalhes: README, doc 02 §6.3 e doc 01 §8 e §11.10.
