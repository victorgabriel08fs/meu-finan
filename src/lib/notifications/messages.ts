// The texts of the daily notices (doc 02 §10), approved by the owner on
// 05/11/2026. One builder per event: the data in, the title and body out,
// or null when there is nothing to say. Without `showAmounts` no amount
// reaches the lock screen (no "R$"); percentages and counts may.
import {
  type AverageComparison,
  type BudgetStatus,
  daysBetween,
  parse,
} from "@/lib/finance";
import {
  monthNameLabel,
  periodLabel,
  shortDateLabel,
  weekdayDateLabel,
} from "@/lib/format/date";
import { formatBRL } from "@/lib/format/money";

export type ReminderMessage = { title: string; body: string };

export type MessageOptions = {
  /** "Mostrar valores nas notificações". */
  showAmounts: boolean;
  /** YYYY-MM-DD in the person's time zone. */
  todayIso: string;
};

/**
 * "A", "A e B", "A, B e C"; past `max` names, "A, B e mais 2".
 */
export function joinNames(
  names: readonly string[],
  max: number = Number.POSITIVE_INFINITY,
): string {
  if (names.length > max) {
    return `${names.slice(0, max).join(", ")} e mais ${names.length - max}`;
  }
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

/** Relative dates go up to this many days (doc 02 §10.1). */
const RELATIVE_DAYS = 6;

/**
 * "hoje", "amanhã", "ontem", "em 3 dias", "há 3 dias"; further away, the
 * data curta of `date`: "em 2/nov".
 */
export function dayWord(days: number, date?: string): string {
  if (days === 0) return "hoje";
  if (days === 1) return "amanhã";
  if (days === -1) return "ontem";
  if (date && Math.abs(days) > RELATIVE_DAYS) {
    return `em ${shortDateLabel(date)}`;
  }
  return days > 0 ? `em ${days} dias` : `há ${-days} dias`;
}

/** Said the same way with and without amounts. */
const BUDGET_USED = "O orçamento do mês já foi todo usado.";

const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

const sentences = (parts: readonly (string | null | false)[]) =>
  parts.filter(Boolean).join(" ");

// Resumo do dia --------------------------------------------------------------

export type DailySummaryInput = {
  /** Without an account that counts in the Saldo em contas, nothing goes. */
  hasLiquidAccount: boolean;
  balanceCents: number;
  /** Bills due today (pending entries off the cards and open invoices). */
  dueToday: readonly { title: string; amountCents: number }[];
  /** The month's budgets as a whole; null without budgets. */
  budget: { status: BudgetStatus; perDayCents: number } | null;
  /** Paid expenses yesterday (magnitude). */
  yesterdayExpenseCents: number;
};

/** Names in "Vencem hoje" before "e mais N". */
const DUE_TODAY_NAMES = 2;

export function dailySummaryMessage(
  input: DailySummaryInput,
  { showAmounts }: MessageOptions,
): ReminderMessage | null {
  if (!input.hasLiquidAccount) return null;
  const { dueToday, budget } = input;

  let due = "Nada vence hoje.";
  if (dueToday.length > 0) {
    const names = joinNames(
      dueToday.map((item) => item.title),
      DUE_TODAY_NAMES,
    );
    const total = dueToday.reduce((sum, item) => sum + item.amountCents, 0);
    due = `${dueToday.length === 1 ? "Vence" : "Vencem"} hoje: ${names}${
      showAmounts ? ` (${formatBRL(total)})` : ""
    }.`;
  }

  if (showAmounts) {
    let pace: string | null = null;
    if (budget) {
      pace =
        budget.status === "over" || budget.perDayCents === 0
          ? BUDGET_USED
          : `Dá para gastar ${formatBRL(budget.perDayCents)} hoje.`;
    }
    return {
      title: "Resumo do dia",
      body: sentences([
        `Saldo em contas: ${formatBRL(input.balanceCents)}.`,
        due,
        pace,
        input.yesterdayExpenseCents > 0 &&
          `Ontem saíram ${formatBRL(input.yesterdayExpenseCents)}.`,
      ]),
    };
  }

  let pace: string | null = null;
  if (budget) {
    pace =
      budget.status === "over" || budget.perDayCents === 0
        ? BUDGET_USED
        : budget.status === "ahead"
          ? "Gastos acima do ritmo do orçamento."
          : "Gastos no ritmo do orçamento.";
  }
  return {
    title: "Resumo do dia",
    body: sentences([due, pace, "Toque para ver o saldo."]),
  };
}

// Contas a vencer ------------------------------------------------------------

export type BillReminderItem = {
  type: "transaction" | "invoice";
  /** Description, or "Fatura {cartão}". */
  title: string;
  amountCents: number;
  accountName: string;
  /** YYYY-MM-DD */
  dueOn: string;
  /** Days from today to the due date (negative once overdue). */
  days: number;
  overdue: boolean;
};

/** Names in a notice with several bills before "E mais N." */
const BILL_NAMES = 4;

function billTitle(item: BillReminderItem): string {
  return `${item.title} ${item.overdue ? "venceu" : "vence"} ${dayWord(item.days, item.dueOn)}`;
}

function billGroupLabel(item: BillReminderItem, count: number): string {
  const word = dayWord(item.days, item.dueOn);
  if (item.days >= 0) return capitalize(word);
  return `${count === 1 ? "Venceu" : "Venceram"} ${word}`;
}

/** `items` in the order of selectBillReminders (upcoming, then overdue). */
export function billsDueMessage(
  items: readonly BillReminderItem[],
  { showAmounts }: MessageOptions,
): ReminderMessage | null {
  const [first] = items;
  if (!first) return null;

  if (items.length === 1) {
    let body: string;
    if (first.type === "invoice") {
      body = showAmounts
        ? `${formatBRL(first.amountCents)} em aberto.`
        : "Toque para ver a fatura.";
    } else {
      body = `${
        showAmounts
          ? `${formatBRL(first.amountCents)} · ${first.accountName}`
          : `Sai da ${first.accountName}`
      }. Toque para ver e marcar como pago.`;
    }
    return { title: billTitle(first), body };
  }

  const shown = items.slice(0, BILL_NAMES);
  const groups: { first: BillReminderItem; names: string[] }[] = [];
  for (const item of shown) {
    const name = showAmounts
      ? `${item.title} (${formatBRL(item.amountCents)})`
      : item.title;
    const group = groups.find((entry) => entry.first.days === item.days);
    if (group) group.names.push(name);
    else groups.push({ first: item, names: [name] });
  }
  const rest = items.length - shown.length;
  return {
    title: items.some((item) => item.overdue)
      ? `${items.length} contas para pagar`
      : `${items.length} contas vencem em breve`,
    body: sentences([
      ...groups.map(
        (group) =>
          `${billGroupLabel(group.first, group.names.length)}: ${joinNames(group.names)}.`,
      ),
      rest > 0 && `E mais ${plural(rest, "conta", "contas")}.`,
    ]),
  };
}

// Próxima receita ------------------------------------------------------------

export type IncomeCountdownInput = {
  description: string;
  amountCents: number;
  /** YYYY-MM-DD, from tomorrow on. */
  date: string;
  /** Saldo previsto up to the day before the income. */
  forecastCents: number;
  /** What can be spent a day until then (capped by the budget). */
  perDayCents: number;
  /** The month has budgets: a zero per day means they are used up. */
  hasBudget: boolean;
};

export function incomeCountdownMessage(
  input: IncomeCountdownInput,
  { showAmounts, todayIso }: MessageOptions,
): ReminderMessage | null {
  const days = daysBetween(parse(todayIso), parse(input.date));
  if (days < 1) return null;
  const title =
    days === 1
      ? `${input.description} amanhã`
      : `${input.description} em ${days} dias`;
  const left = days === 1 ? "Falta 1 dia" : `Faltam ${days} dias`;
  const when = weekdayDateLabel(input.date);
  const negative = input.forecastCents < 0;
  const used = !negative && input.hasBudget && input.perDayCents === 0;
  // A day away, the money until then is today's.
  const tomorrow = days === 1;

  if (showAmounts) {
    let spend = tomorrow
      ? `Hoje, dá para gastar ${formatBRL(input.perDayCents)}.`
      : `Até lá, dá para gastar ${formatBRL(input.perDayCents)} por dia.`;
    if (used) spend = BUDGET_USED;
    if (negative) {
      spend = `Até lá, o saldo previsto fica em ${formatBRL(input.forecastCents)}.`;
    }
    return {
      title,
      body: sentences([
        `${left} para receber ${formatBRL(input.amountCents)} (${when}).`,
        spend,
      ]),
    };
  }
  let spend = tomorrow
    ? "Toque para ver quanto dá para gastar hoje."
    : "Toque para ver quanto dá para gastar por dia até lá.";
  if (used) spend = BUDGET_USED;
  if (negative) spend = "Até lá, o saldo previsto fica negativo.";
  return { title, body: sentences([`${left} (${when}).`, spend]) };
}

// Resumo semanal -------------------------------------------------------------

export type WeeklySummaryInput = {
  /** Monday and Sunday, YYYY-MM-DD. */
  start: string;
  end: string;
  incomeCents: number;
  /** Magnitude (positive). */
  expenseCents: number;
  /** Against the 4 weeks before; null when there is too little history. */
  comparison: AverageComparison | null;
  /** Categories that weighed most, largest first. */
  topCategories: readonly string[];
};

/** Within ±5% of the average is "perto da sua média". */
const NEAR_AVERAGE = 0.05;

/** "18% abaixo da sua média", "7% acima da sua média", "perto da sua média". */
export function comparisonText(comparison: AverageComparison): string {
  const pct = Math.round(Math.abs(comparison.ratio) * 100);
  if (comparison.ratio <= -NEAR_AVERAGE) return `${pct}% abaixo da sua média`;
  if (comparison.ratio >= NEAR_AVERAGE) return `${pct}% acima da sua média`;
  return "perto da sua média";
}

const TOP_CATEGORIES = 3;

export function weeklySummaryMessage(
  input: WeeklySummaryInput,
  { showAmounts }: MessageOptions,
): ReminderMessage | null {
  const { incomeCents, expenseCents, comparison } = input;
  if (incomeCents <= 0 && expenseCents <= 0) return null;
  const top = input.topCategories.slice(0, TOP_CATEGORIES);
  const weighed =
    expenseCents > 0 &&
    top.length > 0 &&
    `${top.length === 1 ? "Mais pesou" : "Mais pesaram"}: ${joinNames(top)}.`;
  const compared = expenseCents > 0 && comparison && comparisonText(comparison);

  let flow: string;
  if (showAmounts) {
    flow =
      expenseCents > 0
        ? `Saíram ${formatBRL(expenseCents)}${compared ? ` (${compared})` : ""}${
            incomeCents > 0 ? ` e entraram ${formatBRL(incomeCents)}` : ""
          }.`
        : `Entraram ${formatBRL(incomeCents)}.`;
  } else if (expenseCents <= 0) {
    flow = "Nenhuma despesa na semana.";
  } else {
    flow = compared ? `Despesas ${compared}.` : "";
  }
  return {
    title: `Sua semana: ${periodLabel(input.start, input.end)}`,
    body: sentences([flow, weighed]) || "Toque para ver como foi a semana.",
  };
}

// Resumo mensal --------------------------------------------------------------

export type MonthlySummaryInput = {
  /** The financial month that closed, YYYY-MM (its label). */
  month: string;
  incomeCents: number;
  /** Magnitude (positive). */
  expenseCents: number;
  /** Budgets of that month: how many kept, and the names of those over. */
  budgets: { met: number; over: readonly string[] } | null;
};

/** Names of the budgets over before "e mais N". */
const OVER_BUDGET_NAMES = 4;

function budgetsText(budgets: MonthlySummaryInput["budgets"]): string | null {
  if (!budgets) return null;
  const { met, over } = budgets;
  const total = met + over.length;
  if (total === 0) return null;
  if (over.length === 0) {
    return total === 1
      ? "1 orçamento cumprido."
      : `Todos os ${total} orçamentos cumpridos.`;
  }
  const overText = `${plural(over.length, "estourado", "estourados")} (${joinNames(over, OVER_BUDGET_NAMES)})`;
  return met === 0
    ? `Orçamentos: ${overText}.`
    : `Orçamentos: ${plural(met, "cumprido", "cumpridos")} e ${overText}.`;
}

export function monthlySummaryMessage(
  input: MonthlySummaryInput,
  { showAmounts }: MessageOptions,
): ReminderMessage | null {
  const { incomeCents, expenseCents } = input;
  if (incomeCents <= 0 && expenseCents <= 0) return null;
  const name = monthNameLabel(input.month);
  const left = incomeCents - expenseCents;

  let result: string;
  if (showAmounts) {
    result = `Entraram ${formatBRL(incomeCents)} e saíram ${formatBRL(expenseCents)}: ${
      left >= 0 ? `sobraram ${formatBRL(left)}` : `faltaram ${formatBRL(-left)}`
    }.`;
  } else if (left > 0) {
    result = `Você fechou ${name} no azul.`;
  } else if (left < 0) {
    result = "As despesas passaram das receitas.";
  } else {
    result = "Receitas e despesas empataram.";
  }
  return {
    title: `Resumo de ${name}`,
    body: sentences([result, budgetsText(input.budgets)]),
  };
}
