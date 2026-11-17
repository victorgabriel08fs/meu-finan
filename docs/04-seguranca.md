# Segurança: auditoria e caminho até o lançamento

Auditoria de 16/11/2026, na versão 0.5.2 (`main` depois do PR #40). Objetivo do dono: **beta em dezembro de 2026** e, depois, **lançamento com planos pagos**. As tarefas que saem daqui estão em `docs/tarefas.md` › "S. Segurança e lançamento".

## 1. Escopo e método

- **Análise estática** do código: autenticação (Better Auth, senha e passkey), autorização e isolamento entre contas (DAL, `authAction`/`adminAction`, filtros por `userId` no domínio), rotas públicas e de token, Route Handlers, cron, importação e exportação, Web Push, cabeçalhos e CSP, variáveis de ambiente, logs.
- **Dependências**: `npm audit` (produção e desenvolvimento).
- **Segredos**: varredura do histórico do git por chaves, URLs de banco com senha e chaves privadas.
- **Testes dinâmicos locais** contra `next start` com PGlite (nunca contra produção), resultados na §3.
- Fora do escopo: o painel da Vercel e da Neon (configurações não visíveis no código) e pentest de terceiros.

## 2. Resumo

**Nenhum achado crítico.** A base está acima da média para o estágio: sem cadastro público, sessão checada no servidor em toda página, action e rota, isolamento por `userId` com checagem de posse de todo id recebido, tokens de uso único com seletor e verificador (só o hash no banco, comparação em tempo constante), endpoints admin do Better Auth desligados, CSP restrita à própria origem, proteção de CSV injection na exportação, allowlist dos serviços de push (sem SSRF) e nenhum segredo no histórico.

O que falta para o beta é menos código vulnerável e mais **operação**: backup fora da Neon, LGPD (termos, privacidade, exportar e excluir a própria conta), segundo fator para administradores e detecção (logs de login e alertas). Para cobrar, entram pagamentos e limites por plano; as contas continuam só por convite.

| Severidade | Achado | Situação |
|---|---|---|
| Alto | A-1 Dependência de produção com vulnerabilidade alta | **Corrigido** neste PR |
| Alto | A-2 Sem backup fora da Neon | Tarefa S1 (antes do beta) |
| Alto | A-3 LGPD: sem termos, política, exportação e exclusão pelo titular | Tarefas S2 e S3 (antes do beta) |
| Médio | M-1 Administrador sem segundo fator obrigatório | **Corrigido** (tarefa S4, versão 0.9.0) |
| Médio | M-2 Limite de login só por IP, sem checagem de senha vazada | **Corrigido** (tarefa S5); resta a nota do proxy |
| Médio | M-3 Previews com cópia dos dados de produção | Tarefa S6 (verificar no painel) |
| Médio | M-4 Ações caras sem limite por pessoa | **Corrigido** (tarefa S7) |
| Médio | M-5 Sem trilha de login nem alertas | **Corrigido** (tarefa S8, 17/11/2026) |
| Médio | M-6 CSP com `'unsafe-inline'` em `script-src` | Tarefa S12 (depois do beta) |
| Baixo | B-1 `esbuild` vulnerável no `drizzle-kit` (só desenvolvimento) | Acompanhar pelo Dependabot |
| Baixo | B-2 Sem Dependabot nem auditoria no CI | **Corrigido** neste PR |
| Baixo | B-3 HSTS com `preload` e `includeSubDomains` | Atenção ao trocar de domínio |

## 3. Testes executados (local)

| Teste | Resultado |
|---|---|
| Páginas do app sem sessão (`/inicio`, `/admin`, `/extrato`) | 307 para `/entrar?voltar=…` |
| Rotas sem sessão (`/api/export/transactions`, `/api/notificacoes`) | 401 |
| `/api/cron/daily` sem Bearer e com Bearer errado | 401 |
| `/recuperar` sem `RECOVERY_TOKEN` | 404 |
| `POST /api/auth/sign-up/email` sem token e com token mas outro e-mail | 403 "Cadastro desativado" |
| `/api/auth/admin/list-users` e `/set-role` | 404 (desligados) |
| Login com `Origin` de outro site | 403 `INVALID_ORIGIN` |
| 7 logins errados do mesmo IP | 5 × 400, depois 429 |
| 7 logins errados trocando `X-Forwarded-For` | nenhum 429 (ver M-2) |
| Cabeçalhos de segurança em `/entrar` | CSP, HSTS, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`; sem `X-Powered-By` |
| Varredura do histórico do git | só os exemplos de `.env.example` |
| `npm audit --omit=dev --audit-level=high` | limpo depois da correção |

A suíte existente cobre o resto do isolamento (integração contra o PGlite: compartilhamento, push, lembretes, flags, auth, exclusão em cascata).

## 4. Achados

### A-1 Dependência de produção com vulnerabilidade alta — corrigido

`@vercel/functions` 3.10.1 puxava `@vercel/oidc` → `@vercel/cli-config` → `zod` < 4.6.6 ([GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), estouro de memória ao validar coleções enormes). O risco real era baixo (esse `zod` não valida entrada do usuário), mas a correção é só o lockfile: `npm audit fix` subiu `@vercel/functions` para 3.11.3 dentro da faixa do `package.json`.

### A-2 Sem backup fora da Neon

O doc 01 §11.7 descreve o export semanal criptografado (`pg_dump` + `age`, pelo GitHub Actions), mas ele não existe no repositório (só há `ci.yml`). Hoje tudo depende da restauração pontual da Neon, cuja janela no plano gratuito é curta. Com dados de terceiros no beta, um `DELETE` errado, uma migração ruim ou a perda da conta da Neon seria irrecuperável.

### A-3 LGPD

O doc 01 §11.8 apoia-se na exceção do uso particular (art. 4º, I). Com pessoas de fora da família no beta, e mais ainda com planos pagos, a exceção deixa de valer: o app passa a ser controlador de dados financeiros pessoais. Faltam **termos de uso**, **política de privacidade** (o que coleta, base legal, operadores Vercel e Neon, retenção, contato), **exportar meus dados** completo e **excluir minha conta** pela própria pessoa (hoje só o administrador exclui; o CSV de lançamentos não cobre contas, metas, orçamentos etc.), além de um procedimento de incidente (comunicar ANPD e titulares).

### M-1 Administrador sem segundo fator obrigatório

O administrador gera links de redefinição e convites. Uma senha de administrador vazada abre a conta de qualquer pessoa (a vítima percebe, mas depois). A passkey existe, porém é opcional. Exigir passkey (ou TOTP do plugin `twoFactor` do Better Auth) para o papel `admin` fecha isso.

**Corrigido na tarefa S4 (versão 0.9.0).** A Administração e as `adminAction` exigem uma sessão aberta ou confirmada com passkey: `session.passkey_verified_at` é carimbado só em `/passkey/verify-authentication` (doc 01 §11.3 e §11.9). Administrador que já tem passkey não cadastra nem remove passkeys com sessão de senha. Riscos que ficam: (1) o primeiro cadastro de passkey de um administrador que ainda não tem nenhuma é confiança no primeiro uso, feito com a sessão de senha; (2) quem é promovido a administrador pode já ter uma passkey cadastrada por quem tinha a senha dele; (3) a confirmação vale pela sessão (30 dias deslizantes), sem janela de recência curta; (4) a passkey não exige verificação do usuário (UV).

### M-2 Limite de login só por IP — corrigido (S5)

Corrigido na tarefa S5: 10 tentativas por e-mail em 15 min (zeradas por um login bem-sucedido; durante o bloqueio nem a senha certa entra, a passkey sim) e senhas que aparecem no Have I Been Pwned são recusadas ao criar ou trocar a senha (k-anonimato, falha aberta). Módulo próprio em vez do plugin `haveIBeenPwned`, que falha fechada e não cobre o convite nem a recuperação. Detalhes no doc 01 §11.2. Custo aceito: quem sabe o e-mail de alguém consegue bloquear o login por senha dele por até 15 min (a passkey continua). Pendente: o cabeçalho do proxy abaixo.

Texto original do achado:

O limitador do Better Auth conta por IP e rota (5 por minuto no login). Na Vercel o `X-Forwarded-For` vem do próprio proxy, então o teste acima não se repete lá; mas um ataque distribuído (credential stuffing com muitos IPs) contra uma conta não tem limite por e-mail, e a senha não é conferida contra listas de senhas vazadas. Se um dia houver outro proxy na frente (Cloudflare), o primeiro salto do `X-Forwarded-For` passa a ser falsificável: usar o cabeçalho próprio desse proxy.

### M-3 Previews com cópia dos dados de produção

Pelo doc 01 §14, cada preview usa um branch da Neon copiado de produção e fica protegido por Vercel Authentication. Não dá para verificar a proteção pelo código. Qualquer PR (inclusive do Dependabot) gera um deploy com os dados reais de todo mundo e roda as migrações do PR sobre eles.

### M-4 Ações caras sem limite por pessoa

Importar extrato (arquivo de até 2 MB), lançamento por texto e exportar CSV não têm `throttle` por pessoa. Uma conta abusiva (ou um script com a sessão de alguém) consome CPU e banco à vontade, e na Vercel isso vira custo.

**Corrigido (S7).** `limitUsage` (`src/server/security/limits.ts`) conta os usos por id da sessão, na tabela `rate_limit`, com janela fixa: analisar extrato, 20 a cada 10 min; confirmar importação, 10 a cada 10 min; lançamento por texto, 30 por minuto; exportar CSV, 10 a cada 10 min. As ações respondem "Espere um pouco e tente de novo" e a rota de exportação responde 429 com `Retry-After`. Desfazer importação não tem limite.

### M-5 Sem trilha de login nem alertas

O doc 01 §13 prevê log de eventos de autenticação e Sentry; nenhum dos dois existe. Hoje não há como saber se alguém está tentando senhas, se uma sessão nova surgiu de outro país ou se o cron falhou, a não ser abrindo o painel.

**Resolvido na tarefa S8 (17/11/2026).** Log JSON de login, falhas, bloqueios do limitador, primeiro acesso, recuperação e convite (e-mail e IP só como HMAC, com o país da Vercel); Sentry opcional com scrubber de valores, descrições e e-mails; monitor do cron diário (`daily-job`) que avisa quando o job falha ou não roda. Os alertas por e-mail são configurados no painel do Sentry (README › Observabilidade). Login não entra no `audit_log`, que é a trilha da administração.

### M-6 CSP com `'unsafe-inline'`

Decisão conhecida e documentada em `next.config.ts` (nonce é incompatível com o shell estático do Cache Components). O React escapa tudo e não há `dangerouslySetInnerHTML` com dado do usuário, então o risco é residual. Revisitar com o SRI do Next ou se o app passar a renderizar por requisição.

### B-1 `esbuild` no `drizzle-kit`

Só o servidor de desenvolvimento do `esbuild` é afetado, e o `drizzle-kit` não o usa assim. A correção do `npm audit` rebaixaria o `drizzle-kit` para 0.18 (quebra). Esperar uma versão nova do `drizzle-kit`.

### B-2 Sem Dependabot nem auditoria no CI — corrigido

Entraram `.github/dependabot.yml` (npm semanal, agrupado; GitHub Actions mensal) e o passo `npm audit --omit=dev --audit-level=high` no CI.

### B-3 HSTS com `preload` e `includeSubDomains`

Inofensivo no `*.vercel.app`. No domínio próprio, todo subdomínio precisa de HTTPS antes de inscrever o domínio na lista de preload (difícil de desfazer).

## 5. Roadmap

### Até o beta (dezembro de 2026)

1. **S1 Backup** fora da Neon (export semanal criptografado do doc 01 §11.7), conferir a janela de restauração do plano da Neon e fazer um teste de restauração.
2. **S2 Termos e privacidade**: páginas públicas, aceite no convite e no primeiro acesso, canal de contato do titular.
3. **S3 Exportar meus dados e excluir minha conta** em Ajustes, com sessão recente.
4. **S4 Segundo fator para administradores** (passkey obrigatória para o papel `admin`).
5. **S6 Previews**: confirmar Vercel Authentication; de preferência, previews com banco de demonstração em vez de cópia de produção.
6. **S8 Observabilidade mínima**: Sentry com `beforeSend` sem valores, descrições e e-mails (nova origem na CSP), log de login e falhas, alerta de falha do cron.
7. **S5 e S7 Limites**: por e-mail no login, senhas vazadas (plugin `haveIBeenPwned` do Better Auth) e `throttle` por pessoa nas ações caras.

### Até lançar com planos

1. **Vercel Pro**: o plano Hobby é só para uso não comercial; cobrar exige o Pro (também traz WAF e regras de firewall).
2. **Neon pago**: restauração pontual de 7 a 30 dias, sem pausa por inatividade.
3. **Contas continuam só por convite** (decisão do dono, 16/11/2026): sem cadastro público. Entra o "esqueci minha senha" por e-mail (Resend, remetente Prumo).
4. **S10 Pagamentos**: checkout hospedado (Stripe, Mercado Pago ou Pagar.me, com Pix e cartão; nenhum dado de cartão passa pelo app), webhook com assinatura verificada e idempotência, tabela de assinaturas e direitos por plano.
5. **S11 Limites por plano** no servidor: o registro de flags já resolve pessoa > global > padrão; entra o plano no meio (pessoa > plano > global > padrão), sempre checado em `flaggedAction` e nas páginas.
6. **Isolamento em profundidade**: Row Level Security no Postgres por `user_id` como segunda barreira, ou um teste que percorra o catálogo e exija filtro por dono em toda consulta.
7. **Pentest externo** e `/.well-known/security.txt` antes da divulgação ampla.
8. **Operação**: página de status, runbook de incidente (inclui comunicar a ANPD), retenção da auditoria e dos logs, nota fiscal e CNPJ para vender.
9. **Homepage indexável** (hoje `noindex`) e domínio próprio (tarefa 24b).
