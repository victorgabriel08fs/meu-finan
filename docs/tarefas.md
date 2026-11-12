# Tarefas

O que falta fazer, em ordem de prioridade. Cada tarefa passa pelos agentes do projeto (CLAUDE.md › Agents): `arquiteto` planeja, `dev` implementa, `qa-ui-ux` revisa as telas e `testador-documentador-versionador` testa, documenta e commita. Ao entregar, marque aqui o que ficou pronto e mova para o README o que a pessoa já pode usar.

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

## 8. Despesas compartilhadas

**Pedido do dono (10/11/2026).** A pessoa adiciona outra pessoa para dividir despesas em comum e vê, de forma clara, quanto cada um paga dentre as despesas compartilhadas selecionadas. Tela bem funcional e bonita, fácil de detalhar.

- **Divisão**: valor livre (digitado por pessoa) ou proporcional (percentual); propor também outras formas, por exemplo partes iguais, pesos/cotas (ex.: 2 para 1), proporcional à renda de cada um, por item da despesa e "quem pagou" com acerto de contas (saldo entre as pessoas: "Bruno te deve R$ 120" e "Marcar como acertado").
- **Seleção**: escolher as despesas que entram (por lançamento, por categoria ou por período) e ver o detalhe por despesa e o total por pessoa.
- **Decidido pelo dono (10/11/2026): a outra pessoa tem login próprio** (outra conta do app) e o convite para dividir vai **pelo app, com notificação** (push). Vale também para a tarefa 9.
- **Com quem**: decidir se a outra pessoa é outra conta do app (convidada, cada uma com o próprio login) ou só um nome cadastrado por quem divide. Se for outra conta, **isso muda a regra de isolamento entre contas** (CLAUDE.md: "nothing reads another account's financial rows") e precisa de um ADR (doc 01 §17, a fase F4 já prevê "finanças compartilhadas entre contas"): o que cada um vê da despesa do outro, consentimento, como sair, o que acontece ao excluir a conta.
- Atrás de uma flag nova enquanto estiver em teste.

## 9. Saldo compartilhado (caixinha em conjunto)

**Pedido do dono (10/11/2026).** Uma espécie de caixinha compartilhada: cada pessoa diz quanto está aportando ou pretende aportar, e a tela mostra o saldo total, quanto cada um já colocou e a projeção (quando chega no objetivo, quanto falta por pessoa).

- Partir da Caixinha (tarefa entregue em 06/11/2026) e das Metas (projeção, aportes): decidir se é uma caixinha com participantes, uma meta compartilhada ou os dois.
- Aportes: realizados (transferência de uma conta da pessoa para a caixinha) e planejados (valor por mês por pessoa); projeção por pessoa e total.
- Mesma decisão de isolamento da tarefa 8 (participantes como outras contas do app ou só nomes) — as duas tarefas devem compartilhar o mesmo modelo de "participantes" e o mesmo ADR.

## 12. Quanto dá para gastar, por conta

**Pedido do dono (12/11/2026).** O bloco "Quanto dá para gastar por dia" (Início) passa a ser por conta: hoje ele soma todas as contas para gastar num saldo só; a pessoa quer ver quanto dá para gastar em cada conta.

- Mesma regra de hoje, aplicada a cada conta para gastar: saldo de hoje mais as despesas e receitas agendadas **daquela conta**, com a fatura do cartão na conta que paga a fatura, dividido pelos dias que faltam no mês financeiro.
- A decidir com o dono: escolher a conta no bloco (chips ou seletor, com "Todas" como hoje) ou uma linha por conta em cada cartão do dia; se a escolha fica salva na conta (`home_layout`) ou vale só na visita; se o aviso "Próxima receita" e o "Resumo do dia" também passam a dizer por conta.
- Cuidado com a fatura de um cartão sem conta de pagamento definida e com transferências entre contas para gastar (saem de uma e entram na outra).
- Testes: `src/lib/finance/spendable-by-day.ts` por conta (fast-check: a soma das contas fecha com o total quando não há transferência agendada), integração do bloco e e2e a 360 px e 200%.

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
