// Monthly budgets with pace (doc 03 §11).
import { and, between, eq, isNull, sql } from "drizzle-orm";
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

/**
 * Expenses of the period per category (paid and pending), with each
 * category's parent: one aggregate over a JOIN, no correlated subquery.
 */
async function expensesByCategory(ctx: UserContext, range: PeriodRange) {
  const sumOf = (status: "paid" | "pending") =>
    sql<number>`coalesce(-sum(${transactions.amountCents}) filter (where ${transactions.status} = ${status}), 0)`.mapWith(
      Number,
    );
  return db
    .select({
      categoryId: transactions.categoryId,
      parentId: categories.parentId,
      paid: sumOf("paid"),
      pending: sumOf("pending"),
    })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        eq(transactions.userId, ctx.userId),
        eq(transactions.kind, "expense"),
        isNull(transactions.deletedAt),
        between(transactions.occurredOn, range.start, range.end),
      ),
    )
    .groupBy(transactions.categoryId, categories.parentId);
}

/**
 * The budgets of the period with what was spent and scheduled. The budget of
 * a main category counts its subcategories too, archived ones included (doc
 * 03 §11, "gasto da categoria e subcategorias"); an old budget on a
 * subcategory counts that subcategory only.
 */
export async function getBudgets(
  ctx: UserContext,
  range: PeriodRange,
): Promise<BudgetOverview> {
  const [budgetRows, spending] = await Promise.all([
    db
      .select({
        id: budgets.id,
        categoryId: budgets.categoryId,
        categoryName: categories.name,
        categoryIcon: categories.icon,
        categoryColor: categories.color,
        budgetCents: budgets.amountCents,
      })
      .from(budgets)
      .innerJoin(categories, eq(categories.id, budgets.categoryId))
      .where(
        and(
          eq(budgets.userId, ctx.userId),
          eq(budgets.month, `${range.month}-01`),
          isNull(categories.archivedAt),
        ),
      ),
    expensesByCategory(ctx, range),
  ]);
  // Each entry counts once per budget: its own category's, or its parent's.
  const rows = budgetRows.map((row) => {
    let spent = 0;
    let scheduled = 0;
    for (const line of spending) {
      if (
        line.categoryId === row.categoryId ||
        line.parentId === row.categoryId
      ) {
        spent += line.paid;
        scheduled += line.pending;
      }
    }
    return { ...row, spent, scheduled };
  });

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
  const category = await requireCategory(
    executor,
    ctx.userId,
    input.categoryId,
    "expense",
  );
  // New budgets go on main categories only (their subcategories count in);
  // an old budget on a subcategory can still change its amount.
  if (category.parentId !== null) {
    const [existing] = await executor
      .select({ id: budgets.id })
      .from(budgets)
      .where(
        and(
          eq(budgets.userId, ctx.userId),
          eq(budgets.categoryId, input.categoryId),
          eq(budgets.month, month),
        ),
      )
      .limit(1);
    if (!existing) {
      throw new DomainError(
        "Escolha uma categoria principal para o orçamento.",
      );
    }
  }
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

/**
 * "Copiar do mês anterior": copies the budgets the month does not have yet,
 * of active main categories only (a main category's budget already counts its
 * subcategories, so copying an old subcategory budget would count it twice).
 */
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
    .innerJoin(categories, eq(categories.id, budgets.categoryId))
    .where(
      and(
        eq(budgets.userId, ctx.userId),
        eq(budgets.month, previous),
        eq(categories.userId, ctx.userId),
        isNull(categories.parentId),
        isNull(categories.archivedAt),
      ),
    );
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
