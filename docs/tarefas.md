# Tarefas

O que falta fazer, em ordem de prioridade. Cada tarefa passa pelos agentes do projeto (CLAUDE.md › Agents): `arquiteto` planeja, `dev` implementa, `qa-ui-ux` revisa as telas e `testador-documentador-versionador` testa, documenta e commita. Ao entregar, marque aqui o que ficou pronto e mova para o README o que a pessoa já pode usar.

## 1. Início personalizável — etapa 2: blocos dos relatórios

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

## 2. Notificações: novos eventos configuráveis pelo cron diário

**Pedido do dono (04/11/2026).** Cinco eventos de notificação enviados pelo cron diário, cada um ligado ou desligado pela pessoa:

- [ ] **Resumo do dia**: como o dia começa — saldo em contas, o que vence hoje e quanto dá para gastar hoje sem passar do orçamento (e quanto saiu ontem).
- [ ] **Contas a vencer**: pendentes e faturas que vencem em breve, com a antecedência escolhida (no dia, 1 ou 3 dias antes); vencidas não pagas também.
- [ ] **Dias até a próxima receita**: "Faltam 5 dias para o Salário (R$ 7.950)", com quanto dá para gastar por dia até lá.
- [ ] **Resumo semanal**: na segunda-feira, a semana anterior — receitas, despesas, categorias que mais pesaram e a comparação com a média.
- [ ] **Resumo mensal**: no primeiro dia do mês financeiro (respeitando `month_start_day`), o mês fechado — receitas, despesas, quanto sobrou, orçamentos cumpridos e estourados.

O conteúdo de cada resumo acima é uma proposta: o arquiteto confirma com o dono antes de implementar.

### O que entra

- O passo `sendReminders` do cron (`src/server/jobs/steps/later-phases.ts`, hoje pulado) passa a montar e enviar os eventos, usando a infraestrutura da etapa 1 (`sendPush`, a tabela `notifications` e o número no ícone).
- **Configurável por pessoa** em Ajustes › Notificações › Avisos (hoje "Em breve"): um interruptor por evento, mais as opções de cada um (antecedência das contas a vencer; resumo semanal e mensal ligados ou não). Definir os padrões de quem nunca mexeu.
- Tudo atrás da flag `notificacoes_push`; só recebe quem tem a flag e pelo menos um aparelho inscrito.
- **Idempotente**: a Vercel pode entregar o cron mais de uma vez e o dono pode chamá-lo à mão. Cada evento é enviado uma vez por pessoa por dia, garantido no banco (chave única por pessoa, evento e data), não só na memória.
- Datas no fuso da pessoa (`user_settings.timezone`); valores com `formatBRL` e o modo discreto não se aplica a notificações (avaliar se o texto da notificação deve omitir valores, já que aparece na tela bloqueada).
- Textos curtos em pt-BR (doc 02 §10), cada notificação abrindo a tela certa ao tocar (Início, Extrato filtrado, Relatórios).

### Limites do plano Hobby da Vercel

- O cron roda **uma vez por dia**, a qualquer momento entre 06:00 e 06:59 de Brasília (`0 9 * * *` UTC). Todos os eventos saem nesse horário; horário escolhido pela pessoa ou mais de um envio por dia exigiria o plano Pro ou um agendador externo.
- O passo precisa caber no tempo do job (240 s de orçamento): enviar em lotes e registrar o que não foi enviado.

### Pronto quando

- Cada evento tem teste de unidade da montagem do texto (funções puras), integração do passo contra o PGlite (quem recebe, quem não recebe, flag desligada, evento desligado, segunda execução no mesmo dia não reenvia, isolamento entre contas) e o resultado aparece em `job_runs`.
- Ajustes › Notificações mostra os interruptores e as opções, aprovados pelo `qa-ui-ux`.
- README (Notificações, Cron diário), doc 01 §9 e doc 02 §6.14 atualizados.

## 3. Extrato — melhorias

Pendências pequenas achadas na correção dos filtros (04/11/2026), que já existiam antes dela:

- Com dois ou mais chips ativos, a 360 e 430 px o "Limpar" fica fora da tela, no fim da linha rolável.
- A folha de categorias tem mais de 20 opções e não tem busca (doc 02 §4.4 pede busca acima de 8).
- Com zoom de 200%, os valores do resumo e das linhas são cortados (doc 02 §3.4 e §11).
- Subcategoria arquivada não entra no filtro da categoria mãe (a página só conhece as categorias ativas).
- Não há como criar subcategoria pelo app: o filtro já trata mãe e filhas, mas hoje só categorias criadas direto no banco têm filhas.
- Procurar outras telas que usem uma só `<Sheet>` para conteúdos diferentes: teriam o mesmo defeito do toque rápido corrigido no Extrato (o toque fora da folha que sai fecha a que acabou de abrir).

## Entregue

### Extrato: filtros de conta, categoria e tipo — 04/11/2026

Bug relatado pelo dono: escolher conta ou categoria na folha não filtrava, e o Tipo também estava quebrado. O servidor estava certo; a folha, ao fechar, voltava um passo no histórico e desfazia a troca de URL. Agora a URL muda depois que a folha fecha (`afterSheetsClose` em `use-back-to-close.ts`), Voltar desfaz o filtro, filtrar a categoria mãe traz as filhas, id inválido na URL não acende chip e limpar um filtro deixa o foco num chip. Também corrigido (05/11/2026), e já existia antes: no toque, tocar no próximo chip enquanto a folha anterior ainda saía abria e fechava a nova na hora; agora cada filtro tem a sua folha. Testes de unidade, integração de cada filtro (`listTransactions`, `periodTotals`) e e2e (`e2e/extrato-filtros.spec.ts`, que falhava antes da correção). Detalhes: doc 02 §6.4.

### Início personalizável (etapa 1) — 04/11/2026

Atrás da flag `inicio_personalizavel` (desligada por padrão; a demo liga para a Ana). Catálogo tipado de blocos com o **Calendário de gastos**, escolha na conta (`user_settings.home_layout`) lida a cada requisição, folha "Personalizar o Início" (no Início e em Preferências) com Subir/Descer, interruptor, "Restaurar padrão" com desfazer, `<Suspense>` e erro por bloco, desktop num fluxo que segue a ordem, dica e novidade. De quebra: próximas contas sempre a partir de hoje e o calendário sem ler valores no modo discreto. Testes de unidade, integração e e2e (`e2e/inicio-personalizavel.spec.ts`). Detalhes: README, doc 02 §6.3 e doc 01 §8 e §11.10.
