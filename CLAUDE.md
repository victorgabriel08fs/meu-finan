@AGENTS.md

# Meu Finan

Personal-finance PWA with accounts by invitation (the first account administers; each account has its own finances): Next.js 16.4 (App Router, Cache Components), Better Auth with passkeys, Drizzle on Postgres: Neon (WebSocket Pool) when `DATABASE_URL` is set, embedded PGlite (`.data/pglite`) for local development and tests, deployed on Vercel (Hobby, region `gru1`).

- Spec, in Portuguese: `docs/01-system-design.md` (architecture, data model, API, jobs, security), `docs/02-frontend-design.md` (tokens, screens, microcopy) and `docs/03-motor-financeiro.md` (formulas). Read the relevant section before coding. The owner's decisions in `README.md` win where the docs differ (accounts by invitation, no Upstash).
- This Next.js differs from your training data: read the guide in `node_modules/next/dist/docs/` before writing Next-specific code, and check APIs against the installed type definitions.

## Commands

- `npm run dev` · `npm run build` (must work without a database) · `npm run build:vercel` (migrations, then build)
- `npm run check` = `lint` (Biome) + `typecheck` (`next typegen && tsc --noEmit`) + `test` (Vitest). Run it before finishing.
- `npm run format` · `npm run test:watch` · `npm run test:coverage`
- `npm run db:generate` (SQL migration from the schema) · `npm run db:migrate` (Neon) · `npm run db:local -- migrate|reset` (PGlite; `predev` migrates automatically) · `npm run db:studio` · `npm run db:seed`

## Rules

- **Accounts by invitation, mandatory auth.** There is no public sign-up, ever: the first account (`/primeiro-acesso`) is an administrator, and only administrators create accounts, with a one-time invite link. Every page, Server Action and Route Handler verifies the session on the server: pages call `requireUser()` from `src/server/dal.ts`, actions use `authAction` from `src/server/safe-action.ts`, route handlers return 401 without a session. `src/proxy.ts` is only an optimistic redirect, never the check. Only exceptions: `/api/auth/*`, `/api/cron/*` (Bearer `CRON_SECRET`), public assets and `/entrar`, `/primeiro-acesso`, `/recuperar`, `/convite/[token]` (the last three gated by their own token, rate-limited).
- Never take the acting user's id from the client; scope every query by the session user's id and check ownership of every id received. Each account's finances are isolated: nothing reads another account's financial rows.
- **Administration** (`/admin`): pages call `requireAdmin()` inside `<Suspense>` (404 for anyone else) and actions use `adminAction`, which re-read the role on every request. Writes go through `src/server/domain/users.ts` and `flag-admin.ts`: one transaction that locks the accounts (`FOR UPDATE`), re-checks that the actor is an active administrator, applies `accountActionBlocker` (`src/lib/admin/guards.ts`: nobody acts on themself, an active administrator always remains) and calls `recordAudit`. No impersonation, no access to anyone's money; the Better Auth admin plugin's HTTP endpoints stay disabled. Never log or audit tokens or passwords.
- **Feature flags** are defined only in `src/lib/flags/registry.ts`; the database stores changes (global and per person; resolution person > global > default). Enforce on the server (`isFlagEnabled` in pages and routes, `flaggedAction` for actions); `useFlag` in Client Components only shapes the UI. To add one: registry entry, server gate, UI, tests (README › Feature flags).
- **Cache Components is on.** Read `cookies()`, `headers()`, `searchParams` and the session only inside `<Suspense>`, never as a top-level await in a layout (starting a promise there and unwrapping it with `use()` inside `<Suspense>` is fine: the feature flags do it). `'use cache'` functions receive the user id as an argument and tag their data (`u:{id}:…`, `rates`); Server Actions invalidate with `updateTag`, Route Handlers with `revalidateTag(tag, 'max')`. Route segment `dynamic`, `revalidate` and `fetchCache` do not exist in this mode.
- No database access while prerendering: CI builds with dummy env values.
- **Inside a transaction use only `tx`**, never the global `db`: PGlite has a single connection, so a query through `db` while a transaction is open deadlocks (Better Auth hooks that run inside its sign-up transaction included). Write paths use `db.transaction()`; helpers take an `Executor` (`db` or `tx`).
- **No correlated subqueries in the select list of single-table queries**: Drizzle drops table qualifiers there, so an outer reference binds to the inner table. Aggregate over a LEFT JOIN with GROUP BY instead, and GROUP BY expressions with bind parameters by position (`.groupBy(sql\`1\`)`).
- **Domain logic** lives in `src/server/domain` (explicit `userId`/`UserContext`, ownership checks on every id); Server Actions in `src/server/actions` validate with Zod, call the domain and finish with `refresh()`.
- **Money is integer cents** (`bigint` columns, `number` in TypeScript); format with `formatBRL` from `src/lib/format/money.ts`. Rates are decimal strings or `numeric`, never floats in the database.
- **Finance logic lives only in `src/lib/finance`**: pure functions, no I/O, no imports from the rest of the project, covered by Vitest and fast-check.
- Server environment variables go through `src/server/env.ts`; document new ones in `.env.example`. Never use `NEXT_PUBLIC_` for secrets.
- Security headers and the CSP live in `next.config.ts`. A new third-party origin must be added to the CSP there.
- Code identifiers in English; user-facing copy in Brazilian Portuguese following `docs/02` §10.
- Biome only (no ESLint or Prettier). Do not edit `drizzle/` by hand.
