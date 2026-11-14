// Retrospectiva do mês (doc 02 §6.12): what the closed month tells, against a
// real (in-memory) Postgres, on 14/nov/2026 (the last closed month is outubro).
import { beforeAll, describe, expect, it, vi } from "vitest";
import { iso, parse } from "@/lib/finance/dates";

vi.mock("server-only", () => ({}));
process.env.DATABASE_URL = "pglite:memory";

type Domain = {
  accounts: typeof import("./accounts");
  categories: typeof import("./categories");
  closing: typeof import("./month-closing");
  context: typeof import("./context");
  dashboard: typeof import("./dashboard");
  recap: typeof import("./month-recap");
  transactions: typeof import("./transactions");
};

let d: Domain;
let db: typeof import("../db/client").db;
let schema: typeof import("../db/schema");

// 14/nov/2026, 12:00 in São Paulo.
const NOW = Date.UTC(2026, 10, 14, 15, 0, 0);
const ctxOf = async (
  userId: string,
  over: { monthStartDay?: number; todayIso?: string } = {},
) => {
  const base = await d.context.getUserContext(userId, { now: NOW });
  const today = over.todayIso ? parse(over.todayIso) : base.today;
  return {
    ...base,
    ...(over.monthStartDay ? { monthStartDay: over.monthStartDay } : {}),
    today,
    todayIso: iso(today),
  };
};

async function person(id: string) {
  await db
    .insert(schema.user)
    .values({ id, name: id, email: `${id}@exemplo.com` });
  const { ensureOwnerDefaults } = await import("../db/seed-defaults");
  await ensureOwnerDefaults(id);
}

const account = (id: string, name = "Conta") =>
  d.accounts.createAccount(id, {
    name,
    type: "checking",
    initialBalanceCents: 10_000_000,
  });

const category = (id: string, name: string, parentId: string | null = null) =>
  d.categories.createCategory(id, {
    kind: "expense",
    name,
    icon: "house",
    color: "cat-1",
    parentId,
  });

let seq = 0;
async function entry(
  id: string,
  accountId: string,
  kind: "expense" | "income",
  amountCents: number,
  occurredOn: string,
  extra: Record<string, unknown> = {},
) {
  seq += 1;
  const created = await d.transactions.createTransaction(await ctxOf(id), {
    kind,
    accountId,
    categoryId: null,
    amountCents,
    occurredOn,
    description: `Lançamento ${seq}`,
    paid: true,
    ...extra,
  });
  const [first] = created.ids;
  if (!first) throw new Error("sem lançamento");
  return first;
}

const spend = (
  id: string,
  accountId: string,
  amountCents: number,
  occurredOn: string,
  extra: Record<string, unknown> = {},
) => entry(id, accountId, "expense", amountCents, occurredOn, extra);

async function recap(id: string, month: string | null = null) {
  const ctx = await ctxOf(id);
  const { range } = d.closing.closingRange(ctx, month);
  return d.recap.monthRecap(ctx, range);
}

const PEOPLE = [
  "ana",
  "bia",
  "caio",
  "dora",
  "eva",
  "fabio",
  "gil",
  "hugo",
  "iris",
  "joao",
  "kemi",
  "lia",
  "eva2",
];

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  ({ db } = await import("../db/client"));
  await migrate(db as never, { migrationsFolder: "drizzle" });
  schema = await import("../db/schema");
  d = {
    accounts: await import("./accounts"),
    categories: await import("./categories"),
    closing: await import("./month-closing"),
    context: await import("./context"),
    dashboard: await import("./dashboard"),
    recap: await import("./month-recap"),
    transactions: await import("./transactions"),
  };
  for (const id of PEOPLE) await person(id);
}, 120_000);

