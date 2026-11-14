import { describe, expect, it } from "vitest";
import type { EntryTextResult } from "@/server/domain/entry-text";
import { emptyDraft } from "@/stores/quick-add";
import { applyTextResult, filledSummary } from "./text-entry";

const result = (patch: Partial<EntryTextResult> = {}): EntryTextResult => ({
  amountCents: null,
  occurredOn: null,
  accountId: null,
  categoryId: null,
  description: "",
  tags: [],
  unmatchedAccount: null,
  warnings: [],
  tagsChanged: false,
  ...patch,
});

const choices = {
  categoryIds: new Set(["cat-1", "cat-2"]),
  accountIds: new Set(["acc-1"]),
};

describe("applyTextResult", () => {
  it("what was written wins over the draft", () => {
    const draft = {
      ...emptyDraft(),
      expression: "5",
      description: "antigo",
      accountId: "acc-9",
      date: "2026-01-01",
      paid: true,
    };
    const { patch, filled } = applyTextResult(
      draft,
      result({
        amountCents: 1250,
        description: "café",
        accountId: "acc-1",
        occurredOn: "2026-11-13",
      }),
      "expense",
      choices,
    );
    expect(patch).toEqual({
      expression: "12,50",
      description: "café",
      accountId: "acc-1",
      date: "2026-11-13",
      paid: null,
    });
    expect(filled).toMatchObject({
      amount: true,
      description: true,
      account: true,
      date: true,
      category: false,
    });
  });

  it("leaves alone what the text did not say", () => {
    const draft = { ...emptyDraft(), description: "fica", expression: "7" };
    expect(applyTextResult(draft, result(), "expense", choices).patch).toEqual(
      {},
    );
  });

  it("the category only fills an empty choice of the open type", () => {
    const empty = emptyDraft();
    expect(
      applyTextResult(
        empty,
        result({ categoryId: "cat-1" }),
        "expense",
        choices,
      ).patch,
    ).toEqual({ expenseCategoryId: "cat-1" });
    expect(
      applyTextResult(empty, result({ categoryId: "cat-1" }), "income", choices)
        .patch,
    ).toEqual({ incomeCategoryId: "cat-1" });
    const chosen = { ...emptyDraft(), expenseCategoryId: "cat-2" };
    expect(
      applyTextResult(
        chosen,
        result({ categoryId: "cat-1" }),
        "expense",
        choices,
      ).patch,
    ).toEqual({});
    expect(
      applyTextResult(
        empty,
        result({ categoryId: "cat-x" }),
        "expense",
        choices,
      ).patch,
    ).toEqual({});
  });

  it("ignores an account the sheet does not list", () => {
    const { patch } = applyTextResult(
      emptyDraft(),
      result({ accountId: "acc-x" }),
      "expense",
      choices,
    );
    expect(patch.accountId).toBeUndefined();
  });

  it("joins the tags already chosen, without repeating, up to 10", () => {
    const draft = { ...emptyDraft(), tagIds: ["t1", "t2"] };
    const { patch, filled, warnings } = applyTextResult(
      draft,
      result({
        tags: [
          { id: "t2", name: "b" },
          { id: "t3", name: "c" },
        ],
      }),
      "expense",
      choices,
    );
    expect(patch.tagIds).toEqual(["t1", "t2", "t3"]);
    expect(filled.tags).toBe(2);
    expect(warnings).toEqual([]);

    const crowded = {
      ...emptyDraft(),
      tagIds: Array.from({ length: 9 }, (_, i) => `x${i}`),
    };
    const over = applyTextResult(
      crowded,
      result({
        tags: [
          { id: "n1", name: "a" },
          { id: "n2", name: "b" },
        ],
      }),
      "expense",
      choices,
    );
    expect(over.patch.tagIds).toHaveLength(10);
    expect(over.filled.tags).toBe(1);
    expect(over.warnings).toContain(
      "Cabem 10 etiquetas por lançamento; as outras ficaram de fora.",
    );
  });

  it("says which account it used when the text named none that exists", () => {
    const { warnings, patch } = applyTextResult(
      emptyDraft(),
      result({ unmatchedAccount: "shopping" }),
      "expense",
      { ...choices, currentAccountName: "Nubank" },
    );
    expect(patch.accountId).toBeUndefined();
    expect(warnings).toEqual(["Não achei a conta “shopping”. Usei Nubank."]);
  });

  it("keeps the server's warnings", () => {
    const { warnings } = applyTextResult(
      emptyDraft(),
      result({ warnings: ["Não encontrei o valor: digite no teclado."] }),
      "expense",
      choices,
    );
    expect(warnings).toEqual(["Não encontrei o valor: digite no teclado."]);
  });
});

describe("filledSummary", () => {
  const none = {
    amount: false,
    description: false,
    account: false,
    date: false,
    category: false,
    tags: 0,
  };

  it("lists what was filled", () => {
    expect(
      filledSummary({
        amount: true,
        description: true,
        account: true,
        date: true,
        category: true,
        tags: 2,
      }),
    ).toBe(
      "Preenchido: valor, descrição, conta, data, categoria e 2 etiquetas. Confira antes de salvar.",
    );
    expect(filledSummary({ ...none, amount: true, tags: 1 })).toBe(
      "Preenchido: valor e 1 etiqueta. Confira antes de salvar.",
    );
    expect(filledSummary({ ...none, description: true })).toBe(
      "Só a descrição foi preenchida. Digite o valor.",
    );
  });

  it("says so when nothing was found", () => {
    expect(filledSummary(none)).toBe("Não encontrei nada para preencher.");
  });
});
