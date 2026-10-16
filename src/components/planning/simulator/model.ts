import { formatMoneyShort, monthYearLabel } from "@/components/charts/format";
import {
  addMonths,
  DEFAULT_MAX_MONTHS,
  passiveMonthlyIncome,
  type RateInput,
  type SimulationInput,
  type SimulationResult,
  savingsMonthlyRate,
  simulate,
  solveMonthly,
  solveMonths,
  toAnnualRate,
  toMonthlyRate,
  type YearMonth,
} from "@/lib/finance";
import { durationLabel } from "@/lib/format/date";
import { formatBRL } from "@/lib/format/money";
import { formatRate } from "@/lib/format/number";
import type { MarketRatesView } from "../market";

/**
 * Compound-interest simulator view model (doc 02 §6.11, doc 03 §2–§7). Turns
 * the controls into a `simulate` / `solveMonthly` / `solveMonths` call and the
 * result into what the screen shows. Pure and synchronous: it runs on every
 * slider move, in the browser, with no network.
 */

export type SimulatorMode = "future" | "monthly" | "time";
export type SimRateKind = "annual" | "monthly" | "cdi" | "ipca";
export type TaxChoice = "regressive" | "exempt" | "none";

export type SimulatorState = {
  mode: SimulatorMode;
  initialCents: number | null;
  monthlyCents: number | null;
  targetCents: number | null;
  rateKind: SimRateKind;
  /** Percent per kind (12 = 12% a.a., 100 = 100% do CDI), kept across kinds. */
  rates: Record<SimRateKind, number | null>;
  /** Term, 1–600 months. */
  months: number;
  termUnit: "years" | "months";
  timing: "start" | "end";
  /** Yearly raise of the contribution, percent. */
  growthPct: number | null;
  tax: TaxChoice;
  /** Expected inflation (% a.a.), also the IPCA of "IPCA +"; null = market value. */
  inflationPct: number | null;
  /** CDI used (% a.a.); null = market value. */
  cdiPct: number | null;
};

export const DEFAULT_STATE: SimulatorState = {
  mode: "future",
  initialCents: 1_000_000,
  monthlyCents: 100_000,
  targetCents: 25_000_000,
  rateKind: "annual",
  rates: { annual: 12, monthly: 1, cdi: 100, ipca: 6 },
  months: 120,
  termUnit: "years",
  timing: "end",
  growthPct: 0,
  tax: "regressive",
  inflationPct: null,
  cdiPct: null,
};

export const MAX_MONTHS = DEFAULT_MAX_MONTHS;

/** Accepted ranges, in percent. Outside them the screen shows an inline error. */
export const LIMITS = {
  annual: { min: 0, max: 100 },
  monthly: { min: 0, max: 100 },
  cdi: { min: 0, max: 300 },
  ipca: { min: -10, max: 50 },
  inflation: { min: -10, max: 100 },
  cdiIndex: { min: 0, max: 100 },
  growth: { min: 0, max: 100 },
} as const;

/** Results beyond this many reais are not shown (float noise, unreadable). */
const MAX_RESULT_REAIS = 1e13;

export type SimField =
  | "initial"
  | "monthly"
  | "target"
  | "rate"
  | "term"
  | "growth"
  | "inflation"
  | "cdi";

export type SimError = { field: SimField; message: string };

const reais = (cents: number | null) => (cents ?? 0) / 100;
export const toCents = (value: number) => Math.round(value * 100);

const pct = (value: number) => value / 100;

/** Inflation and CDI actually used: the edited value or the market one. */
export function indexes(state: SimulatorState, market: MarketRatesView) {
  return {
    inflation:
      state.inflationPct === null ? market.ipcaAnnual : pct(state.inflationPct),
    cdi: state.cdiPct === null ? market.cdiAnnual : pct(state.cdiPct),
  };
}

function outside(value: number, limit: { min: number; max: number }) {
  return value < limit.min || value > limit.max;
}

function rangeMessage(limit: { min: number; max: number }, unit: string) {
  return `Use um valor entre ${limit.min} e ${limit.max}${unit}.`;
}

