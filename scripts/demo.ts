// Local demo: recreates the embedded database (PGlite) with 13 months of
// realistic data for the owner "Ana" (the persona of the mockups), so the app
// can be explored right after `npm run demo`. Never runs against Neon.
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
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/pglite/migrator";
import {
  addDays,
  addMonths,
  atDay,
  compare,
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
  account,
  accountYield,
  categories,
  goals,
  marketRates,
  user,
  userSettings,
} from "../src/server/db/schema";
import { ensureOwnerDefaults } from "../src/server/db/seed-defaults";
import { createAccount } from "../src/server/domain/accounts";
import { upsertBudget } from "../src/server/domain/budgets";
import { listInvoices, payInvoice } from "../src/server/domain/cards";
import { getUserContext } from "../src/server/domain/context";
import { setTipsOff } from "../src/server/domain/tips";
import {
  createTransaction,
  createTransfer,
} from "../src/server/domain/transactions";

const ENV_FILE = ".env.local";
const DEMO_EMAIL = "demo@meu-finan.local";
const DEMO_PASSWORD = "meu-finan-demo";

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

  // Owner (as /primeiro-acesso would create it) ------------------------------
  const userId = randomBytes(16).toString("hex");
  await db.insert(user).values({
    id: userId,
    name: "Ana",
    email: ownerEmail,
    emailVerified: true,
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
    ).map((row) => [row.name, row.id]),
  );
  const cat = (name: string) => {
    const id = categoryIds.get(name);
    if (!id) throw new Error(`Categoria padrão ausente: ${name}`);
    return id;
  };

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
    card: { limitCents: 550_000, closingDay: 17, dueDay: 25 },
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
      expense("Hortifruti", "Mercado", between(7_000, 11_000), day(9)),
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
      expense("Padaria", "Mercado", between(1_500, 4_000), day(21), wallet),
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

  // Tips -----------------------------------------------------------------------
  const tipsOff = process.argv.includes("--sem-dicas");
  if (tipsOff) await setTipsOff(userId, true);

  await closeDatabase();

  console.log("");
  console.log("Demo pronta! Agora rode: npm run dev");
  console.log("  Endereço: http://localhost:3000");
  console.log(`  E-mail:   ${ownerEmail}`);
  console.log(`  Senha:    ${DEMO_PASSWORD}`);
  console.log(
    tipsOff
      ? "  Dicas:    desligadas (religue em Ajustes › Preferências)"
      : "  Dicas:    ligadas, como num primeiro acesso",
  );
  if (created) console.log(`  (${ENV_FILE} criado com segredos locais novos)`);
  console.log("");
}

main().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  await closeDatabase().catch(() => {});
  process.exit(1);
});
