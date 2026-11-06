# Tarefas

O que falta fazer, em ordem de prioridade. Cada tarefa passa pelos agentes do projeto (CLAUDE.md › Agents): `arquiteto` planeja, `dev` implementa, `qa-ui-ux` revisa as telas e `testador-documentador-versionador` testa, documenta e commita. Ao entregar, marque aqui o que ficou pronto e mova para o README o que a pessoa já pode usar.

## 3. Notificações — próximos avisos

Ficaram de fora da primeira leva de avisos (05/11/2026) e saíram da tela (a lista "Em breve" de Ajustes › Notificações). Cada um entra como mais um interruptor em Avisos, no mesmo passo `sendReminders` (doc 01 §9), com a mesma regra de uma vez por pessoa e por dia e sem valores quando "Mostrar valores nas notificações" estiver desligado:

- **Fatura fechando**: dias antes do fechamento, com o total até agora (doc 02 §10.3).
- **Orçamento a 80% e a 100%**: quando o total ou uma categoria chega lá; uma vez por limite e por mês.
- **Meta atingida**: quando o saldo da meta chega ao alvo.
- **Central de notificações no sino** (doc 02 §6.15): a lista dos avisos, com "Marcar todas como lidas". Com ela, abrir o app deixa de marcar tudo como lido e o número no ícone passa a seguir a central.

## 5. Categorias — próximos passos

Ficaram de fora das subcategorias (05/11/2026):

- **Mesclar categorias** (doc 02 §6.14): mover os lançamentos de uma para outra. Ao mesclar uma mãe, as subcategorias vão para o destino se ele for uma categoria principal; senão, a mesclagem é recusada com o motivo. Orçamentos e regras aprendidas da categoria mesclada precisam de regra própria.
- **Reordenar categorias** (`sort_order` já existe): subir e descer, na árvore, sem tirar a subcategoria de baixo da mãe.
- **Detalhe da categoria com as subcategorias** (doc 02 §6.12): os relatórios somam as subcategorias na mãe (doc 03 §12); aqui entra a divisão por subcategoria.
- O "Desfazer" de "Categoria X arquivada" restaura sem toast de confirmação; o texto "restaurada, com N subcategorias" só aparece pelo botão Restaurar.
- O e2e "lança uma despesa pelo +" (`e2e/smoke.spec.ts`) falhou uma vez por tempo sob carga e passou ao repetir: observar se volta a falhar.

## 6. Caixinha: novo tipo de conta

**Pedido do dono (05/11/2026).** Um tipo de conta novo, **Caixinha**, para dinheiro guardado à parte (como as caixinhas dos bancos):

- **Conta no patrimônio** (Relatórios › Patrimônio, bloco Patrimônio do Início).
- **Transferências** de uma caixinha para outra conta e de outra conta para a caixinha, como entre contas comuns (as duas pernas balanceadas, doc 01 ADR-04).
- **Não conta no valor que pode ser gasto**: fica fora da previsão do mês, do "pode gastar por dia" e de tudo que deriva deles (Saldo em contas e previsto no Início, Fluxo de caixa, avisos Resumo do dia e Próxima receita). Guardar dinheiro na caixinha reduz o que dá para gastar; resgatar aumenta.

### O que investigar e decidir

- Hoje os tipos são `checking`, `savings`, `cash`, `investment`, `credit_card` e `other` (`src/server/db/schema/enums.ts`), e a regra de "conta líquida" é `isLiquid` em `src/server/domain/dashboard.ts` (tudo menos cartão, com "incluir no patrimônio", não arquivada), repetida em `reports.ts` e `reminders.ts`: centralizar numa função só e tirar dela a caixinha.
- Valor novo no enum `fin_account_type` (migração com `npm run db:generate`; nunca editar `drizzle/`), rótulo e ícone (doc 02), formulário de conta, filtros e listas que agrupam por tipo, importação de extrato.
- **Para o dono decidir** (o arquiteto traz com recomendação): o card "Saldo em contas" mostra o total guardado nas caixinhas à parte (ex.: "Guardado em caixinhas R$ X")? Poupança e investimento continuam contando como dinheiro para gastar, ou passam a se comportar como caixinha? Caixinha pode ter meta ligada (Planejar › Metas)?
- Transferência para a caixinha não é despesa nem receita (não entra em orçamento nem em Receitas × despesas), como as transferências de hoje.

