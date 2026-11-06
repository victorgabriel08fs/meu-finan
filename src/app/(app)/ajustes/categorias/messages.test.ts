import { describe, expect, it } from "vitest";
import {
  archiveAndMoveLabel,
  archiveDescription,
  archivedMessage,
  archiveMoveSummary,
  archiveQuestion,
  budgetMergeNote,
  createdMessage,
  entriesCount,
  mergeDescription,
  mergedMessage,
  mergeSummary,
  noMergeTarget,
  orderPosition,
  orderSavedMessage,
  orderTitle,
  restoredMessage,
} from "./messages";

const result = (patch: Partial<Parameters<typeof archivedMessage>[0]>) => ({
  name: "Mercado",
  children: 0,
  restoredParent: null,
  moved: null,
  ...patch,
});

describe("category toasts", () => {
  it("archive: alone, with one and with several subcategories", () => {
    expect(archivedMessage(result({}), "expense")).toBe(
      "Categoria Mercado arquivada.",
    );
    expect(archivedMessage(result({ children: 1 }), "expense")).toBe(
      "Categoria Mercado arquivada, com 1 subcategoria.",
    );
    expect(archivedMessage(result({ children: 2 }), "expense")).toBe(
      "Categoria Mercado arquivada, com 2 subcategorias.",
    );
  });

  it("restore: with subcategories, or a subcategory with its parent", () => {
    expect(restoredMessage(result({}))).toBe("Categoria Mercado restaurada.");
    expect(restoredMessage(result({ children: 2 }))).toBe(
      "Categoria Mercado restaurada, com 2 subcategorias.",
    );
    expect(
      restoredMessage(result({ name: "Feira", restoredParent: "Mercado" })),
    ).toBe("Categorias Feira e Mercado restauradas.");
  });

  it("create: a category or a subcategory", () => {
    expect(createdMessage("Academia", null)).toBe("Categoria Academia criada.");
    expect(createdMessage("Feira", "Mercado")).toBe(
      "Subcategoria Feira criada em Mercado.",
    );
  });
});

describe("archiveDescription", () => {
  it("changes with moving the entries", () => {
    expect(archiveDescription([], true)).not.toContain("continuam com");
    expect(archiveDescription(["Feira"], true)).toContain(
      "os lançamentos delas passam",
    );
  });

  it("names what goes along", () => {
    expect(archiveDescription([])).toBe(
      "Ela sai das listas de escolha e dos orçamentos. Os lançamentos antigos continuam com ela, e dá para restaurar quando quiser.",
    );
    expect(archiveDescription(["Feira"])).toBe(
      "Ela e a subcategoria Feira saem das listas de escolha e dos orçamentos. Os lançamentos antigos continuam com elas, e dá para restaurar quando quiser.",
    );
    expect(archiveDescription(["Feira", "Padaria"])).toBe(
      "Ela e as 2 subcategorias saem das listas de escolha e dos orçamentos. Os lançamentos antigos continuam com elas, e dá para restaurar quando quiser.",
    );
  });
});

describe("archive with the entries passed on", () => {
  it("toast: the count and the destination, singular and plural", () => {
    expect(
      archivedMessage(
        result({ children: 2, moved: { entries: 32, to: "Restaurantes" } }),
        "expense",
      ),
    ).toBe(
      "Categoria Mercado arquivada, com 2 subcategorias. 32 despesas foram para Restaurantes.",
    );
    expect(
      archivedMessage(
        result({ moved: { entries: 1, to: "Mercado › Feira" } }),
        "income",
      ),
    ).toBe("Categoria Mercado arquivada. 1 receita foi para Mercado › Feira.");
    expect(
      archivedMessage(result({ moved: { entries: 0, to: "X" } }), "expense"),
    ).toBe("Categoria Mercado arquivada.");
  });

  it("question, button and summary follow the type and the count", () => {
    expect(entriesCount("expense", 1)).toBe("1 despesa");
    expect(entriesCount("income", 3)).toBe("3 receitas");
    expect(archiveQuestion("expense", false)).toBe(
      "Quer passar as despesas desta categoria para outra?",
    );
    expect(archiveQuestion("income", true)).toBe(
      "Quer passar as receitas dela e das subcategorias para outra?",
    );
    expect(archiveAndMoveLabel("income")).toBe("Arquivar e passar receitas");
    expect(
      archiveMoveSummary({
        kind: "expense",
        entries: 32,
        to: "Restaurantes",
        name: "Mercado",
      }),
    ).toBe(
      "32 despesas, inclusive as agendadas, vão para Restaurantes. Não dá para desfazer: se restaurar Mercado, ela volta vazia.",
    );
    expect(
      archiveMoveSummary({
        kind: "expense",
        entries: 1,
        to: "Restaurantes",
        name: "Mercado",
      }),
    ).toBe(
      "1 despesa vai para Restaurantes. Não dá para desfazer: se restaurar Mercado, ela volta vazia.",
    );
    expect(budgetMergeNote("Mercado", "Casa")).toBe(
      "O orçamento de Mercado se soma ao de Casa.",
    );
  });
});

describe("merge and order copy", () => {
  it("merge: description, summary, toast and empty select", () => {
    expect(mergeDescription("Supermercado", [])).toBe(
      "Os lançamentos, as recorrências e o orçamento de Supermercado passam para a categoria escolhida, e Supermercado fica arquivada, vazia.",
    );
    expect(mergeDescription("Mercado", ["Feira"])).toContain(
      "A subcategoria Feira passa para dentro dela.",
    );
    expect(mergeDescription("Mercado", ["Feira", "Padaria"])).toContain(
      "As 2 subcategorias passam para dentro dela.",
    );
    expect(mergeSummary("expense", 32, "Mercado")).toBe(
      "32 despesas vão para Mercado. Não dá para desfazer.",
    );
    expect(mergeSummary("expense", 1, "Mercado")).toBe(
      "1 despesa vai para Mercado. Não dá para desfazer.",
    );
    expect(mergeSummary("expense", 0, "Mercado", "Feira")).toBe(
      "Não há despesas para passar. Feira fica arquivada.",
    );
    expect(mergeSummary("income", 0, "Salário", "Bônus")).toBe(
      "Não há receitas para passar. Bônus fica arquivada.",
    );
    expect(mergedMessage("Supermercado", "Mercado")).toBe(
      "Categoria Supermercado mesclada com Mercado.",
    );
    expect(noMergeTarget("expense")).toBe(
      "Não há outra categoria de despesa para mesclar.",
    );
  });

  it("order: titles, toast and the spoken position", () => {
    expect(orderTitle("income")).toBe("Ordem das receitas");
    expect(orderSavedMessage("expense")).toBe("Ordem das despesas salva.");
    expect(orderPosition("Mercado", 2, 16, null)).toBe(
      "Mercado na posição 2 de 16.",
    );
    expect(orderPosition("Feira", 1, 2, "Mercado")).toBe(
      "Feira na posição 1 de 2 em Mercado.",
    );
  });
});
