import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type CategoryRule,
  createCategorySuggester,
  type HistoryEntry,
  learnablePattern,
  ruleLearning,
} from "./suggest";

const used = (
  description: string,
  categoryId: string,
  uses = 1,
  lastUsedOn = "2026-10-01",
  kind: "income" | "expense" = "expense",
): HistoryEntry => ({ description, kind, categoryId, uses, lastUsedOn });

const rule = (
  pattern: string,
  categoryId: string,
  extra: Partial<CategoryRule> = {},
): CategoryRule => ({
  pattern,
  kind: "expense",
  categoryId,
  accountId: null,
  hits: 1,
  ...extra,
});

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

  it("orders rules around the history: exact, history, contained", () => {
    const withRules = createCategorySuggester(
      [used("UBER *TRIP", "transporte", 9), used("UBER EATS", "restaurantes")],
      [
        rule("uber", "lazer"),
        rule("uber trip", "viagem", { accountId: "card" }),
      ],
    );
    // An exact rule for this account beats the history.
    expect(withRules("UBER *TRIP 1", "expense", "card")).toEqual({
      categoryId: "viagem",
      source: "rule",
    });
    // Another account's rule does not count; the history beats a contained rule.
    expect(withRules("UBER *TRIP 1", "expense", "other")).toEqual({
      categoryId: "transporte",
      source: "history",
    });
    expect(withRules("UBER EATS 22", "expense", "other")?.categoryId).toBe(
      "restaurantes",
    );
    // Without history, the contained rule beats a similar description.
    expect(withRules("UBER *BLACK", "expense", "other")).toEqual({
      categoryId: "lazer",
      source: "rule",
    });
    // A rule matches whole words only.
    expect(withRules("SUBERB", "expense", "other")).toBeNull();
  });

  it("lets an exact rule beat a more used history", () => {
    const withRules = createCategorySuggester(
      [used("Padaria", "mercado", 7)],
      [rule("padaria", "restaurantes")],
    );
    expect(withRules("PADARIA 10", "expense", "acc")).toEqual({
      categoryId: "restaurantes",
      source: "rule",
    });
    expect(withRules("PADARIA 10", "income", "acc")).toBeNull();
  });

  it("breaks exact-rule ties by account, then hits", () => {
    const withRules = createCategorySuggester(
      [],
      [
        rule("cafe", "lazer", { hits: 9 }),
        rule("cafe", "mercado", { hits: 1, accountId: "acc" }),
        rule("cafe", "restaurantes", { hits: 5, accountId: "acc" }),
      ],
    );
    expect(withRules("Café", "expense", "acc")?.categoryId).toBe(
      "restaurantes",
    );
    expect(withRules("Café", "expense", "other")?.categoryId).toBe("lazer");
  });

  it("makes a rule learned from a description win for it", () => {
    const description = fc
      .string({ minLength: 1, maxLength: 40 })
      .filter((value) => learnablePattern(value) !== null);
    const history = fc.array(
      fc.record({
        description: fc.string({ maxLength: 30 }),
        kind: fc.constantFrom("income" as const, "expense" as const),
        categoryId: fc.constantFrom("a", "b", "c"),
        uses: fc.integer({ min: 1, max: 50 }),
        lastUsedOn: fc.constant("2026-10-01"),
      }),
      { maxLength: 20 },
    );
    fc.assert(
      fc.property(description, history, (value, past) => {
        const pattern = learnablePattern(value) as string;
        const suggest = createCategorySuggester(past, [
          rule(pattern, "learned"),
        ]);
        expect(suggest(value, "expense", "acc")).toEqual({
          categoryId: "learned",
          source: "rule",
        });
      }),
    );
  });
});

describe("learnablePattern", () => {
  it("keeps the whole description key", () => {
    expect(learnablePattern("Café")).toBe("cafe");
    expect(learnablePattern("Almoço com João")).toBe("almoco com joao");
    expect(learnablePattern("UBER *TRIP 12/10")).toBe("uber trip");
  });

  it("refuses short or generic descriptions", () => {
    for (const value of ["12", "pix", "PAGAMENTO PIX", "ab", "", "   "]) {
      expect(learnablePattern(value)).toBeNull();
    }
  });
});

describe("ruleLearning", () => {
  const base = {
    description: "Feira da semana",
    categoryId: "mercado",
    suggestedCategoryId: "mercado",
  };

  it("confirms the suggestion or replaces it", () => {
    expect(ruleLearning(base)).toEqual({
      pattern: "feira da semana",
      mode: "confirm",
    });
    expect(ruleLearning({ ...base, categoryId: "restaurantes" })).toEqual({
      pattern: "feira da semana",
      mode: "replace",
    });
  });

  it("learns nothing without a suggestion, category or description", () => {
    expect(ruleLearning({ ...base, suggestedCategoryId: null })).toBeNull();
    expect(
      ruleLearning({ ...base, suggestedCategoryId: undefined }),
    ).toBeNull();
    expect(ruleLearning({ ...base, categoryId: null })).toBeNull();
    expect(ruleLearning({ ...base, description: undefined })).toBeNull();
    expect(ruleLearning({ ...base, description: "  " })).toBeNull();
    expect(ruleLearning({ ...base, description: "pix 12" })).toBeNull();
  });
});
