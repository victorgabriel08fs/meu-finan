import { describe, expect, it } from "vitest";
import { formatBRL } from "@/lib/format/money";
import {
  countTo,
  curvePath,
  DEMO,
  threadLength,
  threadState,
  typedAmount,
  typedKey,
  typedStep,
  WORDMARK_CLOSING_SCALE,
  WORDMARK_HERO_SCALE,
  weightDocked,
  weightScale,
} from "./model";
import { HOME_STAGGER_MAX, HOME_STAGGER_MS, revealDelay } from "./motion";

const NBSP = " ";

describe("typedAmount", () => {
  it("types R$ 64,50 in three steps", () => {
    expect(typedAmount(0)).toBe(`R$${NBSP}0,00`);
    expect(typedAmount(0.25)).toBe(`R$${NBSP}6`);
    expect(typedAmount(0.5)).toBe(`R$${NBSP}64`);
    expect(typedAmount(0.75)).toBe(formatBRL(DEMO.entry));
    expect(typedAmount(1)).toBe(`R$${NBSP}64,50`);
  });

  it("clamps the progress and never goes back", () => {
    expect(typedAmount(-1)).toBe(typedAmount(0));
    expect(typedAmount(7)).toBe(typedAmount(1));
    expect(typedAmount(Number.NaN)).toBe(typedAmount(0));
    let last = 0;
    for (let i = 0; i <= 100; i++) {
      const step = typedStep(i / 100);
      expect(step).toBeGreaterThanOrEqual(last);
      last = step;
    }
    expect(last).toBe(3);
  });

  it("names the key just pressed", () => {
    expect(typedKey(0)).toBeNull();
    expect(typedKey(0.3)).toBe("6");
    expect(typedKey(0.6)).toBe("4");
    expect(typedKey(1)).toBe("0");
  });

  it("survives the quantization the keypad card stores", () => {
    for (const step of [0, 1, 2, 3] as const) {
      expect(typedStep(step / 4)).toBe(step);
    }
  });
});

describe("countTo", () => {
  it("starts at zero and ends exactly on the target", () => {
    expect(countTo(DEMO.heroBalance, 0)).toBe(0);
    expect(countTo(DEMO.heroBalance, 1)).toBe(DEMO.heroBalance);
    expect(countTo(DEMO.heroBalance, 3)).toBe(DEMO.heroBalance);
    expect(countTo(DEMO.heroBalance, -1)).toBe(0);
  });

  it("is whole cents, monotonic and never past the target", () => {
    let last = 0;
    for (let i = 0; i <= 200; i++) {
      const value = countTo(DEMO.heroBalance, i / 200);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(last);
      expect(value).toBeLessThanOrEqual(DEMO.heroBalance);
      last = value;
    }
  });
});

describe("thread", () => {
  it("is as long as the scroll progress, clamped", () => {
    expect(threadLength(-0.2)).toBe(0);
    expect(threadLength(0.37)).toBe(0.37);
    expect(threadLength(1.4)).toBe(1);
  });

  it("settles the weight over the last 15% of the scroll", () => {
    expect(weightDocked(0)).toBe(0);
    expect(weightDocked(0.85)).toBe(0);
    expect(weightDocked(0.925)).toBeCloseTo(0.5);
    expect(weightDocked(1)).toBe(1);
  });

  it("hands the weight over at each wordmark's own size", () => {
    expect(weightScale(0)).toBe(WORDMARK_HERO_SCALE);
    expect(weightScale(0.5)).toBe(WORDMARK_HERO_SCALE);
    expect(weightScale(1)).toBe(WORDMARK_CLOSING_SCALE);
  });

  it("says where the tip is", () => {
    expect(threadState(0)).toBe("top");
    expect(threadState(0.001)).toBe("run");
    expect(threadState(0.999)).toBe("run");
    expect(threadState(1)).toBe("docked");
  });
});

describe("curvePath", () => {
  it("draws from the bottom left to the top right", () => {
    expect(curvePath([0, 50, 100], 200, 80)).toBe(
      "M0.0 80.0L100.0 40.0L200.0 0.0",
    );
  });

  it("shares a scale between series and refuses a single point", () => {
    expect(curvePath([0, 50], 100, 80, 100)).toBe("M0.0 80.0L100.0 40.0");
    expect(curvePath([10], 100, 80)).toBe("");
  });
});

describe("DEMO", () => {
  it("holds integer cents that agree with the shares shown", () => {
    expect(DEMO.budget.spent / DEMO.budget.limit).toBe(DEMO.budgetShare);
    expect(DEMO.goal.saved / DEMO.goal.target).toBe(DEMO.goalShare);
    expect(DEMO.upcoming).toHaveLength(3);
    for (const value of [...DEMO.curve, ...DEMO.deposits]) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});

describe("revealDelay", () => {
  it("staggers by 100ms and stops at the 4th element", () => {
    expect(revealDelay(0)).toBe(0);
    expect(revealDelay(1)).toBe(HOME_STAGGER_MS / 1000);
    expect(revealDelay(9)).toBe(
      ((HOME_STAGGER_MAX - 1) * HOME_STAGGER_MS) / 1000,
    );
  });
});
