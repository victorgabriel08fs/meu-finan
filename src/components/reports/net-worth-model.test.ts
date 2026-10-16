import { describe, expect, it } from "vitest";
import { NBSP } from "@/lib/format/money";
import type { NetWorthBreakdownPoint } from "@/server/domain/reports";
import {
  breakdownSummary,
  breakdownTicks,
  breakdownValueText,
  breakdownXLabels,
  deltaTone,
  pointLabel,
  windowLabel,
} from "./net-worth-model";

const plain = (text: string) => text.replaceAll(NBSP, " ");

const points: NetWorthBreakdownPoint[] = [
  {
    month: "2026-08",
    netCents: 1_500_000,
    assetsCents: 1_500_000,
    liabilitiesCents: 0,
  },
  {
    month: "2026-09",
    netCents: 5_550_000,
    assetsCents: 5_850_000,
    liabilitiesCents: 300_000,
  },
  {
    month: "2026-10",
    netCents: 13_262_600,
    assetsCents: 13_585_500,
    liabilitiesCents: 322_900,
  },
];

describe("net worth view model", () => {
  it("names the window", () => {
    expect(windowLabel(1)).toBe("no mês");
    expect(windowLabel(12)).toBe("em 12 meses");
  });

  it("grows areas from zero, below it when the net worth is negative", () => {
    expect(breakdownTicks([1_500_000, 13_262_600]).values[0]).toBe(0);
    expect(breakdownTicks([-200_000, 100_000]).min).toBeLessThan(0);
    expect(
      breakdownTicks([300_000, 322_900], 2).values.length,
    ).toBeLessThanOrEqual(3);
  });

  it("labels the first month and today under the plot", () => {
    expect(breakdownXLabels(points)).toEqual([
      { position: 0, label: "ago/26" },
      { position: 1, label: "hoje" },
    ]);
    expect(breakdownXLabels(points.slice(0, 1))).toEqual([
      { position: 0.5, label: "hoje" },
    ]);
    expect(breakdownXLabels([])).toEqual([]);
  });

  it("reads a rise as good news except for liabilities", () => {
    expect(deltaTone("netCents", 10)).toBe("good");
    expect(deltaTone("assetsCents", -10)).toBe("bad");
    expect(deltaTone("liabilitiesCents", 10)).toBe("bad");
    expect(deltaTone("liabilitiesCents", -10)).toBe("good");
    expect(deltaTone("liabilitiesCents", 0)).toBe("neutral");
  });

  it("summarizes each series over the window", () => {
    const net = points.map((point) => point.netCents);
    expect(plain(breakdownSummary("netCents", net, 3))).toBe(
      "Patrimônio subiu de R$ 15.000 para R$ 132.626 em 3 meses.",
    );
    expect(plain(breakdownSummary("liabilitiesCents", [300_000, 0], 1))).toBe(
      "Passivos caíram de R$ 3.000 para R$ 0 no mês.",
    );
    expect(plain(breakdownSummary("assetsCents", [500, 500], 6))).toBe(
      "Ativos ficaram estáveis em R$ 5 em 6 meses.",
    );
    expect(plain(breakdownSummary("netCents", [700], 1))).toBe(
      "Patrimônio está em R$ 7.",
    );
    expect(plain(breakdownSummary("assetsCents", [], 1))).toBe(
      "Ativos estão em R$ 0.",
    );
  });

  it("speaks each month of the scrub", () => {
    expect(pointLabel(points, 0)).toBe("fim de agosto de 2026");
    expect(pointLabel(points, 2)).toBe("hoje");
    expect(pointLabel(points, 9)).toBe("");
    expect(plain(breakdownValueText(points, 1))).toBe(
      "Fim de setembro de 2026: patrimônio R$ 55.500; ativos R$ 58.500; passivos R$ 3.000",
    );
    expect(plain(breakdownValueText(points, 2))).toBe(
      "Hoje: patrimônio R$ 132.626; ativos R$ 135.855; passivos R$ 3.229",
    );
    expect(breakdownValueText(points, 5)).toBe("");
  });
});
