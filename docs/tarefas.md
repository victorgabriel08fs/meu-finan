# Tarefas

O que falta fazer, em ordem de prioridade. Cada tarefa passa pelos agentes do projeto (CLAUDE.md › Agents): `arquiteto` planeja, `dev` implementa, `qa-ui-ux` revisa as telas e `testador-documentador-versionador` testa, documenta e commita. Ao entregar, marque aqui o que ficou pronto e mova para o README o que a pessoa já pode usar.

## Próximas tarefas (18 a 21), nesta ordem

Ordem definida em 13/11/2026 pelo dono: cada tarefa só depende das anteriores, e as pequenas vêm antes das que pedem mais contexto (uma tarefa por sessão, para caber no limite de tokens). As tarefas 14 (Maior gasto da semana) e 15 (Parcelas a terminar), de 13/11/2026, 16 (Comparado ao mês passado) e 17 (Assinaturas do mês), de 14/11/2026, foram entregues (ver "Entregue"). Os blocos novos entram no Início personalizável (catálogo de blocos, flag `inicio_personalizavel`), cada um com skeleton e erro próprios.

### 18. Etiquetas — M

- As tabelas `tags` e `transaction_tags` já existem, sem tela. Criar, renomear e arquivar etiquetas (Ajustes), escolher várias no lançamento (Nova transação e detalhe), filtro no Extrato (na URL, como os demais) e um relatório por etiqueta (total e lançamentos do período).
- Exportação CSV com a coluna de etiquetas.
- Pré-requisito da tarefa 21 (`#etiqueta` no texto).

### 19. Gasto fora do padrão — M

- Aviso quando uma categoria passa da média dos últimos meses ("Mercado está 40% acima da média"), usando `comparisonWindows`/`compareBreakdown` da tarefa 16 (a média dos 3 períodos anteriores vem do `previous` de `comparisonWindows`).
- Trocar `categoryInsight` (`dashboard.ts`) por `comparisonWindows`: ele usa `addDays(period.start, elapsed)` sem limitar ao fim do período anterior, então com o mês anterior mais curto a janela invade o período seguinte (início dia 1, 30/mar: fevereiro vira 1/fev–2/mar).
- Novo aviso no cron diário (uma vez por categoria e mês), no sino e no push, ligado ou desligado em Ajustes › Notificações; sem valores na tela bloqueada sem "Mostrar valores". Pode virar também um insight no Início.

### 20. Fechamento do mês — M

- No 1º dia do mês financeiro, uma tela de revisão do mês que acabou: receitas, despesas e o que sobrou; comparação com o anterior (tarefa 16, `comparisonWindows` com o período já terminado); assinaturas (17) e parcelas que continuam (15); orçamentos estourados com a sugestão pela média; e "Guardar a sobra" (transferência para uma caixinha).
- Chega pelo Resumo mensal (sino e push) e fica em Relatórios para os meses anteriores.

### 21. Lançamento por texto — M/G (por último)

- Um campo na Nova transação que entende "café 12 no nubank ontem #viagem" e preenche o formulário (valor, descrição, conta, data, categoria pelas regras de `categorization_rules` e etiquetas da tarefa 18) para a pessoa conferir antes de salvar.
- Começar com um parser determinístico em `src/lib` (sem serviço externo); um modelo de linguagem fica para avaliar depois (custo, CSP e privacidade).

## 17. Assinaturas do mês: o que ficou de fora

A tarefa foi entregue em 14/11/2026 (ver "Entregue"). Fica para depois:

- **Rodapé "e mais N" sem destino**: não há filtro de recorrentes no Extrato; quando houver, o rodapé vira link.
- **Marcar uma recorrência como assinatura**: pede coluna (`is_subscription`), migração e uma tela de recorrências.
- **Recorrências anuais, semanais e a cada N meses**: ficam fora. Depois, as anuais podem entrar como 1/12 no "por mês", com "anual" no subtítulo.
- **Aviso de aumento** (sino e push) e uso no Fechamento do mês (tarefa 20: reaproveita `monthlySubscriptions`).
- **`aria-label` da linha no modo discreto**: lê os valores por extenso mesmo com os valores ocultos.
- **Para o dono decidir**: aluguel e curso contam como assinatura (inferência pela repetição mensal); se incomodar, marcar à mão. Anuais (Prime, domínio) ficam fora por enquanto.

## 16. Comparado ao mês passado: o que ficou de fora

A tarefa foi entregue em 14/11/2026 (ver "Entregue"). Fica para depois:

- **Comparar receitas** e **escolher o mês de referência** (hoje é sempre o mês anterior).
- **Aviso de "fora do padrão"** no cron e no insight: tarefa 19 (inclui o ajuste do `categoryInsight`, ver lá).
- **Skeleton com menos categorias**: a altura é a do bloco com 3 categorias; sem base de comparação, com 1 ou 2 categorias ou no convite, o bloco carregado fica mais baixo e o salto é aceito.
- **Tela de fechamento**: tarefa 20.

## 15. Parcelas a terminar: o que ficou de fora

A tarefa foi entregue em 13/11/2026 (ver "Entregue"). Fica para depois:

