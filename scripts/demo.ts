// Local demo: recreates the embedded database (PGlite) with 13 months of
// realistic data for "Ana" (the persona of the mockups, the administrator),
// plus a regular account (Bruno) and a pending invite (Carla) for
// Administração, so the app can be explored right after `npm run demo`.
// Never runs against Neon.
//
//   npm run demo      → then npm run dev and sign in with the printed credentials
//   npm run demo -- --sem-dicas
//                     → the same, with the tip balloons off ("Não mostrar mais
//                       dicas"): what the e2e suite runs, so balloons never
//                       sit over the screens it drives
//
// Ana's account predates the history (and every novidade), so the demo shows
// the first-access tips and the novidades alike.
import { randomBytes } from "node:crypto";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvConfig } from "@next/env";
import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/pglite/migrator";
import { uuidv7 } from "uuidv7";
import {
  addDays,
  addMonths,
  atDay,
  compare,
  dayOfWeek,
  iso,
  type LocalDate,
  monthEnd,
  parse,
  toYearMonth,
} from "../src/lib/finance";
import { TIPS } from "../src/lib/tips";
import {
  closeDatabase,
  db,
  resolveDatabaseTarget,
} from "../src/server/db/client";
import {
  accessLinks,
  account,
  accountYield,
  auditLog,
  categories,
  featureFlagOverrides,
  finAccounts,
  goals,
  marketRates,
  notifications,
  session,
  shareMembers,
  transactions,
  user,
  userSettings,
} from "../src/server/db/schema";
import { ensureOwnerDefaults } from "../src/server/db/seed-defaults";
import { createAccount } from "../src/server/domain/accounts";
import { upsertBudget } from "../src/server/domain/budgets";
import { listInvoices, payInvoice } from "../src/server/domain/cards";
import { createCategory } from "../src/server/domain/categories";
import { setCategoryArchived } from "../src/server/domain/category-admin";
import { getUserContext } from "../src/server/domain/context";
import {
  contribute,
  createBox,
  setMyPlan,
} from "../src/server/domain/sharing/boxes";
import { addSharedExpenses } from "../src/server/domain/sharing/expenses";
import {
  createGroup,
  getGroup,
  inviteToGroup,
  respondToInvite,
} from "../src/server/domain/sharing/groups";
import { settleUp } from "../src/server/domain/sharing/settlements";
import { setTipsOff } from "../src/server/domain/tips";
import {
  createTransaction,
  createTransfer,
} from "../src/server/domain/transactions";
import {
  ACCESS_LINK_TTL_MS,
  accessLinkUrl,
  createAccessToken,
} from "../src/server/security/access-token";

const ENV_FILE = ".env.local";
const DEMO_EMAIL = "demo@meu-finan.local";
const DEMO_PASSWORD = "meu-finan-demo";
const BRUNO_EMAIL = "bruno@meu-finan.local";
const BRUNO_PASSWORD = "meu-finan-bruno";

/** Creates .env.local with fresh local secrets the first time. */
function ensureEnvFile(): boolean {
  if (existsSync(ENV_FILE)) return false;
  const secret = () => randomBytes(32).toString("base64url");
  writeFileSync(
    ENV_FILE,
    [
      "# Gerado por npm run demo para o desenvolvimento local (não vai para o git).",
      "# Sem DATABASE_URL o app usa o Postgres embutido em .data/pglite.",
      `BETTER_AUTH_SECRET="${secret()}"`,
      'BETTER_AUTH_URL="http://localhost:3000"',
      `OWNER_EMAIL="${DEMO_EMAIL}"`,
      `SETUP_TOKEN="${secret()}"`,
      `CRON_SECRET="${secret()}"`,
      "",
    ].join("\n"),
  );
  return true;
}

