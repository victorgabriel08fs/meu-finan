# Meu Finan

Controle financeiro pessoal, mobile-first e instalável como app (PWA). Registre um gasto em segundos, veja o mês inteiro em uma tela, planeje orçamentos e metas e simule quanto o dinheiro guardado pode render, já com IR e inflação.

> **Uso pessoal.** O app tem uma única pessoa usuária: você. Não existe cadastro público. Mesmo assim, o login é obrigatório em tudo, porque o app fica em uma URL pública e guarda dados financeiros.

## O que já dá para fazer

- **Início**: saldo em contas, previsão para o fim do mês (com agendados e faturas), receitas e despesas, orçamento do mês com ritmo, próximas contas, contas e metas.
- **Lançamento rápido** ("+" em qualquer tela, atalhos N/R/T no desktop e no ícone do app instalado): despesa, receita ou transferência, com teclado de valor, parcelas, repetição e desfazer.
- **Extrato** com busca sem acento, filtros na URL, agendados à parte e detalhe para editar, pagar ou excluir — inclusive "este e os próximos" em parcelas e recorrências.
- **Contas e cartões**: saldos, ajuste de saldo, faturas por mês, pagamento de fatura e melhor dia de compra.
- **Planejar**: orçamentos por categoria (com sugestão pela média), metas com projeção e "Aportar", e o simulador de juros compostos com CDI, IPCA e IR regressivo.
- **Relatórios**: visão geral, categorias, fluxo de caixa dia a dia, patrimônio e calendário de gastos.
- **Dados**: importar extrato OFX/CSV (sem duplicar) e exportar os lançamentos em CSV.
- **Tema escuro por padrão**, com Claro e Sistema: a escolha fica salva na conta e vale em todos os aparelhos (troca rápida no Início e na barra lateral).
- **Dicas e novidades**: balões que apontam o que fazer na primeira visita a cada tela (com "Pular dicas" e "Não mostrar mais") e uma lista do que chegou ao app, com aviso de não lidas; em Preferências, ligar, desligar e "Rever dicas".
- **Ajustes**: passkeys, senha e sessões; aparência, início do mês e dicas de uso; categorias; onboarding em 4 passos.

## Stack

| Camada | Escolha |
|---|---|
| Framework | Next.js 16.4 (App Router, Cache Components, Turbopack) · React 19.3 · TypeScript strict |
| Interface | Tailwind CSS v4 · Radix UI · Motion · lucide-react · next-themes · Sonner · zustand |
| Formulários e ações | Zod 4 · next-safe-action · nuqs (filtros na URL) |
| Autenticação | Better Auth 1.7 com passkeys (sessão em banco) |
| Dados | Postgres: Neon em produção (WebSocket Pool) e PGlite embutido no desenvolvimento local · Drizzle ORM e drizzle-kit |
| Datas | motor próprio em `src/lib/finance` · @date-fns/tz (fuso `America/Sao_Paulo`) |
| Qualidade | Biome (lint e formatação) · Vitest · fast-check · Playwright (celular emulado) |
| Hospedagem | Vercel (funções em `gru1`, São Paulo) · Vercel Cron |

## Requisitos

- Node.js 24 (com npm 11).
- Conta na Vercel. O plano Hobby atende: é gratuito e serve para uso pessoal, não comercial.
- Vercel CLI: `npm i -g vercel` (ou use `npx vercel` nos comandos abaixo).

## Ver o app agora (sem nenhuma conta)

O desenvolvimento local usa um **Postgres embutido (PGlite)** em `.data/pglite`: sem Docker, sem Neon, sem Vercel.

```bash
npm install
npm run demo   # cria o .env.local e um banco local com 13 meses de dados de exemplo
npm run dev    # http://localhost:3000
```

Entre com **demo@meu-finan.local** e a senha **meu-finan-demo**. As dicas de primeiro acesso e as novidades aparecem ligadas (a conta da demo é anterior a todas as novidades); `npm run demo -- --sem-dicas` cria a mesma demo com os balões desligados. Para começar do zero (sem dados), rode `npm run db:local -- reset` e faça o primeiro acesso em `/primeiro-acesso` com o `SETUP_TOKEN` do seu `.env.local` (o `OWNER_EMAIL` dele é o e-mail aceito).

