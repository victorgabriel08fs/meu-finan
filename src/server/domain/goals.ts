// Goals with projections (doc 03 §8). Progress comes from the linked account's
// balance; without one, from the amount the owner keeps up to date by hand.
import { and, asc, between, eq, isNull, lt, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import {
  addMonths,
  type GoalProjection,
  iso,
  isoMonth,
  monthStart,
  parse,
  projectGoal,
  toMonthlyRate,
  toYearMonth,
} from "@/lib/finance";
import { db } from "@/server/db/client";
import {
  type ColorToken,
  finAccounts,
  type GoalExpectedRate,
  goals,
  transactions,
} from "@/server/db/schema";
import { type AccountListItem, listAccounts, requireAccount } from "./accounts";
import type { UserContext } from "./context";
import { DomainError, notFound } from "./errors";
import { getMarketRates, type MarketRates } from "./rates";
import { createTransfer } from "./transactions";

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

type GoalRow = typeof goals.$inferSelect;

/** A goal row with its progress and projection; `active` holds the active accounts by id. */
function toGoalItem(
  ctx: UserContext,
  row: GoalRow,
  active: ReadonlyMap<string, AccountListItem>,
  market: MarketRates,
): GoalItem {
  const linked = row.accountId ? active.get(row.accountId) : undefined;
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
}

const byId = (accounts: AccountListItem[]) =>
  new Map(accounts.map((account) => [account.id, account]));

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
  const active = byId(accounts);
  return rows.map((row) => toGoalItem(ctx, row, active, market));
}

