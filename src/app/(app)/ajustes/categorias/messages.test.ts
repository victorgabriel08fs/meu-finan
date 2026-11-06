import { describe, expect, it } from "vitest";
import {
  archiveDescription,
  archivedMessage,
  createdMessage,
  restoredMessage,
} from "./messages";

const result = (patch: Partial<Parameters<typeof archivedMessage>[0]>) => ({
  name: "Mercado",
  children: 0,
  restoredParent: null,
  ...patch,
});

describe("category toasts", () => {
  it("archive: alone, with one and with several subcategories", () => {
    expect(archivedMessage(result({}))).toBe("Categoria Mercado arquivada.");
    expect(archivedMessage(result({ children: 1 }))).toBe(
      "Categoria Mercado arquivada, com 1 subcategoria.",
    );
    expect(archivedMessage(result({ children: 2 }))).toBe(
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