- **Botão do estado vazio**: é "Adicionar gasto", porque o `QuickAddButton` não abre já em "Mais opções › Parcelar".
- **Skeleton 16 px maior que o bloco a 430 px** quando a descrição cabe em 1 linha (`h-89` foi medido com a legenda em 2 linhas).
- **Filtro "parcelados" no Extrato**: o bloco não tem link no cabeçalho nem no rodapé "e mais N" por isso.
- **Antecipar parcelas** e linha do tempo da compra.

## 14. Maior gasto da semana: o que ficou de fora

A tarefa foi entregue em 13/11/2026 (ver "Entregue"). Fica para depois:

- **`?abrir=<id>` no Extrato**: a linha do bloco leva ao mês, à conta, ao tipo e ao começo da descrição, mas não abre o lançamento.
- **Filtro `desde`/`ate` no Extrato**: para o "Ver no Extrato" mostrar só os 7 dias (hoje mostra as despesas do mês).
- **`aria-label` do `TransactionRow` no modo discreto**: lê o valor por extenso mesmo com os valores ocultos.

## 5. Categorias — pendências pequenas

Mesclar, ordenar, arquivar com mover e o detalhe da categoria estão em **Entregue** (06/11/2026). Ficou:

- A origem mesclada fica em "Arquivadas" sem indicação de que foi mesclada (a linha diz só "Despesa"): mostrar "Mesclada" ou "Mesclada com {destino}" exige guardar o destino ou um marcador no modelo.
- O detalhe de uma categoria com id inválido ou que não é da pessoa responde 200 com a tela "Categoria não encontrada", não 404 (a rota é dinâmica dentro de `<Suspense>`, e o status sai antes de o servidor saber).
- A 200% de texto em 360 px, o botão destrutivo das folhas de arquivar e de mesclar fica logo abaixo da dobra: é alcançável rolando (a folha inteira rola, `flowFooter`), mas pede um gesto.
- O e2e "lança uma despesa pelo +" (`e2e/smoke.spec.ts`) falhou uma vez por tempo sob carga e passou ao repetir: observar se volta a falhar.

## 6. Caixinha: o que ficou de fora

A tarefa foi entregue em 06/11/2026 (ver "Entregue"). Fica para depois:

- **Transferência recorrente** ("guardar todo mês"): `RECURRENCE_KINDS` só tem receita e despesa.
- **Rendimento configurado** da caixinha (`account_yield`): hoje o caminho é "Ajustar saldo".
- **Linha "Para as caixinhas" no "(i)"** do previsto: uma transferência agendada para a caixinha entra em "Despesas agendadas".
- **Pagar fatura a partir de uma caixinha**: não foi tratado nem testado.
- **Chip de variação do mês** (Saldo): a transferência para a caixinha aparece como queda. Avaliar com o dono se o chip deve ignorá-la.
- **Texto vazio do bloco Fluxo** ("Nenhuma conta para o dia a dia") não foi verificado visualmente.
- Renomear `liquidPendingFlows` e `liquidIds` (hoje significam "para gastar").

## 12. Quanto dá para gastar, por conta: o que ficou de fora

A tarefa foi entregue em 12/11/2026 (ver "Entregue"). Fica para depois:

- **Campo "Conta que paga a fatura" no cartão novo** (hoje só na edição).
- **Linhas por conta no estado "não sobra"** do total.
- **Avisos por conta** ("Próxima receita" e "Resumo do dia" seguem com o total).
- **Fatura paga por caixinha**: entra só no total, com a nota.
- **Renomear `liquidPendingFlows` e `liquidIds`** (hoje significam "para gastar").
- **"Paga com {conta}"** no detalhe do cartão.
- **Cor das contas novas**: todas recebem a mesma cor padrão, e os pontos do bloco ficam iguais; variar a cor ao criar.
- **"Não sobra" por conta no modo discreto**: continua visível (o total e os valores são mascarados). Perguntar ao dono se deve mascarar.

## 13. Conta de benefício: o que ficou de fora

A tarefa foi entregue em 12/11/2026 (ver "Entregue"). Fica para depois:

- **Texto do Fluxo** citando benefícios (hoje diz "sem cartões e caixinhas").
- **Avisos por conta**: os valores "por dia" dos avisos seguem sem o benefício.
- **Série do benefício no relatório Fluxo.**
- **Cartão cujo pagador virou benefício**: limpar `payment_account_id` ao converter a conta (o `invoicePayer` já ignora; a fatura entra só no total, com a nota).
- **Nova transação**: tirar os cartões do destino da transferência quando a origem é benefício (o servidor já recusa).
- **"Vale-alimentação" cortado** nos cartões do dia a 100% (aparece inteiro a 200% e para o leitor de tela).
- **"Benefício · fora do patrimônio"** cortado na linha de /contas a 360 px.
- **Skeleton a 200%** do gasto por dia mais baixo que o conteúdo (já era assim).
- **Saldo atual negativo**: o campo ignora o sinal de menos, então "Benefício não fica com saldo negativo." não aparece pelo formulário.
- **Salto de ~52 px** quando o bloco chega com benefício (aceito).

## Rotina diária: a confirmar

- **Confirmar o `User-Agent` da Vercel no primeiro cron real** (`vercel-cron/1.0` é suposição): ver em Administração › Rotina se a execução das 06:00 aparece como "Automática (Vercel)". Se aparecer "Manual (curl)", ajustar o prefixo em `src/app/api/cron/daily/route.ts`.
- ~~Definir o `CRON_SECRET` em Production~~: feito pelo dono em 10/11/2026; o "Rodar agora" funcionou. Falta só a confirmação da execução automática (item acima).

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