/** The rate as the engine wants it, or the error to show next to the field. */
export function rateInput(
  state: SimulatorState,
  market: MarketRatesView,
): { ok: true; rate: RateInput } | { ok: false; error: SimError } {
  const value = state.rates[state.rateKind];
  if (value === null) {
    return {
      ok: false,
      error: { field: "rate", message: "Informe a rentabilidade." },
    };
  }
  const limit = LIMITS[state.rateKind];
  if (outside(value, limit)) {
    const unit =
      state.rateKind === "monthly"
        ? "% a.m."
        : state.rateKind === "cdi"
          ? "% do CDI"
          : "% a.a.";
    return {
      ok: false,
      error: { field: "rate", message: rangeMessage(limit, unit) },
    };
  }
  const { inflation, cdi } = indexes(state, market);
  switch (state.rateKind) {
    case "annual":
      return { ok: true, rate: { kind: "annual", value: pct(value) } };
    case "monthly":
      return { ok: true, rate: { kind: "monthly", value: pct(value) } };
    case "cdi":
      return {
        ok: true,
        rate: { kind: "cdi", pct: pct(value), cdiAnnual: cdi },
      };
    case "ipca":
      return {
        ok: true,
        rate: { kind: "ipca", spread: pct(value), ipcaAnnual: inflation },
      };
  }
}

/** "≈ 0,95% a.m." under an annual rate, "≈ 12,68% a.a." under the others. */
export function rateConversion(rate: RateInput): string {
  if (rate.kind === "annual") {
    return `≈ ${formatRate({ kind: "monthly", value: toMonthlyRate(rate) })}`;
  }
  return `≈ ${formatRate({ kind: "annual", value: toAnnualRate(rate) })}`;
}

export type ChartData = {
  /** Invested and interest per month (interest clamped at zero for drawing). */
  invested: number[];
  interest: number[];
  /** Months the scrub snaps to (every year, or every month up to 2 years). */
  stops: number[];
  maxBalanceCents: number;
};

export type YearRow = {
  month: number;
  label: string;
  investedCents: number;
  interestInPeriodCents: number;
  balanceCents: number;
};

export type Insight = {
  key: string;
  icon: "trend" | "income" | "savings";
  text: string;
};

export type Hero =
  | { kind: "money"; label: string; cents: number; suffix?: string }
  | { kind: "text"; label: string; text: string };

export type SimulationView = {
  months: number;
  /** Contribution used (solved in "Quanto investir"). */
  monthlyCents: number;
  hero: Hero;
  chips: { key: string; text: string; tone: "primary" | "neutral" }[];
  /** One line for the compact bar shown while scrolling the controls. */
  summary: string;
  final: {
    investedCents: number;
    interestCents: number;
    grossCents: number;
    netCents: number;
    netRealCents: number;
    taxCents: number;
  };
  /** Absent when the term is zero (nothing to draw). */
  chart: ChartData | null;
  years: YearRow[];
  insights: Insight[];
  crossoverMonth: number | null;
  monthlyRate: number;
  /** "Em quanto tempo" could not reach the target within 50 years. */
  unreachable: boolean;
};

export type ComputeResult =
  | { ok: true; view: SimulationView }
  | { ok: false; error: SimError };

/** Spoken and visible label of a point in time: "Hoje", "Ano 7", "1 ano e 6 meses". */
export function pointLabel(month: number): string {
  if (month === 0) return "Hoje";
  if (month % 12 === 0) return `Ano ${month / 12}`;
  return durationLabel(month);
}

/** Short axis label: "5 anos", "18 meses". */
export function axisDuration(month: number): string {
  if (month === 0) return "hoje";
  if (month >= 24 || month % 12 === 0) {
    const years = Math.round(month / 12);
    return years === 1 ? "1 ano" : `${years} anos`;
  }
  return month === 1 ? "1 mês" : `${month} meses`;
}

function chartData(result: SimulationResult, months: number): ChartData {
  const invested = result.series.map((point) => point.invested);
  const interest = result.series.map((point) =>
    Math.max(0, point.balance - point.invested),
  );
  const stops: number[] = [];
  const every = months <= 24 ? 1 : 12;
  for (let month = 0; month <= months; month += every) stops.push(month);
  if (stops.at(-1) !== months) stops.push(months);
  const maxBalance = Math.max(
    ...result.series.map((point) => Math.max(point.balance, point.invested)),
  );
  return { invested, interest, stops, maxBalanceCents: toCents(maxBalance) };
}

