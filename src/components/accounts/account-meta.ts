import { isValidCardCycle } from "@/lib/finance/invoices";
import type { ColorToken, FinAccountType } from "@/server/db/schema";

/**
 * Client-safe account metadata (doc 02 §3.9, §6.7). Mirrors the labels and
 * icons of `@/server/domain/accounts`, which cannot be imported into Client
 * Components because it pulls in the database client.
 */

export type AccountType = FinAccountType;

/** What the account sheets need, as plain serializable props. */
export type AccountSnapshot = {
  id: string;
  name: string;
  type: AccountType;
  color: string;
  icon: string;
  balanceCents: number;
  includeInNetWorth: boolean;
  card: { limitCents: number; closingDay: number; dueDay: number } | null;
};

export const ACCOUNT_TYPE_OPTIONS: readonly {
  value: AccountType;
  label: string;
  icon: string;
  /** Name suggested while the user has not typed one. */
  defaultName: string;
}[] = [
  {
    value: "checking",
    label: "Conta corrente",
    icon: "landmark",
    defaultName: "Conta principal",
  },
  {
    value: "savings",
    label: "Poupança",
    icon: "piggy-bank",
    defaultName: "Poupança",
  },
  { value: "cash", label: "Dinheiro", icon: "wallet", defaultName: "Carteira" },
  {
    value: "investment",
    label: "Investimento",
    icon: "trending-up",
    defaultName: "Reserva",
  },
  {
    value: "credit_card",
    label: "Cartão de crédito",
    icon: "credit-card",
    defaultName: "Cartão principal",
  },
  {
    value: "other",
    label: "Outra",
    icon: "wallet",
    defaultName: "Outra conta",
  },
];

export function accountTypeLabel(type: AccountType): string {
  return (
    ACCOUNT_TYPE_OPTIONS.find((option) => option.value === type)?.label ??
    "Conta"
  );
}

export function isAccountType(value: unknown): value is AccountType {
  return ACCOUNT_TYPE_OPTIONS.some((option) => option.value === value);
}

/** pt-BR slugs for `?tipo=` links (the enum values work too). */
const TYPE_SLUGS: Record<string, AccountType> = {
  corrente: "checking",
  poupanca: "savings",
  dinheiro: "cash",
  investimento: "investment",
  cartao: "credit_card",
  outra: "other",
};

/** Account type of a `?tipo=` search param; Conta corrente when absent or unknown. */
export function accountTypeFromParam(value: unknown): AccountType {
  if (typeof value !== "string") return "checking";
  if (isAccountType(value)) return value;
  return Object.hasOwn(TYPE_SLUGS, value)
    ? (TYPE_SLUGS[value] as AccountType)
    : "checking";
}

/** Accounts that may hold a negative balance (overdraft). */
export function allowsNegativeBalance(type: AccountType): boolean {
  return type === "checking" || type === "other";
}

export type AccountGroup = "available" | "investments" | "cards";

/** Groups of the Contas screen: Disponível · Investimentos · Cartões de crédito. */
export const ACCOUNT_GROUPS: readonly {
  value: AccountGroup;
  label: string;
}[] = [
  { value: "available", label: "Disponível" },
  { value: "investments", label: "Investimentos" },
  { value: "cards", label: "Cartões de crédito" },
];

export function accountGroupOf(type: AccountType): AccountGroup {
  if (type === "credit_card") return "cards";
  if (type === "investment" || type === "savings") return "investments";
  return "available";
}

/** Detail screen of an account: cards have their own (/cartoes/[id]). */
export function accountHref(account: { id: string; type: AccountType }) {
  return account.type === "credit_card"
    ? `/cartoes/${account.id}`
    : `/contas/${account.id}`;
}

export type AccountColor = Exclude<ColorToken, "neutral">;

/** The eight category hues (doc 02 §3.2) with names for screen readers. */
export const ACCOUNT_COLOR_OPTIONS: readonly {
  value: AccountColor;
  label: string;
}[] = [
  { value: "cat-1", label: "Azul" },
  { value: "cat-2", label: "Laranja" },
  { value: "cat-3", label: "Água" },
  { value: "cat-4", label: "Amarelo" },
  { value: "cat-5", label: "Magenta" },
  { value: "cat-6", label: "Verde" },
  { value: "cat-7", label: "Violeta" },
  { value: "cat-8", label: "Vermelho" },
];

export function isAccountColor(value: unknown): value is AccountColor {
  return ACCOUNT_COLOR_OPTIONS.some((option) => option.value === value);
}

/** Default color by type, as the server picks it (cards violet, the rest blue). */
export function defaultColorFor(type: AccountType): AccountColor {
  return type === "credit_card" ? "cat-7" : "cat-1";
}

/**
 * Limit use of a card from its list item (same math as getCardOverview):
 * owed today, future installments/scheduled purchases and what is left.
 */
export function cardUsage(account: {
  balanceCents: number;
  pendingCents: number;
  card: { limitCents: number } | null;
}) {
  const owedCents = Math.max(0, -account.balanceCents);
  const futureCents = Math.max(0, -account.pendingCents);
  const limitCents = account.card?.limitCents ?? 0;
  return {
    owedCents,
    futureCents,
    limitCents,
    availableCents: limitCents - owedCents - futureCents,
  };
}

/** Days offered for closing and due dates. */
export const MONTH_DAYS: readonly number[] = Array.from(
  { length: 31 },
  (_, index) => index + 1,
);

/**
 * Message for an invalid card cycle (doc 03 §9 / isValidCardCycle), or null.
 * A due day after a closing day of 28+ would clamp to the closing date in
 * short months, so such cards must be due in the following month.
 */
export function cardCycleError(
  closingDay: number | null,
  dueDay: number | null,
): { field: "closingDay" | "dueDay"; message: string } | null {
  if (closingDay === null) {
    return { field: "closingDay", message: "Escolha o dia de fechamento." };
  }
  if (dueDay === null) {
    return { field: "dueDay", message: "Escolha o dia de vencimento." };
  }
  if (!isValidCardCycle({ closingDay, dueDay })) {
    return {
      field: "dueDay",
      message: `Com fechamento no dia 28 ou depois, o vencimento cai no mês seguinte: escolha um dia até ${closingDay}.`,
    };
  }
  return null;
}

/** "Fecha dia 17 e vence dia 25 do mesmo mês." / "… do mês seguinte." */
export function cardCycleSummary(closingDay: number, dueDay: number): string {
  const month = dueDay > closingDay ? "do mesmo mês" : "do mês seguinte";
  return `Fecha dia ${closingDay} e vence dia ${dueDay} ${month}.`;
}
