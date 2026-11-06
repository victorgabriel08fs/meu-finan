// Reads that several screens of one request share — the blocks of the Início
// (Saldo, Contas, Próximas contas, the first run) and the Fluxo de caixa,
// also a block there — made once per request. React `cache` keys on the
// context object, which getUserContext memoises for the request too.
// `reports.ts` and `dashboard.ts` both read through here (neither may import
// the other's loaders: reports is a dependency of the dashboard).
import { and, eq, isNull, sql } from "drizzle-orm";
import { cache } from "react";
import { iso, localDateIn } from "@/lib/finance";
import { earliestDate } from "@/lib/reports/coverage";
import { db } from "@/server/db/client";
import { finAccounts, transactions } from "@/server/db/schema";
import { type AccountListItem, listAccounts } from "./accounts";
import { listInvoices } from "./cards";
import type { UserContext } from "./context";
import { pendingEntries } from "./transactions";

/** The person's accounts: the Saldo, the Contas, the first run and the Fluxo. */
export const accountsOf = cache(
  (ctx: UserContext): Promise<AccountListItem[]> => listAccounts(ctx.userId),
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
