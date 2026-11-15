import { heatLevels } from "@/components/charts/heat-scale";
import { daysWithoutLabel } from "@/components/reports/calendar-model";
import { leftoverToSave } from "@/components/reports/closing-model";
import { dayMonthLabel } from "@/components/reports/day-labels";
import {
  categoryDetailHref,
  closingHref,
  monthViewHref,
  periodViewHref,
} from "@/components/reports/views";
import {
  MAX_QUERY_LENGTH,
  statementHref,
} from "@/components/transactions/statement-params";
import { dayOfWeek, parse } from "@/lib/finance/dates";
import { monthLabel, monthNameLabel, shortDateLabel } from "@/lib/format/date";
import type { MonthRecap } from "@/server/domain/month-recap";

/**
 * The parts of the Retrospectiva (doc 02 §6.12) and every word on them, from
 * the data of the month. Pure: the page builds the parts on the server, the
 * player only draws them, and tests pin the rules of omission and the copy.
 */

export type RecapSlideId =
  | "intro"
  | "flow"
  | "left"
  | "days"
  | "categories"
  | "biggest"
  | "comparison"
  | "budgets"
  | "next"
  | "outro";

export type RecapCategoryLine = {
  name: string;
  icon: string;
  color: string;
  cents: number;
  /** 0…1 of the month's expenses. */
  share: number;
  percentLabel: string;
};

export type RecapDayCell = {
  date: string;
  day: number;
  paidCents: number;
  /** 0 = no spending, 1…5 as the Calendário. */
  level: number;
  top: boolean;
};

export type RecapSlide =
  | {
      id: "intro";
      title: string;
      /** "1 a 31 de outubro", "5 de outubro a 4 de novembro". */
      range: string;
      lead: string;
    }
  | {
      id: "flow";
      title: string;
      incomeCents: number;
      expenseCents: number;
      note: string | null;
    }
  | {
      id: "left";
      title: string;
      label: string;
      mood: "up" | "down" | "even";
      /** Magnitude: the part never shows a negative number (§10.2). */
      cents: number;
      previous: { lead: string; cents: number | null } | null;
    }
  | {
      id: "days";
      title: string;
      /** Weeks of 7, Sunday first; null pads the first and last week. */
      weeks: (RecapDayCell | null)[][];
      topLine: { lead: string; cents: number } | null;
      withoutLabel: string | null;
      href: string;
    }
  | {
      id: "categories";
      title: string;
      sentence: string;
      items: RecapCategoryLine[];
      others: { label: string; cents: number } | null;
      href: string;
    }
  | {
      id: "biggest";
      title: string;
      description: string;
      cents: number;
      icon: string;
      color: string;
      meta: string;
      extras: string[];
      href: string;
    }
  | {
      id: "comparison";
      title: string;
      lead: string;
      cents: number | null;
      tail: string;
      items: {
        name: string;
        icon: string;
        color: string;
        cents: number;
        direction: "up" | "down";
        href: string;
      }[];
      href: string;
    }
  | {
      id: "budgets";
      title: string;
      sentence: string;
      met: number;
      total: number;
      over: {
        name: string;
        icon: string;
        color: string;
        excessCents: number;
        /** spent / budget, ≥ 1. */
        ratio: number;
      }[];
      allMet: boolean;
      href: string;
    }
  | {
      id: "next";
      title: string;
      lead: string;
      subscriptions: { count: number; cents: number } | null;
      installments: { count: number; cents: number } | null;
    }
  | {
      id: "outro";
      title: string;
      /** What the closing part offers besides the Fechamento. */
      offer:
        | { kind: "save"; cents: number; description: string }
        | { kind: "create-box" }
        | { kind: "saved"; text: string }
        | { kind: "none" };
      boxId: string | null;
      spendableId: string | null;
      closingHref: string;
    };

/** "Outubro" from "outubro". */
export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const PERCENT = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 0,
});

/** "31%"; a share under 1% reads "menos de 1%". */
export function percentLabel(share: number): string {
  return share > 0 && share < 0.01 ? "menos de 1%" : PERCENT.format(share);
}

/** "1 a 31 de outubro", "5 de outubro a 4 de novembro". */
export function recapRange(start: string, end: string): string {
  const s = parse(start);
  const e = parse(end);
  const day = (day: number) => (day === 1 ? "1º" : String(day));
  const full = (date: string) => dayMonthLabel(date);
  if (s.month === e.month && s.year === e.year) {
    return `${day(s.day)} a ${full(end)}`;
  }
  return `${full(start)} a ${full(end)}`;
}

const MIN_DAYS_WITH_SPENDING = 3;