### Bloco "Assinaturas do mês" (tarefa 17) — 14/11/2026

Bloco novo do catálogo do Início (estreito, fora do padrão, com "Novo", atrás de `inicio_personalizavel`): as despesas que se repetem todo mês, quanto somam por mês, o próximo débito de cada uma e o selo "subiu R$ X".

- [x] **Consulta** `monthlySubscriptions` (`src/server/domain/subscriptions.ts`) e redução pura `summarizeSubscriptions` (`src/lib/home/subscriptions.ts`): sem cache, sem migração; infere pela recorrência de despesa mensal ativa; o aumento segue a regra dividida por "Este e os próximos".
- [x] **Bloco** `subscriptions-block.tsx` (até 5 linhas, selo, rodapé "e mais N", convite, modo discreto), skeleton medido e loader em `blocks.tsx`.
- [x] **Dicas**: novidade `novidade-inicio-assinaturas` (`since` 14/11/2026).
- [x] Testes: unidade (`subscriptions.test.ts` com fast-check, `subscriptions-block.test.tsx`, `blocks.test.ts`, `layout.test.ts`, `customize-sheet.test.tsx`, `home-skeleton.test.tsx`), integração (`subscriptions.integration.test.ts`, `blocks.integration.test.tsx`, `preferences.integration.test.ts`) e e2e (`inicio-personalizavel.spec.ts`, `tips.spec.ts`, `novidades-flags.spec.ts`). Detalhes: README, doc 01 §8, doc 02 §6.3 e §6.16, doc 03 §10.1. O que ficou: "17. Assinaturas do mês: o que ficou de fora".

### Bloco "Comparado ao mês passado" (tarefa 16) — 14/11/2026

Bloco novo do catálogo do Início (estreito, fora do padrão, com "Novo", atrás de `inicio_personalizavel`): o gasto pago do mês até hoje contra o mesmo ponto do mês anterior, no total e nas até 3 categorias que mais mudaram.

- [x] **Função pura** `comparisonWindows`, `compareAmounts` e `compareBreakdown` (`src/lib/finance/comparison.ts`, com Vitest e fast-check); reutilizável pelas tarefas 19 e 20.
- [x] **Consulta** `monthComparison` (`src/server/domain/month-comparison.ts`): sem cache, sem migração; uma consulta agrupada pela categoria principal, só da pessoa.
- [x] **Bloco** `month-comparison-block.tsx` e `month-comparison-model.ts` (textos puros), convites (nada para comparar, mês futuro), modo discreto, skeleton medido (`weight` 480) e loader em `blocks.tsx`.
- [x] **Dicas**: novidade `novidade-inicio-comparado-mes-passado` (`since` 14/11/2026).
- [x] Testes: unidade (`comparison.test.ts`, `month-comparison-model.test.ts`, `month-comparison-block.test.tsx`, `blocks.test.ts`, `layout.test.ts`, `customize-sheet.test.tsx`, `home-skeleton.test.tsx`), integração (`month-comparison.integration.test.ts`, `blocks.integration.test.tsx`, `preferences.integration.test.ts`) e e2e (`inicio-personalizavel.spec.ts`, `tips.spec.ts`, `novidades-flags.spec.ts`). Detalhes: README, doc 01 §8, doc 02 §6.3 e doc 03 §12. O que ficou: "16. Comparado ao mês passado: o que ficou de fora".

### Bloco "Parcelas a terminar" (tarefa 15) — 13/11/2026

Bloco novo do catálogo do Início (estreito, fora do padrão, com "Novo", atrás de `inicio_personalizavel`): as 3 compras parceladas que acabam primeiro, com o que falta pagar, as parcelas que restam, o mês em que acaba e quanto sai por mês.

- [x] **Consulta** `installmentsEnding` (`src/server/domain/dashboard.ts`) e função pura `summarizeInstallmentPlans` (`src/lib/home/installments-ending.ts`): lê as parcelas pendentes, não o plano; sem cache, sem migração.
- [x] **Bloco** `installments-ending-block.tsx` (linhas-link, rodapé "e mais N", convite, modo discreto), skeleton `h-89` (`weight` 280) e loader em `blocks.tsx`.
- [x] **Dicas**: novidade `novidade-inicio-parcelas-a-terminar` (`since` 13/11/2026).
- [x] Testes: unidade (`installments-ending.test.ts`, `installments-ending-block.test.tsx`, `blocks.test.ts`, `layout.test.ts`, `customize-sheet.test.tsx`, `home-skeleton.test.tsx`), integração (`installments-ending.integration.test.ts`, `blocks.integration.test.tsx`, `preferences.integration.test.ts`) e e2e (`inicio-personalizavel.spec.ts`, `tips.spec.ts`, `novidades-flags.spec.ts`). Detalhes: README, doc 01 §8 e doc 02 §6.3. O que ficou: "15. Parcelas a terminar: o que ficou de fora".

### Bloco "Maior gasto da semana" (tarefa 14) — 13/11/2026

