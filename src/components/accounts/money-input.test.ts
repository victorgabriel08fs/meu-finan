import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  formatMoneyText,
  MAX_INTEGER_DIGITS,
  moneyTextToCents,
  sanitizeMoneyTyping,
  toggleMoneySign,
} from "./money-input";

describe("sanitizeMoneyTyping", () => {
  it("keeps whole reais as typed (calculator style)", () => {
    expect(sanitizeMoneyTyping("35")).toBe("35");
    expect(sanitizeMoneyTyping("007")).toBe("7");
    expect(sanitizeMoneyTyping("0")).toBe("0");
    expect(sanitizeMoneyTyping("")).toBe("");
    expect(sanitizeMoneyTyping("abc")).toBe("");
  });

  it("uses the comma for cents, at most two", () => {
    expect(sanitizeMoneyTyping("12,345")).toBe("12,34");
    expect(sanitizeMoneyTyping("12,")).toBe("12,");
    expect(sanitizeMoneyTyping(",5")).toBe("0,5");
    expect(sanitizeMoneyTyping("1.234,5")).toBe("1234,5");
    expect(sanitizeMoneyTyping("R$ 1.234,56")).toBe("1234,56");
  });

  it("reads a lone dot with up to 2 digits as the decimal point", () => {
    expect(sanitizeMoneyTyping("12.5")).toBe("12,5");
    expect(sanitizeMoneyTyping("12.")).toBe("12,");
    expect(sanitizeMoneyTyping("1.234")).toBe("1234");
    expect(sanitizeMoneyTyping("1.234.567")).toBe("1234567");
  });

  it("caps the integer part", () => {
    expect(sanitizeMoneyTyping("12345678901")).toBe("123456789");
    expect(sanitizeMoneyTyping("12345678901").length).toBe(MAX_INTEGER_DIGITS);
  });

  it("keeps a minus sign only when negatives are allowed", () => {
    expect(sanitizeMoneyTyping("-12,40", { allowNegative: true })).toBe(
      "−12,40",
    );
    expect(sanitizeMoneyTyping("−", { allowNegative: true })).toBe("−");
    expect(sanitizeMoneyTyping("-12,40")).toBe("12,40");
  });
});

describe("moneyTextToCents", () => {
  it("parses the editing text", () => {
    expect(moneyTextToCents("35")).toBe(3500);
    expect(moneyTextToCents("12,4")).toBe(1240);
    expect(moneyTextToCents("12,")).toBe(1200);
    expect(moneyTextToCents("0,05")).toBe(5);
    expect(moneyTextToCents("1.234,56")).toBe(123456);
    expect(moneyTextToCents("−12,40")).toBe(-1240);
  });

  it("returns null without digits", () => {
    expect(moneyTextToCents("")).toBeNull();
    expect(moneyTextToCents("−")).toBeNull();
    expect(moneyTextToCents("R$")).toBeNull();
  });

  it("never returns negative zero", () => {
    expect(Object.is(moneyTextToCents("−0"), 0)).toBe(true);
  });
});

describe("formatMoneyText", () => {
  it("groups thousands at rest and not while editing", () => {
    expect(formatMoneyText(123456)).toBe("1.234,56");
    expect(formatMoneyText(123456, { grouping: false })).toBe("1234,56");
    expect(formatMoneyText(-1240)).toBe("−12,40");
    expect(formatMoneyText(0)).toBe("0,00");
    expect(formatMoneyText(null)).toBe("");
  });

  it("round-trips every amount the actions accept", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -99_999_999_999, max: 99_999_999_999 }),
        fc.boolean(),
        (cents, grouping) => {
          const text = formatMoneyText(cents, { grouping });
          expect(moneyTextToCents(text)).toBe(cents);
          expect(
            sanitizeMoneyTyping(text, { allowNegative: true }).replace(
              /\./g,
              "",
            ),
          ).toBe(formatMoneyText(cents, { grouping: false }));
        },
      ),
    );
  });
});

describe("toggleMoneySign", () => {
  it("flips the leading minus", () => {
    expect(toggleMoneySign("12,40")).toBe("−12,40");
    expect(toggleMoneySign("−12,40")).toBe("12,40");
    expect(toggleMoneySign("")).toBe("−");
  });
});
