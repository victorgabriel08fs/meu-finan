import { formatMoneyShort, monthYearLabel } from "@/components/charts/format";
import {
  daysInMonth,
  type GoalProjection,
  type GoalStatus,
  type RateInput,
  toAnnualRate,
  toMonthlyRate,
  type YearMonth,
} from "@/lib/finance";
import { formatRate } from "@/lib/format/number";
import type { MarketRatesView } from "../market";

/**
 * Goals screen logic (doc 02 §6.10, doc 03 §8): the expected rate as edited
 * in the form, the projection sentence and the status pill. Pure.
 */

/** Same shape as goals.expected_rate (decimals: 1.02 = 102% do CDI). */
export type GoalRate =
  | { index: "fixed"; annual: number }
  | { index: "cdi"; pct: number }
  | { index: "selic"; pct: number }
  | { index: "ipca"; spread: number };

export type RateKind = "none" | GoalRate["index"];

/** Defaults when a rate kind is picked, in the percent units of the form. */
export const RATE_DEFAULTS: Record<Exclude<RateKind, "none">, number> = {
  cdi: 100,
  selic: 100,
  fixed: 10,
  ipca: 6,
};

/** Bounds accepted by the Server Action, in percent. */
export const RATE_BOUNDS: Record<
  Exclude<RateKind, "none">,
  { min: number; max: number }
> = {
  cdi: { min: 0, max: 300 },
  selic: { min: 0, max: 300 },
  fixed: { min: 0, max: 100 },
  ipca: { min: -10, max: 50 },
};

/** Form value (percent) → stored rate (decimal); null for "sem rendimento". */
export function rateFromForm(kind: RateKind, percent: number): GoalRate | null {
  const value = Math.round(percent * 10_000) / 1_000_000;
  switch (kind) {
    case "none":
      return null;
    case "cdi":
      return { index: "cdi", pct: value };
    case "selic":
      return { index: "selic", pct: value };
    case "fixed":
      return { index: "fixed", annual: value };
    case "ipca":
      return { index: "ipca", spread: value };
  }
}

/** Stored rate → form kind and value in percent. */
export function formFromRate(rate: GoalRate | null): {
  kind: RateKind;
  percent: number | null;
} {
  if (!rate) return { kind: "none", percent: null };
  const percent = (value: number) => Math.round(value * 1_000_000) / 10_000;
  switch (rate.index) {
    case "cdi":
    case "selic":
      return { kind: rate.index, percent: percent(rate.pct) };
    case "fixed":
      return { kind: "fixed", percent: percent(rate.annual) };
    case "ipca":
      return { kind: "ipca", percent: percent(rate.spread) };
  }
}

function toRateInput(rate: GoalRate, market: MarketRatesView): RateInput {
  switch (rate.index) {
    case "fixed":
      return { kind: "annual", value: rate.annual };
    case "cdi":
      return { kind: "cdi", pct: rate.pct, cdiAnnual: market.cdiAnnual };
    case "selic":
      return { kind: "cdi", pct: rate.pct, cdiAnnual: market.selicAnnual };
    case "ipca":
      return {
        kind: "ipca",
        spread: rate.spread,
        ipcaAnnual: market.ipcaAnnual,
      };
  }
}

/** Expected monthly rate, as the server computes it (goalMonthlyRate). */
export function goalMonthlyRate(
  rate: GoalRate | null,
  market: MarketRatesView,
): number {
  return rate ? toMonthlyRate(toRateInput(rate, market)) : 0;
}

/** Annual equivalent ("≈ 13,94% a.a." for 102% do CDI). */
export function goalAnnualRate(
  rate: GoalRate | null,
  market: MarketRatesView,
): number {
  return rate ? toAnnualRate(toRateInput(rate, market)) : 0;
}

/** "102% do CDI", "10,50% a.a.", "IPCA + 6,00%", "100% da Selic", "sem rendimento". */
export function goalRateLabel(rate: GoalRate | null): string {
  if (!rate) return "sem rendimento";
  switch (rate.index) {
    case "fixed":
      return formatRate({ kind: "annual", value: rate.annual });
    case "cdi":
      return formatRate({ kind: "cdi", pct: rate.pct });
    case "selic":
      return formatRate({ kind: "cdi", pct: rate.pct }).replace(
        "do CDI",
        "da Selic",
      );
    case "ipca":
      return formatRate({ kind: "ipca", spread: rate.spread });
  }
}

