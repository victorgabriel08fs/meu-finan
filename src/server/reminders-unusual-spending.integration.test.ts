// "Gasto fora do padrão" (step sendReminders) against a real (in-memory)
// Postgres, with the push service mocked: Saturday 14/nov/2026 is day 14 of
// the financial month, compared with 1..14 of Oct, Sep and Aug. Who gets the
// notice, once per category per month, one notice for several categories,
// the preference, the flag, the bell, giving back, the preview and the
// report.
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { periodViewHref } from "@/components/reports/views";
import { statementHref } from "@/components/transactions/statement-params";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  refresh: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));
const pushService = vi.hoisted(() => ({
  sent: [] as { endpoint: string; body: Record<string, unknown> }[],
  status: new Map<string, number>(),
}));
vi.mock("web-push", () => {
  class WebPushError extends Error {
    readonly body = "";
    constructor(
      message: string,
      readonly statusCode: number,
    ) {
      super(message);
    }
  }
  return {
    WebPushError,
    default: {
      sendNotification: async (target: { endpoint: string }, body: string) => {
        const status = pushService.status.get(target.endpoint);
        if (status) throw new WebPushError("push service error", status);
        pushService.sent.push({
          endpoint: target.endpoint,
          body: JSON.parse(body),
        });
        return { statusCode: 201, body: "", headers: {} };
      },
    },
  };
});
process.env.DATABASE_URL = "pglite:memory";
process.env.VAPID_PUBLIC_KEY =
  "BHo9sGkrAC15LBWdZf8DzB4o5Oce3K2Js_UnloBhFgaD_m5GWx-Z79ffAfiwzHG06Gyz2shMI9viJlceytrQniY";
process.env.VAPID_PRIVATE_KEY = "CirzHWrUhgY50jjnZNdG5uw85M89d44Z-b8WFvJzj2I";

type Modules = {
  db: typeof import("./db/client")["db"];
  schema: typeof import("./db/schema");
  reminders: typeof import("./reminders");
};
let m: Modules;

const KEYS = {
  p256dh:
    "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
  auth: "tBHItJI5svbpez7KI4CCXg",
};
const endpointOf = (userId: string) => `https://web.push.apple.com/${userId}`;
/** 06:15 in São Paulo on a day of November 2026. */
const morningOf = (day: number, month = 10) =>
  new Date(Date.UTC(2026, month, day, 9, 15));
const runAt = (now: Date) =>
  m.reminders.sendDailyReminders({ now, deadline: Date.now() + 60_000 });
const runOn = (day: number) => runAt(morningOf(day));

type Push = { title: string; body: string; tag: string };
const sentTo = (userId: string) =>
  pushService.sent
    .filter((push) => push.endpoint === endpointOf(userId))
    .map((push) => push.body as Push);

const noticesOf = (userId: string) =>
  m.db
    .select({
      dedupeKey: m.schema.notifications.dedupeKey,
      payload: m.schema.notifications.payload,
    })
    .from(m.schema.notifications)
    .where(eq(m.schema.notifications.userId, userId));

const prefs = (showAmounts: boolean, on = true) => ({
  events: {
    daily_summary: false,
    income_countdown: false,
    weekly_summary: false,
    monthly_summary: false,
    bills_due: false,
    non_business_due: false,
    unusual_spending: on,
  },
  billsLeadDays: 1 as const,
  showAmounts,
});

/** A category's spending on day 2 of Nov (now) and of Oct, Sep and Aug. */
const PATTERNS = {
  // Mercado: 820 against an average of 585 (+40.2%, +R$ 235).
  mercado: { name: "Mercado", now: 82_000, before: 58_500 },
  // +R$ 700 / +140%, +R$ 400 / +80%, +R$ 300 / +100%, +R$ 200 / +100%.
  mercadoBig: { name: "Mercado", now: 120_000, before: 50_000 },
  lazer: { name: "Lazer", now: 90_000, before: 50_000 },
  saude: { name: "Saúde", now: 60_000, before: 30_000 },
  pets: { name: "Pets", now: 40_000, before: 20_000 },
  // +19.7%: below the threshold.
  mercadoNear: { name: "Mercado", now: 70_000, before: 58_500 },
} as const;
type Pattern = (typeof PATTERNS)[keyof typeof PATTERNS];

const ids = {
  accounts: new Map<string, string>(),
  categories: new Map<string, string>(),
};
const categoryOf = (userId: string, name: string) => {
  const id = ids.categories.get(`${userId}:${name}`);
  if (!id) throw new Error(`categoria ${name} de ${userId}`);
  return id;
};

