import { and, eq, gte, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { addDays, iso, parse } from "@/lib/finance";
import {
  type PredecessorRule,
  type SubscriptionOccurrence,
  type SubscriptionRule,
  type SubscriptionsSummary,
  summarizeSubscriptions,
} from "@/lib/home/subscriptions";
import { db } from "@/server/db/client";
import { finAccounts, recurrences, transactions } from "@/server/db/schema";
import { resolvePeriod, type UserContext } from "./context";

/** Rows of the Início block; the rest is counted ("e mais N"). */
export const SUBSCRIPTIONS_LIMIT = 5;

export type MonthlySubscriptions = SubscriptionsSummary;

/** How far before the financial month the last reference debit is looked up. */
const REFERENCE_LOOKBACK_DAYS = 62;

/**
 * Assinaturas do mês (doc 02 §6.3): the person's active monthly expense
 * recurrences, read as subscriptions (nothing marks them), with the next
 * debit of each and whether it costs more than the last one before the
 * current financial month. Three reads, every one filtered by the person;
 * the reduction is `summarizeSubscriptions`. Always from today.
 */
export async function monthlySubscriptions(
  ctx: UserContext,
  limit = SUBSCRIPTIONS_LIMIT,
): Promise<MonthlySubscriptions> {
  const period = resolvePeriod(ctx, null);
  const base = {
    todayIso: ctx.todayIso,
    periodStartIso: period.start,
    limit,
  };

  const ruleRows = await db
    .select({
      id: recurrences.id,
      description: recurrences.description,
      accountId: recurrences.accountId,
      accountName: finAccounts.name,
      amountCents: recurrences.amountCents,
      byMonthDay: recurrences.byMonthDay,
      startOn: recurrences.startOn,
      endOn: recurrences.endOn,
      generatedUntil: recurrences.generatedUntil,
    })
    .from(recurrences)
    .innerJoin(
      finAccounts,
      and(
        eq(finAccounts.id, recurrences.accountId),
        eq(finAccounts.userId, ctx.userId),
        isNull(finAccounts.archivedAt),
      ),
    )
    .where(
      and(
        eq(recurrences.userId, ctx.userId),
        eq(recurrences.kind, "expense"),
        eq(recurrences.freq, "monthly"),
        eq(recurrences.interval, 1),
        isNull(recurrences.pausedAt),
        or(isNull(recurrences.endOn), gte(recurrences.endOn, ctx.todayIso)),
      ),
    );
  const rules: SubscriptionRule[] = ruleRows;
  if (rules.length === 0) {
    return summarizeSubscriptions({
      ...base,
      rules: [],
      predecessors: [],
      occurrences: [],
    });
  }

  const endDays = [
    ...new Set(rules.map((r) => iso(addDays(parse(r.startOn), -1)))),
  ];
  const predecessorRows = await db
    .select({
      id: recurrences.id,
      description: recurrences.description,
      byMonthDay: recurrences.byMonthDay,
      endOn: recurrences.endOn,
    })
    .from(recurrences)
    .where(
      and(
        eq(recurrences.userId, ctx.userId),
        eq(recurrences.kind, "expense"),
        eq(recurrences.freq, "monthly"),
        eq(recurrences.interval, 1),
        isNotNull(recurrences.endOn),
        inArray(recurrences.endOn, endDays),
      ),
    );
  const predecessors: PredecessorRule[] = predecessorRows.flatMap((p) =>
    p.endOn ? [{ ...p, endOn: p.endOn }] : [],
  );

  const ids = [...rules.map((r) => r.id), ...predecessors.map((p) => p.id)];
  const occurrenceRows = await db
    .select({
      recurrenceId: transactions.recurrenceId,
      amountCents: transactions.amountCents,
      occurredOn: transactions.occurredOn,
      status: transactions.status,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, ctx.userId),
        isNull(transactions.deletedAt),
        eq(transactions.kind, "expense"),
        inArray(transactions.recurrenceId, ids),
        gte(
          transactions.occurredOn,
          iso(addDays(parse(period.start), -REFERENCE_LOOKBACK_DAYS)),
        ),
      ),
    );
  const occurrences: SubscriptionOccurrence[] = occurrenceRows.flatMap((o) =>
    o.recurrenceId && (o.status === "paid" || o.status === "pending")
      ? [
          {
            recurrenceId: o.recurrenceId,
            amountCents: o.amountCents,
            occurredOn: o.occurredOn,
            status: o.status,
          },
        ]
      : [],
  );

  return summarizeSubscriptions({ ...base, rules, predecessors, occurrences });
}
