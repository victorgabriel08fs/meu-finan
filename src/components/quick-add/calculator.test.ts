import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type CalcKey,
  centsToExpression,
  currentOperand,
  displayValue,
  evaluate,
  expressionLine,
  formatCents,
  formatOperand,
  keyFromKeyboard,
  MAX_AMOUNT_CENTS,
  operandToCents,
  press,
  resolve,
} from "./calculator";

/** Presses the keys in order, ignoring errors. */
function type(keys: CalcKey[], start = ""): string {
  return keys.reduce(
    (expression, key) => press(expression, key).expression,
    start,
  );
}

describe("digits", () => {
  it("reads whole reais: 35 is R$ 35,00", () => {
    expect(type(["3", "5"])).toBe("35");
    expect(evaluate("35")).toBe(3500);
  });

  it("collapses leading zeros", () => {
    expect(type(["0", "0", "7"])).toBe("7");
    expect(type(["00"])).toBe("0");
    expect(type(["00", "00", "4"])).toBe("4");
    expect(type(["1", "+", "0", "3"])).toBe("1+3");
  });

  it("appends 00 as two digits", () => {
    expect(type(["1", "2", "00"])).toBe("1200");
  });

  it("allows at most 9 integer digits", () => {
    const nine: CalcKey[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
    expect(type([...nine, "1"])).toBe("123456789");
    expect(type(["1", "2", "3", "4", "5", "6", "7", "8", "00"])).toBe(
      "12345678",
    );
    expect(type([...nine, "+", "5"])).toBe("123456789+5");
  });
});

describe("comma", () => {
  it("starts the cents, with a leading zero when needed", () => {
    expect(type([",", "5"])).toBe("0,5");
    expect(type(["6", "4", ",", "5"])).toBe("64,5");
    expect(evaluate("64,5")).toBe(6450);
  });

  it("takes at most 2 decimals", () => {
    expect(type(["1", ",", "2", "3", "4"])).toBe("1,23");
    expect(type(["1", ",", "2", "00"])).toBe("1,2");
    expect(type(["1", ",", "00"])).toBe("1,00");
  });

  it("is ignored when the operand already has one", () => {
    expect(type(["1", ",", "2", ","])).toBe("1,2");
    expect(type(["1", ",", "+", ","])).toBe("1+0,");
  });
});

describe("operators", () => {
  it("cannot start an expression", () => {
    expect(type(["+"])).toBe("");
    expect(type(["−", "5"])).toBe("5");
  });

  it("replaces a previous operator or a dangling comma", () => {
    expect(type(["1", "2", "+", "−"])).toBe("12−");
    expect(type(["1", "2", ",", "+"])).toBe("12+");
  });

  it("adds and subtracts in cents", () => {
    expect(evaluate("120+35,5")).toBe(15550);
    expect(evaluate("50−80")).toBe(-3000);
    expect(evaluate("0,1+0,2")).toBe(30);
    expect(evaluate("120+")).toBe(12000);
    expect(evaluate("")).toBeNull();
  });
});

describe("equals", () => {
  it("resolves to the result", () => {
    expect(press("120+35,5", "=")).toEqual({
      expression: "155,50",
      error: null,
    });
    expect(press("10+5", "=")).toEqual({ expression: "15", error: null });
    expect(press("12,", "=")).toEqual({ expression: "12", error: null });
  });

  it("refuses results that are not positive", () => {
    expect(press("50−80", "=")).toEqual({
      expression: "50−80",
      error: "not-positive",
    });
    expect(press("0", "=")).toEqual({ expression: "0", error: "not-positive" });
    expect(press("", "=")).toEqual({ expression: "", error: null });
  });

  it("refuses results above the ceiling", () => {
    expect(resolve("999999999,99+1").error).toBe("too-large");
    expect(resolve("999999999,99").error).toBeNull();
  });
});

describe("back and clear", () => {
  it("removes the last character", () => {
    expect(type(["back"], "120+35")).toBe("120+3");
    expect(type(["back", "back", "back"], "1+2")).toBe("");
    expect(type(["back"], "")).toBe("");
  });

  it("clears everything on a long press", () => {
    expect(type(["clear"], "120+35,5")).toBe("");
  });
});

describe("formatting", () => {
  it("groups thousands on the typed operand", () => {
    expect(formatOperand("1234567,5")).toBe("1.234.567,5");
    expect(formatOperand("123")).toBe("123");
    expect(formatOperand("0,")).toBe("0,");
  });

  it("shows the typed operand, the running result or a placeholder", () => {
    expect(displayValue("")).toBe("0,00");
    expect(displayValue("1234,5")).toBe("1.234,5");
    expect(displayValue("120+35,5")).toBe("155,50");
    expect(displayValue("120+")).toBe("120,00");
    expect(displayValue("50−80")).toBe("−30,00");
  });

  it("writes the expression line only when there is an operation", () => {
    expect(expressionLine("120+35,50")).toBe("120 + 35,50");
    expect(expressionLine("1500−")).toBe("1.500 −");
    expect(expressionLine("64,5")).toBe("");
  });

  it("formats cents with two decimals", () => {
    expect(formatCents(123456789)).toBe("1.234.567,89");
    expect(formatCents(5)).toBe("0,05");
  });

  it("round-trips cents through an expression", () => {
    expect(centsToExpression(3500)).toBe("35");
    expect(centsToExpression(6450)).toBe("64,50");
    expect(centsToExpression(5)).toBe("0,05");
    expect(operandToCents("0,05")).toBe(5);
  });
});

describe("keyboard", () => {
  it("maps physical keys to keypad keys", () => {
    expect(keyFromKeyboard("7")).toBe("7");
    expect(keyFromKeyboard(".")).toBe(",");
    expect(keyFromKeyboard(",")).toBe(",");
    expect(keyFromKeyboard("-")).toBe("−");
    expect(keyFromKeyboard("+")).toBe("+");
    expect(keyFromKeyboard("=")).toBe("=");
    expect(keyFromKeyboard("Backspace")).toBe("back");
    expect(keyFromKeyboard("Delete")).toBe("clear");
    expect(keyFromKeyboard("a")).toBeNull();
    expect(keyFromKeyboard("Enter")).toBeNull();
  });
});

describe("properties", () => {
  const keys = fc.constantFrom<CalcKey>(
    "0",
    "1",
    "5",
    "9",
    "00",
    ",",
    "+",
    "−",
    "=",
    "back",
  );

  it("every reachable expression stays well formed", () => {
    fc.assert(
      fc.property(fc.array(keys, { maxLength: 60 }), (sequence) => {
        const expression = type(sequence);
        expect(expression).toMatch(
          /^(\d{1,9}(,\d{0,2})?([+−]\d{1,9}(,\d{0,2})?)*[+−]?)?$/,
        );
        const operand = currentOperand(expression);
        expect(operand.replace(/,.*/, "").length).toBeLessThanOrEqual(9);
        const value = evaluate(expression);
        if (expression === "") expect(value).toBeNull();
        else expect(Number.isSafeInteger(value)).toBe(true);
      }),
    );
  });

  it("a resolved expression evaluates to the same cents", () => {
    fc.assert(
      fc.property(fc.array(keys, { maxLength: 40 }), (sequence) => {
        const expression = type(sequence);
        const result = resolve(expression);
        if (result.error === null && expression !== "") {
          expect(evaluate(result.expression)).toBe(evaluate(expression));
          expect(evaluate(result.expression)).toBeLessThanOrEqual(
            MAX_AMOUNT_CENTS,
          );
        }
      }),
    );
  });
});
