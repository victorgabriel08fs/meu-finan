import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { countUpAt, easeOutCubic } from "./count-up";

const cents = fc.integer({ min: 0, max: 10_000_000_000 });
const ms = fc.integer({ min: 100, max: 5_000 });

describe("easeOutCubic", () => {
  it("vai de 0 a 1 sem recuar", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (a, b) => {
          const [low, high] = a <= b ? [a, b] : [b, a];
          return easeOutCubic(low) <= easeOutCubic(high);
        },
      ),
    );
  });
});

describe("countUpAt", () => {
  it("fica no valor inicial durante o atraso", () => {
    fc.assert(
      fc.property(cents, cents, ms, ms, (from, to, delay, duration) => {
        const elapsed = delay - 1;
        return (
          countUpAt(from, to, elapsed, {
            durationMs: duration,
            delayMs: delay,
          }) === from
        );
      }),
    );
  });

  it("termina exatamente no valor final, sem arredondar a mais", () => {
    fc.assert(
      fc.property(
        cents,
        cents,
        ms,
        ms,
        fc.integer({ min: 0, max: 10_000 }),
        (from, to, delay, duration, extra) =>
          countUpAt(from, to, delay + duration + extra, {
            durationMs: duration,
            delayMs: delay,
          }) === to,
      ),
    );
  });

  it("fica entre o início e o fim e só anda para o lado do destino", () => {
    fc.assert(
      fc.property(
        cents,
        cents,
        ms,
        fc.integer({ min: 0, max: 5_000 }),
        fc.integer({ min: 0, max: 5_000 }),
        (from, to, duration, a, b) => {
          const [t1, t2] = a <= b ? [a, b] : [b, a];
          const one = countUpAt(from, to, t1, { durationMs: duration });
          const two = countUpAt(from, to, t2, { durationMs: duration });
          const low = Math.min(from, to);
          const high = Math.max(from, to);
          const inside = (n: number) => n >= low && n <= high;
          const forward = to >= from ? one <= two : one >= two;
          return inside(one) && inside(two) && forward;
        },
      ),
    );
  });

  it("devolve sempre um inteiro", () => {
    fc.assert(
      fc.property(
        cents,
        cents,
        ms,
        fc.integer({ min: 0, max: 5_000 }),
        (from, to, duration, t) =>
          Number.isInteger(countUpAt(from, to, t, { durationMs: duration })),
      ),
    );
  });

  it("usa a curva dada e conta de 0 por padrão com atraso zero", () => {
    expect(countUpAt(0, 1000, 500, { durationMs: 1000, ease: (p) => p })).toBe(
      500,
    );
    expect(countUpAt(0, 1000, 0, { durationMs: 1000 })).toBe(0);
  });
});
