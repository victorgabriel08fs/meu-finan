import { unstable_rethrow } from "next/navigation";
import { requireUser } from "@/server/dal";
import { ACCOUNT_TYPE_LABELS, listAccounts } from "@/server/domain/accounts";
import { getUserContext } from "@/server/domain/context";
import { getQuickAddData } from "@/server/domain/quick-add";
import { QuickAddSheet, QuickAddUnavailable } from "./quick-add-sheet";
import type { QuickAddCategory, QuickAddSheetData } from "./types";

function isAccountType(type: string): type is keyof typeof ACCOUNT_TYPE_LABELS {
  return Object.hasOwn(ACCOUNT_TYPE_LABELS, type);
}

function toCategory({
  id,
  name,
  icon,
  color,
  parentId,
}: QuickAddCategory): QuickAddCategory {
  return { id, name, icon, color, parentId };
}

/**
 * Server half of the global quick-add sheet: render it inside <Suspense> in
 * the app layout. Checks the session first (nothing runs while prerendering),
 * then loads accounts (with card cycles for the invoice hint) and categories
 * ordered by use. A failed load must not take the whole shell down, so it
 * degrades to a sheet that explains instead of opening.
 */
export async function QuickAddLoader() {
  const user = await requireUser();
  let data: QuickAddSheetData;
  try {
    const ctx = await getUserContext(user.id);
    const [quickAdd, accounts] = await Promise.all([
      getQuickAddData(ctx),
      listAccounts(ctx.userId),
    ]);
    const cards = new Map(
      accounts.map((account) => [account.id, account.card]),
    );
    data = {
      timeZone: ctx.timeZone,
      accounts: quickAdd.accounts.map((account) => {
        const card = cards.get(account.id);
        return {
          ...account,
          typeLabel: isAccountType(account.type)
            ? ACCOUNT_TYPE_LABELS[account.type]
            : "Conta",
          card: card
            ? { closingDay: card.closingDay, dueDay: card.dueDay }
            : null,
        };
      }),
      expenseCategories: quickAdd.expenseCategories.map(toCategory),
      incomeCategories: quickAdd.incomeCategories.map(toCategory),
      lastAccountId: quickAdd.lastAccountId,
    };
  } catch (error) {
    unstable_rethrow(error);
    console.error("[quick-add] could not load the sheet data", error);
    return <QuickAddUnavailable />;
  }
  return <QuickAddSheet data={data} />;
}
