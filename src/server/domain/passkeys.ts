// Passkeys of an account, for the second factor of Administração (doc 01
// §11.9). Better Auth owns the table; this only counts.
import { count, eq } from "drizzle-orm";
import { db, type Executor } from "@/server/db/client";
import { passkey } from "@/server/db/schema";

/** How many passkeys the account has registered. */
export async function countUserPasskeys(
  userId: string,
  executor: Executor = db,
): Promise<number> {
  const [row] = await executor
    .select({ total: count() })
    .from(passkey)
    .where(eq(passkey.userId, userId));
  return row?.total ?? 0;
}
