import { describe, expect, it } from "vitest";
import {
  formatDecimalInput,
  formatMoneyInput,
  MAX_INPUT_CENTS,
  parseDecimalInput,
  parseMoneyInput,
  stepDecimal,
} from "./inputs";

describe("parseMoneyInput", () => {
  it("reads pt-BR amounts as cents", () => {
    expect(parseMoneyInput("1.234,56")).toEqual({ kind: "ok", cents: 123_456 });
    expect(parseMoneyInput("R$ 64,50")).toEqual({ kind: "ok", cents: 6_450 });
    expect(parseMoneyInput("35")).toEqual({ kind: "ok", cents: 3_500 });
    expect(parseMoneyInput("12.5")).toEqual({ kind: "ok", cents: 1_250 });
    expect(parseMoneyInput(",5")).toEqual({ kind: "ok", cents: 50 });
    expect(parseMoneyInput("0")).toEqual({ kind: "ok", cents: 0 });
  });

  it("tells empty from invalid", () => {
    expect(parseMoneyInput("")).toEqual({ kind: "empty" });
    expect(parseMoneyInput("   ")).toEqual({ kind: "empty" });
    expect(parseMoneyInput("abc")).toEqual({ kind: "invalid" });
    expect(parseMoneyInput("1,2,3")).toEqual({ kind: "invalid" });
  });

  it("rejects negative and oversized amounts", () => {
    expect(parseMoneyInput("-10")).toEqual({ kind: "invalid" });
    expect(parseMoneyInput("9.999.999.999,99")).toEqual({ kind: "invalid" });
    expect(parseMoneyInput("999.999.999,99")).toEqual({
      kind: "ok",
      cents: MAX_INPUT_CENTS,
    });
  });
});

describe("formatMoneyInput", () => {
  it("formats for editing, without ,00", () => {
    expect(formatMoneyInput(123_456)).toBe("1.234,56");
    expect(formatMoneyInput(100_000)).toBe("1.000");
    expect(formatMoneyInput(50)).toBe("0,50");
    expect(formatMoneyInput(null)).toBe("");
  });

  it("round-trips through the parser", () => {
    for (const cents of [0, 1, 99, 100, 123_456, 98_765_432_100]) {
      const parsed = parseMoneyInput(formatMoneyInput(cents));
      expect(parsed).toEqual({ kind: "ok", cents });
    }
  });
});

describe("decimal fields", () => {
  it("parses commas and points", () => {
    expect(parseDecimalInput("12,5")).toEqual({ kind: "ok", value: 12.5 });
    expect(parseDecimalInput("0.95")).toEqual({ kind: "ok", value: 0.95 });
    expect(parseDecimalInput("100")).toEqual({ kind: "ok", value: 100 });
    expect(parseDecimalInput(",25")).toEqual({ kind: "ok", value: 0.25 });
    expect(parseDecimalInput("")).toEqual({ kind: "empty" });
    expect(parseDecimalInput("1.000,5")).toEqual({ kind: "invalid" });
    expect(parseDecimalInput(",")).toEqual({ kind: "invalid" });
  });

  it("accepts negatives only when asked", () => {
    expect(parseDecimalInput("-1,5")).toEqual({ kind: "invalid" });
    expect(parseDecimalInput("−1,5", { allowNegative: true })).toEqual({
      kind: "ok",
      value: -1.5,
    });
  });

  it("formats without grouping and trailing zeros", () => {
    expect(formatDecimalInput(12.5)).toBe("12,5");
    expect(formatDecimalInput(1000)).toBe("1000");
    expect(formatDecimalInput(0.955, 2)).toBe("0,96");
    expect(formatDecimalInput(-1.5)).toBe("−1,5");
    expect(formatDecimalInput(null)).toBe("");
  });

  it("steps without float noise and clamps", () => {
    expect(stepDecimal(12, 0.25)).toBe(12.25);
    expect(stepDecimal(0.1, 0.2)).toBe(0.3);
    expect(stepDecimal(null, 0.25)).toBe(0.25);
    expect(stepDecimal(0, -0.25, { min: 0 })).toBe(0);
    expect(stepDecimal(99.9, 0.25, { max: 100 })).toBe(100);
  });
});
