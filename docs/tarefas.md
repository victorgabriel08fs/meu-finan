# Tarefas

O que falta fazer, em ordem de prioridade. Cada tarefa passa pelos agentes do projeto (CLAUDE.md › Agents): `arquiteto` planeja, `dev` implementa, `qa-ui-ux` revisa as telas e `testador-documentador-versionador` testa, documenta e commita. Ao entregar, marque aqui o que ficou pronto e mova para o README o que a pessoa já pode usar.

## 1. Início personalizável

**Pedido do dono (02/11/2026).** Os blocos do Início passam a ser escolhidos por cada pessoa. O app continua com um Início padrão (o de hoje, doc 02 §6.3); quem quiser mostra, esconde e reordena os blocos, e pode trazer para o Início blocos que hoje só existem nos Relatórios — o primeiro pedido é o **Calendário** (gasto por dia em mapa de calor, Relatórios › Calendário).

### O que entra

- **Catálogo de blocos** definido só no código (um registro tipado, como as flags e as dicas), com id estável, nome, descrição, tamanho e se está no padrão. Ids nunca são renomeados nem reaproveitados.
  - Do Início de hoje: Saldo em contas (com a previsão), Receitas e despesas, Orçamento, Próximas contas, Contas, Metas, Insight.
  - Vindos dos Relatórios, no mês do Início: **Calendário de gastos** (mapa de calor; toque no dia → lançamentos), Fluxo de caixa do mês, Para onde foi o dinheiro (categorias), Receitas × despesas, Patrimônio.
- **Padrão**: a ordem e os blocos de hoje. Quem nunca mexeu vê sempre o padrão atual, inclusive blocos novos que entrarem nele depois.
- **Por pessoa**: a escolha (ordem e visibilidade) fica na conta, vale em todos os aparelhos e não carrega para outra pessoa no mesmo aparelho. Blocos que a pessoa não conhece ainda (adicionados ao catálogo depois da escolha) entram escondidos, com uma novidade avisando.
- **Editar o Início**: um botão "Personalizar" no fim do Início (e em Ajustes › Preferências) abre o modo de edição: lista dos blocos com interruptor Mostrar e alças para reordenar. Arrastar sempre tem alternativa por botão ("Subir" / "Descer", doc 02 §11, critério 2.5.7). "Restaurar padrão" volta ao Início do app.
- **Saldo em contas** continua obrigatório e no topo: é o número herói da tela (doc 02 §2, princípio 2).
- **Desktop**: as três colunas de hoje (doc 02 §4) viram um fluxo que respeita a ordem escolhida; um bloco largo (Calendário, Fluxo) ocupa a largura toda.
- **Estados**: cada bloco mantém o próprio skeleton e streaming (`<Suspense>` por bloco), o próprio vazio (convite, como Orçamento e Metas hoje), o erro de bloco e o modo discreto. Um Início sem contas continua sendo o checklist "Comece por aqui".

### Regras do projeto que pesam aqui

- A escolha é gravada por uma Server Action (`authAction` + Zod) que só aceita ids do catálogo; a leitura usa o id da sessão. Dados por pessoa e nada de outra conta.
- Os blocos vindos dos Relatórios reaproveitam as consultas e os componentes de `src/components/reports` (o mapa de calor é `CalendarHeatmap`), sem duplicar cálculo; buscar só os dados dos blocos visíveis.
- Cache Components: a escolha é lida dentro de `<Suspense>`; o cache do Início ganha a tag da preferência e a action a invalida com `updateTag`.
- Sem depender do tema no primeiro render (tokens e `dark:`).
- Lançar atrás de uma flag (por exemplo `inicio_personalizavel`, desligada por padrão) e anunciar com uma novidade (`when: { flag }`) e uma dica no botão "Personalizar".

### Pronto quando

- Sem mexer em nada, o Início fica igual ao de hoje (e2e comparando os blocos).
- A pessoa mostra o Calendário de gastos, sobe ele para depois do Saldo, recarrega em outro aparelho e vê o mesmo Início; outra conta no mesmo aparelho vê o próprio.
- Reordenar funciona por toque, por teclado e por leitor de tela; `qa-ui-ux` aprova em 360/430 px e desktop, escuro e claro, com axe sem violações.
- Testes: unidade do catálogo e da mesclagem escolha × padrão (blocos novos, ids desconhecidos ignorados), integração da action (ids inválidos recusados, isolamento entre contas), e2e do fluxo de personalizar e do padrão.
- README (O que já dá para fazer), doc 02 §6.3 e doc 01 (modelo de dados) atualizados.
