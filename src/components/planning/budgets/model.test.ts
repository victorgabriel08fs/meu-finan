import { describe, expect, it } from "vitest";
import { NBSP } from "@/lib/format/money";
import {
  budgetRowNote,
  budgetValueText,
  copiedMessage,
  roundUpToTenReais,
  spentPercent,
  suggestBudgets,
  summaryCaption,
} from "./model";

const brl = (text: string) => text.replaceAll("R$ ", `R$${NBSP}`);

const line = (
  overrides: Partial<Parameters<typeof budgetRowNote>[0]> = {},
): Parameters<typeof budgetRowNote>[0] => ({
  budgetCents: 90_000,
  spentCents: 64_000,
  scheduledCents: 0,
  availableCents: 26_000,
  status: "ahead",
  ...overrides,
});

describe("budget rows", () => {
  it("says what is left", () => {
    expect(budgetRowNote(line())).toEqual({
      text: brl("Restam R$ 260"),
      tone: "neutral",
    });
  });

  it("says how far over it went", () => {
    expect(
      budgetRowNote(
        line({
          budgetCents: 40_000,
          spentCents: 41_000,
          availableCents: -1_000,
          status: "over",
        }),
      ),
    ).toEqual({ text: brl("R$ 10 acima"), tone: "danger" });
  });

  it("shows what is scheduled when nothing was spent", () => {
    expect(
      budgetRowNote(
        line({
          budgetCents: 210_000,
          spentCents: 0,
          scheduledCents: 210_000,
          availableCents: 0,
          status: "scheduled",
        }),
      ).text,
    ).toBe(brl("R$ 2.100 agendado"));
  });

  it("warns when the scheduled entries take it over", () => {
    expect(
      budgetRowNote(
        line({
          spentCents: 50_000,
          scheduledCents: 50_000,
          availableCents: -10_000,
          status: "on_track",
        }),
      ),
    ).toEqual({ text: brl("R$ 100 acima com agendados"), tone: "danger" });
  });

  it("speaks the meter value", () => {
    expect(budgetValueText(line())).toBe(
      brl("R$ 640 de R$ 900, 71%, acima do ritmo"),
    );
    expect(
      budgetValueText(line({ scheduledCents: 5_050, status: "on_track" })),
    ).toBe(brl("R$ 640 de R$ 900, 71%, R$ 50,50 agendados, no ritmo"));
    expect(spentPercent({ budgetCents: 0, spentCents: 10 })).toBe(0);
  });
});

describe("suggestions", () => {
  it("rounds averages up to R$ 10", () => {
    expect(roundUpToTenReais(86_712)).toBe(87_000);
    expect(roundUpToTenReais(87_000)).toBe(87_000);
    expect(roundUpToTenReais(1)).toBe(1_000);
    expect(roundUpToTenReais(0)).toBe(0);
  });

  it("skips budgeted and unused categories and sorts by amount", () => {
    const source = (categoryId: string, averageCents: number) => ({
      categoryId,
      name: categoryId,
      icon: "circle",
      color: "neutral",
      averageCents,
    });
    const result = suggestBudgets(
      [
        source("a", 10_000),
        source("b", 0),
        source("c", 55_500),
        source("d", 90_000),
      ],
      new Set(["d"]),
    );
    expect(result.map((item) => [item.categoryId, item.amountCents])).toEqual([
      ["c", 56_000],
      ["a", 10_000],
    ]);
  });
});

describe("captions", () => {
  it("describes the period", () => {
    const base = {
      budgetCents: 450_000,
      categories: 6,
      elapsedDays: 14,
      totalDays: 31,
    };
    expect(summaryCaption({ ...base, timing: "current" })).toBe(
      brl("Orçado R$ 4.500 em 6 categorias · hoje é o dia 14 de 31"),
    );
    expect(summaryCaption({ ...base, categories: 1, timing: "past" })).toBe(
      brl("Orçado R$ 4.500 em 1 categoria · mês encerrado"),
    );
    expect(summaryCaption({ ...base, timing: "future" })).toContain(
      "ainda não começou",
    );
  });

  it("counts copied budgets", () => {
    expect(copiedMessage(0, "setembro")).toBe(
      "Nada novo para copiar de setembro.",
    );
    expect(copiedMessage(1, "setembro")).toBe(
      "1 orçamento copiado de setembro.",
    );
    expect(copiedMessage(3, "setembro")).toBe(
      "3 orçamentos copiados de setembro.",
    );
  });
});
