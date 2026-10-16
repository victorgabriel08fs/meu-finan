import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  detectDecimalSeparator,
  MAX_AMOUNT_CENTS,
  parseAmount,
} from "./amount";

describe("parseAmount with a decimal comma (pt-BR)", () => {
  it.each([
    ["64,50", 6450],
    ["-64,50", -6450],
    ["+64,50", 6450],
    ["1.234,56", 123456],
    ["-1.234.567,89", -123456789],
    ["1234,56", 123456],
    ["R$ 1.234,56", 123456],
    ["-R$ 64,50", -6450],
    ["R$ -64,50", -6450],
    ["R$ 64,50", 6450],
    ["−64,50", -6450],
    ["64,50-", -6450],
    ["(64,50)", -6450],
    ["64,50 D", -6450],
    ["64,50D", -6450],
    ["64,50 C", 6450],
    ["-64,50 D", -6450],
    ["1.234", 123400],
    ["35", 3500],
    [",5", 50],
    ["0,005", 1],
    ["0,004", 0],
    ["-0,005", -1],
    ["0,00", 0],
    ["-0,00", 0],
  ])("%s → %d", (text, cents) => {
    expect(parseAmount(text, ",")).toBe(cents);
  });

  it.each([
    "",
    "   ",
    "abc",
    "R$",
    "1234.56",
    "12.34,5.6",
    "1,2,3",
    "--64,50",
    "-64,50 C",
    "64-50",
    "1e5",
    ",",
  ])("rejects %j", (text) => {
    expect(parseAmount(text, ",")).toBeNull();
  });
});

describe("parseAmount with a decimal point", () => {
  it.each([
    ["64.50", 6450],
    ["-64.5", -6450],
    ["1,234.56", 123456],
    ["$1,234.56", 123456],
    ["1234.567", 123457],
    ["(1,000.00)", -100000],
  ])("%s → %d", (text, cents) => {
    expect(parseAmount(text, ".")).toBe(cents);
  });

  it("rejects pt-BR numbers read the other way", () => {
    expect(parseAmount("1.234,56", ".")).toBeNull();
    expect(parseAmount("1234,56", ".")).toBeNull();
  });
});

describe("parseAmount limits", () => {
  it("refuses amounts above R$ 999.999.999,99", () => {
    expect(parseAmount("999.999.999,99", ",")).toBe(MAX_AMOUNT_CENTS);
    expect(parseAmount("1.000.000.000,00", ",")).toBeNull();
    expect(parseAmount("99999999999999999999", ",")).toBeNull();
  });

  it("is exact for every cent amount, in both conventions", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -MAX_AMOUNT_CENTS, max: MAX_AMOUNT_CENTS }),
        fc.boolean(),
        (cents, grouped) => {
          const magnitude = Math.abs(cents);
          const reais = String(Math.floor(magnitude / 100));
          const fraction = String(magnitude % 100).padStart(2, "0");
          const group = (separator: string) =>
            grouped ? reais.replace(/\B(?=(\d{3})+(?!\d))/g, separator) : reais;
          const sign = cents < 0 ? "-" : "";
          expect(parseAmount(`${sign}${group(".")},${fraction}`, ",")).toBe(
            cents === 0 ? 0 : cents,
          );
          expect(parseAmount(`${sign}${group(",")}.${fraction}`, ".")).toBe(
            cents === 0 ? 0 : cents,
          );
        },
      ),
    );
  });
});

describe("detectDecimalSeparator", () => {
  it("reads pt-BR columns", () => {
    expect(detectDecimalSeparator(["-64,50", "1.234,56", "35"])).toBe(",");
    expect(detectDecimalSeparator(["1.234", "2.500"])).toBe(",");
  });

  it("reads US-style columns", () => {
    expect(detectDecimalSeparator(["-64.50", "1,234.56", "35"])).toBe(".");
    expect(detectDecimalSeparator(["1,234", "2,500"])).toBe(".");
    expect(detectDecimalSeparator(["R$ 12.5", "7.25"])).toBe(".");
  });

  it("defaults to the comma without clues", () => {
    expect(detectDecimalSeparator([])).toBe(",");
    expect(detectDecimalSeparator(["35", "100"])).toBe(",");
  });
});
