import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { keyboardInset, keypadFits } from "./viewport-inset";

describe("keyboardInset", () => {
  const base = {
    layoutHeight: 800,
    viewportHeight: 800,
    offsetTop: 0,
    scale: 1,
  };

  it("é 0 quando o layout encolhe com o teclado (Android, resizes-content)", () => {
    expect(keyboardInset(base)).toBe(0);
  });

  it("é a altura coberta quando o layout não encolhe (iOS)", () => {
    expect(keyboardInset({ ...base, viewportHeight: 500 })).toBe(300);
  });

  it("desconta a página deslocada pelo iOS (offsetTop)", () => {
    expect(
      keyboardInset({ ...base, viewportHeight: 500, offsetTop: 120 }),
    ).toBe(180);
  });

  it("é 0 com zoom de pinça", () => {
    expect(keyboardInset({ ...base, viewportHeight: 500, scale: 2 })).toBe(0);
  });

  it("ignora diferença menor que 1 px e valor negativo", () => {
    expect(keyboardInset({ ...base, viewportHeight: 799.5 })).toBe(0);
    expect(keyboardInset({ ...base, viewportHeight: 820 })).toBe(0);
  });

  it("arredonda para px inteiro", () => {
    expect(keyboardInset({ ...base, viewportHeight: 499.6 })).toBe(300);
  });

  it("nunca é negativo nem passa da altura do layout", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 300, max: 1400 }),
        fc.double({ min: 0, max: 1600, noNaN: true }),
        fc.double({ min: 0, max: 600, noNaN: true }),
        fc.double({ min: 0.5, max: 4, noNaN: true }),
        (layoutHeight, viewportHeight, offsetTop, scale) => {
          const inset = keyboardInset({
            layoutHeight,
            viewportHeight,
            offsetTop,
            scale,
          });
          expect(inset).toBeGreaterThanOrEqual(0);
          expect(inset).toBeLessThanOrEqual(layoutHeight);
        },
      ),
    );
  });
});

describe("keypadFits", () => {
  const sizes = { header: 64, top: 150, footer: 300, minMiddle: 48 };
  // Exactly enough: 64 + 150 + 300 + 48 = 562.
  const enough = 562;

  it("cabe quando sobra o mínimo para o meio", () => {
    expect(keypadFits({ ...sizes, panel: enough, wasFitting: false })).toBe(
      true,
    );
    expect(keypadFits({ ...sizes, panel: 700, wasFitting: false })).toBe(true);
  });

  it("não cabe quando falta mais de 8 px", () => {
    expect(keypadFits({ ...sizes, panel: enough - 9, wasFitting: true })).toBe(
      false,
    );
  });

  it("mantém a resposta anterior até 8 px abaixo do limite (histerese)", () => {
    for (const panel of [enough - 1, enough - 8]) {
      expect(keypadFits({ ...sizes, panel, wasFitting: true })).toBe(true);
      expect(keypadFits({ ...sizes, panel, wasFitting: false })).toBe(false);
    }
  });

  it("mais altura nunca tira o encaixe", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1500 }),
        fc.integer({ min: 0, max: 600 }),
        fc.boolean(),
        (panel, extra, wasFitting) => {
          const before = keypadFits({ ...sizes, panel, wasFitting });
          const after = keypadFits({
            ...sizes,
            panel: panel + extra,
            wasFitting: before,
          });
          if (before) expect(after).toBe(true);
        },
      ),
    );
  });
});
