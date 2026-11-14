// "Assinaturas do mês" (doc 02 §6.3): the expenses that repeat every month,
// what they add up to, the next debit of each one and whether it got more
// expensive than before this financial month. Pure: the queries live in
// src/server/domain/subscriptions.ts.
import {
  addDays,
  iso,
  maxDate,
  occurrencesBetween,
  parse,
} from "@/lib/finance";

export type SubscriptionRule = {
  id: string;
  description: string;
  accountId: string;
  accountName: string;
  /** Negative (expense). */
  amountCents: number;
  byMonthDay: number | null;
  startOn: string;
  endOn: string | null;
  generatedUntil: string;
};

/** A monthly expense rule that ended the day before another one started. */
export type PredecessorRule = {
  id: string;
  description: string;
  byMonthDay: number | null;
  endOn: string;
};

export type SubscriptionOccurrence = {
  recurrenceId: string;
  /** Negative. */
  amountCents: number;
  occurredOn: string;
  status: "paid" | "pending";
};

export type Subscription = {
  recurrenceId: string;
  description: string;
  accountId: string;
  accountName: string;
  /** Next debit, positive. */
  amountCents: number;
  nextOn: string;
  /** Last occurrence before the current financial month, positive; null without one. */
  previousCents: number | null;
  previousOn: string | null;
  /** amountCents − previousCents when positive, else 0. */
  increaseCents: number;
};

export type SubscriptionsSummary = {
  /** Cut at `limit`. */
  items: Subscription[];
  /** Every subscription. */
  totalCount: number;
  /** Sum of the next debit of every subscription. */
  monthlyCents: number;
  /** Every subscription with an increase. */
  increasedCount: number;
  /** Those with an increase beyond `limit`. */
  hiddenIncreasedCount: number;
};

/** How far ahead a rule with no row left is projected to find its next debit. */
const LOOKAHEAD_DAYS = 62;

/**
 * "Este e os próximos" splits a rule: the old one ends the day before the new
 * one starts, and the new one is a copy. The predecessor of `rule` is the rule
 * among `candidates` that ended the day before it started on the same day of
 * the month; with several, the one with the same description, then the
 * greatest id (ids are time-ordered).
 */
export function predecessorOf(
  rule: SubscriptionRule,
  candidates: readonly PredecessorRule[],
): PredecessorRule | null {
  const endOn = iso(addDays(parse(rule.startOn), -1));
  const matches = candidates.filter(
    (c) =>
      c.id !== rule.id && c.endOn === endOn && c.byMonthDay === rule.byMonthDay,
  );
  if (matches.length === 0) return null;
  return matches.reduce((best, c) => {
    const bestSame = best.description === rule.description;
    const cSame = c.description === rule.description;
    if (bestSame !== cSame) return cSame ? c : best;
    return c.id > best.id ? c : best;
  });
}

function nextDebit(
  rule: SubscriptionRule,
  own: readonly SubscriptionOccurrence[],
  todayIso: string,
): { on: string; cents: number } | null {
  let best: SubscriptionOccurrence | null = null;
  for (const o of own) {
    const upcoming =
      o.occurredOn > todayIso ||
      (o.occurredOn === todayIso && o.status === "pending");
    if (upcoming && (best === null || o.occurredOn < best.occurredOn)) best = o;
  }
  if (best) return { on: best.occurredOn, cents: best.amountCents };

  const today = parse(todayIso);
  const from =
    rule.startOn > rule.generatedUntil
      ? parse(rule.startOn)
      : addDays(maxDate(today, parse(rule.generatedUntil)), 1);
  const [first] = occurrencesBetween(
    {
      freq: "monthly",
      interval: 1,
      start: parse(rule.startOn),
      end: rule.endOn ? parse(rule.endOn) : undefined,
      byMonthDay: rule.byMonthDay ?? undefined,
    },
    from,
    addDays(today, LOOKAHEAD_DAYS),
  );
  return first ? { on: iso(first), cents: rule.amountCents } : null;
}

export function summarizeSubscriptions(input: {
  rules: readonly SubscriptionRule[];
  predecessors: readonly PredecessorRule[];
  occurrences: readonly SubscriptionOccurrence[];
  todayIso: string;
  /** Start of the financial month that contains today. */
  periodStartIso: string;
  limit: number;
}): SubscriptionsSummary {
  const { rules, occurrences, todayIso, periodStartIso, limit } = input;
  const byRule = new Map<string, SubscriptionOccurrence[]>();
  for (const o of occurrences) {
    const list = byRule.get(o.recurrenceId);
    if (list) list.push(o);
    else byRule.set(o.recurrenceId, [o]);
  }

  // A predecessor serves a single rule: the first one by id.
  let free = [...input.predecessors];
  const all: Subscription[] = [];
  for (const rule of [...rules].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const own = byRule.get(rule.id) ?? [];
    const next = nextDebit(rule, own, todayIso);
    if (!next) continue;

    const predecessor = predecessorOf(rule, free);
    if (predecessor) free = free.filter((p) => p.id !== predecessor.id);
    const series = predecessor
      ? [...own, ...(byRule.get(predecessor.id) ?? [])]
      : own;
    let reference: SubscriptionOccurrence | null = null;
    for (const o of series) {
      if (
        o.occurredOn < periodStartIso &&
        (reference === null || o.occurredOn > reference.occurredOn)
      ) {
        reference = o;
      }
    }

    const amountCents = Math.abs(next.cents);
    const previousCents = reference ? Math.abs(reference.amountCents) : null;
    all.push({
      recurrenceId: rule.id,
      description: rule.description,
      accountId: rule.accountId,
      accountName: rule.accountName,
      amountCents,
      nextOn: next.on,
      previousCents,
      previousOn: reference?.occurredOn ?? null,
      increaseCents:
        previousCents === null ? 0 : Math.max(0, amountCents - previousCents),
    });
  }

  all.sort(
    (a, b) =>
      (a.nextOn < b.nextOn ? -1 : a.nextOn > b.nextOn ? 1 : 0) ||
      b.amountCents - a.amountCents ||
      (a.recurrenceId < b.recurrenceId ? -1 : 1),
  );
  const items = all.slice(0, Math.max(0, limit));
  const increased = (s: Subscription) => s.increaseCents > 0;
  return {
    items,
    totalCount: all.length,
    monthlyCents: all.reduce((sum, s) => sum + s.amountCents, 0),
    increasedCount: all.filter(increased).length,
    hiddenIncreasedCount: all.slice(items.length).filter(increased).length,
  };
}