Bloco novo do catálogo do Início (estreito, fora do padrão, com "Novo", atrás de `inicio_personalizavel`): as 3 maiores despesas pagas dos últimos 7 dias, com atalho para o Extrato.

- [x] **Consulta** `biggestExpenses` / `topExpensesWindow` (`src/server/domain/dashboard.ts`): sem cache, sem migração; fatura, transferências, ajustes, receitas, pendentes e apagados ficam fora.
- [x] **Bloco** `top-expenses-block.tsx` (linhas de `TransactionRow`, convite, modo discreto), skeleton medido (`weight` 270) e loader em `blocks.tsx`.
- [x] **`TransactionRow`**: o nome acessível não repete o dia quando o `subtitle` já o traz.
- [x] **Dicas**: novidade `novidade-inicio-maior-gasto-semana` (`since` 13/11/2026).
- [x] Testes: unidade (`blocks.test.ts`, `layout.test.ts`, `top-expenses-block.test.tsx`, `transaction-row.test.tsx`, `home-skeleton.test.tsx`), integração (`top-expenses.integration.test.ts`, `blocks.integration.test.tsx`, `preferences.integration.test.ts`) e e2e (`inicio-personalizavel.spec.ts`, `tips.spec.ts`, `novidades-flags.spec.ts`). Detalhes: README, doc 01 §8 e doc 02 §6.3. O que ficou: "14. Maior gasto da semana: o que ficou de fora".

### Conta de benefício (vale-refeição e vale-alimentação) — 12/11/2026

Pedido do dono (12/11/2026): tipo novo "Benefício", fora do patrimônio por padrão, com linha própria no "Quanto dá para gastar por dia", fora do total.

- [x] **Tipo `benefit`** (migração `0014_conta_beneficio`, só o `ADD VALUE`; ícone `utensils-crossed`, cor `cat-4`, grupo "Benefícios", `?tipo=beneficio`). D1: "Incluir no patrimônio" começa desligado e é editável; Mudar o tipo não mexe nele.
- [x] **Regra única**: `benefit` em `NON_SPENDABLE_ACCOUNT_TYPES`; `isBenefitAccount`, `canPayInvoice`, `isDefaultEntryType` e `benefitPerDay` em `src/lib/finance`. Doc 03 §12.
- [x] **D2** nunca é a conta padrão da Nova transação; **D3** nunca paga fatura (`payInvoice`, `checkPaymentAccount`, `insertTransfer` e as listas de pagador); **D4** os avisos "Ontem você gastou", "Contas que vencem hoje" e Próximas contas incluem as despesas dele.
- [x] **Início**: linha por benefício em "Fora do total" (**D5** só benefício mantém o convite; **D6** total zerado com dinheiro no benefício mostra "Não sobra" e a faixa; **D7** sem linha "Em benefícios" no Saldo), "Contas no bloco" lista o benefício, skeleton com `BENEFITS_AFTER_ACCOUNTS_PX` = 33 e `BENEFITS_ALONE_PX` = 22 (24 dava 2 px a menos) e rodapé em `--daily-spend-foot`. Descrição da folha encurtada: "Escolha as contas que aparecem em cada dia. Esconder uma não muda o total."
- [x] **Contas**: nota no formulário e em Editar, "Criar benefício", selo no carrossel, legenda no detalhe, "Benefício · fora do patrimônio". **D8** a demo ganha "Vale-refeição" na Ana (R$ 480,00, fora do patrimônio).
- [x] **Dicas**: novidade `novidade-conta-beneficio` (`since` 12/11/2026).
- [x] Testes: unidade e fast-check (`spendable`, `spendable-by-account`, `block-settings`), componentes, integração (`benefit.integration.test.ts`, `blocks.integration.test.tsx`) e e2e (`beneficio.spec.ts`, `texto-grande.spec.ts`, `inicio-personalizavel.spec.ts`, `tips.spec.ts`). Corrigido de passagem: `sharing-actions.integration.test.ts` usava a data em UTC e falhava depois das 21h em Brasília.

Sem a flag: vale para todos. O que ficou de fora está na seção 13 acima.

### Quanto dá para gastar, por conta (tarefa 12) — 12/11/2026

Pedido do dono (12/11/2026). Decisões: uma linha por conta em cada cartão do dia (o total continua), a escolha de quais contas aparecem fica salva na conta (todos os aparelhos), os avisos seguem com o total.

- [x] **Cálculo puro** (`src/lib/finance/spendable-by-account.ts`): série por conta, fatura atribuída a quem paga (agendados da fatura, conta escolhida no cartão, último pagamento, sem conta), valor por dia por conta. Doc 03 §12 e §13.2.
- [x] **Conta que paga a fatura**: `credit_card_details.payment_account_id` passa a ser gravado e lido (edição do cartão); "Pagar fatura" abre nela. Corrige "No values to set" ao editar um cartão só com os campos do cartão (`updateAccount`).
- [x] **Dados** (migração `0013_gasto_por_conta`): `user_settings.home_block_settings`, `setDailySpendHidden` com checagem de posse e merge atômico.
- [x] **Leituras**: `paidByAccountDaySince` e `invoicePayersOf` uma vez por requisição; `cashFlowReport` usa a mesma leitura (resultado idêntico).
- [x] **Início**: linhas por conta, rótulo "Total", nota das faturas que entram só no total, folha "Contas no bloco" (`saveDailySpendAccountsAction`, atrás de `inicio_personalizavel`), skeleton (`HomeBlockFrame` › `dailySpend`, `--daily-spend-extra`).
- [x] **Dicas**: novidade `novidade-gasto-por-dia-por-conta`; demo com o cartão da Ana pago pela Conta principal.
- [x] **Ajustes de acessibilidade da revisão**: item do sino na barra lateral nomeado pelo texto visível (axe `label-content-name-mismatch`).