/** The parts of the month's story, in order, without the ones with nothing to say. */
export function buildRecapSlides(
  recap: MonthRecap,
  options: {
    /** A category or the total "stayed the same" under this change (the server constant, passed in to keep the database out of the client bundle). */
    minComparisonDiffCents: number;
  },
): RecapSlide[] {
  const { closing, categories, biggest, days } = recap;
  const month = monthNameLabel(closing.month);
  const previousMonth = monthNameLabel(closing.previousMonth);
  const slides: RecapSlide[] = [];

  slides.push({
    id: "intro",
    title: `${capitalize(month)} fechou`,
    range: recapRange(closing.start, closing.end),
    lead: "Veja em 1 minuto como foi o seu mês.",
  });

  slides.push({
    id: "flow",
    title: "Entrou e saiu",
    incomeCents: closing.incomeCents,
    expenseCents: closing.expenseCents,
    note: closing.hasPending
      ? "Lançamentos pendentes não entram nesta conta."
      : null,
  });

  const left = closing.leftCents;
  const previous = closing.previous;
  slides.push({
    id: "left",
    title:
      left > 0
        ? `Você fechou ${month} no azul.`
        : left < 0
          ? "As despesas passaram das receitas."
          : "Receitas e despesas empataram.",
    label: left > 0 ? "Sobrou" : left < 0 ? "Faltou" : "Empatou",
    mood: left > 0 ? "up" : left < 0 ? "down" : "even",
    cents: Math.abs(left),
    previous: previous
      ? previous.leftCents === 0
        ? { lead: `Em ${previousMonth}, empatou.`, cents: null }
        : {
            lead: `Em ${previousMonth}, ${previous.leftCents < 0 ? "faltaram" : "sobraram"}`,
            cents: Math.abs(previous.leftCents),
          }
      : null,
  });

  const spentDays = days.filter((day) => day.paidCents > 0);
  if (closing.expenseCents > 0 && spentDays.length >= MIN_DAYS_WITH_SPENDING) {
    const levels = heatLevels(days.map((day) => day.paidCents));
    const top = spentDays.reduce((best, day) =>
      day.paidCents > best.paidCents ? day : best,
    );
    const lead = dayOfWeek(parse(days[0]?.date ?? closing.start));
    const cells: (RecapDayCell | null)[] = [
      ...Array.from({ length: lead }, () => null),
      ...days.map((day, index) => ({
        date: day.date,
        day: parse(day.date).day,
        paidCents: day.paidCents,
        level: levels[index] ?? 0,
        top: day.date === top.date,
      })),
    ];
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks = Array.from({ length: cells.length / 7 }, (_, week) =>
      cells.slice(week * 7, week * 7 + 7),
    );
    const without = days.length - spentDays.length;
    slides.push({
      id: "days",
      title: "Seu mês, dia a dia",
      weeks,
      topLine: {
        lead: `O dia de maior gasto foi ${dayMonthLabel(top.date)}:`,
        cents: top.paidCents,
      },
      withoutLabel: without > 0 ? `${daysWithoutLabel(without)}.` : null,
      href: monthViewHref(
        "/relatorios/calendario",
        closing.month,
        closing.currentMonth,
      ),
    });
  }

  const [first] = categories.items;
  if (first) {
    slides.push({
      id: "categories",
      title: "Para onde foi o dinheiro",
      sentence: `${first.name} levou ${percentLabel(first.share)} das despesas.`,
      items: categories.items.map((item) => ({
        name: item.name,
        icon: item.icon,
        color: item.color,
        cents: item.cents,
        share: item.share,
        percentLabel: percentLabel(item.share),
      })),
      others:
        categories.othersCount > 0
          ? {
              label: `Outras ${categories.othersCount} ${categories.othersCount === 1 ? "categoria" : "categorias"}`,
              cents: categories.othersCents,
            }
          : null,
      href: periodViewHref(
        "/relatorios/categorias",
        1,
        closing.month,
        closing.currentMonth,
      ),
    });
  }

  if (biggest) {
    const extras: string[] = [];
    if (biggest.installment) {
      extras.push(
        `Parcela ${biggest.installment.number} de ${biggest.installment.count}`,
      );
    }
    if (biggest.recurring) extras.push("Repete todo mês");
    slides.push({
      id: "biggest",
      title: "O maior gasto",
      description: biggest.description.trim() || "Sem descrição",
      cents: Math.abs(biggest.amountCents),
      icon: biggest.categoryIcon ?? "ellipsis",
      color: biggest.categoryColor ?? "neutral",
      meta: `${shortDateLabel(biggest.occurredOn)} · ${biggest.accountName}`,
      extras,
      href: statementHref(
        {
          month: closing.month,
          accountId: null,
          categoryId: null,
          tagId: null,
          kind: "expense",
          status: null,
          q: biggest.description.slice(0, MAX_QUERY_LENGTH),
        },
        closing.currentMonth,
      ),
    });
  }

  const { comparison } = closing;
  if (comparison && comparison.total.baselineCents !== 0) {
    const diff = comparison.total.diffCents;
    const min = options.minComparisonDiffCents;
    const same = Math.abs(diff) < min;
    slides.push({
      id: "comparison",
      title: `Comparado a ${previousMonth}`,
      lead: same
        ? `Você gastou quase o mesmo que em ${previousMonth}.`
        : "Você gastou",
      cents: same ? null : Math.abs(diff),
      tail: same
        ? ""
        : `${diff < 0 ? "a menos" : "a mais"} que em ${previousMonth}.`,
      items: comparison.categories
        .filter((item) => item.direction !== "same")
        .map((item) => ({
          name: item.name,
          icon: item.icon,
          color: item.color,
          cents: Math.abs(item.diffCents),
          direction: item.direction === "down" ? "down" : "up",
          href: item.categoryId
            ? categoryDetailHref(
                item.categoryId,
                1,
                closing.month,
                closing.currentMonth,
              )
            : periodViewHref(
                "/relatorios/categorias",
                1,
                closing.month,
                closing.currentMonth,
              ),
        })),
      href: periodViewHref(
        "/relatorios/categorias",
        1,
        closing.month,
        closing.currentMonth,
      ),
    });
  }

  const { budgets } = closing;
  if (budgets) {
    const total = budgets.metCount + budgets.over.length;
    slides.push({
      id: "budgets",
      title: `Orçamentos de ${month}`,
      sentence:
        budgets.over.length === 0
          ? "Todos dentro do combinado."
          : budgets.metCount === 0
            ? `${budgets.over.length === 1 ? "1 estourado" : `${budgets.over.length} estourados`}.`
            : `${budgets.metCount} ${budgets.metCount === 1 ? "cumprido" : "cumpridos"} e ${budgets.over.length} ${budgets.over.length === 1 ? "estourado" : "estourados"}.`,
      met: budgets.metCount,
      total,
      over: budgets.over.slice(0, 3).map((item) => ({
        name: item.categoryName,
        icon: item.categoryIcon,
        color: item.categoryColor,
        excessCents: item.spentCents - item.budgetCents,
        ratio: item.budgetCents > 0 ? item.spentCents / item.budgetCents : 1,
      })),
      allMet: budgets.over.length === 0,
      href: "/planejar/orcamentos",
    });
  }

  const { next } = closing;
  const subscriptions =
    next && next.subscriptions.items.length > 0
      ? {
          count: next.subscriptions.totalCount,
          cents: next.subscriptions.monthlyCents,
        }
      : null;
  const installments =
    next && next.installments.items.length > 0
      ? {
          count: next.installments.totalPlans,
          cents: next.installments.monthlyCents,
        }
      : null;
  if (subscriptions || installments) {
    slides.push({
      id: "next",
      title: `O que continua em ${monthNameLabel(closing.currentMonth)}`,
      lead: "Já contando com isso, o mês fica mais previsível.",
      subscriptions,
      installments,
    });
  }

  const box = next?.savings.boxes[0] ?? null;
  const toSave = next ? leftoverToSave(left, next.savings.savedCents) : 0;
  let title = "Um mês novo começou";
  let offer: Extract<RecapSlide, { id: "outro" }>["offer"] = { kind: "none" };
  if (next && left > 0) {
    if (!box) {
      title = "Que tal guardar a sobra?";
      offer = { kind: "create-box" };
    } else if (toSave > 0) {
      title = "Que tal guardar a sobra?";
      offer = {
        kind: "save",
        cents: toSave,
        description: `Sobra de ${month}`,
      };
    } else {
      title = `A sobra de ${month} já está nas caixinhas.`;
      offer = { kind: "saved", text: "Bom trabalho com o dinheiro guardado." };
    }
  }
  slides.push({
    id: "outro",
    title,
    offer,
    boxId: box?.id ?? null,
    spendableId: next?.savings.spendableId ?? null,
    closingHref: closingHref(closing.month),
  });

  return slides;
}

