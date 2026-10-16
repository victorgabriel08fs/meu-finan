import { describe, expect, it } from "vitest";
import { createCategorySuggester, type HistoryEntry } from "./suggest";

const used = (
  description: string,
  categoryId: string,
  uses = 1,
  lastUsedOn = "2026-10-01",
  kind: "income" | "expense" = "expense",
): HistoryEntry => ({ description, kind, categoryId, uses, lastUsedOn });

describe("createCategorySuggester", () => {
  const suggest = createCategorySuggester(
    [
      used("UBER *TRIP 1234", "transporte", 5),
      used("Uber *Trip 9876", "lazer", 1),
      used("SUPERMERCADO EXTRA", "mercado", 2),
      used("NETFLIX.COM", "assinaturas", 3),
      used("PIX ENVIADO Joao da Silva", "moradia", 4),
      used("SALARIO EMPRESA X", "salario", 6, "2026-10-05", "income"),
      used("Padaria", "mercado", 2, "2026-09-01"),
      used("Padaria", "restaurantes", 2, "2026-10-10"),
    ],
    [],
  );

  it("uses the category most used with the same description", () => {
    expect(suggest("UBER *TRIP 5555 SAO PAULO", "expense", "acc")).toEqual({
      categoryId: "transporte",
      source: "history",
    });
    expect(suggest("Netflix.com", "expense", "acc")?.categoryId).toBe(
      "assinaturas",
    );
  });

  it("breaks a tie by the most recent use", () => {
    expect(suggest("PADARIA", "expense", "acc")?.categoryId).toBe(
      "restaurantes",
    );
  });

  it("keeps income and expenses apart", () => {
    expect(suggest("SALARIO EMPRESA X", "income", "acc")?.categoryId).toBe(
      "salario",
    );
    expect(suggest("SALARIO EMPRESA X", "expense", "acc")).toBeNull();
  });

  it("falls back to a similar description", () => {
    expect(suggest("SUPERMERCADO EXTRA LOJA 12", "expense", "acc")).toEqual({
      categoryId: "mercado",
      source: "similar",
    });
    expect(
      suggest("PIX ENVIADO JOAO DA SILVA SANTOS", "expense", "acc")?.categoryId,
    ).toBe("moradia");
  });

  it("does not guess from a weak resemblance", () => {
    expect(suggest("UBER EATS", "expense", "acc")).toBeNull();
    expect(suggest("PIX ENVIADO Maria", "expense", "acc")).toBeNull();
    expect(suggest("1234 5678", "expense", "acc")).toBeNull();
    expect(suggest("Loja nova", "expense", "acc")).toBeNull();
  });

  it("puts explicit rules first: longest pattern, then this account", () => {
    const withRules = createCategorySuggester(
      [used("UBER *TRIP", "transporte", 9)],
      [
        {
          pattern: "uber",
          kind: "expense",
          categoryId: "lazer",
          accountId: null,
          hits: 1,
        },
        {
          pattern: "uber trip",
          kind: "expense",
          categoryId: "viagem",
          accountId: "card",
          hits: 1,
        },
      ],
    );
    expect(withRules("UBER *TRIP 1", "expense", "card")).toEqual({
      categoryId: "viagem",
      source: "rule",
    });
    expect(withRules("UBER *TRIP 1", "expense", "other")?.categoryId).toBe(
      "lazer",
    );
    // A rule matches whole words only.
    expect(withRules("SUBERB", "expense", "other")).toBeNull();
  });
});
