"use client";

import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { upsertBudgetAction } from "@/server/actions/planning";

const NETWORK_ERROR = "Não conseguimos salvar. Verifique a conexão.";

/**
 * "Usar em {mês}": saves the suggestion as the budget of the current month
 * with one tap. The label and the toast carry no amounts (discreet mode).
 */
export function BudgetSuggestionButton({
  categoryId,
  categoryName,
  month,
  monthName,
  amountCents,
  label,
}: {
  categoryId: string;
  categoryName: string;
  /** The month the budget is saved for (the current one), `YYYY-MM`. */
  month: string;
  /** "novembro". */
  monthName: string;
  amountCents: number;
  label: string;
}) {
  const save = useAction(upsertBudgetAction, {
    onSuccess: () => {
      toast(`Orçamento de ${categoryName} salvo para ${monthName}.`);
    },
    onError: ({ error }) => {
      toast(error.serverError ?? NETWORK_ERROR);
    },
  });
  return (
    <Button
      variant="tonal"
      size="sm"
      loading={save.isPending}
      aria-label={`Usar a sugestão de ${categoryName} em ${monthName}`}
      onClick={() => save.execute({ categoryId, month, amountCents })}
    >
      {label}
    </Button>
  );
}
