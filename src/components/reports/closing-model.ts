import { roundUpToTenReais } from "@/components/planning/budgets/model";
import { addDays, parse } from "@/lib/finance/dates";
import { monthNameLabel } from "@/lib/format/date";

/**
 * Copy and numbers of Fechamento (doc 02 §6.12, doc 03 §12). Pure: the page
 * computes them from the server data and tests pin the wording. A month that
 * fell short is never red or guilty (§10.2).
 */

/** The sentence at the top of "Como foi {mês}". */
export function closingHeadline(leftCents: number, monthName: string): string {
  if (leftCents > 0) return `Você fechou ${monthName} no azul.`;
  if (leftCents < 0) return "As despesas passaram das receitas.";
  return "Receitas e despesas empataram.";
}

/**
 * What is still worth saving: the leftover less what already went to the
 * caixinhas since the month began (never below zero; a withdrawal does not
 * raise it).
 */
export function leftoverToSave(leftCents: number, savedCents: number): number {
  return Math.max(0, leftCents - Math.max(0, savedCents));
}

/** "2 cumpridos e 1 estourado." · "Todos os 3 orçamentos cumpridos." */
export function budgetsSummary(metCount: number, overCount: number): string {
  const over = `${overCount} ${overCount === 1 ? "estourado" : "estourados"}`;
  if (overCount === 0) {
    return metCount === 1
      ? "1 orçamento cumprido."
      : `Todos os ${metCount} orçamentos cumpridos.`;
  }
  if (metCount === 0) return `${over}.`;
  return `${metCount} ${metCount === 1 ? "cumprido" : "cumpridos"} e ${over}.`;
}

export type BudgetSuggestionKind =
  | { kind: "none" }
  | { kind: "create" | "raise" | "covered"; suggestedCents: number };

/**
 * What to offer for a budget that went over: the average of the last 3
 * months rounded up to R$ 10, to create the budget of the current month,
 * raise it, or say that it already covers it.
 */
export function budgetSuggestion({
  averageCents,
  nextBudgetCents,
}: {
  averageCents: number | null;
  nextBudgetCents: number | null;
}): BudgetSuggestionKind {
  if (averageCents === null) return { kind: "none" };
  const suggestedCents = roundUpToTenReais(averageCents);
  if (suggestedCents === 0) return { kind: "none" };
  if (nextBudgetCents === null) return { kind: "create", suggestedCents };
  if (nextBudgetCents < suggestedCents)
    return { kind: "raise", suggestedCents };
  return { kind: "covered", suggestedCents };
}

/**
 * Empty state before any month has closed: "No dia 1º de dezembro, você vê
 * aqui como foi novembro." `currentEnd` is the last day of the running period.
 */
export function firstClosingCopy(
  currentEnd: string,
  currentMonth: string,
): string {
  const next = addDays(parse(currentEnd), 1);
  const month = monthNameLabel(
    `${next.year}-${String(next.month).padStart(2, "0")}`,
  );
  const day = next.day === 1 ? "1º" : String(next.day);
  return `No dia ${day} de ${month}, você vê aqui como foi ${monthNameLabel(currentMonth)}.`;
}