Detalhes que valem lembrar: uma conta mostra "Não sobra" sempre que o valor por dia dela é 0; pagamentos de fatura agendados para depois do fim do mês não são lidos (a fatura vai para o pagador do cartão); a nota das faturas sem conta só aparece com linhas visíveis; a 200% de texto um cartão do dia pode passar da largura da faixa e a faixa rola (aceito).

Testes: unidade e fast-check (`spendable-by-account.test.ts`, `block-settings.test.ts`), componentes (bloco, folha, edição do cartão, Pagar fatura, skeleton), integração (`blocks.integration.test.tsx`, `card-payer.integration.test.ts`, `preferences.integration.test.ts`) e e2e (`inicio-personalizavel.spec.ts`, `texto-grande.spec.ts` com uma quarta conta, `cartao-conta-pagamento.spec.ts`, `tips.spec.ts`, `novidades-flags.spec.ts`). Detalhes: README, doc 01 (`home_block_settings`, `payment_account_id`), doc 02 §5.17, §6.3, §6.8 e §6.16, doc 03 §12 e §13.2. O que ficou: "12. Quanto dá para gastar, por conta: o que ficou de fora".

### Caixinha compartilhada (tarefa 9) — 12/11/2026

Pedido do dono (10/11/2026), etapa C do compartilhado; decisões aprovadas em 12/11/2026: a caixinha é do grupo, cada pessoa resgata no máximo o que guardou, a parte no objetivo é igual por padrão e ajustável em percentual, e o lançamento nas contas de cada um é opcional ("Lançar no meu extrato").

- [x] **Lib** `src/lib/finance/shared-box.ts` (`projectSharedBox`, doc 03 §8.1) com fast-check: a soma das partes é o objetivo, quem não planeja fica sem data, coerência com `projectGoal` para uma pessoa só. Correção em `projectGoal`: a previsão além do ano 9999 virou "sem data" em vez de erro (planos de centavos quebravam a tela; vale para as metas próprias).
- [x] **Dados** (migração `0012_caixinha_compartilhada`): `shared_boxes` (com `target_split`), `shared_box_members`, `shared_box_entries`; avisos `box_activity` e `box_reached`.
- [x] **Domínio** `src/server/domain/sharing/boxes.ts` e `insertTransfer` extraído de `createTransfer`: criar, editar, arquivar, plano próprio, partes (criadora do grupo), guardar e resgatar com transferência opcional para a caixinha própria, Desfazer (as duas pernas) e limite do resgate sob trava.
- [x] **Telas**: abas Despesas · Caixinhas, `/compartilhado/[grupo]/caixinhas` e a caixinha (anel, projeção no plural, "Quem guarda", histórico), folhas Nova caixinha, Guardar, Resgatar, Mudar meu plano, Partes do objetivo e Desfazer; seção "Caixinhas compartilhadas" em Planejar › Metas; avisos no sino e no push; novidade "Guardem dinheiro juntos"; demo com "Viagem para Salvador" na Casa.
- [x] Testes: unidade e fast-check, componente (modelo de textos), integração (isolamento com a Carla, contas alheias recusadas, resgate acima do guardado, dois resgates ao mesmo tempo, Desfazer, `box_reached` uma vez, saída e conta excluída com dinheiro na caixinha, actions e push) e e2e (`e2e/caixinha-compartilhada.spec.ts`: criar com objetivo e prazo, plano, guardar com e sem transferência, o Bruno sem caixinha própria, limite do resgate, percentual, Desfazer pelo aviso e pela linha, arquivar e desarquivar, Metas, flag desligada, axe nos dois temas, 360 px a 200%).

Decisões além do plano: `target_split` (`equal` | `percent`) na caixinha; quem sai mantém o histórico ("Bruno (saiu)") mas deixa de contar no total e na projeção; não dá para desfazer um aporte já resgatado em parte; sem datas no futuro; "Chegou ao objetivo" no sino de todos e push só para os outros; a caixinha arquivada ainda abre, com Desarquivar; sem auditoria e sem tags de cache (as actions terminam com `refresh()`).

**Ficou para depois:** o campo de rendimento esperado (a coluna `expected_rate` existe, sem uso na tela); "guardar todo mês" automático (depende da recorrência de transferência); desfazer um aporte não corrige o aviso agregado do dia que os outros já receberam; dinheiro guardado na conta de outra pessoa.

### Despesas compartilhadas (grupos, ADR-13) — 12/11/2026

Tarefa 8 (etapa B). Decisões do dono (12/11/2026): grupo de até 6 pessoas com convite pelo e-mail e resposta neutra, o outro vê só o que alguém pôs no grupo, formas de divisão Iguais · Valores · Percentual · Cotas, saída livre com aviso, conta excluída vira "conta excluída" no grupo.

