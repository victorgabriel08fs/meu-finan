import { describe, expect, it } from "vitest";
import { MINUS, NBSP } from "@/lib/format/money";
import {
  axisMoneyLabel,
  axisPercentLabel,
  formatMoneyShort,
  formatWholeReais,
  monthAbbrev,
  monthName,
  monthsCount,
  monthYearLabel,
} from "./format";

describe("axis labels", () => {
  it("compacts amounts without the currency symbol", () => {
    expect(axisMoneyLabel(0)).toBe("0");
    expect(axisMoneyLabel(95_000)).toBe("950");
    expect(axisMoneyLabel(400_000)).toBe(`4${NBSP}mil`);
    expect(axisMoneyLabel(120_000_000)).toBe(`1,2${NBSP}mi`);
    expect(axisMoneyLabel(-400_000)).toBe(`${MINUS}4${NBSP}mil`);
  });

  it("formats percent ticks with at most one decimal", () => {
    expect(axisPercentLabel(0)).toBe("0%");
    expect(axisPercentLabel(0.25)).toBe("25%");
    expect(axisPercentLabel(0.125)).toBe("12,5%");
    expect(axisPercentLabel(-0.1)).toBe(`${MINUS}10%`);
  });
});

describe("money in summaries", () => {
  it("drops zero cents but keeps real ones", () => {
    expect(formatMoneyShort(41_000)).toBe(`R$${NBSP}410`);
    expect(formatMoneyShort(64_050)).toBe(`R$${NBSP}640,50`);
    expect(formatMoneyShort(-1_000)).toBe(`${MINUS}R$${NBSP}10`);
    expect(formatMoneyShort(268_000, { sign: "always" })).toBe(
      `+R$${NBSP}2.680`,
    );
  });

  it("rounds whole reais towards zero", () => {
    expect(formatWholeReais(5_306)).toBe(`R$${NBSP}53`);
    expect(formatWholeReais(99)).toBe(`R$${NBSP}0`);
  });
});

describe("month labels", () => {
  it("abbreviates and names months in pt-BR", () => {
    expect(monthAbbrev("2026-10")).toBe("out");
    expect(monthName("2026-03")).toBe("março");
    expect(monthYearLabel("2027-08")).toBe("ago/2027");
    expect(monthYearLabel({ year: 2029, month: 12 })).toBe("dez/2029");
    expect(monthsCount(1)).toBe("1 mês");
    expect(monthsCount(4)).toBe("4 meses");
  });
});
