import { show } from "./guards";
import { assertCents } from "./money";

/**
 * Balances of a group that shares expenses (doc 03 §14). A member's net is
 * what they put in minus what they owe: positive, the others owe them;
 * negative, they owe. Settlements move money between two members and count
 * like a payment of the debt.
 */

/** What each member paid, owes, sent and received, summed over the group's history. */
export type MemberTotals = {
  memberId: string;
  /** Expenses this member paid. */
  paidCents: number;
  /** This member's parts of every expense. */
  owedCents: number;
  /** Settlements this member paid to someone else. */
  sentCents: number;
  /** Settlements this member got from someone else. */
  receivedCents: number;
};

export type MemberNet = { memberId: string; netCents: number };

/** net = paid − owed + sent − received, per member, in the order given. */
export function netFromTotals(totals: readonly MemberTotals[]): MemberNet[] {
  return totals.map((row) => {
    for (const key of [
      "paidCents",
      "owedCents",
      "sentCents",
      "receivedCents",
    ] as const) {
      assertCents(row[key], `${row.memberId}.${key}`);
    }
    return {
      memberId: row.memberId,
      netCents:
        row.paidCents - row.owedCents + row.sentCents - row.receivedCents,
    };
  });
}

export type GroupExpense = {
  paidBy: string;
  amountCents: number;
  shares: readonly { memberId: string; shareCents: number }[];
};

export type GroupSettlement = { from: string; to: string; amountCents: number };

/**
 * The nets from each expense and settlement (the expanded form of
 * `netFromTotals`, which the server feeds with sums). Members outside
 * `memberIds` are added at the end, in the order they appear.
 */
export function groupBalances(
  memberIds: readonly string[],
  expenses: readonly GroupExpense[],
  settlements: readonly GroupSettlement[],
): MemberNet[] {
  const nets = new Map<string, number>(memberIds.map((id) => [id, 0]));
  const add = (id: string, cents: number) => {
    assertCents(cents);
    nets.set(id, (nets.get(id) ?? 0) + cents);
  };
  for (const expense of expenses) {
    add(expense.paidBy, expense.amountCents);
    for (const share of expense.shares) add(share.memberId, -share.shareCents);
  }
  for (const settlement of settlements) {
    add(settlement.from, settlement.amountCents);
    add(settlement.to, -settlement.amountCents);
  }
  return [...nets].map(([memberId, netCents]) => ({ memberId, netCents }));
}

/** One payment of the plan: `from` pays `amountCents` to `to`. */
export type Transfer = { from: string; to: string; amountCents: number };

/**
 * Who pays whom to settle everything: repeatedly the largest debtor pays the
 * largest creditor as much as one of them needs (ties to the earlier member).
 * Each step zeroes at least one member, so n members need at most n − 1
 * payments. The nets must sum to zero.
 */
export function settleUpPlan(nets: readonly MemberNet[]): Transfer[] {
  let sum = 0;
  for (const net of nets) {
    assertCents(net.netCents, `${net.memberId}.netCents`);
    sum += net.netCents;
  }
  if (sum !== 0) {
    throw new RangeError(`nets must sum to zero (received ${show(nets)})`);
  }
  const left = nets.map((net, order) => ({ ...net, order }));
  const transfers: Transfer[] = [];
  for (;;) {
    let debtor: (typeof left)[number] | undefined;
    let creditor: (typeof left)[number] | undefined;
    for (const net of left) {
      if (net.netCents < 0 && (!debtor || net.netCents < debtor.netCents))
        debtor = net;
      if (net.netCents > 0 && (!creditor || net.netCents > creditor.netCents))
        creditor = net;
    }
    if (!debtor || !creditor) break;
    const amountCents = Math.min(-debtor.netCents, creditor.netCents);
    transfers.push({
      from: debtor.memberId,
      to: creditor.memberId,
      amountCents,
    });
    debtor.netCents += amountCents;
    creditor.netCents -= amountCents;
  }
  return transfers;
}

/**
 * The payment of the plan between `a` and `b`, seen from `a`: positive when
 * `b` pays `a`, negative when `a` pays `b`, 0 when the plan has none.
 */
export function transferBetween(
  plan: readonly Transfer[],
  a: string,
  b: string,
): number {
  for (const transfer of plan) {
    if (transfer.from === b && transfer.to === a) return transfer.amountCents;
    if (transfer.from === a && transfer.to === b) return -transfer.amountCents;
  }
  return 0;
}