- [x] **ADR-13** (doc 01 §17 e §11.11) e a regra nova do CLAUDE.md: as tabelas compartilhadas são a única exceção ao isolamento, lidas só por membros ativos.
- [x] **Flag `financas_compartilhadas`** (desligada por padrão; a demo liga para a Ana e o Bruno) e a novidade "Divida despesas com outra pessoa".
- [x] **Dados** (migração `0011_compartilhado`): `share_groups`, `share_members` (`user_id` com `ON DELETE SET NULL`, a única FK sem cascade), `shared_expenses`, `shared_expense_shares` e `share_settlements`; auditoria `share.*` e sete tipos de aviso.
- [x] **Motor** (doc 03 §14): divisão pelo maior resto (`split.ts`) e saldo e plano de acerto (`settle.ts`), com fast-check.
- [x] **Domínio e actions**: grupos, convites (limites por pessoa e por par, 6 pessoas), aceitar e recusar, sair e tirar, despesas (retrato do lançamento próprio, edição, tirar e desfazer, "Atualizar"), acertos (conferidos na transação, parciais valem, Desfazer) e `deliverPushes` depois do commit.
- [x] **Telas**: `/compartilhado` (convites, grupos, vazio, Novo grupo), `/compartilhado/[grupo]` (saldo, mês, lista por dia, Pessoas, Adicionar despesas do extrato em lote ou nova, detalhe, editor de divisão, Marcar como acertado, Acertar contas), "Dividir" no detalhe do lançamento, bloco "Compartilhado" no Início, item na barra lateral e linha em Ajustes › Organização; avisos de grupo no sino (Aceitar e Recusar) e no push.
- [x] Testes: unidade e fast-check (`split`, `settle`, rótulos e textos, editor de divisão, frase do saldo), integração contra o PGlite (isolamento com uma terceira conta em toda função, convites neutros e vencidos, concorrência de aceites e de acertos, saída e exclusão de conta, notificações agregadas; `sharing-actions.integration.test.ts` com a flag, os limites de convite e `deliverPushes`; rota `/api/notificacoes` com avisos de grupo) e e2e (`e2e/compartilhado.spec.ts`: Ana e Bruno, cada forma de dividir, lote com busca de categoria, o que o Bruno não vê, aviso ao sair, acerto, flag desligada, axe nos dois temas, 360 px a 200%).

**Ficou para depois:** dividir **por renda** (percentual sugerido pela renda que cada um digita no grupo) e **por item**; **regra automática** ("toda despesa de Mercado entra"); **compra parcelada inteira** de uma vez (hoje cada parcela entra como lançamento); sincronizar a despesa do grupo quando o lançamento muda (hoje só a nota "Desatualizada" com "Atualizar"); moedas e anexos; tempo real (a caixinha compartilhada, tarefa 9, foi entregue em 12/11/2026).

### Sino de notificações — 12/11/2026

Etapa A das tarefas 8 e 9 (central de avisos antes dos convites para dividir despesas). Decisões do dono (12/11/2026): avisos do cron gravados no sino mesmo sem aparelho, número do ícone pelas não lidas do sino, dispensar sem apagar a linha, tempo real fica para depois.

- [x] **Flag `central_notificacoes`** (desligada por padrão; a demo liga para a Ana e o Bruno) e a novidade "Notificações num lugar só" (só em Ajustes › Novidades).
- [x] **Tabela `notifications`**: `dismissed_at` e índice `(user_id, created_at)` (migração `0010_central_notificacoes`); `payload.amounts` para o modo discreto.
- [x] **Domínio e rota**: listar, contar, marcar como lido (por ids ou até uma data), dispensar e restaurar (`src/server/domain/notifications.ts`), `GET /api/notificacoes` (sessão, flag, cursor, `limite=0`) e registro de tipos `src/lib/notifications/kinds.ts` (ações por tipo, modo discreto, tipos por flag, espaço para convites das tarefas 8 e 9).
- [x] **Sino**: botão no Início (com selo, "9+"), item na barra lateral, folha com Hoje / Esta semana / Antes, ação direta, "Marcar como pago", marcar uma ou todas como lidas, dispensar (X ou deslizar) com Desfazer, estados vazio, carregando e erro; toque no aviso do celular marca como lido (`?aviso=`).
- [x] **Avisos do cron no sino sem aparelho** (`bellOnly` na Rotina) e **número do ícone** pelas não lidas do sino: abrir o app não o zera com a flag ligada.
- [x] Testes: unidade (`center`, `kinds`, `withNoticeParam`, componentes do sino, do item da barra e da folha), integração contra o PGlite (domínio com isolamento entre contas, rota, avisos do cron, sync do aparelho, flag) e e2e (`e2e/sino.spec.ts`, `tips.spec.ts`, `novidades-flags.spec.ts`; axe nos dois temas, 360 px a 200%, desktop, flag desligada).

- [x] **Correções da verificação**: tocar num aviso abre o destino depois que a folha fecha (`afterSheetsClose`, Voltar desfaz); o "Desfazer" de um toast recebe o toque com qualquer folha aberta (Sino, Flags, Personalizar o Início) sem fechar a folha.

