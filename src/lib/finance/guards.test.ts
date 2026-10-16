import { describe, expect, it } from "vitest";
import {
  assertAtLeast,
  assertFinite,
  assertInteger,
  assertOneOf,
  assertRate,
  show,
} from "./guards";

describe("guards", () => {
  it("show() renders any received value without throwing", () => {
    expect(show(1.5)).toBe("1.5");
    expect(show(undefined)).toBe("undefined");
    expect(show(null)).toBe("null");
    expect(show({ year: 2026 })).toBe('{"year":2026}');
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(show(circular)).toBe("[object Object]");
    expect(show({ cents: 10n })).toBe("[object Object]");
    expect(show([1, 2])).toBe("[1,2]");
  });

  it("assertFinite", () => {
    expect(() => assertFinite(0, "x")).not.toThrow();
    expect(() => assertFinite(Number.NaN, "x")).toThrow(
      "x must be a finite number (received NaN)",
    );
  });

  it("assertAtLeast", () => {
    expect(() => assertAtLeast(0, 0, "x")).not.toThrow();
    expect(() => assertAtLeast(-0.1, 0, "x")).toThrow(
      "x must be a finite number >= 0 (received -0.1)",
    );
    expect(() => assertAtLeast(Infinity, 0, "x")).toThrow(RangeError);
  });

  it("assertInteger", () => {
    expect(() => assertInteger(3, "n", 1, 3)).not.toThrow();
    expect(() => assertInteger(4, "n", 1, 3)).toThrow(
      "n must be an integer from 1 to 3 (received 4)",
    );
    expect(() => assertInteger(0, "n", 1, 3)).toThrow(RangeError);
    expect(() => assertInteger(1.5, "n")).toThrow(RangeError);
    expect(() => assertInteger(2 ** 53, "n")).toThrow(RangeError);
  });

  it("assertRate keeps rates above −100%", () => {
    expect(() => assertRate(-0.99, "r")).not.toThrow();
    expect(() => assertRate(-1, "r")).toThrow(
      "r must be a finite rate greater than -1 (received -1)",
    );
    expect(() => assertRate(Number.NaN, "r")).toThrow(RangeError);
  });

  it("assertOneOf", () => {
    expect(() => assertOneOf("a", ["a", "b"], "k")).not.toThrow();
    expect(() => assertOneOf("c" as "a", ["a", "b"], "k")).toThrow(
      "k must be one of a, b (received c)",
    );
  });
});