function yearRows(result: SimulationResult, months: number): YearRow[] {
  const rows: YearRow[] = [];
  let previous = result.series[0];
  const marks: number[] = [];
  for (let month = 12; month < months; month += 12) marks.push(month);
  if (months > 0) marks.push(months);
  for (const month of marks) {
    const point = result.series[month];
    if (!point || !previous) continue;
    const gained =
      point.balance - previous.balance - (point.invested - previous.invested);
    rows.push({
      month,
      label:
        month % 12 === 0
          ? month === 12
            ? "1 ano"
            : `${month / 12} anos`
          : durationLabel(month),
      investedCents: toCents(point.invested),
      interestInPeriodCents: toCents(gained),
      balanceCents: toCents(point.balance),
    });
    previous = point;
  }
  return rows;
}

function ordinal(value: number) {
  return `${value}º`;
}

function insightsFor(input: {
  result: SimulationResult;
  months: number;
  monthlyCents: number;
  inflation: number;
  state: SimulatorState;
  base: Omit<SimulationInput, "monthly" | "months">;
  market: MarketRatesView;
}): Insight[] {
  const { result, months, monthlyCents, inflation, state, base, market } =
    input;
  const insights: Insight[] = [];
  const crossover = result.crossoverMonth;
  if (crossover !== null && crossover <= months) {
    insights.push({
      key: "crossover",
      icon: "trend",
      text:
        crossover < 12
          ? `A partir do ${ordinal(crossover)} mês, os juros de cada mês passam a render mais que o aporte.`
          : `A partir do ${ordinal(Math.ceil(crossover / 12))} ano, os juros de cada mês passam a render mais que o aporte.`,
    });
  } else if (monthlyCents > 0 && months > 0) {
    insights.push({
      key: "crossover",
      icon: "trend",
      text: "Nesse prazo, os juros do mês ainda não passam o aporte — nos juros compostos, o tempo é o que mais pesa.",
    });
  } else if (result.final.invested > 0 && months > 0) {
    const times = result.final.gross / result.final.invested;
    insights.push({
      key: "growth",
      icon: "trend",
      text: `Seu dinheiro cresce ${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(times)} vezes no período.`,
    });
  }

  const income = passiveMonthlyIncome(
    result.final.netReal,
    result.monthlyRate,
    inflation,
  );
  insights.push(
    income > 0
      ? {
          key: "income",
          icon: "income",
          text: `Renda mensal estimada sem consumir o capital: ${formatBRL(toCents(income))} em valores de hoje.`,
        }
      : {
          key: "income",
          icon: "income",
          text: `Com essa taxa, o dinheiro perde para a inflação (${formatRate({ kind: "annual", value: inflation })}).`,
        },
  );

  // Poupança as a yardstick (doc 02 §6.11 "comparação com poupança quando relevante").
  if (state.mode === "future" && months > 0) {
    const savings = simulate({
      ...base,
      monthly: monthlyCents / 100,
      months,
      rate: { kind: "monthly", value: savingsMonthlyRate(market.selicAnnual) },
      tax: "exempt",
    });
    const difference = toCents(result.final.net - savings.final.net);
    if (Math.abs(difference) >= 100) {
      insights.push({
        key: "savings",
        icon: "savings",
        text:
          difference > 0
            ? `Na poupança, seriam ${formatMoneyShort(toCents(savings.final.net))} — ${formatMoneyShort(difference)} a menos.`
            : `A poupança renderia mais neste cenário: ${formatMoneyShort(toCents(savings.final.net))}.`,
      });
    }
  }
  return insights;
}

/**
 * Runs the simulation for the current controls. Invalid controls return the
 * error to show inline (the screen keeps the last valid result, dimmed).
 */
