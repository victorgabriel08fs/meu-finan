// Reads that several screens of one request share — the blocks of the Início
// (Saldo, Contas, Próximas contas, the first run) and the Fluxo de caixa,
// also a block there — made once per request. React `cache` keys on the
// context object, which getUserContext memoises for the request too.
// `reports.ts` and `dashboard.ts` both read through here (neither may import
// the other's loaders: reports is a dependency of the dashboard).
import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  ne,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { cache } from "react";
import { iso, isSpendableAccount, localDateIn } from "@/lib/finance";
import { earliestDate } from "@/lib/reports/coverage";
import { db } from "@/server/db/client";
import { finAccounts, transactions } from "@/server/db/schema";
import { type AccountListItem, listAccounts } from "./accounts";
import { listInvoices } from "./cards";
import type { UserContext } from "./context";
import { getHomeBlockSettings } from "./preferences";
import { pendingEntries } from "./transactions";

/** The person's accounts: the Saldo, the Contas, the first run and the Fluxo. */
export const accountsOf = cache(
  (ctx: UserContext): Promise<AccountListItem[]> => listAccounts(ctx.userId),
);

/**
 * The accounts the Saldo, the forecast, the Fluxo and the daily notices count:
 * outside cards and caixinhas, in the net worth, active (`isSpendableAccount`).
 */
export const spendableAccountsOf = cache(async (ctx: UserContext) =>
  (await accountsOf(ctx)).filter(isSpendableAccount),
);

/** The credit cards and, in the same order, each one's invoices. */
export const cardInvoicesOf = cache(async (ctx: UserContext) => {
  const cards = (await accountsOf(ctx)).filter(
    (account) => account.type === "credit_card",
  );
  const invoicesByCard = await Promise.all(
    cards.map((card) => listInvoices(ctx, card.id)),
  );
  return { cards, invoicesByCard };
});

/**
 * Pending transactions up to a day: the end of the period for the forecast
 * and the Fluxo, today + 7 for the próximas contas (one read when they meet).
 */
export const pendingUntil = cache((ctx: UserContext, until: string) =>
  pendingEntries(ctx, until),
);

export type PaidAccountDay = {
  accountId: string;
  /** `YYYY-MM-DD`. */
  day: string;
  /** Net of the paid entries (ledger sign). */
  totalCents: number;
  count: number;
};

/**
 * Paid entries of the spendable accounts from a day on, netted by account
 * and day (later ones included): the Fluxo adds them up by day, Quanto dá
 * para gastar keeps them by account. Empty without spendable accounts.
 */
export const paidByAccountDaySince = cache(
  async (ctx: UserContext, start: string): Promise<PaidAccountDay[]> => {
    const ids = (await spendableAccountsOf(ctx)).map((account) => account.id);
    if (ids.length === 0) return [];
    return db
      .select({
        accountId: transactions.accountId,
        day: transactions.occurredOn,
        totalCents:
          sql<number>`coalesce(sum(${transactions.amountCents}), 0)`.mapWith(
            Number,
          ),
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, ctx.userId),
          inArray(transactions.accountId, ids),
          isNull(transactions.deletedAt),
          eq(transactions.status, "paid"),
          gte(transactions.occurredOn, start),
        ),
      )
      .groupBy(transactions.accountId, transactions.occurredOn);
  },
);

/** The other leg of a transfer (an invoice payment's, here). */
const sourceLeg = alias(transactions, "source_leg");

/**
 * Per card, the account its latest paid invoice payment came from (by date,
 * then by creation): who pays the invoice when the card names no one. Empty
 * without cards. A JOIN on the transfer, not a correlated subquery.
 */
export const invoicePayersOf = cache(
  async (ctx: UserContext): Promise<Map<string, string>> => {
    const { cards } = await cardInvoicesOf(ctx);
    if (cards.length === 0) return new Map();
    const rows = await db
      .selectDistinctOn([transactions.accountId], {
        cardId: transactions.accountId,
        fromAccountId: sourceLeg.accountId,
      })
      .from(transactions)
      .innerJoin(
        sourceLeg,
        and(
          eq(sourceLeg.transferId, transactions.transferId),
          ne(sourceLeg.id, transactions.id),
          eq(sourceLeg.userId, ctx.userId),
          isNull(sourceLeg.deletedAt),
        ),
      )
      .where(
        and(
          eq(transactions.userId, ctx.userId),
          inArray(
            transactions.accountId,
            cards.map((card) => card.id),
          ),
          isNotNull(transactions.invoiceId),
          eq(transactions.kind, "transfer"),
          eq(transactions.status, "paid"),
          isNull(transactions.deletedAt),
        ),
      )
      .orderBy(
        transactions.accountId,
        desc(transactions.occurredOn),
        desc(transactions.createdAt),
      );
    return new Map(rows.map((row) => [row.cardId, row.fromAccountId]));
  },
);

/** What the person changed in single blocks of the Início (null: nothing). */
export const homeBlockSettingsOf = cache((ctx: UserContext) =>
  getHomeBlockSettings(ctx.userId),
);

/**
 * The day of the person's first record: the earliest non-deleted transaction
 * (any status) or the creation of the oldest account (archived ones too),
 * whichever came first; null with neither. Months that end before it have
 * nothing to report (the Fluxo and the Patrimônio say so).
 */
export const firstRecordOn = cache(
  async (ctx: UserContext): Promise<string | null> => {
    const [[transaction], [account]] = await Promise.all([
      db
        .select({
          first: sql<string | null>`min(${transactions.occurredOn})::text`,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, ctx.userId),
            isNull(transactions.deletedAt),
          ),
        ),
      db
        .select({ first: sql<Date | null>`min(${finAccounts.createdAt})` })
        .from(finAccounts)
        .where(eq(finAccounts.userId, ctx.userId)),
    ]);
    const created = account?.first
      ? iso(localDateIn(new Date(account.first), ctx.timeZone))
      : null;
    return earliestDate(transaction?.first, created);
  },
);