**Ficou para depois:** tempo real (a contagem atualiza ao voltar ao app); avisos de orçamento 80%/100%, meta atingida e fatura fechando; os convites das tarefas 8 e 9 (o registro de tipos já tem o espaço); o "Marcar como pago" não tem teste de e2e que clica (pagar o Condomínio mudaria as telas dos testes seguintes); só unidade e integração.
### Alerta de conta que vence em dia não útil — 12/11/2026

Tarefa 11, com as decisões do dono (12/11/2026): dias não úteis pelo calendário bancário; "Venceu" só depois do próximo dia útil (D2); aviso push com interruptor próprio, ligado por padrão, no último dia útil antes, uma vez por conta; só feriados nacionais por enquanto.

- [x] **Calendário de dias úteis** puro (`src/lib/finance/business-days.ts`): Páscoa, feriados nacionais fixos e móveis, Carnaval (segunda e terça), Sexta-feira Santa, Corpus Christi, 31/12 sem expediente bancário; Quarta-feira de Cinzas e 24/12 são úteis. Próximo e anterior dia útil, `nonBusinessDue`, `isInGrace` (doc 03 §10.3).
- [x] **Feriados da BrasilAPI** no cron diário (passo `syncHolidays`, tabela `holidays`, migração `0009_feriados`): anos atual e seguinte, a cada 30 dias, tempo limite de 5 s e uma nova tentativa, mínimo de 9 feriados válidos, nada é apagado com resposta ruim. O calendário efetivo é sempre o cálculo próprio somado ao que a API trouxe; nenhuma chamada externa em render.
- [x] **Flag `alerta_dia_nao_util`** (desligada por padrão; a demo liga para a Ana, com um "Condomínio" no próximo sábado) e a novidade "Vencimento em dia não útil".
- [x] **Nota no app**: Início › Próximas contas, Extrato (linha, nome acessível e folha de detalhe) e fatura do cartão, em texto de informação (`fg-3`), sem valores. A texto grande ou em linha estreita a nota desce para baixo da linha toda (`placement`, container query `@max-tight`).
- [x] **"Prazo até seg, 16 nov"** (âmbar) no lugar de "Venceu" entre o vencimento e o próximo dia útil: Início, Extrato, detalhe e fatura ("Fechada"); o aviso de conta vencida espera esse dia. Só apresentação.
- [x] **Aviso "Vencimento em dia não útil"** (interruptor com ícone `CalendarX` em Ajustes › Notificações, só com a flag): no último dia útil antes, uma vez por conta; o "Contas a vencer" do mesmo dia leva a nota e o aviso novo não repete a conta. Conta na Rotina, na prévia dos administradores e no número do ícone. Com a flag desligada, o valor salvo do interruptor fica guardado.
- [x] Testes: unidade e fast-check (`business-days`, `due-day`, `brasilapi-holidays`, seleção e mensagens dos avisos, preferências, Rotina, dicas, componentes), integração contra o PGlite (`holidays`, `reminders-non-business`, Início, preferências, `job-runs`) e e2e (`e2e/dia-nao-util.spec.ts`, `notificacoes.spec.ts`, `novidades-flags.spec.ts`, axe nos dois temas, 360 px a 200%). O estado âmbar "Prazo até …" só nos testes de unidade e integração, com data fixa (o relógio do e2e é o real).

**Ficou para depois:**

- **Feriados estaduais e municipais** (os bancos fecham neles): escolher a cidade dos pagamentos em Ajustes e usar uma API com token (Invertexto ou Feriados API), com variável de ambiente nova e `scope` "BR-UF-IBGE" na mesma tabela `holidays`. Nager.Date cobre alguns estaduais.
- A nota no **detalhe da conta** (`/contas/[id]`) e nos lançamentos da fatura: o campo opcional já serve, só falta anotar na página.
- **Receita (salário) em dia não útil** e "Próxima receita" ajustada.
- O **status gravado da fatura** e a previsão por dia útil: hoje só a apresentação muda.
- O aviso na central do sino já existe (entregue em 12/11/2026, abaixo).

### Bloco "Quanto dá para gastar por dia" — 10/11/2026