/** Deterministic pseudo-random amounts (mulberry32), so every demo is the same. */
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main(): Promise<void> {
  const created = ensureEnvFile();
  loadEnvConfig(process.cwd(), true);
  const target = resolveDatabaseTarget();
  if (target.kind !== "pglite" || !target.dir) {
    throw new Error(
      "O demo só roda no banco local (PGlite). Remova DATABASE_URL do .env.local para usá-lo.",
    );
  }
  const ownerEmail = (process.env.OWNER_EMAIL ?? DEMO_EMAIL)
    .trim()
    .toLowerCase();

  rmSync(resolve(target.dir), { recursive: true, force: true });
  await migrate(db as never, { migrationsFolder: resolve("drizzle") });

  // Owner (as /primeiro-acesso would create it: the administrator) -----------
  const userId = randomBytes(16).toString("hex");
  // The account dates from the start of the history (13 months ago).
  const since = new Date(Date.now() - 395 * 24 * 60 * 60 * 1000);
  await db.insert(user).values({
    id: userId,
    name: "Ana",
    email: ownerEmail,
    emailVerified: true,
    role: "admin",
    createdAt: since,
    updatedAt: since,
  });
  await db.insert(account).values({
    id: randomBytes(16).toString("hex"),
    accountId: userId,
    providerId: "credential",
    userId,
    password: await hashPassword(DEMO_PASSWORD),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await ensureOwnerDefaults(userId);
  await db
    .update(userSettings)
    .set({ onboardingDoneAt: new Date() })
    .where(eq(userSettings.userId, userId));
  const ctx = await getUserContext(userId);

  const categoryIds = new Map(
    (
      await db
        .select({ id: categories.id, name: categories.name })
        .from(categories)
        .where(eq(categories.userId, userId))
    ).map((row) => [row.name, row.id]),
  );
  const cat = (name: string) => {
    const id = categoryIds.get(name);
    if (!id) throw new Error(`Categoria padrão ausente: ${name}`);
    return id;
  };
  // Subcategories of Mercado: Feira (the Hortifruti entries) and Padaria
  // (archived once the history is in, so the statement shows how an
  // archived subcategory still counts under its parent).
  for (const [name, icon] of [
    ["Feira", "sprout"],
    ["Padaria", "store"],
  ] as const) {
    categoryIds.set(
      name,
      await createCategory(userId, {
        kind: "expense",
        name,
        icon,
        color: "cat-2",
        parentId: cat("Mercado"),
      }),
    );
  }

  // Accounts -------------------------------------------------------------------
  const today = ctx.today;
  const start = atDay(
    addMonths(toYearMonth(today), -12).year,
    addMonths(toYearMonth(today), -12).month,
    1,
  );
  // The account dates from the start of the history, or from before the
  // first novidade if that is earlier: novidades reach only older accounts.
  const firstNews = TIPS.filter((tip) => tip.kind === "novidade")
    .map((tip) => iso(addDays(parse(tip.since), -1)))
    .sort()[0];
  const createdOn =
    firstNews && firstNews < iso(start) ? firstNews : iso(start);
  await db
    .update(user)
    .set({ createdAt: new Date(`${createdOn}T12:00:00-03:00`) })
    .where(eq(user.id, userId));

  const checking = await createAccount(userId, {
    name: "Conta principal",
    type: "checking",
    initialBalanceCents: 350_000,
    color: "cat-1",
  });
  const reserve = await createAccount(userId, {
    name: "Reserva",
    type: "investment",
    initialBalanceCents: 150_000,
    color: "cat-3",
  });
  await db.insert(accountYield).values({
    accountId: reserve,
    index: "cdi",
    pctOfIndex: "1.0200",
    taxMode: "regressive",
  });
  const wallet = await createAccount(userId, {
    name: "Carteira",
    type: "cash",
    initialBalanceCents: 15_000,
    color: "cat-4",
  });
  const card = await createAccount(userId, {
    name: "Cartão Principal",
    type: "credit_card",
    initialBalanceCents: 0,
    color: "cat-7",
    // The checking account pays the invoice (it opens there in "Pagar fatura").
    card: {
      limitCents: 550_000,
      closingDay: 17,
      dueDay: 25,
      paymentAccountId: checking,
    },
  });

  // History ----------------------------------------------------------------------
  const expense = (
    description: string,
    category: string,
    amountCents: number,
    date: LocalDate,
    accountId = checking,
    extra: Partial<Parameters<typeof createTransaction>[1]> = {},
  ) =>
    compare(date, start) >= 0
      ? createTransaction(ctx, {
          kind: "expense",
          amountCents,
          accountId,
          categoryId: cat(category),
          description,
          occurredOn: iso(date),
          ...extra,
        })
      : Promise.resolve({ ids: [] });
  const income = (
    description: string,
    category: string,
    amountCents: number,
    date: LocalDate,
    accountId = checking,
  ) =>
    createTransaction(ctx, {
      kind: "income",
      amountCents,
      accountId,
      categoryId: cat(category),
      description,
      occurredOn: iso(date),
    });

  // Fixed monthly bills as real recurrences, started 12 months ago.
  await expense(
    "Aluguel",
    "Moradia",
    210_000,
    atDay(start.year, start.month, 15),
    checking,
    {
      recurrence: { freq: "monthly" },
    },
  );
  await expense(
    "Internet",
    "Contas da casa",
    11_990,
    atDay(start.year, start.month, 20),
    checking,
    {
      recurrence: { freq: "monthly" },
    },
  );
  await expense(
    "Curso de inglês",
    "Educação",
    45_000,
    atDay(start.year, start.month, 10),
    checking,
    { recurrence: { freq: "monthly" } },
  );
  await expense(
    "Academia",
    "Saúde",
    11_990,
    atDay(start.year, start.month, 5),
    card,
    { recurrence: { freq: "monthly" } },
  );
  await expense(
    "Streaming",
    "Assinaturas",
    4_490,
    atDay(start.year, start.month, 16),
    card,
    {
      recurrence: { freq: "monthly" },
    },
  );

  const next = random(2026);
  const between = (min: number, max: number) =>
    Math.round((min + (max - min) * next()) / 10) * 10;

  for (let k = 0; k <= 12; k++) {
    const month = addMonths(toYearMonth(start), k);
    const day = (d: number) => atDay(month.year, month.month, d);
    const due = (d: LocalDate) => compare(d, today) <= 0;
    const add = async (date: LocalDate, task: () => Promise<unknown>) => {
      if (due(date)) await task();
    };

    await add(day(1), () =>
      income(
        "Rendimentos da reserva",
        "Rendimentos",
        between(14_000, 18_000),
        day(1),
        reserve,
      ),
    );
    await add(day(7), () => income("Salário", "Salário", 720_000, day(7)));
    await add(day(1), () =>
      createTransfer(ctx, {
        fromAccountId: checking,
        toAccountId: wallet,
        amountCents: 3_000,
        occurredOn: iso(day(1)),
        description: "Saque",
      }),
    );
    await add(day(8), () =>
      createTransfer(ctx, {
        fromAccountId: checking,
        toAccountId: reserve,
        amountCents: 120_000,
        occurredOn: iso(day(8)),
      }),
    );
    if (k % 3 === 2)
      await add(day(28), () =>
        income("Freelance", "Freelance", 65_000, day(28)),
      );
    if (month.month === 12)
      await add(day(18), () =>
        income("13º salário", "Salário", 720_000, day(18)),
      );

    await add(day(12), () =>
      expense(
        "Conta de luz",
        "Contas da casa",
        between(14_000, 24_000),
        day(12),
      ),
    );
    await add(day(2), () =>
      expense("Supermercado", "Mercado", between(26_000, 32_000), day(2)),
    );
    await add(day(9), () =>
      expense("Hortifruti", "Feira", between(7_000, 11_000), day(9)),
    );
    await add(day(16), () =>
      expense("Supermercado", "Mercado", between(18_000, 26_000), day(16)),
    );
    await add(day(24), () =>
      expense("Atacado", "Mercado", between(9_000, 20_000), day(24)),
    );
    const isCurrentMonth = k === 12;
    if (!isCurrentMonth)
      await add(day(5), () =>
        expense(
          "Posto de combustível",
          "Transporte",
          between(14_000, 18_000),
          day(5),
          card,
        ),
      );
    for (const d of [3, 11, 19, 27]) {
      await add(day(d), () =>
        expense(
          "Corrida por app",
          "Transporte",
          between(1_800, 3_800),
          day(d),
          card,
        ),
      );
    }
    for (const d of [4, 11, 18, 25]) {
      const name = d === 18 ? "Delivery" : "Restaurante";
      await add(day(d), () =>
        expense(name, "Restaurantes", between(4_500, 14_000), day(d), card),
      );
    }
    await add(day(6), () =>
      expense("Farmácia", "Saúde", between(2_500, 7_000), day(6), card),
    );
    await add(day(12), () =>
      expense("Pet shop", "Pets", between(9_000, 16_000), day(12), card),
    );
    await add(day(22), () =>
      expense(
        "Salão",
        "Cuidados pessoais",
        between(6_000, 9_000),
        day(22),
        card,
      ),
    );
    await add(day(10), () =>
      expense("Cinema", "Lazer", between(6_000, 12_000), day(10)),
    );
    await add(day(21), () =>
      expense("Padaria", "Padaria", between(1_500, 4_000), day(21), wallet),
    );
    if (month.month === 7) {
      await add(day(14), () =>
        expense("Passagens e hotel", "Viagem", 495_000, day(14), card, {
          installments: 5,
        }),
      );
    }
    if (month.month === 12)
      await add(day(20), () =>
        expense(
          "Presentes de Natal",
          "Presentes e doações",
          62_000,
          day(20),
          card,
        ),
      );
    if (month.month === 1)
      await add(day(15), () =>
        expense("IPVA", "Impostos e taxas", 128_000, day(15)),
      );
    if (k % 4 === 1)
      await add(day(13), () =>
        expense("Roupas", "Compras", between(15_000, 35_000), day(13), card),
      );
  }

  // Tênis em 6x, comprado há ~40 dias.
  const purchase = addDays(today, -41);
  await expense("Tênis de corrida", "Compras", 59_988, purchase, card, {
    installments: 6,
  });

  // A bill due next Saturday (1 to 7 days ahead): the non-business day note
  // of the Início, the Extrato and the detail (the flag is on for Ana).
  const saturday = addDays(today, (6 - dayOfWeek(today) + 7) % 7 || 7);
  await expense("Condomínio", "Moradia", 68_000, saturday);

  // Card invoices paid on their due date (the current one stays open).
  for (const invoice of await listInvoices(ctx, card)) {
    if (invoice.dueDate <= ctx.todayIso && invoice.outstandingCents > 0) {
      await payInvoice(ctx, {
        invoiceId: invoice.id,
        fromAccountId: checking,
        amountCents: invoice.outstandingCents,
        occurredOn: invoice.dueDate,
      });
    }
  }
  // A freelance payment still to come this month.
  const endOfMonth = monthEnd(toYearMonth(today));
  const freelanceDay = addDays(today, 10);
  if (compare(freelanceDay, endOfMonth) <= 0) {
    await income("Freelance", "Freelance", 65_000, freelanceDay);
  }

  await setCategoryArchived(userId, cat("Padaria"), true);

  // Budgets for this month and the previous one ---------------------------------
  const budgets: [string, number][] = [
    ["Moradia", 210_000],
    ["Mercado", 90_000],
    ["Restaurantes", 40_000],
    ["Transporte", 45_000],
    ["Lazer", 35_000],
    ["Saúde", 30_000],
  ];
  for (const offset of [-1, 0]) {
    const month = addMonths(toYearMonth(today), offset);
    const label = `${month.year}-${String(month.month).padStart(2, "0")}`;
    for (const [name, cents] of budgets) {
      await upsertBudget(ctx, {
        categoryId: cat(name),
        month: label,
        amountCents: cents,
      });
    }
  }

  // Goals -------------------------------------------------------------------------
  const inMonths = (count: number) => {
    const month = addMonths(toYearMonth(today), count);
    return iso(monthEnd(month));
  };
  await db.insert(goals).values([
    {
      userId,
      name: "Reserva de emergência",
      icon: "shield-check",
      color: "cat-3",
      targetCents: 3_000_000,
      targetDate: null,
      accountId: reserve,
      initialCents: 0,
      monthlyPlanCents: 100_000,
      expectedRate: { index: "cdi", pct: 1.02 },
    },
    {
      userId,
      name: "Viagem ao Japão",
      icon: "plane",
      color: "cat-1",
      targetCents: 2_500_000,
      targetDate: inMonths(14),
      accountId: null,
      initialCents: 950_000,
      monthlyPlanCents: 80_000,
      expectedRate: { index: "cdi", pct: 1 },
    },
    {
      userId,
      name: "Troca do carro",
      icon: "car",
      color: "cat-4",
      targetCents: 4_000_000,
      targetDate: inMonths(38),
      accountId: null,
      initialCents: 420_000,
      monthlyPlanCents: 90_000,
      expectedRate: { index: "ipca", spread: 0.06 },
    },
  ]);

  // Market rates (as the daily cron would sync them) ------------------------------
  const rates = [];
  for (let k = 0; k < 12; k++) {
    const month = addMonths(toYearMonth(today), -k - 1);
    rates.push({
      index: "ipca" as const,
      refDate: iso(atDay(month.year, month.month, 1)),
      value: "0.36700000",
    });
  }
  rates.push({
    index: "cdi" as const,
    refDate: ctx.todayIso,
    value: "13.65000000",
  });
  rates.push({
    index: "selic" as const,
    refDate: ctx.todayIso,
    value: "13.75000000",
  });
  await db.insert(marketRates).values(rates).onConflictDoNothing();

  const origin = new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000")
    .origin;
  const inviteUrl = await seedPeople({ id: userId, name: "Ana" }, origin);

  // Tips -----------------------------------------------------------------------
  // Off for every account (Ana, Bruno and the pending invite) with --sem-dicas.
  const tipsOff = process.argv.includes("--sem-dicas");
  if (tipsOff) {
    const people = await db.select({ id: user.id }).from(user);
    for (const person of people) await setTipsOff(person.id, true);
  }

  await closeDatabase();

  console.log("");
  console.log("Demo pronta! Agora rode: npm run dev");
  console.log(`  Endereço: ${origin}`);
  console.log(
    tipsOff
      ? "  Dicas:    desligadas (religue em Ajustes › Preferências)"
      : "  Dicas:    ligadas, como num primeiro acesso",
  );
  console.log("");
  console.log("  Ana · administradora");
  console.log(`    E-mail: ${ownerEmail}`);
  console.log(`    Senha:  ${DEMO_PASSWORD}`);
  console.log("  Bruno · usuário comum, com as próprias finanças");
  console.log(`    E-mail: ${BRUNO_EMAIL}`);
  console.log(`    Senha:  ${BRUNO_PASSWORD}`);
  console.log("  Carla · convite pendente (vale 72 horas, uma vez só)");
  console.log(`    ${inviteUrl}`);
  if (created) {
    console.log("");
    console.log(`  (${ENV_FILE} criado com segredos locais novos)`);
  }
  console.log("");
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * What the bell lists for Ana: today's "Contas a vencer" (unread, naming the
 * pending Condomínio, so "Marcar como pago" shows), yesterday's weekly summary
 * (read), a monthly summary from 10 days ago (read) and a dismissed notice
 * (kept in the table, off the list).
 */
async function seedNotifications(
  userId: string,
  ago: (days: number, hours?: number) => Date,
): Promise<void> {
  const ctx = await getUserContext(userId);
  const [bill] = await db
    .select({ id: transactions.id, dueOn: transactions.occurredOn })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.description, "Condomínio"),
        eq(transactions.status, "pending"),
      ),
    )
    .limit(1);
  const day = (offset: number) => iso(addDays(ctx.today, offset));
  const rows: (typeof notifications.$inferInsert)[] = [];
  if (bill) {
    rows.push({
      userId,
      type: "bills_due",
      dedupeKey: `bills_due:${ctx.todayIso}`,
      payload: {
        type: "bills_due",
        date: ctx.todayIso,
        title: "Condomínio vence em dia não útil",
        body: "Condomínio (R$ 680,00): o pagamento costuma passar para segunda.",
        url: "/extrato?status=pendente",
        itemKeys: [`t:${bill.id}:${bill.dueOn}`],
        amounts: true,
      },
      createdAt: ago(0),
    });
  }
  rows.push(
    {
      userId,
      type: "weekly_summary",
      dedupeKey: `weekly_summary:${day(-1)}`,
      payload: {
        type: "weekly_summary",
        date: day(-1),
        title: "Sua semana",
        body: "Você gastou 8% menos que na semana anterior.",
        url: "/relatorios/calendario",
        amounts: false,
      },
      readAt: ago(1),
      createdAt: ago(1),
    },
    {
      userId,
      type: "monthly_summary",
      dedupeKey: `monthly_summary:${day(-10)}`,
      payload: {
        type: "monthly_summary",
        date: day(-10),
        title: "Resumo do mês",
        body: "O mês fechou com sobra de R$ 1.240,00.",
        url: "/relatorios/visao-geral",
        amounts: true,
      },
      readAt: ago(10),
      createdAt: ago(10),
    },
    {
      userId,
      type: "daily_summary",
      dedupeKey: `daily_summary:${day(-3)}`,
      payload: {
        type: "daily_summary",
        date: day(-3),
        title: "Resumo do dia",
        body: "Tudo em dia por aqui.",
        url: "/inicio",
        amounts: false,
      },
      readAt: ago(3),
      dismissedAt: ago(3),
      createdAt: ago(3),
    },
  );
  await db.insert(notifications).values(rows);
}