### No celular (mesma rede Wi‑Fi)

1. Descubra o IP do computador na rede (no Windows, `ipconfig` → "Endereço IPv4", por exemplo `192.168.0.10`).
2. No `.env.local`, troque `BETTER_AUTH_URL` por `http://192.168.0.10:3000` e reinicie o `npm run dev`. O login confere a origem, então use esse endereço também no computador enquanto ele estiver assim.
3. No celular, abra `http://192.168.0.10:3000` e entre com a senha. Se o Windows perguntar, libere o Node.js no firewall para redes privadas.

> Passkeys funcionam em `localhost` e no deploy (HTTPS). Pelo IP da rede o navegador não libera WebAuthn sem HTTPS: use a senha.

## Publicar (Vercel + Neon)

1. Instale as dependências e vincule a pasta a um projeto da Vercel:

   ```bash
   npm install
   npx vercel link
   ```

2. Crie o banco pela Vercel: **Storage → Create Database → Neon**, região **São Paulo (aws-sa-east-1)**, conectado ao projeto nos ambientes Development, Preview e Production. Ative os branches de preview: cada deploy de preview ganha um branch próprio do banco. A integração cria `DATABASE_URL` e `DATABASE_URL_UNPOOLED`.

3. Cadastre as demais variáveis em **Settings → Environment Variables**. O arquivo [`.env.example`](.env.example) explica cada uma e como gerar os segredos. Em produção, `BETTER_AUTH_URL` é o endereço público (ex.: `https://meu-finan.vercel.app`): as passkeys ficam presas a esse domínio.

4. Faça o deploy (`npx vercel --prod` ou um push na branch conectada). O build roda as migrações (`npm run build:vercel`) antes do `next build`.

5. Faça o primeiro acesso (seção abaixo) e cadastre sua passkey.

Para desenvolver contra a Neon em vez do banco embutido, crie um branch `dev` no console da Neon e coloque a connection string dele em `DATABASE_URL` e `DATABASE_URL_UNPOOLED` do `.env.local` (ou use `npx vercel env pull .env.local`). Com `DATABASE_URL` definida o app usa a Neon, e `npm run db:migrate` aplica as migrações.

## Primeiro acesso

Como não há cadastro público, a conta é criada uma única vez, com um token temporário.

1. Gere um token:

   ```bash
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
   ```

2. Na Vercel (ambiente Production), defina `OWNER_EMAIL` com o seu e-mail e `SETUP_TOKEN` com o token. Faça um novo deploy: variáveis novas só valem depois dele.
3. Abra `https://seu-app/primeiro-acesso`, informe o token e cadastre uma passkey (Face ID, digital, Windows Hello ou chave de segurança).
4. Apague `SETUP_TOKEN` na Vercel e faça um novo deploy. Sem o token, `/primeiro-acesso` fica desativado.
5. Daqui em diante, entre por `/entrar` com a passkey.

No ambiente local, o caminho é o mesmo, com as variáveis no `.env.local` e o endereço `http://localhost:3000/primeiro-acesso`. Passkeys ficam vinculadas ao domínio: a criada em `localhost` não serve em produção, e vice-versa.

## Recuperação de emergência

Se você perder acesso à passkey (troca de celular sem sincronização, por exemplo):

1. Gere um token novo (mesmo comando do primeiro acesso) e defina `RECOVERY_TOKEN` na Vercel (Production). Faça um novo deploy.
2. Abra `https://seu-app/recuperar`, informe o token e cadastre uma nova passkey.
3. Apague `RECOVERY_TOKEN` e faça um novo deploy.

Enquanto o token existir, quem o tiver consegue cadastrar uma passkey na sua conta. Por isso ele só deve existir durante a recuperação.

## Deploy

