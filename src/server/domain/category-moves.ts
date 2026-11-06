// Moving what a category holds into another one (doc 02 §6.14): "Mesclar com
// outra" and "Arquivar" with "Passar para". Entries (paid, scheduled,
// deleted, every installment), recurrences, categorization rules and budgets
// all go; the source is left archived and empty, never deleted. Every id
// comes from the client, so every query is scoped by the session user's id.
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { categoryLabel, moveTargetBlocker } from "@/lib/categories/hierarchy";
import { db, type Executor } from "@/server/db/client";
import {
  budgets,
  categories,
  categorizationRules,
  recurrences,
  transactions,
} from "@/server/db/schema";
import { DomainError, notFound } from "./errors";

/**
 * Points everything of `fromIds` at `to`, inside the caller's transaction:
 * entries (whatever their status, deleted ones too, so a Desfazer brings them
 * back in the new category), recurrence rules (paused and ended ones too, so
 * the job never creates an entry in the old category), categorization rules,
 * and budgets, added month by month to the budget of the target's main
 * category (doc 03 §11: subcategories count into their parent) before the
 * source's are deleted. Returns how many entries (not deleted) moved.
 */
export async function moveCategoryEntries(
  tx: Executor,
  userId: string,
  fromIds: readonly string[],
  to: { id: string; parentId: string | null },
): Promise<number> {
  if (fromIds.length === 0) return 0;
  const from = [...fromIds];
  const moved = await tx
    .update(transactions)
    .set({ categoryId: to.id })
    .where(
      and(
        eq(transactions.userId, userId),
        inArray(transactions.categoryId, from),
      ),
    )
    .returning({ deletedAt: transactions.deletedAt });
  await tx
    .update(recurrences)
    .set({ categoryId: to.id })
    .where(
      and(
        eq(recurrences.userId, userId),
        inArray(recurrences.categoryId, from),
      ),
    );
  await tx
    .update(categorizationRules)
    .set({ categoryId: to.id })
    .where(
      and(
        eq(categorizationRules.userId, userId),
        inArray(categorizationRules.categoryId, from),
      ),
    );

  // Summed per month first: one INSERT … ON CONFLICT cannot touch a row twice.
  const sources = await tx
    .select({
      month: budgets.month,
      amountCents: budgets.amountCents,
      rollover: budgets.rollover,
    })
    .from(budgets)
    .where(and(eq(budgets.userId, userId), inArray(budgets.categoryId, from)));
  const months = new Map<string, { amountCents: number; rollover: boolean }>();
  for (const row of sources) {
    const month = months.get(row.month);
    months.set(row.month, {
      amountCents: (month?.amountCents ?? 0) + row.amountCents,
      rollover: (month?.rollover ?? false) || row.rollover,
    });
  }
  if (months.size > 0) {
    // The target's own rollover stays; a budget created here takes the source's.
    await tx
      .insert(budgets)
      .values(
        [...months].map(([month, budget]) => ({
          id: uuidv7(),
          userId,
          categoryId: to.parentId ?? to.id,
          month,
          ...budget,
        })),
      )
      .onConflictDoUpdate({
        target: [budgets.userId, budgets.categoryId, budgets.month],
        set: {
          amountCents: sql`${budgets.amountCents} + excluded.amount_cents`,
        },
      });
    await tx
      .delete(budgets)
      .where(
        and(eq(budgets.userId, userId), inArray(budgets.categoryId, from)),
      );
  }
  return moved.filter((row) => row.deletedAt === null).length;
}

export type MergeResult = {
  /** The category merged (now archived and empty). */
  name: string;
  /** Where it went: "Mercado" or "Mercado › Feira". */
  into: string;
  /** Entries (not deleted) that moved. */
  entries: number;
  /** Subcategories that moved into the target. */
  children: number;
};

/**
 * "Mesclar com outra": everything of `fromId` goes into `intoId`, its
 * subcategories (archived ones too) move under `intoId` (to the end of its
 * list) keeping their own entries, and `fromId` is archived, empty. One
 * transaction: both categories are locked in id order (two merges never
 * deadlock, and a subcategory created at the same time waits and is seen).
 */
export async function mergeCategories(
  userId: string,
  fromId: string,
  intoId: string,
): Promise<MergeResult> {
  return db.transaction(async (tx) => {
    const locked = await tx
      .select({
        id: categories.id,
        kind: categories.kind,
        name: categories.name,
        parentId: categories.parentId,
        archivedAt: categories.archivedAt,
      })
      .from(categories)
      .where(
        and(
          eq(categories.userId, userId),
          inArray(categories.id, [fromId, intoId]),
        ),
      )
      .orderBy(asc(categories.id))
      .for("update");
    const source = locked.find((item) => item.id === fromId);
    const target = locked.find((item) => item.id === intoId);
    if (!source || !target) throw notFound("Categoria");
    if (source.archivedAt !== null) {
      throw new DomainError("Restaure a categoria para mesclar.");
    }

    const children = await tx
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(
        and(eq(categories.userId, userId), eq(categories.parentId, fromId)),
      );
    const blocker = moveTargetBlocker({
      mode: "merge",
      source: { ...source, hasChildren: children.length > 0 },
      target: { ...target, archived: target.archivedAt !== null },
      excluded: [],
    });
    if (blocker) throw new DomainError(blocker);

    if (children.length > 0) {
      // Names are unique under a parent, archived ones included.
      const clash = await tx
        .select({ name: categories.name })
        .from(categories)
        .where(
          and(
            eq(categories.userId, userId),
            eq(categories.parentId, intoId),
            inArray(
              categories.name,
              children.map((child) => child.name),
            ),
          ),
        )
        .orderBy(asc(categories.name))
        .limit(1);
      if (clash[0]) {
        throw new DomainError(
          `${target.name} já tem uma subcategoria ${clash[0].name}. Renomeie uma das duas antes de mesclar.`,
        );
      }
    }

    const entries = await moveCategoryEntries(tx, userId, [fromId], target);
    if (children.length > 0) {
      await tx
        .update(categories)
        .set({ parentId: intoId, sortOrder: 999 })
        .where(
          and(eq(categories.userId, userId), eq(categories.parentId, fromId)),
        );
    }
    await tx
      .update(categories)
      .set({ archivedAt: new Date() })
      .where(and(eq(categories.id, fromId), eq(categories.userId, userId)));

    return {
      name: source.name,
      into: await targetLabel(tx, userId, target),
      entries,
      children: children.length,
    };
  });
}

/** "Mercado › Feira" for a subcategory target, its name for a main one. */
export async function targetLabel(
  tx: Executor,
  userId: string,
  target: { name: string; parentId: string | null },
): Promise<string> {
  if (target.parentId === null) return target.name;
  const parents = await tx
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(
      and(eq(categories.id, target.parentId), eq(categories.userId, userId)),
    )
    .limit(1);
  return categoryLabel(target, parents);
}
