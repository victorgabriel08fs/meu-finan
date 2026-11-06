import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The columns of the months not selected (doc 02 §9.4) must stay readable on
// the card in both themes: 3:1 for graphics (WCAG 1.4.11).
const css = readFileSync("src/app/globals.css", "utf8");

/** The declarations of the block that starts with `selector {`. */
function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(selector);
  return css.slice(start, css.indexOf("\n}", start));
}

function token(scope: string, name: string): string {
  const match = new RegExp(String.raw`--${name}:\s*(#[0-9a-fA-F]{6})`).exec(
    block(scope),
  );
  if (!match?.[1]) throw new Error(`${scope} --${name}`);
  return match[1];
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((index) => {
    const value = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe("rest colors of the chart columns", () => {
  for (const [theme, scope] of [
    ["light", ":root"],
    ["dark", '[data-theme="dark"]'],
  ] as const) {
    for (const name of ["chart-3-rest", "chart-2-rest"]) {
      it(`${name} has at least 3:1 against --surface in the ${theme} theme`, () => {
        expect(
          contrast(token(scope, name), token(scope, "surface")),
        ).toBeGreaterThanOrEqual(3);
      });
    }
  }
});
