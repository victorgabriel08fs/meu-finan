import { describe, expect, it } from "vitest";
import {
  archivedMessage,
  createdMessage,
  entriesLabel,
  restoredMessage,
} from "./messages";

describe("entriesLabel", () => {
  it("counts entries in pt-BR", () => {
    expect(entriesLabel(0)).toBe("Nenhum lançamento");
    expect(entriesLabel(1)).toBe("1 lançamento");
    expect(entriesLabel(12)).toBe("12 lançamentos");
  });
});

describe("toasts", () => {
  it("names the tag", () => {
    expect(createdMessage({ name: "viagem", restored: false })).toBe(
      "Etiqueta viagem criada.",
    );
    expect(createdMessage({ name: "viagem", restored: true })).toBe(
      "Etiqueta viagem restaurada.",
    );
    expect(archivedMessage("viagem")).toBe("Etiqueta viagem arquivada.");
    expect(restoredMessage("viagem")).toBe("Etiqueta viagem restaurada.");
  });
});