### Pronto quando

- Criar uma caixinha, transferir para ela e de volta; o patrimônio não muda com a transferência, o Saldo em contas, o previsto e o "pode gastar por dia" mudam.
- Testes: unidade da regra de conta líquida; integração (previsão, patrimônio, Fluxo de caixa e avisos com e sem caixinha; isolamento); e2e criando a caixinha e transferindo.
- README, doc 01 (enum e regra de liquidez), doc 02 (tipo de conta, Início) e doc 03 (previsão e "pode gastar por dia") atualizados; novidade em Ajustes › Novidades.

## 7. Arquivar categoria levando os lançamentos para outra

**Pedido do dono (06/11/2026).** Ao arquivar uma categoria em Ajustes › Categorias, perguntar: "Quer passar as despesas desta categoria para outra?" (ou "as receitas", conforme o tipo).

- **Sim**: a pessoa escolhe a categoria de destino (do mesmo tipo, ativa; subcategorias aparecem como "Mercado › Feira") e os lançamentos da arquivada passam para ela.
- **Não**: os lançamentos ficam sem categoria ou vão para "Outros" (a categoria padrão que já existe) — o dono escolhe qual dos dois quando a tarefa começar; hoje eles continuam com a categoria arquivada.

### O que investigar e decidir

- É o mesmo movimento do **Mesclar categorias** da tarefa 5: fazer os dois juntos (um só domínio que move os lançamentos, em transação, com ownership do destino) ou deixar o mesclar para depois.
- Quais lançamentos mudam: todos (passados, agendados, recorrências e parcelas futuras) ou só os futuros? Regras aprendidas da importação (`mapping`) e orçamentos da categoria arquivada (D1: só categorias principais têm orçamento) — o que acontece com cada um.
- Mãe com subcategorias: a cascata de arquivar (já existe) leva as filhas; os lançamentos das filhas vão para o destino também, ou cada filha escolhe?
- "Desfazer": hoje arquivar tem Desfazer; com lançamentos movidos, desfazer precisa devolver cada um à categoria de antes (guardar a lista) ou a ação vira confirmação sem Desfazer (doc 02 §2, princípio 6: confirmação só para o irreversível).
- Textos (doc 02 §10), confirmação com a contagem ("32 despesas vão para Mercado"), toasts.

### Pronto quando

- Arquivar com e sem mover; os lançamentos, totais, orçamentos e relatórios refletem o destino; isolamento entre contas e ownership do destino testados (integração); e2e do fluxo; README, doc 02 §6.14 e doc 01 atualizados.

## Acessibilidade — depois

Sobrou da tarefa "Acessibilidade e textos" (entregue em 06/11/2026), medido a 200% de texto em 360 px:

- **Nova transação**: com o teclado aberto, o valor e o seletor de tipo ficam abaixo da dobra (o rodapé rola junto, mas a folha ainda é alta demais). Pensar numa folha que reserva a altura do teclado.
- **Skeletons exatos a 200%**: as alturas são as de 100%, então o conteúdo ainda empurra a tela ao chegar.
- **Gráfico de poupança** (Relatórios › Visão geral) a 200%: ~60 px de altura, e os rótulos encostam na linha.
- **Chip de variação do Saldo** a 200%: quebra em 4 linhas (~160 px).
- **Termo único**: "Admin" na lista de usuários e "Administrador" na folha. Escolher um (doc 02 §10.4).
- **Onboarding e telas de entrada** (`/entrar`, `/primeiro-acesso`, `/recuperar`, `/convite`) a 200%: só foram varridas, sem ajuste nem teste.
- **Desktop a 200%**: só se garante a ausência de rolagem lateral a 1280 px; o resto do layout não foi revisto.

## Entregue

### Acessibilidade e textos — 06/11/2026

Achados do `qa-ui-ux` nas Notificações (05/11/2026) e as decisões do dono:

