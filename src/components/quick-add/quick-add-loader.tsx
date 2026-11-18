import { unstable_rethrow } from "next/navigation";
import { requireUser } from "@/server/dal";
import { ACCOUNT_TYPE_LABELS } from "@/server/domain/accounts";
import { getUserContext } from "@/server/domain/context";
import { getQuickAddData } from "@/server/domain/quick-add";
import { isFlagEnabled } from "@/server/flags";
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
  order,
}: QuickAddCategory): QuickAddCategory {
  return { id, name, icon, color, parentId, order };
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
    const [quickAdd, textEntry] = await Promise.all([
      getQuickAddData(ctx),
      // A flag that cannot be read must not take the sheet down.
      isFlagEnabled("lancamento_por_texto", user.id).catch((error) => {
        unstable_rethrow(error);
        return false;
      }),
    ]);
    data = {
      timeZone: ctx.timeZone,
      accounts: quickAdd.accounts.map((account) => ({
        ...account,
        typeLabel: isAccountType(account.type)
          ? ACCOUNT_TYPE_LABELS[account.type]
          : "Conta",
      })),
      expenseCategories: quickAdd.expenseCategories.map(toCategory),
      incomeCategories: quickAdd.incomeCategories.map(toCategory),
      lastAccountId: quickAdd.lastAccountId,
      tags: quickAdd.tags,
      textEntry,
    };
  } catch (error) {
    unstable_rethrow(error);
    console.error("[quick-add] could not load the sheet data", error);
    return <QuickAddUnavailable />;
  }
  return <QuickAddSheet data={data} />;
}