export type GoalDetail = GoalItem & {
  /**
   * Linked to an active account: progress follows its balance and "Aportar"
   * is a transfer into it. A goal whose account was archived counts as not
   * linked, as in listGoals (its progress is the amount saved by hand).
   */
  linked: boolean;
  archived: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One of the user's goals, archived ones included, or null when the id is
 * malformed, unknown or someone else's (doc 01 §7.4: never reveal which).
 */
export async function getGoal(
  ctx: UserContext,
  id: string,
): Promise<GoalDetail | null> {
  if (!UUID.test(id)) return null;
  const [rows, accounts, market] = await Promise.all([
    db
      .select()
      .from(goals)
      .where(and(eq(goals.id, id), eq(goals.userId, ctx.userId)))
      .limit(1),
    listAccounts(ctx.userId),
    getMarketRates(),
  ]);
  const row = rows[0];
  if (!row) return null;
  const active = byId(accounts);
  return {
    ...toGoalItem(ctx, row, active, market),
    linked: row.accountId !== null && active.has(row.accountId),
    archived: row.archivedAt !== null,
  };
}

/** Months of history behind a linked goal: the current one and the 11 before it. */
export const GOAL_HISTORY_MONTHS = 12;

export type GoalHistoryMonth = {
  /** `YYYY-MM`, oldest first; the last one is the current month, up to today. */
  month: string;
  /** Money that came into the linked account (income and incoming transfers), paid. */
  contributionCents: number;
  /** Balance of the account at the end of the month (today for the current one), never below zero. */
  balanceCents: number;
};

/**
 * Contributions of a linked goal (doc 02 §6.10, "aportes realizados"): what
 * came into its account month by month, with the balance it left, from the
 * ledger. Empty for a goal without an active linked account.
 */
export async function goalContributions(
  ctx: UserContext,
  goal: Pick<GoalDetail, "accountId" | "linked">,
): Promise<GoalHistoryMonth[]> {
  const accountId = goal.linked ? goal.accountId : null;
  if (!accountId) return [];
  const first = addMonths(toYearMonth(ctx.today), 1 - GOAL_HISTORY_MONTHS);
  const start = iso(monthStart(first));
  const paid = and(
    eq(transactions.userId, ctx.userId),
    isNull(transactions.deletedAt),
    eq(transactions.status, "paid"),
  );
  const month = sql<string>`to_char(${transactions.occurredOn}, 'YYYY-MM')`;
  const [[base], rows] = await Promise.all([
    // Aggregate over a LEFT JOIN (no correlated subquery, see CLAUDE.md).
    db
      .select({
        initialCents: finAccounts.initialBalanceCents,
        beforeCents:
          sql<number>`coalesce(sum(${transactions.amountCents}), 0)`.mapWith(
            Number,
          ),
      })
      .from(finAccounts)
      .leftJoin(
        transactions,
        and(
          eq(transactions.accountId, finAccounts.id),
          paid,
          lt(transactions.occurredOn, start),
        ),
      )
      .where(
        and(eq(finAccounts.id, accountId), eq(finAccounts.userId, ctx.userId)),
      )
      .groupBy(finAccounts.id),
    db
      .select({
        month,
        netCents:
          sql<number>`coalesce(sum(${transactions.amountCents}), 0)`.mapWith(
            Number,
          ),
        inflowCents:
          sql<number>`coalesce(sum(${transactions.amountCents}) filter (where ${transactions.amountCents} > 0 and ${transactions.kind} in ('income', 'transfer')), 0)`.mapWith(
            Number,
          ),
      })
      .from(transactions)
      .where(
        and(
          paid,
          eq(transactions.accountId, accountId),
          between(transactions.occurredOn, start, ctx.todayIso),
        ),
      )
      // Grouped by position: the expression would not match itself in GROUP BY.
      .groupBy(sql`1`),
  ]);
  if (!base) return [];
  const byMonth = new Map(rows.map((row) => [row.month, row]));
  let running = base.initialCents + base.beforeCents;
  return Array.from({ length: GOAL_HISTORY_MONTHS }, (_, index) => {
    const key = isoMonth(addMonths(first, index));
    const row = byMonth.get(key);
    running += row?.netCents ?? 0;
    return {
      month: key,
      contributionCents: row?.inflowCents ?? 0,
      balanceCents: Math.max(0, running),
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

// Aportes ----------------------------------------------------------------------

export type ContributionInput = {
  amountCents: number;
  /** Linked goals: the account the money leaves (not the goal's own, not a card). */
  fromAccountId?: string | null;
  /** Linked goals: date of the transfer, `YYYY-MM-DD`; today by default. A future date schedules it. */
  occurredOn?: string;
  /** Linked goals: client-generated id of the transfer, so a resubmission creates nothing new. */
  requestId?: string;
};

export type ContributionResult =
  | {
      kind: "transfer";
      transferId: string;
      /** Dated after today: pending until the day. */
      scheduled: boolean;
      /** The goal is reached with this contribution counted. */
      achieved: boolean;
    }
  | {
      kind: "saved";
      /** The saved amount after the contribution. */
      savedCents: number;
      achieved: boolean;
    };

function assertContribution(amountCents: number) {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new DomainError("O valor precisa ser maior que zero.");
  }
}

/**
 * "Aportar" (doc 01 §7.2 contributeToGoal, doc 02 §6.10). With an active
 * linked account the contribution is a transfer from another account into it
 * ("Aporte · <meta>"); without one, the amount is added to the value saved by
 * hand. Both the goal and the source account must be the user's.
 */
export async function contributeToGoal(
  ctx: UserContext,
  goalId: string,
  input: ContributionInput,
): Promise<ContributionResult> {
  assertContribution(input.amountCents);
  const [goal] = await db
    .select({
      id: goals.id,
      name: goals.name,
      accountId: goals.accountId,
      targetCents: goals.targetCents,
    })
    .from(goals)
    .where(
      and(
        eq(goals.id, goalId),
        eq(goals.userId, ctx.userId),
        isNull(goals.archivedAt),
      ),
    )
    .limit(1);
  if (!goal) throw notFound("Meta");

  const [linked] = goal.accountId
    ? await db
        .select({ id: finAccounts.id })
        .from(finAccounts)
        .where(
          and(
            eq(finAccounts.id, goal.accountId),
            eq(finAccounts.userId, ctx.userId),
            isNull(finAccounts.archivedAt),
          ),
        )
        .limit(1)
    : [];

  if (!linked) {
    const [row] = await db
      .update(goals)
      .set({ initialCents: sql`${goals.initialCents} + ${input.amountCents}` })
      .where(and(eq(goals.id, goal.id), eq(goals.userId, ctx.userId)))
      .returning({ initialCents: goals.initialCents });
    if (!row) throw notFound("Meta");
    return {
      kind: "saved",
      savedCents: row.initialCents,
      achieved: row.initialCents >= goal.targetCents,
    };
  }

  if (!input.fromAccountId) {
    throw new DomainError("Escolha de qual conta sai o aporte.");
  }
  if (input.fromAccountId === linked.id) {
    throw new DomainError("Escolha uma conta diferente da conta da meta.");
  }
  const from = await requireAccount(db, ctx.userId, input.fromAccountId);
  if (from.type === "credit_card") {
    throw new DomainError("O aporte sai de uma conta, não de um cartão.");
  }
  const occurredOn = input.occurredOn ?? ctx.todayIso;
  // createTransfer opens its own transaction and checks both accounts again.
  const { transferId } = await createTransfer(ctx, {
    id: input.requestId,
    fromAccountId: from.id,
    toAccountId: linked.id,
    amountCents: input.amountCents,
    occurredOn,
    description: `Aporte · ${goal.name}`,
  });
  const balanceCents =
    (await listAccounts(ctx.userId)).find((account) => account.id === linked.id)
      ?.balanceCents ?? 0;
  return {
    kind: "transfer",
    transferId,
    scheduled: occurredOn > ctx.todayIso,
    achieved: balanceCents >= goal.targetCents,
  };
}

/**
 * "Desfazer" of a contribution to a goal without a linked account: takes the
 * amount back out of the saved value, never below zero. (A linked
 * contribution is undone by discarding its transfer.)
 */
export async function undoGoalContribution(
  ctx: UserContext,
  goalId: string,
  amountCents: number,
): Promise<{ savedCents: number }> {
  assertContribution(amountCents);
  const [row] = await db
    .update(goals)
    .set({
      initialCents: sql`greatest(${goals.initialCents} - ${amountCents}, 0)`,
    })
    .where(and(eq(goals.id, goalId), eq(goals.userId, ctx.userId)))
    .returning({ initialCents: goals.initialCents });
  if (!row) throw notFound("Meta");
  return { savedCents: row.initialCents };
}