/** Last day of a deadline month, as stored in goals.target_date. */
export function deadlineDate(month: YearMonth): string {
  const mm = String(month.month).padStart(2, "0");
  const dd = String(daysInMonth(month.year, month.month)).padStart(2, "0");
  return `${month.year}-${mm}-${dd}`;
}

/** "2027-12-31" → { year: 2027, month: 12 }. */
export function deadlineMonth(targetDate: string | null): YearMonth | null {
  if (!targetDate) return null;
  const year = Number(targetDate.slice(0, 4));
  const month = Number(targetDate.slice(5, 7));
  return Number.isInteger(year) && month >= 1 && month <= 12
    ? { year, month }
    : null;
}

export type Segment = { text: string; strong?: boolean };

const monthsLabel = (count: number) =>
  count === 1 ? "1 mês" : `${count} meses`;

/** The projection line under a goal (doc 03 §8 table), as text segments. */
export function projectionSentence(input: {
  projection: GoalProjection;
  monthlyPlanCents: number;
  deadline: YearMonth | null;
}): Segment[] {
  const { projection, monthlyPlanCents, deadline } = input;
  const eta = projection.eta ? monthYearLabel(projection.eta) : null;
  switch (projection.status) {
    case "achieved":
      return [{ text: "Meta atingida! Que tal a próxima?" }];
    case "no_plan":
      return [
        { text: "Defina um aporte mensal para ver quando você chega lá." },
      ];
    case "ahead": {
      const slack = projection.slackMonths ?? 0;
      return [
        { text: "Chega em " },
        { text: eta ?? "", strong: true },
        { text: `, ${monthsLabel(slack)} antes do prazo.` },
      ];
    }
    case "on_track":
      return [
        { text: "No ritmo atual, você chega lá em " },
        { text: eta ?? "", strong: true },
        { text: deadline ? ", dentro do prazo." : "." },
      ];
    case "behind": {
      const due = deadline ? monthYearLabel(deadline) : "o prazo";
      if (projection.requiredMonthlyCents === null) {
        return [
          {
            text: `O prazo de ${due} chegou. Ajuste o prazo ou o valor para seguir acompanhando.`,
          },
        ];
      }
      const today =
        monthlyPlanCents > 0
          ? `hoje: ${formatMoneyShort(monthlyPlanCents)}`
          : "hoje: sem aporte";
      const segments: Segment[] = [
        { text: `Para chegar em ${due}, aporte ` },
        {
          text: `${formatMoneyShort(projection.requiredMonthlyCents)}/mês`,
          strong: true,
        },
        { text: ` (${today}).` },
      ];
      if (eta) segments.push({ text: ` No ritmo atual, chega em ${eta}.` });
      return segments;
    }
  }
}

export type StatusPill = {
  label: string;
  tone: "primary" | "warning" | "neutral";
  icon: "check" | "ahead" | "behind" | "none";
};

export const GOAL_STATUS: Record<GoalStatus, StatusPill> = {
  achieved: { label: "Concluída", tone: "primary", icon: "check" },
  ahead: { label: "Adiantada", tone: "primary", icon: "ahead" },
  on_track: { label: "No ritmo", tone: "primary", icon: "check" },
  behind: { label: "Atrasada", tone: "warning", icon: "behind" },
  no_plan: { label: "Sem plano", tone: "neutral", icon: "none" },
};

/** "R$ 1.000/mês · 102% do CDI · conta Reserva · prazo dez/2027". */
export function planLine(input: {
  monthlyPlanCents: number;
  rateLabel: string;
  accountName: string | null;
  deadline: YearMonth | null;
}): string {
  return [
    input.monthlyPlanCents > 0
      ? `${formatMoneyShort(input.monthlyPlanCents)}/mês`
      : "sem aporte planejado",
    input.rateLabel,
    input.accountName ? `conta ${input.accountName}` : null,
    input.deadline ? `prazo ${monthYearLabel(input.deadline)}` : "sem prazo",
  ]
    .filter(Boolean)
    .join(" · ");
}
