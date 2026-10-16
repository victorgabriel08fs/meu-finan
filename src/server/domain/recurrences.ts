// Extends recurring entries ahead of time (doc 03 §10.1): the daily cron calls
// this so every active rule always has its next occurrences as pending rows.
import { and, eq, isNull, lt } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import {
  addDays,
  compare,
  invoiceFor,
  iso,
  minDate,
  occurrencesBetween,
  parse,
} from "@/lib/finance";
import { db } from "@/server/db/client";
import { recurrences, transactions } from "@/server/db/schema";
import { requireAccount } from "./accounts";
import { ensureInvoice } from "./cards";
import { getUserContext, type UserContext } from "./context";
import { RECURRENCE_HORIZON_DAYS } from "./transactions";

export type MaterializeReport = { recurrences: number; created: number };

/**
 * For every active rule whose horizon is behind today + 60 days, creates the
 * missing occurrences and advances generated_until. Idempotent: the unique
 * (recurrence_id, occurred_on) index ignores occurrences that already exist
 * (including deleted ones, which are never recreated).
 */
export async function materializeRecurrences(
  options: { now?: number; signal?: AbortSignal } = {},
): Promise<MaterializeReport> {
  const now = options.now ?? Date.now();
  const due = await db
    .select()
    .from(recurrences)
    .where(
      and(
        isNull(recurrences.pausedAt),
        // Cheap pre-filter; the exact horizon depends on each owner's time zone.
        lt(
          recurrences.generatedUntil,
          iso(
            addDays(
              parse(new Date(now).toISOString().slice(0, 10)),
              RECURRENCE_HORIZON_DAYS + 1,
            ),
          ),
        ),
      ),
    );

  const contexts = new Map<string, UserContext>();
  let created = 0;
  let touched = 0;
  for (const rule of due) {
    if (options.signal?.aborted) break;
    let ctx = contexts.get(rule.userId);
    if (!ctx) {
      ctx = await getUserContext(rule.userId, { now });
      contexts.set(rule.userId, ctx);
    }
    let horizon = addDays(ctx.today, RECURRENCE_HORIZON_DAYS);
    if (rule.endOn) horizon = minDate(horizon, parse(rule.endOn));
    const from = addDays(parse(rule.generatedUntil), 1);
    if (compare(from, horizon) > 0) continue;

    const dates = occurrencesBetween(
      {
        freq: rule.freq,
        interval: rule.interval,
        start: parse(rule.startOn),
        end: rule.endOn ? parse(rule.endOn) : undefined,
        byMonthDay: rule.byMonthDay ?? undefined,
      },
      from,
      horizon,
    );

    created += await db.transaction(async (tx) => {
      let account: Awaited<ReturnType<typeof requireAccount>>;
      try {
        account = await requireAccount(tx, rule.userId, rule.accountId);
      } catch {
        // Archived or deleted account: stop the rule instead of failing the job.
        await tx
          .update(recurrences)
          .set({ pausedAt: new Date(now) })
          .where(eq(recurrences.id, rule.id));
        return 0;
      }
      const rows: (typeof transactions.$inferInsert)[] = [];
      for (const date of dates) {
        const status = compare(date, ctx.today) <= 0 ? "paid" : "pending";
        rows.push({
          id: uuidv7(),
          userId: rule.userId,
          accountId: account.id,
          categoryId: rule.categoryId,
          kind: rule.kind,
          status,
          amountCents: rule.amountCents,
          description: rule.description,
          occurredOn: iso(date),
          paidAt: status === "paid" ? new Date(now) : null,
          recurrenceId: rule.id,
          invoiceId: account.cycle
            ? await ensureInvoice(
                tx,
                rule.userId,
                account.id,
                invoiceFor(date, account.cycle),
              )
            : null,
        });
      }
      const inserted =
        rows.length > 0
          ? await tx
              .insert(transactions)
              .values(rows)
              .onConflictDoNothing()
              .returning({ id: transactions.id })
          : [];
      await tx
        .update(recurrences)
        .set({ generatedUntil: iso(horizon) })
        .where(eq(recurrences.id, rule.id));
      return inserted.length;
    });
    touched += 1;
  }
  return { recurrences: touched, created };
}