export function computeSimulation(
  state: SimulatorState,
  market: MarketRatesView,
  today: YearMonth,
): ComputeResult {
  const rate = rateInput(state, market);
  if (!rate.ok) return rate;
  if (
    state.inflationPct !== null &&
    outside(state.inflationPct, LIMITS.inflation)
  ) {
    return {
      ok: false,
      error: {
        field: "inflation",
        message: rangeMessage(LIMITS.inflation, "% a.a."),
      },
    };
  }
  if (state.cdiPct !== null && outside(state.cdiPct, LIMITS.cdiIndex)) {
    return {
      ok: false,
      error: { field: "cdi", message: rangeMessage(LIMITS.cdiIndex, "% a.a.") },
    };
  }
  const growth = state.growthPct ?? 0;
  if (outside(growth, LIMITS.growth)) {
    return {
      ok: false,
      error: { field: "growth", message: rangeMessage(LIMITS.growth, "%") },
    };
  }
  if (
    state.mode !== "time" &&
    (!Number.isInteger(state.months) ||
      state.months < 1 ||
      state.months > MAX_MONTHS)
  ) {
    return {
      ok: false,
      error: { field: "term", message: "O prazo vai de 1 mês a 50 anos." },
    };
  }
  if (
    state.mode !== "future" &&
    (state.targetCents === null || state.targetCents <= 0)
  ) {
    return {
      ok: false,
      error: { field: "target", message: "Informe quanto quer alcançar." },
    };
  }

  const { inflation } = indexes(state, market);
  const base = {
    initial: reais(state.initialCents),
    rate: rate.rate,
    timing: state.timing,
    contributionGrowthAnnual: pct(growth),
    inflationAnnual: inflation,
    tax: state.tax,
  } satisfies Omit<SimulationInput, "monthly" | "months">;
  const target = reais(state.targetCents);
  const net = state.tax === "regressive" ? " líquidos" : "";

  try {
    let months = state.months;
    let monthly = reais(state.monthlyCents);
    let unreachable = false;
    let already = false;

    if (state.mode === "monthly") {
      const solved = solveMonthly(target, { ...base, months }, "net");
      if (solved === null) {
        return {
          ok: false,
          error: {
            field: "target",
            message: "Não dá para chegar a esse valor nesse prazo.",
          },
        };
      }
      monthly = solved;
      already = solved === 0;
    } else if (state.mode === "time") {
      const solved = solveMonths(
        target,
        { ...base, monthly },
        "net",
        MAX_MONTHS,
      );
      unreachable = solved === null;
      months = solved ?? MAX_MONTHS;
      already = solved === 0;
    }

    const result = simulate({ ...base, monthly, months });
    if (
      !Number.isFinite(result.final.gross) ||
      Math.abs(result.final.gross) > MAX_RESULT_REAIS
    ) {
      return {
        ok: false,
        error: {
          field: "rate",
          message:
            "O resultado ficou grande demais para mostrar. Reduza a taxa ou o prazo.",
        },
      };
    }

    const final = {
      investedCents: toCents(result.final.invested),
      interestCents: toCents(result.final.interest),
      grossCents: toCents(result.final.gross),
      netCents: toCents(result.final.net),
      netRealCents: toCents(result.final.netReal),
      taxCents: toCents(result.final.tax),
    };
    const monthlyCents = toCents(monthly);
    const duration = durationLabel(months);

    let hero: Hero;
    let chips: SimulationView["chips"];
    let summary: string;
    if (state.mode === "future") {
      hero = {
        kind: "money",
        label: `Em ${duration} você terá`,
        cents: final.grossCents,
      };
      chips = [];
      if (state.tax === "regressive") {
        chips.push({
          key: "net",
          text: `Líquido de IR ${formatBRL(final.netCents)}`,
          tone: "primary",
        });
      } else if (state.tax === "exempt") {
        chips.push({ key: "net", text: "Isento de IR", tone: "primary" });
      }
      chips.push({
        key: "real",
        text: `Em valores de hoje ${formatBRL(final.netRealCents)}`,
        tone: "neutral",
      });
      summary = `${formatBRL(final.grossCents)} em ${duration}`;
    } else if (state.mode === "monthly") {
      const goal = `${formatMoneyShort(state.targetCents ?? 0)}${net}`;
      hero = already
        ? {
            kind: "text",
            label: `Para ter ${goal} em ${duration}`,
            text: "Seu valor inicial já basta",
          }
        : {
            kind: "money",
            label: `Para ter ${goal} em ${duration}, invista`,
            cents: monthlyCents,
            suffix: "por mês",
          };
      chips = [
        {
          key: "invested",
          text: `Total investido ${formatMoneyShort(final.investedCents)}`,
          tone: "primary",
        },
        {
          key: "real",
          text: `Em valores de hoje ${formatMoneyShort(final.netRealCents)}`,
          tone: "neutral",
        },
      ];
      summary = already
        ? "Seu valor inicial já basta"
        : `${formatBRL(monthlyCents)} por mês`;
    } else {
      const goal = `${formatMoneyShort(state.targetCents ?? 0)}${net}`;
      const text = unreachable
        ? "mais de 50 anos"
        : already
          ? "você já chegou lá"
          : duration;
      hero = { kind: "text", label: `Você chega a ${goal} em`, text };
      chips = unreachable
        ? [{ key: "hint", text: "Aumente o aporte ou a taxa", tone: "neutral" }]
        : [
            {
              key: "when",
              text: already
                ? "Seu valor inicial já basta"
                : `em ${monthYearLabel(addMonths(today, months))}`,
              tone: "primary",
            },
            {
              key: "invested",
              text: `Total investido ${formatMoneyShort(final.investedCents)}`,
              tone: "neutral",
            },
          ];
      summary = unreachable
        ? "Mais de 50 anos"
        : already
          ? "Você já chegou lá"
          : duration;
    }

    return {
      ok: true,
      view: {
        months,
        monthlyCents,
        hero,
        chips,
        summary,
        final,
        chart: months > 0 ? chartData(result, months) : null,
        years: yearRows(result, months),
        insights: insightsFor({
          result,
          months,
          monthlyCents,
          inflation,
          state,
          base,
          market,
        }),
        crossoverMonth: result.crossoverMonth,
        monthlyRate: result.monthlyRate,
        unreachable,
      },
    };
  } catch {
    return {
      ok: false,
      error: {
        field: "rate",
        message: "Não deu para simular com esses valores. Revise os campos.",
      },
    };
  }
}

