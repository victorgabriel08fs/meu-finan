import { describe, expect, it } from "vitest";
import { futureValue, simulate, toMonthlyRate } from "@/lib/finance";
import type { MarketRatesView } from "../market";
import {
  axisDuration,
  computeSimulation,
  DEFAULT_STATE,
  pointLabel,
  rateConversion,
  rateInput,
  restoreState,
  type SimulatorState,
} from "./model";

const market: MarketRatesView = {
  cdiAnnual: 0.1365,
  selicAnnual: 0.1375,
  ipcaAnnual: 0.045,
  source: "bcb",
  asOf: "2026-10-13",
};
const today = { year: 2026, month: 10 };

const state = (overrides: Partial<SimulatorState> = {}): SimulatorState => ({
  ...DEFAULT_STATE,
  tax: "none",
  ...overrides,
});

function view(overrides: Partial<SimulatorState> = {}) {
  const result = computeSimulation(state(overrides), market, today);
  if (!result.ok) throw new Error(result.error.message);
  return result.view;
}

describe("Quanto terei", () => {
  it("matches the closed formula (doc 02 example: R$ 252.988,52)", () => {
    const result = view();
    const i = toMonthlyRate({ kind: "annual", value: 0.12 });
    expect(result.final.grossCents).toBe(
      Math.round(futureValue(10_000, 1_000, i, 120) * 100),
    );
    expect(result.final.grossCents).toBe(25_298_852);
    expect(result.hero).toMatchObject({
      kind: "money",
      label: "Em 10 anos você terá",
    });
    expect(result.final.investedCents).toBe(13_000_000);
  });

  it("shows the net and real values as chips", () => {
    const result = view({ tax: "regressive" });
    expect(result.chips.map((chip) => chip.key)).toEqual(["net", "real"]);
    expect(result.final.netCents).toBeLessThan(result.final.grossCents);
    expect(result.final.netRealCents).toBeLessThan(result.final.netCents);
  });

  it("samples the chart per year and builds the yearly table", () => {
    const result = view();
    expect(result.chart?.stops).toEqual([
      0, 12, 24, 36, 48, 60, 72, 84, 96, 108, 120,
    ]);
    expect(result.chart?.invested).toHaveLength(121);
    expect(result.years).toHaveLength(10);
    expect(result.years.at(-1)?.balanceCents).toBe(result.final.grossCents);
    const interest = result.years.reduce(
      (sum, row) => sum + row.interestInPeriodCents,
      0,
    );
    expect(Math.abs(interest - result.final.interestCents)).toBeLessThanOrEqual(
      10,
    );
  });

  it("uses monthly stops on short terms and a partial last year", () => {
    expect(view({ months: 18 }).chart?.stops).toHaveLength(19);
    const rows = view({ months: 30 }).years;
    expect(rows.map((row) => row.label)).toEqual([
      "1 ano",
      "2 anos",
      "2 anos e 6 meses",
    ]);
  });

  it("finds the month interest beats the contribution", () => {
    const result = view({ months: 360 });
    const crossover = result.crossoverMonth ?? 0;
    expect(crossover).toBeGreaterThan(0);
    expect(result.insights[0]?.text).toContain(
      `${Math.ceil(crossover / 12)}º ano`,
    );
  });

  it("compares with poupança and estimates passive income", () => {
    const keys = view().insights.map((insight) => insight.key);
    expect(keys).toContain("income");
    expect(keys).toContain("savings");
  });
});

describe("Quanto investir", () => {
  it("solves the monthly contribution that reaches the target", () => {
    const result = view({ mode: "monthly", targetCents: 25_000_000 });
    expect(result.hero).toMatchObject({ kind: "money", suffix: "por mês" });
    const reached = simulate({
      initial: 10_000,
      monthly: result.monthlyCents / 100,
      months: 120,
      rate: { kind: "annual", value: 0.12 },
    });
    expect(reached.final.net).toBeGreaterThanOrEqual(250_000 - 0.01);
    expect(result.monthlyCents).toBeLessThan(100_000);
  });

  it("says when the initial amount is enough", () => {
    const result = view({ mode: "monthly", targetCents: 500_000 });
    expect(result.hero.kind).toBe("text");
    expect(result.monthlyCents).toBe(0);
  });
});

