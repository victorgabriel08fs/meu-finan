// Learned "description → category" rules (categorization_rules): written when
// a person saves an entry whose category the form filled in by itself. Runs
// inside the caller's transaction (only `tx`), every query scoped by user id;
// the pattern is never logged (it is financial data).
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import type { RuleLearning } from "@/lib/import/suggest";
import type { Executor } from "@/server/db/client";
import { categorizationRules } from "@/server/db/schema";

/** Rules kept per person; the least recently used goes first. */
export const MAX_CATEGORY_RULES = 500;

/**
 * Applies what saving taught. `categoryId` must already be validated by the
 * caller (the person's own, active, of the entry's kind).
 * - confirm: one more hit for the rule with this pattern and category, if any
 *   (nothing is created: the history already covers an accepted suggestion).
 * - replace: the pattern now points at `categoryId` (created when missing).
 */
export async function learnCategoryRule(
  tx: Executor,
  userId: string,
  learning: RuleLearning,
  categoryId: string,
): Promise<void> {
  const own = and(
    eq(categorizationRules.userId, userId),
    eq(categorizationRules.pattern, learning.pattern),
  );

  if (learning.mode === "confirm") {
    await tx
      .update(categorizationRules)
      .set({ hits: sql`${categorizationRules.hits} + 1` })
      .where(and(own, eq(categorizationRules.categoryId, categoryId)));
    return;
  }

  const [existing] = await tx
    .select({
      id: categorizationRules.id,
      categoryId: categorizationRules.categoryId,
    })
    .from(categorizationRules)
    .where(own)
    .limit(1)
    .for("update");
  if (existing) {
    await tx
      .update(categorizationRules)
      .set({
        categoryId,
        accountId: null,
        hits:
          existing.categoryId === categoryId
            ? sql`${categorizationRules.hits} + 1`
            : 1,
      })
      .where(
        and(
          eq(categorizationRules.id, existing.id),
          eq(categorizationRules.userId, userId),
        ),
      );
    return;
  }

  const [{ total } = { total: 0 }] = await tx
    .select({ total: count() })
    .from(categorizationRules)
    .where(eq(categorizationRules.userId, userId));
  if (total >= MAX_CATEGORY_RULES) {
    const oldest = await tx
      .select({ id: categorizationRules.id })
      .from(categorizationRules)
      .where(eq(categorizationRules.userId, userId))
      .orderBy(
        asc(categorizationRules.updatedAt),
        asc(categorizationRules.hits),
      )
      .limit(total - MAX_CATEGORY_RULES + 1);
    if (oldest.length > 0) {
      await tx.delete(categorizationRules).where(
        and(
          eq(categorizationRules.userId, userId),
          inArray(
            categorizationRules.id,
            oldest.map((row) => row.id),
          ),
        ),
      );
    }
  }
  // Two saves with the same new pattern may race: the second one wins.
  await tx
    .insert(categorizationRules)
    .values({
      userId,
      pattern: learning.pattern,
      categoryId,
      accountId: null,
      hits: 1,
    })
    .onConflictDoUpdate({
      target: [categorizationRules.userId, categorizationRules.pattern],
      set: { categoryId, accountId: null, hits: 1, updatedAt: new Date() },
    });
}
