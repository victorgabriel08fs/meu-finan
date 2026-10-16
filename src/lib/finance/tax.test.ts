import { describe, expect, it } from "vitest";
import { incomeTaxRate, LONG_TERM_TAX_RATE, monthsToDays } from "./tax";

describe("incomeTaxRate (IR regressivo)", () => {
  it.each([
    [0, 0.225],
    [180, 0.225],
    [181, 0.2],
    [360, 0.2],
    [361, 0.175],
    [720, 0.175],
    [721, 0.15],
    [10_000, LONG_TERM_TAX_RATE],
  ])("%d dias → %d", (days, rate) => {
    expect(incomeTaxRate(days)).toBe(rate);
  });

  it("rejects negative or non-finite holding periods", () => {
    expect(() => incomeTaxRate(-1)).toThrow(RangeError);
    expect(() => incomeTaxRate(Number.NaN)).toThrow(RangeError);
  });
});

describe("monthsToDays", () => {
  it("uses 365.25 / 12 days per month: 12 months = 365 days (17.5%, not 20%)", () => {
    expect(monthsToDays(0)).toBe(0);
    expect(monthsToDays(6)).toBe(183);
    expect(monthsToDays(12)).toBe(365);
    expect(incomeTaxRate(monthsToDays(12))).toBe(0.175);
    expect(monthsToDays(24)).toBe(731);
    expect(incomeTaxRate(monthsToDays(24))).toBe(0.15);
    expect(incomeTaxRate(monthsToDays(5))).toBe(0.225);
  });

  it("rejects negative months", () => {
    expect(() => monthsToDays(-1)).toThrow(RangeError);
  });
});