export type RecapAction = "next" | "prev" | "first" | "last";

/** Index after an action, never outside 0…total−1. */
export function nextIndex(
  index: number,
  total: number,
  action: RecapAction,
): number {
  const last = Math.max(0, total - 1);
  switch (action) {
    case "next":
      return Math.min(last, index + 1);
    case "prev":
      return Math.max(0, index - 1);
    case "first":
      return 0;
    case "last":
      return last;
  }
}

/** A tap on the left third goes back, anywhere else goes forward. */
export function tapAction(x: number, width: number): "prev" | "next" {
  return width > 0 && x < width / 3 ? "prev" : "next";
}

/** localStorage key of the last month seen, one per person on the device. */
export function recapStorageKey(userId: string): string {
  return `meu-finan:retrospectiva-vista:${userId}`;
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export function readSeenMonth(userId: string): string | null {
  try {
    const value = window.localStorage.getItem(recapStorageKey(userId));
    return value && MONTH.test(value) ? value : null;
  } catch {
    return null;
  }
}

/** Saves the month as seen; the greatest one wins, it never goes back. */
export function writeSeenMonth(userId: string, month: string): void {
  try {
    const seen = readSeenMonth(userId);
    if (seen && seen >= month) return;
    window.localStorage.setItem(recapStorageKey(userId), month);
  } catch {
    // Storage blocked: the invite may show once more, nothing breaks.
  }
}

/** "Retrospectiva · Outubro de 2026". */
export function recapKicker(month: string): string {
  return `Retrospectiva · ${capitalize(monthLabel(month))}`;
}