/** Reads a saved state, keeping only well-formed fields (localStorage is untrusted). */
export function restoreState(raw: unknown): SimulatorState {
  if (typeof raw !== "object" || raw === null) return DEFAULT_STATE;
  const data = raw as Record<string, unknown>;
  const cents = (value: unknown, fallback: number | null) =>
    value === null || (Number.isSafeInteger(value) && (value as number) >= 0)
      ? (value as number | null)
      : fallback;
  const percent = (value: unknown, fallback: number | null) =>
    value === null || (typeof value === "number" && Number.isFinite(value))
      ? (value as number | null)
      : fallback;
  const oneOf = <T extends string>(
    value: unknown,
    options: readonly T[],
    fallback: T,
  ) => (options.includes(value as T) ? (value as T) : fallback);
  const rates = (
    typeof data.rates === "object" && data.rates !== null ? data.rates : {}
  ) as Record<string, unknown>;
  const months =
    Number.isInteger(data.months) &&
    (data.months as number) >= 1 &&
    (data.months as number) <= MAX_MONTHS
      ? (data.months as number)
      : DEFAULT_STATE.months;

  return {
    mode: oneOf(
      data.mode,
      ["future", "monthly", "time"] as const,
      DEFAULT_STATE.mode,
    ),
    initialCents: cents(data.initialCents, DEFAULT_STATE.initialCents),
    monthlyCents: cents(data.monthlyCents, DEFAULT_STATE.monthlyCents),
    targetCents: cents(data.targetCents, DEFAULT_STATE.targetCents),
    rateKind: oneOf(
      data.rateKind,
      ["annual", "monthly", "cdi", "ipca"] as const,
      DEFAULT_STATE.rateKind,
    ),
    rates: {
      annual: percent(rates.annual, DEFAULT_STATE.rates.annual),
      monthly: percent(rates.monthly, DEFAULT_STATE.rates.monthly),
      cdi: percent(rates.cdi, DEFAULT_STATE.rates.cdi),
      ipca: percent(rates.ipca, DEFAULT_STATE.rates.ipca),
    },
    months,
    termUnit: oneOf(
      data.termUnit,
      ["years", "months"] as const,
      DEFAULT_STATE.termUnit,
    ),
    timing: oneOf(data.timing, ["start", "end"] as const, DEFAULT_STATE.timing),
    growthPct: percent(data.growthPct, DEFAULT_STATE.growthPct),
    tax: oneOf(
      data.tax,
      ["regressive", "exempt", "none"] as const,
      DEFAULT_STATE.tax,
    ),
    inflationPct: percent(data.inflationPct, null),
    cdiPct: percent(data.cdiPct, null),
  };
}