describe("Em quanto tempo", () => {
  it("finds the first month that reaches the target", () => {
    const result = view({ mode: "time", targetCents: 25_000_000 });
    expect(result.months).toBe(120);
    expect(result.hero).toEqual({
      kind: "text",
      label: expect.stringContaining("Você chega a"),
      text: "10 anos",
    });
    expect(result.chips[0]?.text).toBe("em out/2036");
  });

  it("reports targets beyond 50 years", () => {
    const result = view({
      mode: "time",
      initialCents: 0,
      monthlyCents: 0,
      targetCents: 100_000,
    });
    expect(result.unreachable).toBe(true);
    expect(result.hero).toMatchObject({ text: "mais de 50 anos" });
  });

  it("handles a target already reached", () => {
    const result = view({ mode: "time", targetCents: 500_000 });
    expect(result.months).toBe(0);
    expect(result.chart).toBeNull();
  });
});

describe("validation", () => {
  it("asks for a rate and rejects absurd ones", () => {
    const missing = computeSimulation(
      state({ rates: { ...DEFAULT_STATE.rates, annual: null } }),
      market,
      today,
    );
    expect(missing).toEqual({
      ok: false,
      error: { field: "rate", message: "Informe a rentabilidade." },
    });
    const absurd = computeSimulation(
      state({
        rateKind: "monthly",
        rates: { ...DEFAULT_STATE.rates, monthly: 150 },
      }),
      market,
      today,
    );
    expect(absurd.ok).toBe(false);
  });

  it("asks for a target in the reverse modes", () => {
    const result = computeSimulation(
      state({ mode: "time", targetCents: null }),
      market,
      today,
    );
    expect(result.ok ? null : result.error.field).toBe("target");
  });

  it("refuses results too large to show", () => {
    const result = computeSimulation(
      state({
        rateKind: "monthly",
        rates: { ...DEFAULT_STATE.rates, monthly: 100 },
        months: 600,
      }),
      market,
      today,
    );
    expect(result.ok).toBe(false);
  });
});

describe("rates", () => {
  it("builds CDI and IPCA+ from the market or edited indexes", () => {
    const cdi = rateInput(state({ rateKind: "cdi" }), market);
    expect(cdi).toEqual({
      ok: true,
      rate: { kind: "cdi", pct: 1, cdiAnnual: 0.1365 },
    });
    const edited = rateInput(
      state({ rateKind: "ipca", inflationPct: 5 }),
      market,
    );
    expect(edited).toEqual({
      ok: true,
      rate: { kind: "ipca", spread: 0.06, ipcaAnnual: 0.05 },
    });
  });

  it("shows the conversion helper", () => {
    expect(rateConversion({ kind: "annual", value: 0.12 })).toBe(
      "≈ 0,95% a.m.",
    );
    expect(rateConversion({ kind: "cdi", pct: 1.02, cdiAnnual: 0.1365 })).toBe(
      "≈ 13,94% a.a.",
    );
  });
});

describe("labels", () => {
  it("names points and axis ticks", () => {
    expect(pointLabel(0)).toBe("Hoje");
    expect(pointLabel(84)).toBe("Ano 7");
    expect(pointLabel(18)).toBe("1 ano e 6 meses");
    expect(axisDuration(0)).toBe("hoje");
    expect(axisDuration(60)).toBe("5 anos");
    expect(axisDuration(9)).toBe("9 meses");
  });
});

describe("restoreState", () => {
  it("falls back to defaults for garbage", () => {
    expect(restoreState(null)).toEqual(DEFAULT_STATE);
    expect(restoreState("x")).toEqual(DEFAULT_STATE);
  });

  it("keeps valid fields and drops invalid ones", () => {
    const restored = restoreState({
      mode: "time",
      initialCents: 123,
      monthlyCents: -5,
      rates: { annual: 10, cdi: "x" },
      months: 9999,
      tax: "exempt",
      inflationPct: 5,
    });
    expect(restored.mode).toBe("time");
    expect(restored.initialCents).toBe(123);
    expect(restored.monthlyCents).toBe(DEFAULT_STATE.monthlyCents);
    expect(restored.rates).toEqual({
      annual: 10,
      monthly: 1,
      cdi: 100,
      ipca: 6,
    });
    expect(restored.months).toBe(DEFAULT_STATE.months);
    expect(restored.tax).toBe("exempt");
    expect(restored.inflationPct).toBe(5);
  });
});