async function expense(
  userId: string,
  categoryName: string,
  cents: number,
  occurredOn: string,
) {
  const accountId = ids.accounts.get(userId);
  if (!accountId) throw new Error(`conta de ${userId}`);
  await m.db.insert(m.schema.transactions).values({
    userId,
    accountId,
    categoryId: categoryOf(userId, categoryName),
    kind: "expense",
    status: "paid",
    amountCents: -cents,
    description: "Compra",
    occurredOn,
  });
}

async function seed(
  userId: string,
  pattern: Pattern,
  months: readonly string[] = ["2026-10", "2026-09", "2026-08"],
) {
  await expense(userId, pattern.name, pattern.now, "2026-11-02");
  for (const month of months) {
    await expense(userId, pattern.name, pattern.before, `${month}-02`);
  }
}

const resetNotices = () => m.db.delete(m.schema.notifications);

const PEOPLE = {
  ana: prefs(true),
  bia: prefs(false),
  caio: prefs(true),
  dora: prefs(true, false),
  eva: prefs(true), // no feature flag
  fabio: prefs(true),
  gil: prefs(true),
  hugo: prefs(true), // bell, no device
  iris: prefs(true), // device that fails, no bell
  kemi: prefs(true), // nothing spent
  mel: prefs(true), // next financial month
  nina: prefs(true), // a second category on the next day
  otto: prefs(true), // someone else's spending, never hers
} as const;

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = await import("./db/client");
  await migrate(client.db as never, { migrationsFolder: "drizzle" });
  const schema = await import("./db/schema");
  const { ensureOwnerDefaults } = await import("./db/seed-defaults");
  const { createAccount } = await import("./domain/accounts");
  const { listCategories } = await import("./domain/categories");
  const db = client.db;

  await db.insert(schema.user).values(
    Object.keys(PEOPLE).map((id) => ({
      id,
      name: id,
      email: `${id}@exemplo.com`,
    })),
  );
  for (const [id, notificationPrefs] of Object.entries(PEOPLE)) {
    await ensureOwnerDefaults(id);
    await db
      .update(schema.userSettings)
      .set({ notificationPrefs })
      .where(eq(schema.userSettings.userId, id));
    ids.accounts.set(
      id,
      await createAccount(id, {
        name: "Conta Principal",
        type: "checking",
        initialBalanceCents: 5_000_000,
      }),
    );
    for (const category of await listCategories(id)) {
      ids.categories.set(`${id}:${category.name}`, category.id);
    }
  }
  const flagged = Object.keys(PEOPLE).filter((id) => id !== "eva");
  await db.insert(schema.featureFlagOverrides).values([
    ...flagged.map((userId) => ({
      userId,
      key: "notificacoes_push",
      enabled: true,
    })),
    { userId: "hugo", key: "central_notificacoes", enabled: true },
  ]);
  await db.insert(schema.pushSubscriptions).values(
    Object.keys(PEOPLE)
      .filter((id) => id !== "hugo")
      .map((userId) => ({ userId, endpoint: endpointOf(userId), ...KEYS })),
  );

  m = { db, schema, reminders: await import("./reminders") };

  for (const id of ["ana", "bia", "dora", "eva", "hugo", "iris", "nina"]) {
    await seed(id, PATTERNS.mercado);
  }
  for (const key of ["mercadoBig", "lazer", "saude", "pets"] as const) {
    await seed("caio", PATTERNS[key]);
  }
  await seed("fabio", PATTERNS.mercadoNear);
  // Gil: no spending in August, so there is no pattern.
  await seed("gil", PATTERNS.mercado, ["2026-10", "2026-09"]);
  // Nina's second category: its pattern exists, today's spending comes later.
  for (const month of ["2026-10", "2026-09", "2026-08"]) {
    await expense("nina", "Lazer", 30_000, `${month}-02`);
  }
  // Mel: Nov (now) and the Dec month (day 8) both over the pattern.
  await seed("mel", PATTERNS.mercado);
  await expense("mel", "Mercado", 100_000, "2026-12-02");
  // Otto spends nothing; Ana's Mercado is hers alone.
  await expense("otto", "Lazer", 1_000, "2026-11-02");
}, 120_000);

beforeEach(async () => {
  pushService.sent = [];
  pushService.status.clear();
  await resetNotices();
});

