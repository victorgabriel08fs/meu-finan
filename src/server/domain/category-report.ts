// The detail of one category in Relatórios › Categorias (doc 02 §6.12, doc 03
// §12): its total in the window and its share of the type, the split per
// subcategory, month by month and the descriptions that weighed the most.
// Same filters as the ranking (`categoryBreakdown`): paid, not deleted,
// accrual basis (purchase date), entries of the category's type.
import { and, between, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { categoryLabel } from "@/lib/categories/hierarchy";
import { db } from "@/server/db/client";
import {
  type CategoryKind,
  type ColorToken,
  categories,
  transactions,
} from "@/server/db/schema";
import type { PeriodRange, UserContext } from "./context";
import {
  type CategoryShare,
  categoryBreakdown,
  kindSum,
  periodMonthBucket,
  trailingPeriods,
} from "./reports";

const parentCategory = alias(categories, "parent_category");

export type CategoryDetailMonth = {
  month: string;
  start: string;
  end: string;
  cents: number;
  /** The period that contains today (still running). */
  partial: boolean;
};

export type CategoryDetail = {
  category: {
    id: string;
    kind: CategoryKind;
    name: string;
    icon: string;
    color: ColorToken;
    parentId: string | null;
    /** "Mercado › Feira" for a subcategory, the name for a main one. */
    label: string;
    archived: boolean;
  };
  /** First and last day of the window (`period` months ending in `range`). */
  start: string;
  end: string;
  totalCents: number;
  /** Of the type's total in the window (the ranking's share), 0 to 1. */
  share: number;
  /**
   * The split per subcategory, largest first, with the entries in the main
   * category itself as "Sem subcategoria" (categoryId null); empty when no
   * subcategory has a value in the window.
   */
  bySubcategory: (CategoryShare & { archived: boolean })[];
  /** One point per financial month of the window, oldest first. */
  months: CategoryDetailMonth[];
  /** The five descriptions with the largest totals. */
  topDescriptions: { description: string; count: number; cents: number }[];
};

/**
 * The detail of a category of the person over the `period` financial months
 * ending with `range` (archived categories too, so a link from an old report
 * still works); null when the id is not one of the person's categories.
 */
export async function categoryDetail(
  ctx: UserContext,
  categoryId: string,
  range: PeriodRange,
  period: number,
): Promise<CategoryDetail | null> {
  const { userId } = ctx;
  const [row] = await db
    .select({
      id: categories.id,
      kind: categories.kind,
      name: categories.name,
      icon: categories.icon,
      color: categories.color,
      parentId: categories.parentId,
      archivedAt: categories.archivedAt,
      parentName: parentCategory.name,
    })
    .from(categories)
    .leftJoin(
      parentCategory,
      and(
        eq(parentCategory.id, categories.parentId),
        eq(parentCategory.userId, userId),
      ),
    )
    .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
    .limit(1);
  if (!row) return null;

  // One level only: a subcategory has no children of its own.
  const children =
    row.parentId === null
      ? await db
          .select({
            id: categories.id,
            name: categories.name,
            icon: categories.icon,
            color: categories.color,
            archivedAt: categories.archivedAt,
          })
          .from(categories)
          .where(
            and(
              eq(categories.userId, userId),
              eq(categories.parentId, categoryId),
            ),
          )
      : [];
  const ids = [categoryId, ...children.map((child) => child.id)];

  const periods = trailingPeriods(range, Math.max(1, period));
  const start = periods[0]?.start ?? range.start;
  const end = range.end;
  const filters = and(
    eq(transactions.userId, userId),
    isNull(transactions.deletedAt),
    eq(transactions.status, "paid"),
    eq(transactions.kind, row.kind),
    between(transactions.occurredOn, start, end),
    inArray(transactions.categoryId, ids),
  );
  const cents = kindSum(row.kind);
  const bucket = periodMonthBucket(ctx);
  const [perCategory, perMonth, top, breakdown] = await Promise.all([
    db
      .select({ categoryId: transactions.categoryId, cents })
      .from(transactions)
      .where(filters)
      .groupBy(transactions.categoryId),
    db
      .select({ month: bucket, cents })
      .from(transactions)
      .where(filters)
      .groupBy(sql`1`),
    db
      .select({
        description: transactions.description,
        count: sql<number>`count(*)`.mapWith(Number),
        cents,
      })
      .from(transactions)
      .where(filters)
      .groupBy(transactions.description)
      .orderBy(desc(cents), transactions.description)
      .limit(5),
    categoryBreakdown(ctx, start, end, row.kind),
  ]);

  const byCategory = new Map(
    perCategory.map((item) => [item.categoryId, item.cents]),
  );
  const totalCents = Math.max(
    0,
    perCategory.reduce((sum, item) => sum + item.cents, 0),
  );

  let bySubcategory: CategoryDetail["bySubcategory"] = [];
  if (children.some((child) => (byCategory.get(child.id) ?? 0) > 0)) {
    const own = byCategory.get(categoryId) ?? 0;
    bySubcategory = [
      ...children.map((child) => ({
        categoryId: child.id,
        name: child.name,
        icon: child.icon,
        color: child.color,
        archived: child.archivedAt !== null,
        cents: byCategory.get(child.id) ?? 0,
      })),
      {
        categoryId: null,
        name: "Sem subcategoria",
        icon: row.icon,
        color: row.color,
        archived: false,
        cents: own,
      },
    ]
      .filter((item) => item.cents > 0)
      .sort((a, b) => b.cents - a.cents)
      .map((item) => ({
        ...item,
        share: totalCents > 0 ? item.cents / totalCents : 0,
      }));
  }

  const monthly = new Map(perMonth.map((item) => [item.month, item.cents]));
  return {
    category: {
      id: row.id,
      kind: row.kind,
      name: row.name,
      icon: row.icon,
      color: row.color,
      parentId: row.parentId,
      label: categoryLabel(
        row,
        row.parentId && row.parentName
          ? [{ id: row.parentId, name: row.parentName }]
          : [],
      ),
      archived: row.archivedAt !== null,
    },
    start,
    end,
    totalCents,
    share: breakdown.totalCents > 0 ? totalCents / breakdown.totalCents : 0,
    bySubcategory,
    months: periods.map((item) => ({
      month: item.month,
      start: item.start,
      end: item.end,
      cents: Math.max(0, monthly.get(item.month) ?? 0),
      partial: item.start <= ctx.todayIso && ctx.todayIso <= item.end,
    })),
    topDescriptions: top.filter((item) => item.cents > 0),
  };
}