- **Produção:** push na `main`. **Preview:** cada pull request, com URL e branch do banco próprios.
- O build da Vercel roda `npm run build:vercel` (`drizzle-kit migrate && next build`): as migrações são aplicadas no banco do ambiente antes do build. Escreva migrações compatíveis com a versão anterior do código (expandir agora, remover colunas num deploy seguinte), para que o Instant Rollback da Vercel continue seguro.
- As funções rodam em `gru1` (São Paulo), perto do banco (`aws-sa-east-1`). A rota do cron tem até 300 s de execução.
- O banco de cada preview é uma cópia do banco de produção. Mantenha a **Deployment Protection** da Vercel ligada (é o padrão) para que só você abra os previews. As passkeys de produção não funcionam na URL de preview, porque o domínio é outro.
- O CI do GitHub ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) roda lint, verificação de tipos, testes e build em cada pull request e em cada push na `main`. O build não depende do banco.

## Cron diário

O [`vercel.json`](vercel.json) agenda `GET /api/cron/daily` para as 09:00 UTC (06:00 em Brasília). O cron só roda no deploy de **produção** e, no plano Hobby, pode disparar em qualquer momento dentro dessa hora.

A rota só aceita `Authorization: Bearer <CRON_SECRET>`, com comparação em tempo constante. Sem `CRON_SECRET`, ela recusa tudo. Cada execução fica registrada na tabela `job_runs`, com o resultado e a duração de cada passo. A falha de um passo não impede os seguintes.

| Passo | O que faz |
|---|---|
| `materializeRecurrences` | Cria os lançamentos recorrentes até 60 dias à frente |
| `rollInvoices` | Fechamento e abertura de faturas (fase F2; por enquanto, pulado) |
| `syncMarketRates` | Busca CDI (SGS 4389), Selic (SGS 432) e IPCA (SGS 433) na API do Banco Central e atualiza `market_rates` |
| `snapshotBalances` | Saldo de fim de mês para o patrimônio (fase F3; por enquanto, pulado) |
| `sendReminders` | Lembretes por push e e-mail (fase F3; por enquanto, pulado) |
| `purgeDeleted` | Apaga de vez os lançamentos excluídos há mais de 30 dias |