/**
 * Administração (doc 01 §11.9): besides Ana, the administrator, a regular
 * account with a little data of its own (Bruno, who accepted his invite a
 * while ago) and a pending invite (Carla), plus the activity that led there.
 * Returns Carla's invite link, the only time its token exists.
 */
async function seedPeople(
  admin: { id: string; name: string },
  origin: string,
): Promise<string> {
  const now = Date.now();
  const ago = (days: number, hours = 0) =>
    new Date(now - days * DAY_MS - hours * 60 * 60 * 1000);

  // Bruno: invited 12 days ago, accepted the next day ----------------------
  const brunoId = randomBytes(16).toString("hex");
  await db.insert(user).values({
    id: brunoId,
    name: "Bruno Lima",
    email: BRUNO_EMAIL,
    emailVerified: false,
    role: "user",
    createdAt: ago(12, 3),
    updatedAt: ago(11),
  });
  await db.insert(account).values({
    id: randomBytes(16).toString("hex"),
    accountId: brunoId,
    providerId: "credential",
    userId: brunoId,
    password: await hashPassword(BRUNO_PASSWORD),
    createdAt: ago(11),
    updatedAt: ago(11),
  });
  const brunoInvite = createAccessToken();
  await db.insert(accessLinks).values({
    userId: brunoId,
    purpose: "invite",
    selector: brunoInvite.selector,
    verifierHash: brunoInvite.verifierHash,
    createdBy: admin.id,
    createdAt: ago(12, 3),
    expiresAt: new Date(ago(12, 3).getTime() + ACCESS_LINK_TTL_MS),
    usedAt: ago(11),
  });
  await ensureOwnerDefaults(brunoId);
  await db
    .update(userSettings)
    .set({ onboardingDoneAt: ago(11) })
    .where(eq(userSettings.userId, brunoId));
  // Last seen two days ago on his phone.
  await db.insert(session).values({
    id: randomBytes(16).toString("hex"),
    token: randomBytes(32).toString("base64url"),
    userId: brunoId,
    createdAt: ago(11),
    updatedAt: ago(2, 5),
    expiresAt: new Date(ago(2, 5).getTime() + 30 * DAY_MS),
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36",
  });

  const brunoCtx = await getUserContext(brunoId);
  const brunoCategories = new Map(
    (
      await db
        .select({ id: categories.id, name: categories.name })
        .from(categories)
        .where(eq(categories.userId, brunoId))
    ).map((row) => [row.name, row.id]),
  );
  const checking = await createAccount(brunoId, {
    name: "Conta corrente",
    type: "checking",
    initialBalanceCents: 120_000,
    color: "cat-6",
  });
  const today = brunoCtx.today;
  const thisMonth = (day: number) => {
    const date = atDay(today.year, today.month, Math.min(day, today.day));
    return iso(date);
  };
  for (const [kind, description, category, cents, day] of [
    ["income", "Salário", "Salário", 450_000, 5],
    ["expense", "Aluguel", "Moradia", 140_000, 6],
    ["expense", "Supermercado", "Mercado", 32_050, 9],
    ["expense", "Restaurante", "Restaurantes", 8_690, 12],
    ["expense", "Farmácia", "Saúde", 4_250, 14],
  ] as const) {
    await createTransaction(brunoCtx, {
      kind,
      amountCents: cents,
      accountId: checking,
      categoryId: brunoCategories.get(category) ?? null,
      description,
      occurredOn: thisMonth(day),
    });
  }
  // Importar extrato turned off for Bruno only (a per-person flag), and the
  // notifications, the customizable Início and the non-business day alert
  // (off by default) on for Ana, so the demo shows them. The notification
  // center (the bell) is on for Ana and Bruno.
  await db.insert(featureFlagOverrides).values([
    {
      userId: brunoId,
      key: "importar_extrato",
      enabled: false,
      updatedBy: admin.id,
      updatedAt: ago(6),
    },
    {
      userId: admin.id,
      key: "notificacoes_push",
      enabled: true,
      updatedBy: admin.id,
      updatedAt: ago(6),
    },
    {
      userId: admin.id,
      key: "inicio_personalizavel",
      enabled: true,
      updatedBy: admin.id,
      updatedAt: ago(0),
    },
    {
      userId: admin.id,
      key: "alerta_dia_nao_util",
      enabled: true,
      updatedBy: admin.id,
      updatedAt: ago(0),
    },
    {
      userId: admin.id,
      key: "central_notificacoes",
      enabled: true,
      updatedBy: admin.id,
      updatedAt: ago(0),
    },
    {
      userId: brunoId,
      key: "central_notificacoes",
      enabled: true,
      updatedBy: admin.id,
      updatedAt: ago(0),
    },
    // Finanças compartilhadas, for the two of them (the group "Casa").
    {
      userId: admin.id,
      key: "financas_compartilhadas",
      enabled: true,
      updatedBy: admin.id,
      updatedAt: ago(0),
    },
    {
      userId: brunoId,
      key: "financas_compartilhadas",
      enabled: true,
      updatedBy: admin.id,
      updatedAt: ago(0),
    },
  ]);
  await seedNotifications(admin.id, ago);

  // Carla: invited yesterday, still pending -------------------------------------
  const carlaId = randomBytes(16).toString("hex");
  await db.insert(user).values({
    id: carlaId,
    name: "Carla Mendes",
    email: "carla@meu-finan.local",
    emailVerified: false,
    role: "user",
    createdAt: ago(1),
    updatedAt: ago(1),
  });
  const carlaInvite = createAccessToken();
  await db.insert(accessLinks).values({
    userId: carlaId,
    purpose: "invite",
    selector: carlaInvite.selector,
    verifierHash: carlaInvite.verifierHash,
    createdBy: admin.id,
    createdAt: ago(1),
    expiresAt: new Date(ago(1).getTime() + ACCESS_LINK_TTL_MS),
  });

  // Activity, oldest first (ids are time-ordered) --------------------------------
  const bruno = { id: brunoId, name: "Bruno Lima", email: BRUNO_EMAIL };
  const carla = {
    id: carlaId,
    name: "Carla Mendes",
    email: "carla@meu-finan.local",
  };
  const entries: (typeof auditLog.$inferInsert)[] = [
    {
      action: "setup.completed",
      actorId: admin.id,
      actorName: admin.name,
      metadata: { role: "admin" },
      createdAt: ago(395),
    },
    {
      action: "user.created",
      actorId: admin.id,
      actorName: admin.name,
      targetUserId: bruno.id,
      targetName: bruno.name,
      targetEmail: bruno.email,
      metadata: { role: "user" },
      createdAt: ago(12, 3),
    },
    {
      action: "access_link.accepted",
      actorId: bruno.id,
      actorName: bruno.name,
      targetUserId: bruno.id,
      targetName: bruno.name,
      targetEmail: bruno.email,
      metadata: { purpose: "invite" },
      createdAt: ago(11),
    },
    {
      action: "flag.user_set",
      actorId: admin.id,
      actorName: admin.name,
      targetUserId: bruno.id,
      targetName: bruno.name,
      targetEmail: bruno.email,
      metadata: { flag: "importar_extrato", value: false },
      createdAt: ago(6),
    },
    {
      action: "user.created",
      actorId: admin.id,
      actorName: admin.name,
      targetUserId: carla.id,
      targetName: carla.name,
      targetEmail: carla.email,
      metadata: { role: "user" },
      createdAt: ago(1),
    },
  ];
  for (const entry of entries) await db.insert(auditLog).values(entry);

  await seedSharing(admin.id, brunoId, carla.email);

  return accessLinkUrl(origin, carlaInvite.token);
}

