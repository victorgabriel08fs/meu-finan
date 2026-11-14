"use client";

import { centsToExpression } from "@/components/quick-add/calculator";
import { Button } from "@/components/ui/button";
import { useQuickAddStore } from "@/stores/quick-add";

/**
 * "Guardar a sobra": opens "Nova transação" as a transfer to the first
 * caixinha with the amount and a description filled in. The person checks
 * and saves; nothing is saved here.
 */
export function SaveLeftoverButton({
  spendableId,
  boxId,
  amountCents,
  description,
}: {
  spendableId: string | null;
  boxId: string;
  amountCents: number;
  description: string;
}) {
  const openQuickAdd = useQuickAddStore((state) => state.openQuickAdd);
  return (
    <Button
      aria-haspopup="dialog"
      onClick={() =>
        openQuickAdd("transfer", {
          accountId: spendableId,
          toAccountId: boxId,
          expression: centsToExpression(amountCents),
          description,
        })
      }
    >
      Guardar a sobra
    </Button>
  );
}
