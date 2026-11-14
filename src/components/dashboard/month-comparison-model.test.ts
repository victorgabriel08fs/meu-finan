import { describe, expect, it } from "vitest";
import { compareAmounts } from "@/lib/finance";
import {
  categoryDirectionHint,
  categoryPercentLabel,
  comparisonCaption,
  previousLine,
  totalChangeParts,
} from "./month-comparison-model";

const previous = { start: "2026-10-01", end: "2026-10-14" };

describe("comparisonCaption", () => {
  it("says up to today, against the same days of the month before", () => {
    expect(
      comparisonCaption({ complete: false, previous }, "novembro", "outubro"),
    ).toBe("Despesas pagas até hoje, contra 1/out – 14/out");
  });

  it("says whole months when the month is over", () => {
    expect(
      comparisonCaption({ complete: true, previous }, "novembro", "outubro"),
    ).toBe("Despesas pagas em novembro, contra outubro inteiro");
  });
});

describe("totalChangeParts", () => {
  it("says more, with the percent and the direction in words", () => {
    expect(
      totalChangeParts(compareAmounts(11_750, 10_000), "outubro", false),
    ).toEqual({
      kind: "up",
      percent: "+17,5%",
      suffix: " a mais que em outubro",
    });
  });

  it("says less, with the real minus sign", () => {
    const parts = totalChangeParts(
      compareAmounts(8_800, 10_000),
      "outubro",
      false,
    );
    expect(parts).toMatchObject({
      kind: "down",
      suffix: " a menos que em outubro",
    });
    expect(parts.percent).toBe("−12,0%");
  });

  it("drops the decimal from 100% on", () => {
    expect(
      totalChangeParts(compareAmounts(20_200, 10_000), "outubro", false)
        .percent,
    ).toBe("+102%");
  });

  it("says equal", () => {
    expect(
      totalChangeParts(compareAmounts(500, 500), "outubro", false),
    ).toEqual({ kind: "same", percent: null, suffix: "Igual a outubro" });
  });

  it("says there was nothing to compare with, by the point or whole", () => {
    const total = compareAmounts(500, 0);
    expect(totalChangeParts(total, "outubro", false)).toEqual({
      kind: "no-baseline",
      percent: null,
      suffix: "Sem despesas pagas em outubro até esse ponto",
    });
    expect(totalChangeParts(total, "outubro", true).suffix).toBe(
      "Sem despesas pagas em outubro",
    );
  });
});

describe("previousLine", () => {
  const total = compareAmounts(500, 400);

  it("names the point reached, or the whole month", () => {
    expect(previousLine({ complete: false, previous, total }, "outubro")).toBe(
      "Em outubro, até 14/out:",
    );
    expect(previousLine({ complete: true, previous, total }, "outubro")).toBe(
      "Em outubro:",
    );
  });

  it("goes away without a baseline", () => {
    expect(
      previousLine(
        { complete: false, previous, total: compareAmounts(500, 0) },
        "outubro",
      ),
    ).toBeNull();
  });
});

describe("category labels", () => {
  it("gives the percent, or 'Nova no mês' when nothing was spent before", () => {
    expect(categoryPercentLabel(compareAmounts(32_000, 20_000))).toBe("+60,0%");
    expect(categoryPercentLabel(compareAmounts(12_000, 20_000))).toBe("−40,0%");
    expect(categoryPercentLabel(compareAmounts(500, 0))).toBe("Nova no mês");
  });

  it("tells the direction to a screen reader", () => {
    expect(categoryDirectionHint(compareAmounts(2, 1), "outubro")).toBe(
      " a mais que em outubro",
    );
    expect(categoryDirectionHint(compareAmounts(1, 2), "outubro")).toBe(
      " a menos que em outubro",
    );
  });
});
