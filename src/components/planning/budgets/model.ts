import { formatMoneyShort } from "@/components/charts/format";
import type { BudgetStatus } from "@/lib/finance/budget";

/**
 * Copy and numbers for the budgets screen (doc 02 §6.9, doc 03 §11). Pure:
 * the page computes them from the server data and tests pin the wording.
 */

export type BudgetLine = {
  budgetCents: number;
  spentCents: number;
  scheduledCents: number;
  availableCents: number;
  status: BudgetStatus;
};

const STATUS_SPOKEN: Record<BudgetStatus, string> = {
  on_track: "no ritmo",
  ahead: "acima do ritmo",
  over: "estourou",
  scheduled: "agendado",
};

/** Right-hand note of a budget row: what is left, or how far over it went. */
export function budgetRowNote(line: BudgetLine): {
  text: string;
  tone: "neutral" | "danger";
} {
  if (line.spentCents > line.budgetCents) {
    return {
      text: `${formatMoneyShort(line.spentCents - line.budgetCents)} acima`,
      tone: "danger",
    };
  }
  if (line.status === "scheduled") {
    return {
      text: `${formatMoneyShort(line.scheduledCents)} agendado`,
      tone: "neutral",
    };
  }
  if (line.availableCents < 0) {
    return {
      text: `${formatMoneyShort(-line.availableCents)} acima com agendados`,
      tone: "danger",
    };
  }
  return {
    text: `Restam ${formatMoneyShort(line.availableCents)}`,
    tone: "neutral",
  };
}

/** Share of the budget already spent, floored ("71%"), for spoken values. */
export function spentPercent(
  line: Pick<BudgetLine, "budgetCents" | "spentCents">,
) {
  if (line.budgetCents <= 0) return 0;
  return Math.floor((line.spentCents / line.budgetCents) * 100);
}

/** aria-valuetext of a budget meter: "R$ 640 de R$ 900, 71%, acima do ritmo". */
export function budgetValueText(line: BudgetLine): string {
  const parts = [
    `${formatMoneyShort(line.spentCents)} de ${formatMoneyShort(line.budgetCents)}`,
    `${spentPercent(line)}%`,
  ];
  if (line.scheduledCents > 0) {
    parts.push(`${formatMoneyShort(line.scheduledCents)} agendados`);
  }
  parts.push(STATUS_SPOKEN[line.status]);
  return parts.join(", ");
}

/** Up to the next R$ 10 (suggestions read as round numbers). */
export function roundUpToTenReais(cents: number): number {
  if (cents <= 0) return 0;
  return Math.ceil(cents / 1000) * 1000;
}

export type SuggestionSource = {
  categoryId: string;
  name: string;
  icon: string;
  color: string;
  /** Average monthly spending over the last 3 months. */
  averageCents: number;
};

export type BudgetSuggestion = SuggestionSource & { amountCents: number };

/**
 * "Usar sugestão" (doc 02 §6.9): one budget per expense category with
 * spending in the last 3 months, at the average rounded up to R$ 10, largest
 * first; categories that already have a budget are left out.
 */
export function suggestBudgets(
  sources: readonly SuggestionSource[],
  budgeted: ReadonlySet<string>,
): BudgetSuggestion[] {
  return sources
    .filter(
      (source) => source.averageCents > 0 && !budgeted.has(source.categoryId),
    )
    .map((source) => ({
      ...source,
      amountCents: roundUpToTenReais(source.averageCents),
    }))
    .sort(
      (a, b) =>
        b.amountCents - a.amountCents || a.name.localeCompare(b.name, "pt-BR"),
    );
}

export type MonthTiming = "past" | "current" | "future";

/** Caption under the summary: "Orçado R$ 4.500 em 6 categorias · hoje é o dia 14 de 31". */
export function summaryCaption(input: {
  budgetCents: number;
  categories: number;
  timing: MonthTiming;
  elapsedDays: number;
  totalDays: number;
}): string {
  const count =
    input.categories === 1 ? "1 categoria" : `${input.categories} categorias`;
  const head = `Orçado ${formatMoneyShort(input.budgetCents)} em ${count}`;
  if (input.timing === "past") return `${head} · mês encerrado`;
  if (input.timing === "future") return `${head} · o mês ainda não começou`;
  return `${head} · hoje é o dia ${input.elapsedDays} de ${input.totalDays}`;
}

/** "1 orçamento copiado de setembro." and friends. */
export function copiedMessage(copied: number, fromMonthName: string): string {
  if (copied === 0) return `Nada novo para copiar de ${fromMonthName}.`;
  if (copied === 1) return `1 orçamento copiado de ${fromMonthName}.`;
  return `${copied} orçamentos copiados de ${fromMonthName}.`;
}