Bloco novo do catálogo do Início (largo, fora do padrão, com "Novo"): para cada um dos próximos 14 dias (até o fim do mês financeiro), o menor saldo previsto das contas para gastar dividido pelos dias que faltam, em cartões lado a lado numa faixa que rola dentro do bloco (hoje primeiro, com destaque e `aria-current="date"`; região focusável para o teclado). O orçamento não entra na conta: vale o saldo de hoje mais as despesas e receitas agendadas, com as faturas de cartão como despesa agendada. Estados: não sobra (com a falta, ou sem saldo), sem contas para gastar, último dia do mês (1 cartão). Decisões do dono: dias até o fim do mês financeiro, 14 dias; em 11/11/2026, sem o teto do orçamento (a nota do card Orçamento "O saldo previsto não cobre o mês" também saiu) e na horizontal em vez da lista com barras (tarefa 10, mesma branch e PR #12). Novidade "Quanto dá para gastar por dia" (`when: { flag: "inicio_personalizavel" }`).

Testes de unidade e fast-check (`src/lib/finance/spendable-by-day.test.ts`), integração (`src/app/(app)/inicio/blocks.integration.test.tsx`), componentes e skeleton, e2e (`e2e/inicio-personalizavel.spec.ts`, `texto-grande.spec.ts`, `tips.spec.ts`, `novidades-flags.spec.ts`). Detalhes: README, doc 02 §5.17 e §6.3, doc 03 §11 e §12.

**Ficou para depois:** marcar a próxima receita na lista do bloco.

### Administração › Rotina diária — 10/11/2026

Em produção o `CRON_SECRET` não estava definido e o cron respondia sempre 401, sem rastro. Agora:

- [x] **Origem da execução** no `job_runs.report` (`trigger`: cron, manual, admin) e **linha "Recusada (segredo)"** quando a Vercel chama e a rota recusa (no máximo uma por hora).
- [x] **Tela Administração › Rotina** (`/admin/rotina`, item em Ajustes › Administração): aviso de saúde do cron, configuração sem segredos, 14 últimas execuções com os passos em português e o botão **Rodar agora** (uma por vez, uma a cada 2 minutos, auditado como `job.run_manual` na Atividade).
- [x] Texto do passo pulado sem "fase F2/F3"; `SegmentedLinks` quebra de linha a 200% em vez de sobrepor as abas.

Testes de unidade (`src/lib/admin/routine.test.ts`, `activity.test.ts`, `runner.test.ts`), integração contra o PGlite (`src/server/domain/job-runs.integration.test.ts`: lista, configuração, Rodar agora, rota do cron) e e2e (`e2e/rotina.spec.ts` com axe no escuro e no claro). Detalhes: README (Cron diário), doc 01 §9 e §11.9, doc 02 §6.17.

### Caixinha: novo tipo de conta — 06/11/2026

Decisões do dono (06/11/2026): **D1** linha "Guardado em caixinhas" no Saldo e nota no "(i)"; **D2** Poupança e Investimento continuam como hoje; **D3** meta ligada à caixinha; **D4** despesa ou receita direto na caixinha permitida, mas ela nunca é a conta padrão (Nova transação e importação); **D5** mudar o tipo de uma conta que não é cartão; **D6** "Guardar" e "Resgatar" no detalhe; **D7** sem flag; **D8** grupo "Caixinhas" em Contas; **D9** saldo inicial sem negativo.

- [x] **Tipo `savings_box`** ("Caixinha", ícone `vault`, cor `cat-6`): migração `0008_caixinha` só com o `ADD VALUE`, formulário (`?tipo=caixinha`), grupo e selo, detalhe com legenda.
- [x] **Regra única** `isSpendableAccount` (`src/lib/finance/spendable.ts`): os três `isLiquid` e o SQL da variação do mês saíram; `spendableAccountsOf` lê uma vez por requisição. Saldo, previsto, Fluxo (relatório e bloco), Resumo do dia e Próxima receita deixam a caixinha de fora; o patrimônio a soma.
- [x] **Saldo**: "Guardado em caixinhas" e nota no "(i)"; textos do Fluxo dizem "sem cartões e caixinhas".
- [x] **Mudar o tipo** em Editar (sem cartão), **Guardar** e **Resgatar** (`openQuickAdd(kind, preset)`) e a novidade `novidade-caixinhas`.
- [x] Testes: unidade (regra com fast-check, metadados, `defaultAccountFor`, store), integração (`savings-box.integration.test.ts`, bloco Saldo, avisos com caixinha) e e2e (`e2e/caixinha.spec.ts`: criar, guardar, resgatar, axe nos dois temas, arquivar).

### Categorias: mesclar, arquivar com mover, ordenar e detalhe — 06/11/2026

Tarefas 5 e 7, com as decisões do dono (06/11/2026):

- [x] **Mesclar categorias**: lançamentos (pagos, agendados, excluídos e parcelas), recorrências, regras de importação e orçamentos vão para o destino; a origem fica **arquivada e vazia**, não apagada. Uma mãe leva as subcategorias para dentro da principal escolhida; mãe em subcategoria e nome de subcategoria repetido são recusados com o motivo. Sem Desfazer: a folha diz a contagem.
- [x] **Arquivar passando os lançamentos** ("Quer passar as despesas desta categoria para outra?"): "Não" mantém os lançamentos na arquivada, com Desfazer (e o toast do Desfazer agora confirma a restauração); "Sim" move tudo da categoria e das subcategorias ativas para um destino só, sem Desfazer. O orçamento da origem se soma ao da principal do destino em todos os meses.
- [x] **Mudar a ordem** (Despesas e Receitas): "Subir" e "Descer" na árvore, a mãe com as filhas, Desfazer; vale nas listas de escolha, nos orçamentos, no extrato e na lista "Todas" da Nova transação.
- [x] **Detalhe da categoria** em Relatórios › Categorias: divisão por subcategoria (arquivada e "Sem subcategoria"), mês a mês, o que mais pesou e atalho para o Extrato; o ranking de Categorias, a Visão geral e o bloco do Início abrem o detalhe.
- [x] **Folha que rola por inteiro** a texto grande (`flowFooter`), "Mais ações" na folha de edição e novidade `novidade-categorias-organizar`.

Testes: unidade (`order`, `hierarchy`, `messages`, `views`), integração (`category-moves.integration.test.ts`: mover, mesclar, arquivar com mover, ordem, contagens e detalhe, com isolamento entre contas) e e2e (`categorias.spec.ts`, `relatorios-categoria.spec.ts`, `texto-grande.spec.ts`).

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
