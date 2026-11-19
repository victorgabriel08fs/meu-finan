// Social sign-in links of an account (ADR-15): Better Auth owns the rows in
// `account`; the password (`credential`) row is never touched here.
import { and, eq, ne } from "drizzle-orm";
import { db, type Executor } from "@/server/db/client";
import { account } from "@/server/db/schema";

/**
 * Removes every social link of the account (resetting access or /recuperar
 * with "remove passkeys": whoever lost control cuts every door). Returns
 * whether there was any.
 */
export async function deleteSocialLinks(
  executor: Executor,
  userId: string,
): Promise<boolean> {
  const removed = await executor
    .delete(account)
    .where(
      and(eq(account.userId, userId), ne(account.providerId, "credential")),
    )
    .returning({ id: account.id });
  return removed.length > 0;
}

/**
 * The provider of one of the person's own `account` rows (the id
 * /unlink-account receives), or null when it is not theirs.
 */
export async function linkedProviderOf(
  userId: string,
  accountRowId: string,
  executor: Executor = db,
): Promise<string | null> {
  const [row] = await executor
    .select({ providerId: account.providerId })
    .from(account)
    .where(and(eq(account.id, accountRowId), eq(account.userId, userId)))
    .limit(1);
  return row?.providerId ?? null;
}
