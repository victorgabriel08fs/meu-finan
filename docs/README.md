# Meu Finan — documentação de design

Aplicação de controle financeiro pessoal, **mobile-first**, com backend e frontend na **Vercel**.

| Documento | Conteúdo |
|---|---|
| [01-system-design.md](01-system-design.md) | Requisitos, arquitetura na Vercel, stack, estrutura do projeto, modelo de dados (DDL), API, cache, jobs, autenticação e administração de contas, feature flags, segurança, backups, performance, observabilidade, CI/CD, custos, roadmap e ADRs |
| [02-frontend-design.md](02-frontend-design.md) | Direção visual, design tokens (cores, tipografia, espaçamento, motion), navegação, biblioteca de componentes, especificação tela a tela, interações, gráficos, microcopy, acessibilidade, PWA e responsividade |
| [03-motor-financeiro.md](03-motor-financeiro.md) | Fórmulas e algoritmos: juros compostos, conversão de taxas (CDI, IPCA+), IR regressivo, inflação, cálculos reversos, metas, parcelamento, fatura de cartão, recorrência, orçamento e previsões — com código de referência e casos de teste |

## Decisões em uma linha

- **Uso pessoal ou familiar, contas por convite**: a primeira conta (a do dono) é a administradora; as outras só entram por convite, cada uma com as próprias finanças. Sem cadastro público e com **autenticação obrigatória** em toda página, action e rota — a URL é pública e os dados são sensíveis.
- **Next.js 16.4 (App Router, Cache Components) full-stack na Vercel Hobby** (uso pessoal, não comercial), funções em `gru1` (São Paulo), Fluid compute; npm, React 19.3, Zod 4, Vitest 5.
- **Postgres na Neon** (decidido; `aws-sa-east-1`, via Vercel Marketplace, branch por preview) + **Drizzle ORM** (Neon WebSocket Pool em produção, **PGlite embutido** no desenvolvimento local e nos testes — `npm run demo` sobe o app sem nenhuma conta; escrita em transações).
- **Better Auth**: primeiro acesso único (`SETUP_TOKEN` + `OWNER_EMAIL`), passkey primeiro e e-mail + senha forte como alternativa, rate limit embutido com storage no banco (sem Redis), sessões de 30 dias revogáveis, recuperação de emergência (`RECOVERY_TOKEN`); 2FA TOTP na F1. Plugin admin para papéis e desativação (sem personificação, rotas HTTP desligadas); convites e links de redefinição de uso único (72 h, só o hash no banco); auditoria das ações.
- **Feature flags**: registro tipado no código, valor global e por pessoa no banco (pessoa > global > padrão), aplicadas no servidor; painel em Administração › Flags.
- **Backups**: restauração pontual da Neon + export semanal criptografado (F1).
- **Custo**: R$ 0/mês dentro dos planos gratuitos.
- **Dinheiro em centavos (`bigint`)**, ledger com sinal por conta; projeções em `number` arredondadas só na exibição.
- **Motor financeiro puro em TypeScript**, compartilhado entre cliente (simulador instantâneo) e servidor (metas, relatórios).
- **PWA instalável** (Serwist), notificações Web Push, Vercel Cron diário para recorrências, faturas, índices do BCB e lembretes.
- **UI**: Tailwind CSS v4 (via `@tailwindcss/turbopack`) + shadcn/ui + Motion, fonte Manrope, paleta "Sereno" (neutros + verde-esmeralda), gráficos com paleta validada para daltonismo.

## Mockups

As telas de referência (Início, Extrato, Nova transação, Fatura, Orçamentos, Metas, Simulador e Relatórios) estão no canvas de design: <https://claude.ai/artifact/MRRjsjHAv7dsC5Wm6rWiGE> (privado até ser compartilhado pelo menu Share).

- Todas navegam entre si pela tab bar no modo Play.
- **Nova transação** tem o teclado funcionando (calculadora, tipos, categorias, salvar com "Desfazer").
- **Simulador** (tema escuro) recalcula de verdade: três modos, taxa a.a./% do CDI/IPCA+, IR regressivo e scrub no gráfico.
- Os valores são fictícios, mas consistentes entre as telas e com os exemplos dos docs (usuária Ana, terça 14/out/2026).
