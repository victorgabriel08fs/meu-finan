// Monthly budgets with pace (doc 03 §11).
import { and, eq, isNull, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import {
  addMonths,
  type BudgetPace,
  budgetPace,
  isoMonth,
  parseMonth,
} from "@/lib/finance";
import { db, type Executor } from "@/server/db/client";
import { budgets, categories, transactions } from "@/server/db/schema";
import { requireCategory } from "./categories";
import type { PeriodRange, UserContext } from "./context";
import { DomainError, notFound } from "./errors";

export type BudgetItem = {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  budgetCents: number;
  spentCents: number;
  scheduledCents: number;
  pace: BudgetPace;
};

export type BudgetOverview = {
  items: BudgetItem[];
  total: {
    budgetCents: number;
    spentCents: number;
    scheduledCents: number;
    pace: BudgetPace;
  } | null;
};

const STATUS_ORDER = { over: 0, ahead: 1, on_track: 2, scheduled: 3 } as const;

export async function getBudgets(
  ctx: UserContext,
  range: PeriodRange,
): Promise<BudgetOverview> {
  const spentIn = (status: "paid" | "pending") =>
    sql<number>`coalesce((
      select -sum(${transactions.amountCents}) from ${transactions}
      where ${transactions.userId} = ${ctx.userId}
        and ${transactions.categoryId} = ${budgets.categoryId}
        and ${transactions.kind} = 'expense'
        and ${transactions.status} = ${status}
        and ${transactions.deletedAt} is null
        and ${transactions.occurredOn} between ${range.start} and ${range.end}
    ), 0)`.mapWith(Number);

  const rows = await db
    .select({
      id: budgets.id,
      categoryId: budgets.categoryId,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      categoryColor: categories.color,
      budgetCents: budgets.amountCents,
      spent: spentIn("paid"),
      scheduled: spentIn("pending"),
    })
    .from(budgets)
    .innerJoin(categories, eq(categories.id, budgets.categoryId))
    .where(
      and(
        eq(budgets.userId, ctx.userId),
        eq(budgets.month, `${range.month}-01`),
        isNull(categories.archivedAt),
      ),
    );

  const pace = (
    budgetCents: number,
    spentCents: number,
    scheduledCents: number,
  ) =>
    budgetPace({
      budgetCents,
      spentCents,
      scheduledCents,
      period: range.period,
      today: ctx.today,
    });

  const items = rows
    .map((row) => {
      const spentCents = Math.max(0, row.spent);
      const scheduledCents = Math.max(0, row.scheduled);
      return {
        id: row.id,
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        categoryIcon: row.categoryIcon,
        categoryColor: row.categoryColor,
        budgetCents: row.budgetCents,
        spentCents,
        scheduledCents,
        pace: pace(row.budgetCents, spentCents, scheduledCents),
      };
    })
    .sort(
      (a, b) =>
        STATUS_ORDER[a.pace.status] - STATUS_ORDER[b.pace.status] ||
        b.spentCents / b.budgetCents - a.spentCents / a.budgetCents,
    );

  if (items.length === 0) return { items, total: null };
  const budgetCents = items.reduce((sum, item) => sum + item.budgetCents, 0);
  const spentCents = items.reduce((sum, item) => sum + item.spentCents, 0);
  const scheduledCents = items.reduce(
    (sum, item) => sum + item.scheduledCents,
    0,
  );
  return {
    items,
    total: {
      budgetCents,
      spentCents,
      scheduledCents,
      pace: pace(budgetCents, spentCents, scheduledCents),
    },
  };
}

export async function upsertBudget(
  ctx: UserContext,
  input: { categoryId: string; month: string; amountCents: number },
  executor: Executor = db,
): Promise<void> {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    throw new DomainError("O orçamento precisa ser maior que zero.");
  }
  const month = `${isoMonth(parseMonth(input.month))}-01`;
  await requireCategory(executor, ctx.userId, input.categoryId, "expense");
  await executor
    .insert(budgets)
    .values({
      id: uuidv7(),
      userId: ctx.userId,
      categoryId: input.categoryId,
      month,
      amountCents: input.amountCents,
    })
    .onConflictDoUpdate({
      target: [budgets.userId, budgets.categoryId, budgets.month],
      set: { amountCents: input.amountCents },
    });
}

/** Several budgets of one month at once ("Usar sugestão"): all or none. */
export async function upsertBudgets(
  ctx: UserContext,
  month: string,
  items: readonly { categoryId: string; amountCents: number }[],
): Promise<number> {
  await db.transaction(async (tx) => {
    for (const item of items) {
      await upsertBudget(ctx, { ...item, month }, tx);
    }
  });
  return items.length;
}

export async function deleteBudget(
  ctx: UserContext,
  id: string,
): Promise<void> {
  const deleted = await db
    .delete(budgets)
    .where(and(eq(budgets.id, id), eq(budgets.userId, ctx.userId)))
    .returning({ id: budgets.id });
  if (deleted.length === 0) throw notFound("Orçamento");
}

/** "Copiar do mês anterior": copies the budgets the month does not have yet. */
export async function copyBudgetsFromPreviousMonth(
  ctx: UserContext,
  month: string,
): Promise<number> {
  const target = parseMonth(month);
  const previous = `${isoMonth(addMonths(target, -1))}-01`;
  const rows = await db
    .select({
      categoryId: budgets.categoryId,
      amountCents: budgets.amountCents,
    })
    .from(budgets)
    .where(and(eq(budgets.userId, ctx.userId), eq(budgets.month, previous)));
  if (rows.length === 0) return 0;
  const inserted = await db
    .insert(budgets)
    .values(
      rows.map((row) => ({
        id: uuidv7(),
        userId: ctx.userId,
        categoryId: row.categoryId,
        month: `${isoMonth(target)}-01`,
        amountCents: row.amountCents,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: budgets.id });
  return inserted.length;
}
