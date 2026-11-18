// Data the "Nova transação" sheet needs to open instantly (doc 02 §6.5).
import { and, desc, eq, isNull } from "drizzle-orm";
import {
  addDays,
  isDefaultEntryType,
  iso,
  isSpendableType,
} from "@/lib/finance";
import { db } from "@/server/db/client";
import { transactions } from "@/server/db/schema";
import { type CategoryItem, categoriesByUse } from "./categories";
import type { UserContext } from "./context";
import { accountOptionsOf } from "./request-reads";
import { listTags } from "./tags";

export type QuickAddData = {
  today: string;
  yesterday: string;
  accounts: {
    id: string;
    name: string;
    type: string;
    icon: string;
    color: string;
    /** The card's cycle (the invoice hint); null outside cards. */
    card: { closingDay: number; dueDay: number } | null;
  }[];
  /** Ordered by use in the last 90 days. */
  expenseCategories: CategoryItem[];
  incomeCategories: CategoryItem[];
  /** Account of the most recent entry, the default of the form. */
  lastAccountId: string | null;
  /** Active tags, in name order. */
  tags: { id: string; name: string }[];
};

export async function getQuickAddData(ctx: UserContext): Promise<QuickAddData> {
  const since = iso(addDays(ctx.today, -90));
  const [accounts, expenseCategories, incomeCategories, [last], tags] =
    await Promise.all([
      accountOptionsOf(ctx),
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
      listTags(ctx.userId),
    ]);
  return {
    today: ctx.todayIso,
    yesterday: iso(addDays(ctx.today, -1)),
    accounts: accounts.map(({ id, name, type, icon, color, card }) => ({
      id,
      name,
      type,
      icon,
      color,
      card,
    })),
    expenseCategories,
    incomeCategories,
    lastAccountId:
      // Never a caixinha (money set aside) nor a benefício (it only pays for
      // some things), even when it was the last one used.
      last &&
      accounts.some(
        (account) =>
          account.id === last.accountId && isDefaultEntryType(account.type),
      )
        ? last.accountId
        : (accounts.find((account) => isSpendableType(account.type))?.id ??
          null),
    tags: tags.map(({ id, name }) => ({ id, name })),
  };
}
