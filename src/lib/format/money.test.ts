import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseBRLToCents } from "@/lib/finance/money";
import {
  brlParts,
  formatBRL,
  formatCompactBRL,
  MINUS,
  NBSP,
  type SignDisplay,
} from "./money";

// Intl separates "R$" from the number with a no-break space (U+00A0), and the
// helpers use the typographic minus (U+2212). Expected strings spell both out.
describe("constants", () => {
  it("are the exact characters", () => {
    expect(NBSP).toBe(" ");
    expect(MINUS).toBe("−");
    expect(MINUS).not.toBe("-");
  });
});

describe("formatBRL", () => {
  it.each([
    [123_456, "R$ 1.234,56"],
    [0, "R$ 0,00"],
    [5, "R$ 0,05"],
    [100, "R$ 1,00"],
    [-6450, "−R$ 64,50"],
    [-1, "−R$ 0,01"],
    [100_000_000_000, "R$ 1.000.000.000,00"],
    [Number.MAX_SAFE_INTEGER, "R$ 90.071.992.547.409,91"],
    [-Number.MAX_SAFE_INTEGER, "−R$ 90.071.992.547.409,91"],
  ])("%d → %j", (cents, expected) => {
    expect(formatBRL(cents)).toBe(expected);
  });

  it("sign 'always' adds + to positives only", () => {
    expect(formatBRL(780_000, { sign: "always" })).toBe("+R$ 7.800,00");
    expect(formatBRL(-6450, { sign: "always" })).toBe("−R$ 64,50");
    expect(formatBRL(0, { sign: "always" })).toBe("R$ 0,00");
  });

  it("sign 'never' prints the absolute value", () => {
    expect(formatBRL(-6450, { sign: "never" })).toBe("R$ 64,50");
    expect(formatBRL(6450, { sign: "never" })).toBe("R$ 64,50");
  });

  it("agrees with Intl (minus aside) and parses back to the same cents", () => {
    const intl = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
    const sign = fc.constantFrom<SignDisplay>("auto", "always");
    fc.assert(
      fc.property(fc.integer({ min: -1e13, max: 1e13 }), sign, (cents, s) => {
        expect(formatBRL(cents)).toBe(
          intl.format(cents / 100).replace("-", MINUS),
        );
        expect(parseBRLToCents(formatBRL(cents, { sign: s }))).toBe(cents);
      }),
      { numRuns: 200 },
    );
  });

  it("rejects amounts that are not cents and unknown sign modes", () => {
    expect(() => formatBRL(64.5)).toThrow(RangeError);
    expect(() => formatBRL(Number.NaN)).toThrow(RangeError);
    expect(() => formatBRL(1, { sign: "plus" as SignDisplay })).toThrow(
      /sign must be one of auto, always, never/,
    );
  });
});

describe("brlParts", () => {
  it("splits sign, symbol, whole reais and the decimal part (with the comma)", () => {
    expect(brlParts(123_415)).toEqual({
      sign: "",
      currency: "R$",
      integer: "1.234",
      decimal: ",15",
    });
    expect(brlParts(-5)).toEqual({
      sign: "−",
      currency: "R$",
      integer: "0",
      decimal: ",05",
    });
    expect(brlParts(780_000, { sign: "always" }).sign).toBe("+");
    expect(brlParts(-780_000, { sign: "never" }).sign).toBe("");
  });

  it("joined with NBSP, gives formatBRL", () => {
    const parts = brlParts(-99_999);
    expect(
      `${parts.sign}${parts.currency}${NBSP}${parts.integer}${parts.decimal}`,
    ).toBe(formatBRL(-99_999));
  });
});

describe("formatCompactBRL", () => {
  it.each([
    [10_580_000, "R$ 105,8 mil"],
    [123_456_700, "R$ 1,2 mi"],
    [100_000, "R$ 1 mil"],
    [1_234_500, "R$ 12,3 mil"],
    [150_000_000_000, "R$ 1,5 bi"],
    [95_055, "R$ 951"],
    [99_960, "R$ 1 mil"],
    [5300, "R$ 53"],
    [0, "R$ 0"],
    [-10_580_000, "−R$ 105,8 mil"],
  ])("%d → %j", (cents, expected) => {
    expect(formatCompactBRL(cents)).toBe(expected);
  });

  it("honours the sign option, and drops the sign when the amount rounds to zero", () => {
    expect(formatCompactBRL(10_580_000, { sign: "always" })).toBe(
      "+R$ 105,8 mil",
    );
    expect(formatCompactBRL(-10_580_000, { sign: "never" })).toBe(
      "R$ 105,8 mil",
    );
    expect(formatCompactBRL(-40)).toBe("R$ 0");
    expect(formatCompactBRL(40, { sign: "always" })).toBe("R$ 0");
  });

  it("rejects amounts that are not cents", () => {
    expect(() => formatCompactBRL(0.5)).toThrow(RangeError);
  });
});