describe("Gasto fora do padrão", () => {
  it("goes out once for a category over its pattern, with the amounts when the person chose to see them", async () => {
    const report = await runOn(14);
    expect(report.errors).toBe(0);
    const [push, ...rest] = sentTo("ana");
    expect(rest).toEqual([]);
    expect(push?.tag).toBe("gasto-fora-do-padrao");
    expect(push?.title).toBe("Mercado está 40% acima da média");
    expect(push?.body.replace(/\s/g, " ")).toBe(
      "R$ 820,00 até hoje, contra R$ 585,00 na média dos 3 meses anteriores até este ponto do mês. Toque para ver os lançamentos.",
    );
  });

  it("has no amounts without 'Mostrar valores'", async () => {
    await runOn(14);
    const [push] = sentTo("bia");
    expect(push?.title).toBe("Mercado está 40% acima da média");
    expect(push?.body).toBe(
      "Comparado aos 3 meses anteriores no mesmo ponto do mês. Toque para ver os lançamentos.",
    );
    expect(push?.body).not.toMatch(/R\$/);
    const [row] = await noticesOf("bia");
    expect(row?.payload).toMatchObject({ amounts: false });
  });

  it("records the day's dedupe key, the category and month, and the statement of the category as the destination", async () => {
    await runOn(14);
    const [row] = await noticesOf("ana");
    expect(row?.dedupeKey).toBe("unusual_spending:2026-11-14");
    const mercado = categoryOf("ana", "Mercado");
    expect(row?.payload).toMatchObject({
      type: "unusual_spending",
      amounts: true,
      itemKeys: [`${mercado}:2026-11`],
      url: statementHref(
        {
          month: "2026-11",
          accountId: null,
          categoryId: mercado,
          kind: "expense",
          status: null,
          q: "",
        },
        "2026-11",
      ),
    });
  });

  it("does not repeat in a second run the same day", async () => {
    await runOn(14);
    pushService.sent = [];
    const second = await runOn(14);
    expect(second.sent.unusual_spending).toBe(0);
    expect(pushService.sent).toEqual([]);
  });

  it("does not announce the same category again the next day", async () => {
    await runOn(14);
    pushService.sent = [];
    const next = await runOn(15);
    expect(next.sent.unusual_spending).toBe(0);
    expect(sentTo("ana")).toEqual([]);
  });

  it("announces another category that passes later in the month, and only that one", async () => {
    await runOn(14);
    pushService.sent = [];
    await expense("nina", "Lazer", 60_000, "2026-11-15");
    await runOn(15);
    const nina = sentTo("nina");
    expect(nina).toHaveLength(1);
    expect(nina[0]?.title).toBe("Lazer está 100% acima da média");
    expect(nina[0]?.body).not.toContain("Mercado");
    const rows = await noticesOf("nina");
    expect(rows).toHaveLength(2);
    const last = rows.find((row) => row.dedupeKey.endsWith(":2026-11-15"));
    expect(last?.payload).toMatchObject({
      itemKeys: [`${categoryOf("nina", "Lazer")}:2026-11`],
    });
  });

  it("announces again in the next financial month", async () => {
    await runOn(14);
    pushService.sent = [];
    const december = await runAt(morningOf(8, 11));
    expect(december.errors).toBe(0);
    const [push] = sentTo("mel");
    // Dec 1..8 (R$ 1.000) against Nov 1..8 (820), Oct (585) and Sep (585).
    expect(push?.title).toBe("Mercado está 51% acima da média");
    const rows = await noticesOf("mel");
    expect(rows.map((row) => row.dedupeKey).sort()).toEqual([
      "unusual_spending:2026-11-14",
      "unusual_spending:2026-12-08",
    ]);
  });

  it("names several categories in one notice, the most over first, and opens the categories report", async () => {
    const report = await runOn(14);
    expect(report.sent.unusual_spending).toBeGreaterThanOrEqual(1);
    const caio = sentTo("caio");
    expect(caio).toHaveLength(1);
    expect(caio[0]?.title).toBe("Mercado está 140% acima da média");
    expect(caio[0]?.body.replace(/\s/g, " ")).toContain(
      "Lazer, Saúde e mais 1 também estão acima da média. Toque para ver as categorias.",
    );
    const [row] = await noticesOf("caio");
    expect(row?.payload).toMatchObject({
      url: periodViewHref("/relatorios/categorias", 1, "2026-11", "2026-11"),
    });
    const keys =
      row?.payload.type === "unusual_spending" ? row.payload.itemKeys : [];
    expect(keys).toEqual(
      ["Mercado", "Lazer", "Saúde", "Pets"].map(
        (name) => `${categoryOf("caio", name)}:2026-11`,
      ),
    );
  });

  it("sends nothing below the thresholds, without a 3-month pattern, before day 7 or with nothing spent", async () => {
    await runOn(14);
    for (const id of ["fabio", "gil", "kemi", "otto"]) {
      expect(sentTo(id), id).toEqual([]);
    }
    pushService.sent = [];
    await resetNotices();
    // 6/nov: E = 6, too early for everyone.
    const early = await runOn(6);
    expect(early.sent.unusual_spending).toBe(0);
    expect(pushService.sent).toEqual([]);
  });

  it("never mixes in another person's spending", async () => {
    await runOn(14);
    // Otto spent only R$ 10; Ana's R$ 820 on Mercado does not reach him.
    expect(sentTo("otto")).toEqual([]);
    expect(await noticesOf("otto")).toEqual([]);
  });

  it("stays off when the person turned it off, and without the notifications flag", async () => {
    await runOn(14);
    expect(sentTo("dora")).toEqual([]);
    expect(sentTo("eva")).toEqual([]);
    expect(await noticesOf("dora")).toEqual([]);
    expect(await noticesOf("eva")).toEqual([]);
  });

  it("keeps it in the bell only when there is no device", async () => {
    const report = await runOn(14);
    expect(report.bellOnly).toBeGreaterThanOrEqual(1);
    expect(sentTo("hugo")).toEqual([]);
    const rows = await noticesOf("hugo");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.payload.type).toBe("unusual_spending");
  });

  it("gives an undelivered notice back (no bell), so the next run sends it and the category is not lost", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    pushService.status.set(endpointOf("iris"), 500);
    const failed = await runOn(14);
    expect(failed.undelivered).toBe(1);
    expect(sentTo("iris")).toEqual([]);
    expect(await noticesOf("iris")).toEqual([]);

    pushService.status.clear();
    await runOn(14);
    expect(sentTo("iris").map((push) => push.title)).toEqual([
      "Mercado está 40% acima da média",
    ]);
  });

  it("counts it in the report, with no ids, names or amounts", async () => {
    const report = await runOn(14);
    expect(report.sent.unusual_spending).toBe(
      pushService.sent.filter(
        (push) => push.body.tag === "gasto-fora-do-padrao",
      ).length,
    );
    expect(report.sent.unusual_spending).toBeGreaterThan(0);
    const text = JSON.stringify(report);
    expect(text).not.toMatch(/R\$/);
    for (const word of ["Mercado", "Lazer", "ana", "caio", "push.apple.com"]) {
      expect(text).not.toContain(word);
    }
    const counts = (value: unknown): boolean =>
      typeof value === "number" ||
      (typeof value === "object" &&
        value !== null &&
        Object.values(value).every(counts));
    expect(counts(report)).toBe(true);
  });
});

