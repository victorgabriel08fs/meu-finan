import { describe, expect, it } from "vitest";
import type { RateInput } from "@/lib/finance/rates";
import { formatPercent, formatRate, type RateLabelInput } from "./number";

describe("formatPercent", () => {
  it.each([
    [0.309, "30,9%"],
    [0.3, "30,0%"],
    [0.268, "26,8%"],
    [0.0004, "0,0%"],
    [0, "0,0%"],
    [0.9994, "99,9%"],
    [0.99996, "100%"],
    [1, "100%"],
    [1.02, "102%"],
    [12.5, "1.250%"],
    [-0.32, "−32,0%"],
    [-1.5, "−150%"],
    [-0.0001, "0,0%"],
  ])("%d → %j", (ratio, expected) => {
    expect(formatPercent(ratio)).toBe(expected);
  });

  it("honours the sign option", () => {
    expect(formatPercent(0.125, { sign: "always" })).toBe("+12,5%");
    expect(formatPercent(-0.4, { sign: "always" })).toBe("−40,0%");
    expect(formatPercent(-0.4, { sign: "never" })).toBe("40,0%");
    expect(formatPercent(0, { sign: "always" })).toBe("0,0%");
  });

  it("rejects non-finite ratios", () => {
    expect(() => formatPercent(Number.NaN)).toThrow(RangeError);
    expect(() => formatPercent(Infinity)).toThrow(RangeError);
  });
});

describe("formatRate", () => {
  it.each<[RateLabelInput, string]>([
    [{ kind: "monthly", value: 0.0095 }, "0,95% a.m."],
    [{ kind: "annual", value: 0.12 }, "12,00% a.a."],
    [{ kind: "annual", value: 0.139_411 }, "13,94% a.a."],
    [{ kind: "monthly", value: -0.005 }, "−0,50% a.m."],
    [{ kind: "monthly", value: -0.000_01 }, "0,00% a.m."],
    [{ kind: "cdi", pct: 1.02 }, "102% do CDI"],
    [{ kind: "cdi", pct: 1 }, "100% do CDI"],
    [{ kind: "cdi", pct: 1.025 }, "102,5% do CDI"],
    [{ kind: "cdi", pct: 0.95 }, "95% do CDI"],
    [{ kind: "cdi", pct: -0.5 }, "−50% do CDI"],
    [{ kind: "ipca", spread: 0.06 }, "IPCA + 6,00%"],
    [{ kind: "ipca", spread: 0.0575 }, "IPCA + 5,75%"],
    [{ kind: "ipca", spread: -0.01 }, "IPCA − 1,00%"],
    [{ kind: "ipca", spread: 0 }, "IPCA + 0,00%"],
  ])("%j → %j", (rate, expected) => {
    expect(formatRate(rate)).toBe(expected);
  });

  it("accepts the finance RateInput as is", () => {
    const rate: RateInput = { kind: "cdi", pct: 1.02, cdiAnnual: 0.1365 };
    expect(formatRate(rate)).toBe("102% do CDI");
    const ipca: RateInput = { kind: "ipca", spread: 0.06, ipcaAnnual: 0.045 };
    expect(formatRate(ipca)).toBe("IPCA + 6,00%");
  });

  it("rejects unknown kinds and non-finite values", () => {
    expect(() =>
      formatRate({ kind: "selic", value: 0.1 } as unknown as RateLabelInput),
    ).toThrow(/Unknown rate kind/);
    expect(() => formatRate({ kind: "annual", value: Number.NaN })).toThrow(
      /rate\.value/,
    );
    expect(() => formatRate({ kind: "cdi", pct: Infinity })).toThrow(
      /rate\.pct/,
    );
    expect(() => formatRate({ kind: "ipca", spread: Number.NaN })).toThrow(
      /rate\.spread/,
    );
  });
});
