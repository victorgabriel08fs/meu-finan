import { describe, expect, it } from "vitest";
import { NBSP } from "@/lib/format/money";
import type {
  CashFlowDayPoint,
  CashFlowReport,
  CashFlowScheduledItem,
} from "@/server/domain/reports";
import {
  cashFlowSummary,
  cashFlowTicks,
  cashFlowValueText,
  cashFlowXLabels,
  defaultCashFlowIndex,
  lowestTone,
  pickMarkers,
  shortLabel,
} from "./cash-flow-model";

const plain = (text: string) => text.replaceAll(NBSP, " ");

/** October: realized up to the 14th, projected from then on. */
function october(values: Record<number, number>, today = 14) {
  const days: CashFlowDayPoint[] = [];
  let balance = 2_000_000;
  for (let day = 1; day <= 31; day++) {
    balance += values[day] ?? 0;
    days.push({
      date: `2026-10-${String(day).padStart(2, "0")}`,
      realizedCents: day <= today ? balance : null,
      projectedCents: day >= today ? balance : null,
    });
  }
  return days;
}

const item = (
  day: number,
  label: string,
  amountCents: number,
  extra: Partial<CashFlowScheduledItem> = {},
): CashFlowScheduledItem => ({
  date: `2026-10-${String(day).padStart(2, "0")}`,
  label,
  amountCents,
  kind: "entry",
  overdue: false,
  ...extra,
});

describe("shortLabel", () => {
  it("keeps short names and cuts long ones at a word", () => {
    expect(shortLabel("Aluguel")).toBe("Aluguel");
    expect(shortLabel("Fatura Cartão Principal")).toBe("Fatura Cartão…");
    expect(shortLabel("  Conta   de luz ")).toBe("Conta de luz");
    expect(shortLabel("Supercalifragilístico")).toBe("Supercalifrag…");
  });
});

describe("pickMarkers", () => {
  const days = october({ 15: -210_000, 20: -11_990, 25: -138_042, 28: 65_000 });
  const ticks = cashFlowTicks(days);

  const items = [
    item(15, "Aluguel", -210_000),
    item(20, "Internet", -11_990),
    item(25, "Fatura Cartão Principal", -138_042, { kind: "invoice" }),
    item(28, "Freelance", 65_000),
  ];

  it("marks the biggest items, at most three, in date order", () => {
    const markers = pickMarkers(days, items, { min: 0, max: 2_500_000 });
    expect(
      markers.map((marker) => [marker.index, marker.label, marker.placement]),
    ).toEqual([
      [14, "Aluguel", "below"],
      [24, "Fatura Cartão…", "below"],
      // Three days after the invoice, but labelled on the other side.
      [27, "Freelance", "above"],
    ]);
    expect(markers[0]?.value).toBe(days[14]?.projectedCents);
  });

  it("drops a label that would run into another on the same side", () => {
    // Zoomed in, the invoice sits at the bottom: its label flips above, where
    // Freelance's would be three days later.
    const markers = pickMarkers(days, items, ticks);
    expect(markers.map((marker) => [marker.label, marker.placement])).toEqual([
      ["Aluguel", "below"],
      ["Fatura Cartão…", "above"],
    ]);
  });

  it("names a day after its biggest item and keeps markers apart", () => {
    const markers = pickMarkers(
      days,
      [
        item(15, "Internet", -11_990),
        item(15, "Aluguel", -210_000),
        item(16, "Academia", -150_000),
        item(28, "Freelance", 65_000),
      ],
      ticks,
    );
    expect(markers.map((marker) => marker.label)).toEqual([
      "Aluguel",
      "Freelance",
    ]);
  });

  it("labels outflows below and inflows above, flipping at the edges", () => {
    const zoomed = { min: 1_500_000, max: 2_500_000 };
    const [outflow, inflow] = pickMarkers(
      days,
      [item(15, "Aluguel", -210_000), item(28, "Freelance", 65_000)],
      zoomed,
    );
    expect(outflow?.placement).toBe("below");
    expect(inflow?.placement).toBe("above");
    // Near the bottom of the plot the label goes above instead.
    const low = pickMarkers(days, [item(15, "Aluguel", -210_000)], {
      min: 1_700_000,
      max: 3_000_000,
    });
    expect(low[0]?.placement).toBe("above");
    const high = pickMarkers(days, [item(28, "Freelance", 65_000)], {
      min: 0,
      max: 1_900_000,
    });
    expect(high[0]?.placement).toBe("below");
  });

  it("skips items outside the chart or without a projection", () => {
    expect(pickMarkers(days, [item(3, "Passado", -9_000)], ticks)).toEqual([]);
    expect(
      pickMarkers(
        days,
        [{ ...item(1, "Fora", -9_000), date: "2026-11-02" }],
        ticks,
      ),
    ).toEqual([]);
  });
});