describe("preview of Gasto fora do padrão", () => {
  it("sends it to the device with today's data, records nothing, and ignores what was already announced", async () => {
    await runOn(14);
    const rowsBefore = await noticesOf("ana");
    expect(rowsBefore).toHaveLength(1);
    pushService.sent = [];
    const outcome = await m.reminders.previewReminders(
      "ana",
      endpointOf("ana"),
      morningOf(14),
    );
    expect(outcome).toEqual({ built: 1, sent: 1, removed: false });
    const [push] = sentTo("ana");
    expect(push?.tag).toBe("previa-unusual_spending");
    expect(push?.title).toBe("Mercado está 40% acima da média");
    expect(await noticesOf("ana")).toHaveLength(1);
  });

  it("leaves it out when the person turned it off", async () => {
    const outcome = await m.reminders.previewReminders(
      "dora",
      endpointOf("dora"),
      morningOf(14),
    );
    expect(outcome.built).toBe(0);
    expect(sentTo("dora")).toEqual([]);
  });
});

describe("the choice is stored per person", () => {
  it("leaves the saved preference of the person untouched by a run", async () => {
    await runOn(14);
    const [saved] = await m.db
      .select({ prefs: m.schema.userSettings.notificationPrefs })
      .from(m.schema.userSettings)
      .where(eq(m.schema.userSettings.userId, "dora"));
    expect(saved?.prefs?.events?.unusual_spending).toBe(false);
  });
});
