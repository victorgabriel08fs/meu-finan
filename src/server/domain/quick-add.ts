// Data the "Nova transação" sheet needs to open instantly (doc 02 §6.5).
import { and, desc, eq, isNull } from "drizzle-orm";
import { addDays, iso } from "@/lib/finance";
import { db } from "@/server/db/client";
import { transactions } from "@/server/db/schema";
import { listAccounts } from "./accounts";
import { type CategoryItem, categoriesByUse } from "./categories";
import type { UserContext } from "./context";

export type QuickAddData = {
  today: string;
  yesterday: string;
  accounts: {
    id: string;
    name: string;
    type: string;
    icon: string;
    color: string;
  }[];
  /** Ordered by use in the last 90 days. */
  expenseCategories: CategoryItem[];
  incomeCategories: CategoryItem[];
  /** Account of the most recent entry, the default of the form. */
  lastAccountId: string | null;
};

export async function getQuickAddData(ctx: UserContext): Promise<QuickAddData> {
  const since = iso(addDays(ctx.today, -90));
  const [accounts, expenseCategories, incomeCategories, [last]] =
    await Promise.all([
      listAccounts(ctx.userId),
      categoriesByUse(ctx.userId, "expense", since),
      categoriesByUse(ctx.userId, "income", since),
      db
        .select({ accountId: transactions.accountId })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, ctx.userId),
            isNull(transactions.deletedAt),
            eq(transactions.kind, "expense"),
          ),
        )
        .orderBy(desc(transactions.createdAt))
        .limit(1),
    ]);
  return {
    today: ctx.todayIso,
    yesterday: iso(addDays(ctx.today, -1)),
    accounts: accounts.map(({ id, name, type, icon, color }) => ({
      id,
      name,
      type,
      icon,
      color,
    })),
    expenseCategories,
    incomeCategories,
    lastAccountId:
      last && accounts.some((account) => account.id === last.accountId)
        ? last.accountId
        : (accounts.find((account) => account.type !== "credit_card")?.id ??
          null),
  };
}
