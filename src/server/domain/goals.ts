// Goals with projections (doc 03 §8). Progress comes from the linked account's
// balance; without one, from the amount the owner keeps up to date by hand.
import { and, asc, eq, isNull } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import {
  type GoalProjection,
  parse,
  projectGoal,
  toMonthlyRate,
  toYearMonth,
} from "@/lib/finance";
import { db } from "@/server/db/client";
import {
  type ColorToken,
  type GoalExpectedRate,
  goals,
} from "@/server/db/schema";
import { listAccounts, requireAccount } from "./accounts";
import type { UserContext } from "./context";
import { DomainError, notFound } from "./errors";
import { getMarketRates, type MarketRates } from "./rates";

export type GoalItem = {
  id: string;
  name: string;
  icon: string;
  color: ColorToken;
  targetCents: number;
  currentCents: number;
  progress: number;
  targetDate: string | null;
  monthlyPlanCents: number;
  expectedRate: GoalExpectedRate | null;
  rateLabel: string;
  accountId: string | null;
  accountName: string | null;
  monthlyRate: number;
  projection: GoalProjection;
};

const percent = (value: number, digits = 2) =>
  new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value * 100);

export function goalMonthlyRate(
  rate: GoalExpectedRate | null,
  market: MarketRates,
): { monthlyRate: number; label: string } {
  if (!rate) return { monthlyRate: 0, label: "sem rendimento" };
  switch (rate.index) {
    case "fixed":
      return {
        monthlyRate: toMonthlyRate({ kind: "annual", value: rate.annual }),
        label: `${percent(rate.annual)}% a.a.`,
      };
    case "cdi":
      return {
        monthlyRate: toMonthlyRate({
          kind: "cdi",
          pct: rate.pct,
          cdiAnnual: market.cdiAnnual,
        }),
        label: `${percent(rate.pct, 0)}% do CDI`,
      };
    case "selic":
      return {
        monthlyRate: toMonthlyRate({
          kind: "cdi",
          pct: rate.pct,
          cdiAnnual: market.selicAnnual,
        }),
        label: `${percent(rate.pct, 0)}% da Selic`,
      };
    case "ipca":
      return {
        monthlyRate: toMonthlyRate({
          kind: "ipca",
          spread: rate.spread,
          ipcaAnnual: market.ipcaAnnual,
        }),
        label: `IPCA + ${percent(rate.spread)}%`,
      };
  }
}

export async function listGoals(ctx: UserContext): Promise<GoalItem[]> {
  const [rows, accounts, market] = await Promise.all([
    db
      .select()
      .from(goals)
      .where(and(eq(goals.userId, ctx.userId), isNull(goals.archivedAt)))
      .orderBy(asc(goals.createdAt)),
    listAccounts(ctx.userId),
    getMarketRates(),
  ]);
  const balances = new Map(accounts.map((account) => [account.id, account]));

  return rows.map((row) => {
    const linked = row.accountId ? balances.get(row.accountId) : undefined;
    const currentCents = linked
      ? Math.max(0, linked.balanceCents)
      : row.initialCents;
    const { monthlyRate, label } = goalMonthlyRate(row.expectedRate, market);
    const projection = projectGoal({
      currentCents,
      targetCents: row.targetCents,
      monthlyCents: row.monthlyPlanCents ?? 0,
      monthlyRate,
      today: toYearMonth(ctx.today),
      targetMonth: row.targetDate
        ? toYearMonth(parse(row.targetDate))
        : undefined,
    });
    return {
      id: row.id,
      name: row.name,
      icon: row.icon,
      color: row.color,
      targetCents: row.targetCents,
      currentCents,
      progress: Math.min(1, currentCents / row.targetCents),
      targetDate: row.targetDate,
      monthlyPlanCents: row.monthlyPlanCents ?? 0,
      expectedRate: row.expectedRate,
      rateLabel: label,
      accountId: row.accountId,
      accountName: linked?.name ?? null,
      monthlyRate,
      projection,
    };
  });
}

export type GoalInput = {
  name: string;
  icon: string;
  color: ColorToken;
  targetCents: number;
  targetDate: string | null;
  accountId: string | null;
  savedCents: number;
  monthlyPlanCents: number;
  expectedRate: GoalExpectedRate | null;
};

async function validate(ctx: UserContext, input: GoalInput) {
  if (!Number.isSafeInteger(input.targetCents) || input.targetCents <= 0) {
    throw new DomainError("O valor da meta precisa ser maior que zero.");
  }
  if (input.targetDate && input.targetDate <= ctx.todayIso) {
    throw new DomainError("O prazo precisa ser uma data futura.");
  }
  if (input.accountId) await requireAccount(db, ctx.userId, input.accountId);
}

export async function createGoal(
  ctx: UserContext,
  input: GoalInput,
): Promise<string> {
  await validate(ctx, input);
  const id = uuidv7();
  await db.insert(goals).values({
    id,
    userId: ctx.userId,
    name: input.name.trim(),
    icon: input.icon,
    color: input.color,
    targetCents: input.targetCents,
    targetDate: input.targetDate,
    accountId: input.accountId,
    initialCents: input.accountId ? 0 : Math.max(0, input.savedCents),
    monthlyPlanCents: input.monthlyPlanCents || null,
    expectedRate: input.expectedRate,
  });
  return id;
}

export async function updateGoal(
  ctx: UserContext,
  id: string,
  input: GoalInput,
): Promise<void> {
  await validate(ctx, input);
  const updated = await db
    .update(goals)
    .set({
      name: input.name.trim(),
      icon: input.icon,
      color: input.color,
      targetCents: input.targetCents,
      targetDate: input.targetDate,
      accountId: input.accountId,
      initialCents: input.accountId ? 0 : Math.max(0, input.savedCents),
      monthlyPlanCents: input.monthlyPlanCents || null,
      expectedRate: input.expectedRate,
    })
    .where(and(eq(goals.id, id), eq(goals.userId, ctx.userId)))
    .returning({ id: goals.id });
  if (updated.length === 0) throw notFound("Meta");
}

export async function archiveGoal(ctx: UserContext, id: string): Promise<void> {
  await db
    .update(goals)
    .set({ archivedAt: new Date() })
    .where(and(eq(goals.id, id), eq(goals.userId, ctx.userId)));
}