- [x] **Texto a 200% em 360 px**: nenhuma tela rola para o lado, nenhum valor sai do cartão, nada fica sob um interruptor. `Money` encolhe até 50% (valor sempre exato); linhas de lista quebram em até 2 linhas abaixo de 16 rem de contêiner; botões, selos e segmented crescem em vez de cortar; cabeçalhos, `MonthSwitcher`, grades, carrossel, simulador e gráficos se ajustam. Tetos para o que não é texto: `--target`, `--tab-bar-h`, `--tab-icon`, `--fab`, `--switch-*`, `--row-icon`, `--avatar`.
- [x] **Barra inferior só com ícones** (rótulo `sr-only`) quando não cabe; barra até 80 px e "+" até 60 px.
- [x] **`Switch` único** (`src/components/ui/switch.tsx`) com trilha desligada de 3:1 nos dois temas (`--switch-off`) e `SettingRow` para as linhas de ajuste.
- [x] **Toast**: ação ("Desfazer") com 44 px.
- [x] **Concordância do toast das flags** pelo `grammar` do registro ("Notificações ligadas para Bruno.").
- [x] **Resumo "Agendados"** do Extrato: o "·" fica com a palavra anterior.
- [x] **Patrimônio** começa no primeiro registro (`trimToFirstRecord`), com "Seus registros começam em {mês}."
- [x] **CLS no Início a 1280 px**: item "Administração" em lista própria e skeleton de Próximas contas na forma do conteúdo.
- [x] **Valores a partir de R$ 1 mi** inteiros nos cartões.

Testes: unidade (`fit`, `title-fit`, `labels`, `coverage`, `switch`, `setting-row`, resumo, botão, gráficos), integração (`blocks.integration.test.tsx`) e `e2e/texto-grande.spec.ts` (telas a 360 e 430 px, 100% e 200%; barra inferior; axe a 200% nos dois temas), mais o CLS e a concordância em `e2e/admin.spec.ts`. `e2e/layout.ts` compara a rolagem com a largura pedida do viewport: com `isMobile` o `innerWidth` cresce até o conteúdo e escondia o problema. Detalhes: doc 02 §3.1, §3.4, §3.5, §3.10, §4.2, §4.3, §5.1, §5.4, §5.13, §5.14, §5.15, §6.12, §6.17, §8 e §11. O que ficou: "Acessibilidade — depois".

### Início e Relatórios: melhorias — 05/11/2026

Pendências da etapa 2 do Início personalizável, com as decisões do dono (05/11/2026):

- [x] **`?mes=` nos relatórios por período** (Visão geral, Categorias, Patrimônio): chips e abas mantêm o mês; nota "Até {mês}" com "Voltar para hoje"; os blocos do Início e o aviso Resumo mensal abrem o relatório no mês certo. "Para onde foi o dinheiro" em outro mês leva a "Ver relatório" (`/relatorios/categorias?periodo=1&mes=…`), não mais ao extrato.
- [x] **"Sem registros em {mês}"** nos quatro blocos dos relatórios e nas telas de Fluxo e Patrimônio, para um mês que termina antes do primeiro lançamento não excluído ou da conta mais antiga, com "Ir para {mês}" (`firstRecordOn` em `src/server/domain/request-reads.ts`, regra pura em `src/lib/reports/coverage.ts`).
- [x] **Contraste das colunas em repouso** de Receitas × despesas (≥ 3:1 nos dois temas): tokens `--chart-3-rest` e `--chart-2-rest`; a seleção também aparece num traço sob o mês.
- [x] **Resumo do Patrimônio** sem variação: "ficou estável em R$ …".
- [x] **Rótulos do Fluxo** não terminam mais em preposição ("Mensalidade…").
- [x] **Skeleton por fase** em Receitas e Despesas, Orçamento, Para onde foi o dinheiro e Receitas × despesas por mês.
- [x] **axe no tema claro** (`e2e/inicio-personalizavel.spec.ts`): Início com os blocos dos relatórios, Fluxo em tabela, os relatórios e meses sem registros e futuro; o tema volta ao escuro no fim. `chooseTheme` agora é um só, em `e2e/theme.ts`.
- [x] **Barra inferior opaca** (`bg-surface`, sem desfoque) para o item ativo manter o contraste: desvio do doc 02 §3.7, documentado lá.

Testes de unidade (`views`, `coverage`, `model`, `cash-flow-model`, `home-skeleton`, `chart-tokens`, gráficos), integração contra o PGlite (`request-reads.integration.test.ts`, `blocks.integration.test.tsx`, `reminders.integration.test.ts`) e e2e. Detalhes: doc 02 §3.1, §3.7, §6.3, §6.12 e §9.4.

Ficou para depois, em "Acessibilidade — depois" (e entregue em "Acessibilidade e textos").

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
