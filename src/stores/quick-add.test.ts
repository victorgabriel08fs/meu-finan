import { beforeEach, describe, expect, it } from "vitest";
import { emptyDraft, useQuickAddStore } from "./quick-add";

beforeEach(() => {
  useQuickAddStore.setState({
    open: false,
    draft: emptyDraft(),
    openedAt: null,
    closedAt: null,
    restored: false,
  });
});

describe("openQuickAdd", () => {
  it("opens as a transfer with the accounts of a preset (Guardar)", () => {
    useQuickAddStore.getState().openQuickAdd("transfer", {
      accountId: "conta",
      toAccountId: "caixinha",
    });
    const state = useQuickAddStore.getState();
    expect(state.open).toBe(true);
    expect(state.draft).toMatchObject({
      kind: "transfer",
      accountId: "conta",
      toAccountId: "caixinha",
    });
  });

  it("applies the preset over a sheet that is already open", () => {
    const store = useQuickAddStore.getState();
    store.openQuickAdd("expense");
    store.openQuickAdd("transfer", {
      accountId: "caixinha",
      toAccountId: "conta",
    });
    expect(useQuickAddStore.getState().draft).toMatchObject({
      kind: "transfer",
      accountId: "caixinha",
      toAccountId: "conta",
    });
  });

  it("opens as before without a preset", () => {
    useQuickAddStore.getState().openQuickAdd("income");
    expect(useQuickAddStore.getState().draft).toMatchObject({
      kind: "income",
      accountId: null,
      toAccountId: null,
    });
  });
});

describe("tags in the draft", () => {
  it("starts empty", () => {
    expect(emptyDraft().tagIds).toEqual([]);
    expect(emptyDraft("income").tagIds).toEqual([]);
  });

  it("resetDraft keeps them only when asked to", () => {
    const store = useQuickAddStore.getState();
    store.updateDraft({ tagIds: ["t1", "t2"], expression: "10" });
    store.resetDraft({ tagIds: ["t1", "t2"] });
    expect(useQuickAddStore.getState().draft.tagIds).toEqual(["t1", "t2"]);
    expect(useQuickAddStore.getState().draft.expression).toBe("");
    store.resetDraft();
    expect(useQuickAddStore.getState().draft.tagIds).toEqual([]);
  });
});