describe("axis and labels", () => {
  it("zooms in on a steady balance far from zero", () => {
    const ticks = cashFlowTicks(october({ 15: -50_000 }));
    expect(ticks.values).not.toContain(0);
  });

  it("puts first day, today and last day under the plot without collisions", () => {
    expect(cashFlowXLabels(october({}), "2026-10-14")).toEqual([
      { position: 0, label: "1/out" },
      { position: 13 / 30, label: "hoje" },
      { position: 1, label: "31/out" },
    ]);
    expect(
      cashFlowXLabels(october({}, 2), "2026-10-02").map((item) => item.label),
    ).toEqual(["hoje", "31/out"]);
    expect(
      cashFlowXLabels(october({}), "2026-11-20").map((item) => item.label),
    ).toEqual(["1/out", "31/out"]);
    expect(cashFlowXLabels([], "2026-10-14")).toEqual([]);
  });

  it("starts on today, or on the last day away from the current month", () => {
    expect(defaultCashFlowIndex(october({}), "2026-10-14")).toBe(13);
    expect(defaultCashFlowIndex(october({}), "2026-11-20")).toBe(30);
    expect(defaultCashFlowIndex([], "2026-11-20")).toBe(0);
  });
});

describe("lowestTone", () => {
  const base = {
    phase: "current" as const,
    lowestRealized: null,
    lowestProjected: { date: "2026-10-25", cents: 5_000 },
    endCents: 10_000,
  };

  it("flags a dip below zero, and danger when the month ends below it", () => {
    expect(lowestTone(base)).toBeNull();
    expect(
      lowestTone({
        ...base,
        lowestProjected: { date: "2026-10-25", cents: -5_000 },
      }),
    ).toBe("warning");
    expect(
      lowestTone({
        ...base,
        lowestProjected: { date: "2026-10-25", cents: -5_000 },
        endCents: -1,
      }),
    ).toBe("danger");
    expect(
      lowestTone({
        ...base,
        phase: "past",
        lowestRealized: { date: "2026-09-12", cents: -100 },
        lowestProjected: null,
      }),
    ).toBe("warning");
  });
});

describe("spoken text", () => {
  const days = october({ 15: -210_000, 25: -138_042 });
  const report: Pick<
    CashFlowReport,
    | "phase"
    | "days"
    | "startCents"
    | "endCents"
    | "lowestRealized"
    | "lowestProjected"
  > = {
    phase: "current",
    days,
    startCents: 2_000_000,
    endCents: 1_651_958,
    lowestRealized: { date: "2026-10-01", cents: 2_000_000 },
    lowestProjected: { date: "2026-10-25", cents: 1_651_958 },
  };

  it("summarizes each kind of month", () => {
    expect(plain(cashFlowSummary(report, "2026-10-14"))).toBe(
      "Saldo de R$ 20.000 hoje; previsto R$ 16.519,58 em 31/out; menor saldo previsto R$ 16.519,58 em 25/out.",
    );
    expect(
      plain(cashFlowSummary({ ...report, phase: "past" }, "2026-11-20")),
    ).toBe(
      "Saldo começou o mês em R$ 20.000 e fechou em R$ 16.519,58 em 31/out; menor saldo R$ 20.000 em 1/out.",
    );
    expect(
      plain(cashFlowSummary({ ...report, phase: "future" }, "2026-09-20")),
    ).toBe(
      "Previsão: começa em R$ 20.000 e termina em R$ 16.519,58 em 31/out; menor saldo previsto R$ 16.519,58 em 25/out.",
    );
    expect(cashFlowSummary({ ...report, days: [] }, "2026-10-14")).toBe(
      "Sem saldo para mostrar.",
    );
  });

  it("describes the day under the scrub", () => {
    expect(plain(cashFlowValueText(days[13], "2026-10-14"))).toBe(
      "14 de outubro, hoje: saldo R$ 20.000",
    );
    expect(
      plain(
        cashFlowValueText(
          {
            date: "2026-10-14",
            realizedCents: 100_000,
            projectedCents: 90_000,
          },
          "2026-10-14",
        ),
      ),
    ).toBe("14 de outubro, hoje: saldo R$ 1.000; com os atrasados, R$ 900");
    expect(plain(cashFlowValueText(days[2], "2026-10-14"))).toBe(
      "3 de outubro: saldo R$ 20.000",
    );
    expect(plain(cashFlowValueText(days[24], "2026-10-14"))).toBe(
      "25 de outubro: saldo previsto R$ 16.519,58",
    );
    expect(cashFlowValueText(undefined, "2026-10-14")).toBe("");
  });
});
