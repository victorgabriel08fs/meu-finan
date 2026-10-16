import { describe, expect, it } from "vitest";
import { NBSP } from "@/lib/format/money";
import type { MarketRatesView } from "../market";
import {
  deadlineDate,
  deadlineMonth,
  formFromRate,
  goalAnnualRate,
  goalMonthlyRate,
  goalRateLabel,
  planLine,
  projectionSentence,
  rateFromForm,
} from "./model";

const market: MarketRatesView = {
  cdiAnnual: 0.1365,
  selicAnnual: 0.1375,
  ipcaAnnual: 0.045,
  source: "estimate",
  asOf: null,
};

const text = (segments: { text: string }[]) =>
  segments
    .map((segment) => segment.text)
    .join("")
    .replace(new RegExp(NBSP, "g"), " ");

describe("rates in the form", () => {
  it("converts percent to stored decimals and back", () => {
    expect(rateFromForm("cdi", 102)).toEqual({ index: "cdi", pct: 1.02 });
    expect(rateFromForm("fixed", 10.5)).toEqual({
      index: "fixed",
      annual: 0.105,
    });
    expect(rateFromForm("ipca", 6)).toEqual({ index: "ipca", spread: 0.06 });
    expect(rateFromForm("none", 5)).toBeNull();
    expect(formFromRate({ index: "cdi", pct: 1.02 })).toEqual({
      kind: "cdi",
      percent: 102,
    });
    expect(formFromRate({ index: "fixed", annual: 0.105 })).toEqual({
      kind: "fixed",
      percent: 10.5,
    });
    expect(formFromRate(null)).toEqual({ kind: "none", percent: null });
  });

  it("compounds % do CDI on the daily rate (doc 03 §2)", () => {
    expect(goalAnnualRate({ index: "cdi", pct: 1.02 }, market)).toBeCloseTo(
      0.139411,
      5,
    );
    expect(goalMonthlyRate(null, market)).toBe(0);
    expect(
      goalMonthlyRate({ index: "fixed", annual: 0.12 }, market),
    ).toBeCloseTo(0.009489, 5);
  });

  it("labels rates like the server", () => {
    expect(goalRateLabel({ index: "cdi", pct: 1.02 })).toBe("102% do CDI");
    expect(goalRateLabel({ index: "selic", pct: 1 })).toBe("100% da Selic");
    expect(goalRateLabel({ index: "ipca", spread: 0.06 })).toBe("IPCA + 6,00%");
    expect(goalRateLabel(null)).toBe("sem rendimento");
  });
});

describe("deadlines", () => {
  it("stores the last day of the month", () => {
    expect(deadlineDate({ year: 2027, month: 2 })).toBe("2027-02-28");
    expect(deadlineDate({ year: 2028, month: 2 })).toBe("2028-02-29");
    expect(deadlineDate({ year: 2027, month: 12 })).toBe("2027-12-31");
    expect(deadlineMonth("2027-12-31")).toEqual({ year: 2027, month: 12 });
    expect(deadlineMonth(null)).toBeNull();
  });
});

describe("projection sentences (doc 03 §8)", () => {
  it("on track", () => {
    expect(
      text(
        projectionSentence({
          projection: {
            status: "on_track",
            eta: { year: 2027, month: 8 },
            requiredMonthlyCents: null,
            slackMonths: null,
          },
          monthlyPlanCents: 100_000,
          deadline: null,
        }),
      ),
    ).toBe("No ritmo atual, você chega lá em ago/2027.");
  });

  it("ahead", () => {
    expect(
      text(
        projectionSentence({
          projection: {
            status: "ahead",
            eta: { year: 2029, month: 8 },
            requiredMonthlyCents: 80_000,
            slackMonths: 4,
          },
          monthlyPlanCents: 90_000,
          deadline: { year: 2029, month: 12 },
        }),
      ),
    ).toBe("Chega em ago/2029, 4 meses antes do prazo.");
  });

  it("behind, with the contribution that meets the deadline", () => {
    const segments = projectionSentence({
      projection: {
        status: "behind",
        eta: { year: 2028, month: 2 },
        requiredMonthlyCents: 93_100,
        slackMonths: -2,
      },
      monthlyPlanCents: 80_000,
      deadline: { year: 2027, month: 12 },
    });
    expect(text(segments)).toBe(
      "Para chegar em dez/2027, aporte R$ 931/mês (hoje: R$ 800). No ritmo atual, chega em fev/2028.",
    );
    expect(segments.find((segment) => segment.strong)?.text).toContain("931");
  });

  it("behind without a plan or past the deadline", () => {
    expect(
      text(
        projectionSentence({
          projection: {
            status: "behind",
            eta: null,
            requiredMonthlyCents: 50_000,
            slackMonths: null,
          },
          monthlyPlanCents: 0,
          deadline: { year: 2027, month: 6 },
        }),
      ),
    ).toBe("Para chegar em jun/2027, aporte R$ 500/mês (hoje: sem aporte).");
    expect(
      text(
        projectionSentence({
          projection: {
            status: "behind",
            eta: null,
            requiredMonthlyCents: null,
            slackMonths: null,
          },
          monthlyPlanCents: 0,
          deadline: { year: 2026, month: 10 },
        }),
      ),
    ).toContain("O prazo de out/2026 chegou");
  });

  it("no plan and achieved", () => {
    expect(
      text(
        projectionSentence({
          projection: {
            status: "no_plan",
            eta: null,
            requiredMonthlyCents: null,
            slackMonths: null,
          },
          monthlyPlanCents: 0,
          deadline: null,
        }),
      ),
    ).toBe("Defina um aporte mensal para ver quando você chega lá.");
    expect(
      text(
        projectionSentence({
          projection: {
            status: "achieved",
            eta: null,
            requiredMonthlyCents: 0,
            slackMonths: null,
          },
          monthlyPlanCents: 0,
          deadline: null,
        }),
      ),
    ).toContain("Meta atingida!");
  });
});

describe("plan line", () => {
  it("joins plan, rate, account and deadline", () => {
    expect(
      planLine({
        monthlyPlanCents: 100_000,
        rateLabel: "102% do CDI",
        accountName: "Reserva",
        deadline: null,
      }).replace(new RegExp(NBSP, "g"), " "),
    ).toBe("R$ 1.000/mês · 102% do CDI · conta Reserva · sem prazo");
    expect(
      planLine({
        monthlyPlanCents: 0,
        rateLabel: "sem rendimento",
        accountName: null,
        deadline: { year: 2027, month: 12 },
      }),
    ).toBe("sem aporte planejado · sem rendimento · prazo dez/2027");
  });
});
