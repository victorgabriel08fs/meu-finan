import { describe, expect, it } from "vitest";
import { NBSP } from "@/lib/format/money";
import {
  defaultSelectedMonth,
  highlightIndices,
  incomeExpenseMonthLabel,
  incomeExpenseSummary,
  monthSavingsRate,
  netWorthChange,
  netWorthSummary,
  parseReportPeriod,
  partialProgress,
  periodQuery,
  savingsCaption,
  savingsSummary,
  sumTotals,
} from "./model";

const plain = (text: string) => text.replaceAll(NBSP, " ");

const series = [
  {
    month: "2026-08",
    incomeCents: 870_000,
    expenseCents: 602_000,
    partial: false,
  },
  {
    month: "2026-09",
    incomeCents: 870_000,
    expenseCents: 894_000,
    partial: false,
  },
  {
    month: "2026-10",
    incomeCents: 870_000,
    expenseCents: 150_000,
    partial: true,
  },
];

describe("period filter", () => {
  it("accepts 1, 3, 6 and 12 months", () => {
    expect(parseReportPeriod("3")).toBe(3);
    expect(parseReportPeriod(["6"])).toBe(6);
    expect(parseReportPeriod("24")).toBe(12);
    expect(parseReportPeriod(undefined)).toBe(12);
    expect(periodQuery(12)).toBe("");
    expect(periodQuery(1)).toBe("?periodo=1");
  });
});

describe("KPIs", () => {
  it("sums with the partial month and says so", () => {
    expect(sumTotals(series)).toEqual({
      incomeCents: 2_610_000,
      expenseCents: 1_646_000,
      partialCaption: "inclui out parcial",
    });
  });

  it("describes the complete months behind the savings rate", () => {
    expect(
      savingsCaption({
        monthsCounted: 11,
        from: { year: 2025, month: 11 },
        to: { year: 2026, month: 9 },
      }),
    ).toBe("11 meses completos, nov/25–set/26");
    expect(savingsCaption({ monthsCounted: 0, from: null, to: null })).toBe(
      "aguarda um mês completo",
    );
  });
});

describe("income × expenses", () => {
  it("selects the last complete month", () => {
    expect(defaultSelectedMonth(series)).toBe(1);
    expect(defaultSelectedMonth([series[2] as (typeof series)[number]])).toBe(
      0,
    );
    expect(defaultSelectedMonth([])).toBeNull();
  });

  it("summarises the chart for screen readers", () => {
    expect(plain(incomeExpenseSummary(series))).toBe(
      "Receitas superaram as despesas em 2 de 3 meses; maior despesa em setembro, R$ 8.940. Outubro está parcial.",
    );
    expect(incomeExpenseSummary(series, { hideValues: true })).toBe(
      "Receitas superaram as despesas em 2 de 3 meses; maior despesa em setembro, valor oculto. Outubro está parcial.",
    );
  });

  it("names each month's columns, amounts hidden in privacy mode", () => {
    const [september, october] = series.slice(1) as typeof series;
    expect(plain(incomeExpenseMonthLabel(september))).toBe(
      "setembro de 2026: receitas R$ 8.700, despesas R$ 8.940",
    );
    expect(plain(incomeExpenseMonthLabel(october))).toBe(
      "outubro de 2026 (parcial): receitas R$ 8.700, despesas R$ 1.500",
    );
    expect(incomeExpenseMonthLabel(october, { hideValues: true })).toBe(
      "outubro de 2026 (parcial): receitas valor oculto, despesas valor oculto",
    );
  });

  it("says how far the partial month went", () => {
    const october = { start: "2026-10-01", end: "2026-10-31" };
    expect(partialProgress(series, october, "2026-10-14")).toBe(
      "até o dia 14 de 31",
    );
    expect(partialProgress(series, october, "2026-10-01")).toBe(
      "até o dia 1 de 31",
    );
    // A month that starts on the 5th: day 10 of the period on 14/out.
    expect(
      partialProgress(
        series,
        { start: "2026-10-05", end: "2026-11-04" },
        "2026-10-14",
      ),
    ).toBe("até o dia 10 de 31");
    // Only complete months: nothing to say.
    expect(
      partialProgress(series.slice(0, 2), october, "2026-10-14"),
    ).toBeNull();
    expect(partialProgress([], october, "2026-10-14")).toBeNull();
  });
});

describe("savings rate", () => {
  it("skips the partial month and months without income", () => {
    expect(monthSavingsRate(series[0] as (typeof series)[number])).toBeCloseTo(
      0.308,
      3,
    );
    expect(monthSavingsRate(series[2] as (typeof series)[number])).toBeNull();
    expect(
      monthSavingsRate({
        month: "2026-01",
        incomeCents: 0,
        expenseCents: 10,
        partial: false,
      }),
    ).toBeNull();
  });

  it("labels the peak, the low and the last point once each", () => {
    expect(highlightIndices([0.2, 0.4, null, 0.1, 0.3])).toEqual([1, 3, 4]);
    expect(highlightIndices([0.5])).toEqual([0]);
    expect(highlightIndices([null, null])).toEqual([]);
  });

  it("summarises the line", () => {
    expect(
      savingsSummary(["2026-07", "2026-08", "2026-09"], [0.064, 0.436, 0.308]),
    ).toBe(
      "Taxa de poupança entre 6,4% (julho) e 43,6% (agosto); setembro fechou em 30,8%.",
    );
  });
});

describe("net worth", () => {
  it("measures the change from the month before the window", () => {
    expect(netWorthChange([1_648_000, 2_000_000, 2_628_973])).toEqual({
      first: 1_648_000,
      last: 2_628_973,
      delta: 980_973,
    });
    expect(plain(netWorthSummary([1_648_000, 2_628_973], 12))).toBe(
      "Patrimônio subiu de R$ 16.480 para R$ 26.289,73 em 12 meses.",
    );
    expect(
      netWorthSummary([1_648_000, 2_628_973], 6, { hideValues: true }),
    ).toBe("Patrimônio subiu de valor oculto para valor oculto em 6 meses.");
  });

  it("says it held steady, once, when nothing changed", () => {
    expect(plain(netWorthSummary([500_000, 500_000], 1))).toBe(
      "Patrimônio ficou estável em R$ 5.000 no mês.",
    );
    expect(plain(netWorthSummary([500_000, 500_000], 6))).toBe(
      "Patrimônio ficou estável em R$ 5.000 em 6 meses.",
    );
    expect(netWorthSummary([500_000, 500_000], 3, { hideValues: true })).toBe(
      "Patrimônio ficou estável em valor oculto em 3 meses.",
    );
    expect(plain(netWorthSummary([500_000, 500_001], 6))).toContain("subiu de");
  });
});
