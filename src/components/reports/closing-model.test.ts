import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  budgetSuggestion,
  budgetsSummary,
  closingHeadline,
  firstClosingCopy,
  leftoverToSave,
} from "./closing-model";

describe("closingHeadline", () => {
  it("says plainly how the month went, with no blame", () => {
    expect(closingHeadline(1, "outubro")).toBe("Você fechou outubro no azul.");
    expect(closingHeadline(-1, "outubro")).toBe(
      "As despesas passaram das receitas.",
    );
    expect(closingHeadline(0, "outubro")).toBe(
      "Receitas e despesas empataram.",
    );
  });
});

describe("leftoverToSave", () => {
  it("takes what already went to the caixinhas off the leftover", () => {
    expect(leftoverToSave(182_960, 0)).toBe(182_960);
    expect(leftoverToSave(182_960, 50_000)).toBe(132_960);
    expect(leftoverToSave(50_000, 50_000)).toBe(0);
    expect(leftoverToSave(50_000, 80_000)).toBe(0);
  });

  it("is never negative and a withdrawal does not raise it", () => {
    expect(leftoverToSave(100_000, -30_000)).toBe(100_000);
    fc.assert(
      fc.property(
        fc.integer({ min: -10_000_000, max: 10_000_000 }),
        fc.integer({ min: -10_000_000, max: 10_000_000 }),
        (left, saved) => {
          const value = leftoverToSave(left, saved);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(Math.max(0, left));
        },
      ),
    );
  });
});

describe("budgetsSummary", () => {
  it("counts kept and over budgets in the singular and plural", () => {
    expect(budgetsSummary(3, 0)).toBe("Todos os 3 orçamentos cumpridos.");
    expect(budgetsSummary(1, 0)).toBe("1 orçamento cumprido.");
    expect(budgetsSummary(2, 1)).toBe("2 cumpridos e 1 estourado.");
    expect(budgetsSummary(1, 2)).toBe("1 cumprido e 2 estourados.");
    expect(budgetsSummary(0, 1)).toBe("1 estourado.");
    expect(budgetsSummary(0, 2)).toBe("2 estourados.");
  });
});

describe("budgetSuggestion", () => {
  it("offers nothing without an average", () => {
    expect(
      budgetSuggestion({ averageCents: null, nextBudgetCents: null }),
    ).toEqual({ kind: "none" });
    expect(
      budgetSuggestion({ averageCents: 0, nextBudgetCents: 5_000 }),
    ).toEqual({ kind: "none" });
  });

  it("creates, raises or says it is covered, rounding the average up to R$ 10", () => {
    expect(
      budgetSuggestion({ averageCents: 79_000, nextBudgetCents: null }),
    ).toEqual({ kind: "create", suggestedCents: 79_000 });
    expect(
      budgetSuggestion({ averageCents: 79_050, nextBudgetCents: null }),
    ).toEqual({ kind: "create", suggestedCents: 80_000 });
    expect(
      budgetSuggestion({ averageCents: 79_050, nextBudgetCents: 60_000 }),
    ).toEqual({ kind: "raise", suggestedCents: 80_000 });
    expect(
      budgetSuggestion({ averageCents: 79_050, nextBudgetCents: 80_000 }),
    ).toEqual({ kind: "covered", suggestedCents: 80_000 });
    expect(
      budgetSuggestion({ averageCents: 79_050, nextBudgetCents: 90_000 }),
    ).toEqual({ kind: "covered", suggestedCents: 80_000 });
  });

  it("suggests a multiple of R$ 10 that covers the average; raises only below it", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100_000_000 }),
        fc.option(fc.integer({ min: 0, max: 100_000_000 }), { nil: null }),
        (average, next) => {
          const result = budgetSuggestion({
            averageCents: average,
            nextBudgetCents: next,
          });
          if (result.kind === "none") throw new Error("expected a suggestion");
          expect(result.suggestedCents % 1000).toBe(0);
          expect(result.suggestedCents).toBeGreaterThanOrEqual(average);
          expect(result.kind === "raise").toBe(
            next !== null && next < result.suggestedCents,
          );
          expect(result.kind === "create").toBe(next === null);
        },
      ),
    );
  });
});

describe("firstClosingCopy", () => {
  it("names the first day of the next period", () => {
    expect(firstClosingCopy("2026-11-30", "2026-11")).toBe(
      "No dia 1º de dezembro, você vê aqui como foi novembro.",
    );
    expect(firstClosingCopy("2026-11-04", "2026-10")).toBe(
      "No dia 5 de novembro, você vê aqui como foi outubro.",
    );
  });

  it("crosses the year", () => {
    expect(firstClosingCopy("2026-12-31", "2026-12")).toBe(
      "No dia 1º de janeiro, você vê aqui como foi dezembro.",
    );
  });
});
