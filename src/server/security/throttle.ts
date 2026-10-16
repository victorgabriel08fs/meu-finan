// Fixed-window attempt limiter for Server Actions that run outside Better Auth's
// own limiter (first access, recovery). Shares Better Auth's rate_limit table
// with a distinct key prefix, so no Redis is needed.
import { sql } from "drizzle-orm";
import { db, type Executor } from "@/server/db/client";
import { rateLimit } from "@/server/db/schema";

export type ThrottleRule = { windowSeconds: number; max: number };
export type ThrottleResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSeconds: number };

/**
 * Counts one attempt for `key` and tells whether it is allowed. The window
 * starts at the first attempt and resets once it has passed. A single upsert,
 * so concurrent attempts cannot slip past the limit.
 */
export async function throttle(
  key: string,
  rule: ThrottleRule,
  options: { now?: number; executor?: Executor } = {},
): Promise<ThrottleResult> {
  const now = options.now ?? Date.now();
  const windowMs = rule.windowSeconds * 1000;
  const expired = sql`${rateLimit.lastRequest} < ${now - windowMs}`;

  const [row] = await (options.executor ?? db)
    .insert(rateLimit)
    .values({
      id: crypto.randomUUID(),
      key: `meu-finan:${key}`,
      count: 1,
      lastRequest: now,
    })
    .onConflictDoUpdate({
      target: rateLimit.key,
      set: {
        count: sql`case when ${expired} then 1 else ${rateLimit.count} + 1 end`,
        lastRequest: sql`case when ${expired} then ${now} else ${rateLimit.lastRequest} end`,
      },
    })
    .returning({ count: rateLimit.count, lastRequest: rateLimit.lastRequest });

  if (!row || row.count <= rule.max) {
    return { ok: true, remaining: Math.max(0, rule.max - (row?.count ?? 1)) };
  }
  const retryAfterMs = row.lastRequest + windowMs - now;
  return {
    ok: false,
    retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
  };
}