Para rodar na hora (por exemplo, para carregar os índices logo após o primeiro deploy):

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://seu-app/api/cron/daily
```

## Segurança

- **Sessão verificada no servidor** em toda página, Server Action e rota de API. O `proxy.ts` só redireciona para `/entrar` quem chega sem cookie de sessão; ele não é a proteção. Ficam de fora apenas `/api/auth/*` (Better Auth), `/api/cron/daily` (protegida pelo `CRON_SECRET`), os arquivos públicos e as páginas `/entrar`, `/primeiro-acesso` e `/recuperar`.
- **Cabeçalhos** ([`next.config.ts`](next.config.ts)): HSTS, Content-Security-Policy, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy` e `X-Robots-Tag: noindex, nofollow`. O `robots.txt` bloqueia todos os robôs.
- **CSP sem nonce.** Tudo fica restrito à própria origem (scripts, estilos, imagens, fontes, conexões e formulários), e o app não pode ser exibido em iframe. Scripts e estilos inline continuam permitidos (`'unsafe-inline'`), porque o Next.js entrega a página pré-renderizada (Cache Components) com scripts inline, e nonces exigiriam renderizar cada página a cada requisição. A defesa contra XSS fica com o escape do React, a ausência de HTML vindo de dados do usuário e as restrições de origem da CSP, que limitam para onde um script injetado conseguiria enviar dados. O caminho para uma CSP com nonce está descrito no próprio `next.config.ts`.
- A CSP bloqueia a Vercel Toolbar nos previews. Se ela fizer falta, desative-a em **Settings → General → Vercel Toolbar**, ou ignore os avisos no console.
- Segredos só em variáveis de ambiente do servidor, nunca com o prefixo `NEXT_PUBLIC_`.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run demo` | Cria o `.env.local` (se faltar) e recria o banco local com 13 meses de dados de exemplo; com `-- --sem-dicas`, desliga os balões de dicas |
| `npm run dev` | Servidor de desenvolvimento (aplica as migrações no banco local antes) |
| `npm run db:local -- reset` | Apaga e recria o banco local vazio |
| `npm run build` | Build de produção (não acessa o banco) |
| `npm run build:vercel` | Migrações e build; é o comando de build da Vercel |
| `npm run start` | Serve o build de produção |
| `npm run lint` | Biome: lint, formatação e ordem dos imports |
| `npm run format` | Formata os arquivos com o Biome |
| `npm run typecheck` | Gera os tipos de rotas do Next.js e roda o `tsc` |
| `npm run test` | Testes (Vitest) |
| `npm run test:watch` | Testes em modo observação |
| `npm run test:coverage` | Testes com cobertura |
| `npm run check` | Lint, tipos e testes (rode antes de abrir um pull request) |
| `npm run test:e2e` | Recria os dados de demonstração (com as dicas desligadas), faz o build e roda o Playwright num celular emulado; `e2e/tips.spec.ts` liga as dicas, testa e desliga de novo |
| `npm run db:generate` | Gera uma migração SQL a partir do schema Drizzle |
| `npm run db:migrate` | Aplica as migrações pendentes |
| `npm run db:studio` | Abre o Drizzle Studio |
| `npm run db:seed` | Executa `scripts/seed.ts` |

## Estrutura

```
meu-finan/
├─ docs/                     # especificação do produto (veja abaixo)
├─ drizzle/                  # migrações SQL geradas pelo drizzle-kit (não editar à mão)
├─ e2e/                      # testes Playwright (celular emulado, build de produção)
├─ public/                   # arquivos estáticos
├─ scripts/                  # banco local, dados de demonstração e seed
├─ src/
│  ├─ app/
│  │  ├─ (auth)/             # entrar, primeiro acesso e recuperação
│  │  ├─ (app)/              # telas autenticadas: início, extrato, contas, cartões,
│  │  │                      # planejar, relatórios e ajustes
│  │  ├─ api/auth/           # rotas do Better Auth
│  │  ├─ api/cron/daily/     # job diário (Vercel Cron)
│  │  └─ robots.ts           # bloqueia a indexação
│  ├─ components/
│  │  ├─ ui/                 # componentes base (Button, Sheet, SegmentedControl…)
│  │  ├─ app/ · finance/ · money/ · charts/
│  │  └─ dashboard/ · accounts/ · transactions/ · quick-add/ · planning/ · reports/ · tips/
│  ├─ lib/
│  │  ├─ finance/            # motor financeiro puro (juros, IR, faturas, orçamento…), com testes
│  │  ├─ format/             # formatação pt-BR (moeda, datas, percentuais)
│  │  └─ tips/               # registro das dicas e novidades, seleção por tela e geometria do balão
│  ├─ server/
│  │  ├─ auth.ts             # instância do Better Auth
│  │  ├─ dal.ts              # getSession e requireUser (checagem de sessão no servidor)
│  │  ├─ safe-action.ts      # cliente das Server Actions (authAction exige sessão)
│  │  ├─ env.ts              # variáveis de ambiente validadas com Zod
│  │  ├─ domain/             # regras de negócio sobre o banco (lançamentos, faturas…)
│  │  ├─ actions/            # Server Actions das telas
│  │  ├─ db/                 # cliente Drizzle (Neon ou PGlite) e schema
│  │  └─ jobs/               # passos do cron diário
│  ├─ stores/                # estado do cliente (privacidade, lançamento rápido)
│  └─ proxy.ts               # redirecionamento otimista para /entrar
├─ next.config.ts            # Cache Components e cabeçalhos de segurança
└─ vercel.json               # região, comando de build e cron
```

## Documentação

- [`docs/README.md`](docs/README.md): visão geral e decisões em uma linha.
- [`docs/01-system-design.md`](docs/01-system-design.md): requisitos, arquitetura, modelo de dados, API, cache, jobs, segurança e CI/CD.
- [`docs/02-frontend-design.md`](docs/02-frontend-design.md): design tokens, navegação, componentes, telas, microcopy, acessibilidade e PWA.
- [`docs/03-motor-financeiro.md`](docs/03-motor-financeiro.md): fórmulas e algoritmos (juros compostos, CDI, IPCA+, IR regressivo, faturas, parcelamento, orçamento).

Quando os docs e este README divergirem, valem as decisões do dono do produto: uso por uma única pessoa (sem cadastro público), autenticação obrigatória, Neon sem Redis (limite de tentativas de login pelo Better Auth, guardado no banco) e Vercel Hobby.
