import type { CardCycle } from "@/lib/finance";

/** An account as the quick-add pickers show it. */
export type QuickAddAccount = {
  id: string;
  name: string;
  /** `checking`, `savings`, `cash`, `investment`, `credit_card` or `other`. */
  type: string;
  /** pt-BR label of the type ("Conta corrente", "Cartão de crédito"…). */
  typeLabel: string;
  icon: string;
  color: string;
  /** Closing and due days of a credit card, for "Entra na fatura de…". */
  card: CardCycle | null;
};

export type QuickAddCategory = {
  id: string;
  name: string;
  icon: string;
  color: string;
  parentId: string | null;
};

/** Everything the "Nova transação" sheet needs, loaded once per session. */
export type QuickAddSheetData = {
  /** The user's IANA time zone; "today" is computed when the sheet opens. */
  timeZone: string;
  accounts: QuickAddAccount[];
  /** Ordered by use in the last 90 days. */
  expenseCategories: QuickAddCategory[];
  incomeCategories: QuickAddCategory[];
  /** Account of the most recent expense: the default of the form. */
  lastAccountId: string | null;
};