describe("monthRecap", () => {
  it("is null while the month has not closed", async () => {
    await account("ana");
    const ctx = await ctxOf("ana");
    const running = d.context.resolvePeriod(ctx, "2026-11");
    expect(await d.recap.monthRecap(ctx, running)).toBeNull();
  });

  it("cuts the ranking at 5 categories and sums the rest", async () => {
    const acc = await account("bia");
    const sizes = [70_000, 60_000, 50_000, 40_000, 30_000, 20_000, 10_000];
    for (const [index, cents] of sizes.entries()) {
      const id = await category("bia", `Cat ${index}`);
      await spend("bia", acc, cents, "2026-10-10", { categoryId: id });
    }
    const result = await recap("bia");
    expect(result?.categories.items).toHaveLength(5);
    expect(result?.categories.items.map((item) => item.cents)).toEqual([
      70_000, 60_000, 50_000, 40_000, 30_000,
    ]);
    expect(result?.categories).toMatchObject({
      totalCents: 280_000,
      othersCount: 2,
      othersCents: 30_000,
    });
  });

  it("adds a subcategory to its main category", async () => {
    const acc = await account("caio");
    const parent = await category("caio", "Reforma");
    const child = await category("caio", "Condomínio", parent);
    await spend("caio", acc, 80_000, "2026-10-05", { categoryId: parent });
    await spend("caio", acc, 20_000, "2026-10-06", { categoryId: child });
    const result = await recap("caio");
    expect(result?.categories.items).toHaveLength(1);
    expect(result?.categories.items[0]).toMatchObject({
      name: "Reforma",
      cents: 100_000,
    });
    expect(result?.categories.othersCount).toBe(0);
    expect(result?.categories.othersCents).toBe(0);
  });

  it("takes the biggest expense of the month, not of the week, and skips pending, transfers and income", async () => {
    const acc = await account("dora");
    const other = await account("dora", "Poupança");
    const winner = await spend("dora", acc, 90_000, "2026-10-03");
    await spend("dora", acc, 50_000, "2026-10-25");
    await spend("dora", acc, 800_000, "2026-10-15", { paid: false });
    await entry("dora", acc, "income", 900_000, "2026-10-02");
    await d.transactions.createTransfer(await ctxOf("dora"), {
      fromAccountId: acc,
      toAccountId: other,
      amountCents: 700_000,
      occurredOn: "2026-10-04",
    });
    // Outside the month (the first days of the next one, and September).
    await spend("dora", acc, 950_000, "2026-11-02");
    await spend("dora", acc, 960_000, "2026-09-30");
    const result = await recap("dora");
    expect(result?.biggest?.id).toBe(winner);
    expect(result?.biggest?.amountCents).toBe(-90_000);
  });

  it("has no biggest expense in a month without spending", async () => {
    const acc = await account("eva");
    await entry("eva", acc, "income", 100_000, "2026-10-02");
    const result = await recap("eva");
    expect(result?.biggest).toBeNull();
    expect(result?.categories.items).toEqual([]);
    expect(result?.days.every((day) => day.paidCents === 0)).toBe(true);
  });

  it("lists every day of the month with what was paid, pending left out", async () => {
    const acc = await account("fabio");
    await spend("fabio", acc, 10_000, "2026-10-01");
    await spend("fabio", acc, 5_000, "2026-10-01");
    await spend("fabio", acc, 7_000, "2026-10-31");
    await spend("fabio", acc, 99_000, "2026-10-20", { paid: false });
    const result = await recap("fabio");
    expect(result?.days).toHaveLength(31);
    expect(result?.days[0]).toEqual({ date: "2026-10-01", paidCents: 15_000 });
    expect(result?.days[30]).toEqual({ date: "2026-10-31", paidCents: 7_000 });
    expect(result?.days.find((day) => day.date === "2026-10-20")).toEqual({
      date: "2026-10-20",
      paidCents: 0,
    });
  });

  it("follows a financial month that starts on the 5th", async () => {
    const acc = await account("gil");
    const inside = await spend("gil", acc, 30_000, "2026-11-03");
    await spend("gil", acc, 90_000, "2026-10-04");
    const ctx = await ctxOf("gil", { monthStartDay: 5 });
    const { range } = d.closing.closingRange(ctx, null);
    const result = await d.recap.monthRecap(ctx, range);
    expect(result?.closing.month).toBe("2026-10");
    expect(result?.biggest?.id).toBe(inside);
    expect(result?.days[0]?.date).toBe("2026-10-05");
    expect(result?.days).toHaveLength(31);
  });

  it("never reads another person's entries", async () => {
    const mine = await account("hugo");
    const theirs = await account("iris");
    await spend("hugo", mine, 1_000, "2026-10-10");
    await spend("iris", theirs, 999_000, "2026-10-10");
    await entry("iris", theirs, "income", 5_000_000, "2026-10-02");
    const result = await recap("hugo");
    expect(result?.biggest?.amountCents).toBe(-1_000);
    expect(result?.categories.totalCents).toBe(1_000);
    expect(result?.closing.incomeCents).toBe(0);
    expect(result?.days.reduce((sum, day) => sum + day.paidCents, 0)).toBe(
      1_000,
    );
  });
});

describe("biggestExpenses with a window", () => {
  it("asks for the given days instead of the last 7", async () => {
    const acc = await account("joao");
    const inside = await spend("joao", acc, 40_000, "2026-10-02");
    await spend("joao", acc, 10_000, "2026-11-13");
    const items = await d.dashboard.biggestExpenses(await ctxOf("joao"), 3, {
      start: "2026-10-01",
      end: "2026-10-31",
    });
    expect(items.map((item) => item.id)).toEqual([inside]);
    const week = await d.dashboard.biggestExpenses(await ctxOf("joao"));
    expect(week.map((item) => item.amountCents)).toEqual([-10_000]);
  });
});

describe("recapInvite", () => {
  const invite = async (id: string, over: Parameters<typeof ctxOf>[1] = {}) =>
    d.recap.recapInvite(await ctxOf(id, over));

  it("invites in the first 7 days of the month, for the month that closed", async () => {
    const acc = await account("kemi");
    await spend("kemi", acc, 10_000, "2026-10-10");
    expect(await invite("kemi", { todayIso: "2026-11-01" })).toEqual({
      month: "2026-10",
    });
    expect(await invite("kemi", { todayIso: "2026-11-07" })).toEqual({
      month: "2026-10",
    });
  });

  it("stops on the 8th and does not invite before the first day", async () => {
    expect(await invite("kemi", { todayIso: "2026-11-08" })).toBeNull();
    expect(await invite("kemi")).toBeNull();
  });

  it("counts the days from the start of a financial month on the 5th", async () => {
    // The month that closed is 5/out to 4/nov; the window is 5/nov to 11/nov.
    const at = (todayIso: string) =>
      ctxOf("kemi", { monthStartDay: 5, todayIso });
    expect(await d.recap.recapInvite(await at("2026-11-04"))).toBeNull();
    expect(await d.recap.recapInvite(await at("2026-11-05"))).toEqual({
      month: "2026-10",
    });
    expect(await d.recap.recapInvite(await at("2026-11-11"))).toEqual({
      month: "2026-10",
    });
    expect(await d.recap.recapInvite(await at("2026-11-12"))).toBeNull();
  });

  it("does not invite when nothing was paid in the month that closed", async () => {
    const acc = await account("eva2");
    await spend("eva2", acc, 10_000, "2026-10-10", { paid: false });
    expect(await invite("eva2", { todayIso: "2026-11-02" })).toBeNull();
  });
});