/**
 * Finanças compartilhadas (ADR-13), through the domain as the screens would:
 * "Casa" (Ana owns it, Bruno accepted) with 8 expenses over this month and
 * the last, one in each way to divide, and a settlement last month; an
 * invite from Ana to Carla still open; "Viagem", Bruno's, inviting Ana
 * (her "Convites para você"); and in "Casa" the shared box "Viagem para
 * Salvador" (see seedSharedBox).
 */
async function seedSharing(
  anaId: string,
  brunoId: string,
  carlaEmail: string,
): Promise<void> {
  const ana = await getUserContext(anaId);
  const bruno = await getUserContext(brunoId);
  const casa = uuidv7();
  await createGroup(ana, { id: casa, name: "Casa", emails: [BRUNO_EMAIL] });
  const [brunoMember] = await db
    .select({ id: shareMembers.id })
    .from(shareMembers)
    .where(
      and(eq(shareMembers.groupId, casa), eq(shareMembers.userId, brunoId)),
    );
  if (!brunoMember) throw new Error("Convite do Bruno ausente.");
  await respondToInvite(bruno, brunoMember.id, "accept");
  const group = await getGroup(ana, casa);
  const a = group.me.id;
  const b = brunoMember.id;

  const today = ana.today;
  const month = toYearMonth(today);
  const last = addMonths(month, -1);
  const on = (ym: { year: number; month: number }, day: number) =>
    iso(atDay(ym.year, ym.month, Math.min(day, ym === month ? today.day : 28)));
  const expensesOf = (ym: { year: number; month: number }) => [
    {
      id: uuidv7(),
      description: "Aluguel",
      amountCents: 250_000,
      occurredOn: on(ym, 5),
      paidByMemberId: a,
      method: "percent" as const,
      inputs: [
        { memberId: a, value: 6_000 },
        { memberId: b, value: 4_000 },
      ],
    },
    {
      id: uuidv7(),
      description: "Mercado do mês",
      amountCents: 61_840,
      occurredOn: on(ym, 8),
      paidByMemberId: b,
      method: "equal" as const,
      inputs: [
        { memberId: a, value: 1 },
        { memberId: b, value: 1 },
      ],
    },
    {
      id: uuidv7(),
      description: "Internet",
      amountCents: 12_000,
      occurredOn: on(ym, 10),
      paidByMemberId: b,
      method: "amounts" as const,
      inputs: [
        { memberId: a, value: 8_000 },
        { memberId: b, value: 4_000 },
      ],
    },
    {
      id: uuidv7(),
      description: "Luz",
      amountCents: 21_330,
      occurredOn: on(ym, 2),
      paidByMemberId: a,
      method: "shares" as const,
      inputs: [
        { memberId: a, value: 2 },
        { memberId: b, value: 1 },
      ],
    },
  ];
  await addSharedExpenses(ana, casa, expensesOf(last));
  // Bruno settled what he owed last month.
  const owed = (await getGroup(bruno, casa)).transfers[0];
  if (owed && owed.amountCents < 0) {
    await settleUp(bruno, casa, {
      id: uuidv7(),
      withMemberId: a,
      amountCents: -owed.amountCents,
      expectedCents: owed.amountCents,
      occurredOn: iso(atDay(last.year, last.month, 28)),
    });
  }
  await addSharedExpenses(ana, casa, expensesOf(month));

  await seedSharedBox(ana, bruno, casa);
  await inviteToGroup(ana, casa, [carlaEmail]);
  await createGroup(bruno, {
    id: uuidv7(),
    name: "Viagem",
    emails: [
      (
        await db
          .select({ email: user.email })
          .from(user)
          .where(eq(user.id, anaId))
      )[0]?.email ?? "",
    ],
  });
  // Ana's bell keeps only the 3 notices of seedNotifications (the specs of
  // the bell count them): what the group wrote to her is dismissed, and so
  // is what the shared box wrote to Bruno. The invite itself still shows in
  // Compartilhado.
  const now = new Date();
  const mine = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      userId: notifications.userId,
    })
    .from(notifications);
  for (const row of mine) {
    const fromGroup =
      row.userId === anaId &&
      (row.type.startsWith("share") || row.type.startsWith("box_"));
    const fromBox = row.userId === brunoId && row.type.startsWith("box_");
    if (!fromGroup && !fromBox) continue;
    await db
      .update(notifications)
      .set({ readAt: now, dismissedAt: now })
      .where(eq(notifications.id, row.id));
  }
}

/**
 * "Viagem para Salvador" in "Casa": R$ 8.000 until jun/2027; Ana saved
 * R$ 1.800 (R$ 400/mês), each time also moving it from her checking account
 * to a caixinha of her own; Bruno R$ 1.100 (R$ 300/mês), only in the group.
 */
async function seedSharedBox(
  ana: Awaited<ReturnType<typeof getUserContext>>,
  bruno: Awaited<ReturnType<typeof getUserContext>>,
  groupId: string,
): Promise<void> {
  const [checking] = await db
    .select({ id: finAccounts.id })
    .from(finAccounts)
    .where(
      and(eq(finAccounts.userId, ana.userId), eq(finAccounts.type, "checking")),
    )
    .limit(1);
  if (!checking) throw new Error("Conta corrente da Ana ausente.");
  const anaBox = await createAccount(ana.userId, {
    name: "Caixinha Viagem",
    type: "savings_box",
    initialBalanceCents: 0,
  });
  const boxId = uuidv7();
  await createBox(ana, groupId, {
    id: boxId,
    name: "Viagem para Salvador",
    icon: "plane",
    color: "cat-6",
    targetCents: 800_000,
    targetDate: `${ana.today.year + 1}-06-30`,
    expectedRate: null,
  });
  const month = toYearMonth(ana.today);
  const dayIn = (offset: number, day: number) => {
    const ym = addMonths(month, offset);
    const date = atDay(ym.year, ym.month, day);
    return iso(compare(date, ana.today) > 0 ? ana.today : date);
  };
  for (const offset of [-2, -1, 0]) {
    await contribute(ana, boxId, {
      id: uuidv7(),
      amountCents: 60_000,
      occurredOn: dayIn(offset, 5),
      fromAccountId: checking.id,
      toBoxAccountId: anaBox,
    });
  }
  for (const [offset, cents] of [
    [-1, 50_000],
    [0, 60_000],
  ] as const) {
    await contribute(bruno, boxId, {
      id: uuidv7(),
      amountCents: cents,
      occurredOn: dayIn(offset, 10),
    });
  }
  await setMyPlan(ana, boxId, 40_000);
  await setMyPlan(bruno, boxId, 30_000);
}

main().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  await closeDatabase().catch(() => {});
  process.exit(1);
});
