import { describe, expect, it } from "vitest";
import { defaultAccountFor } from "./entry";
import type { QuickAddAccount } from "./types";

const account = (id: string, type: string): QuickAddAccount => ({
  id,
  name: id,
  type,
  typeLabel: type,
  icon: "wallet",
  color: "cat-1",
  card: null,
});

const checking = account("conta", "checking");
const card = account("cartao", "credit_card");
const box = account("caixinha", "savings_box");
const vr = account("vr", "benefit");

describe("defaultAccountFor", () => {
  it("never starts an expense or income on a caixinha", () => {
    const accounts = [box, card, checking];
    expect(defaultAccountFor("expense", accounts, "caixinha")).toBe("conta");
    expect(defaultAccountFor("income", accounts, "caixinha")).toBe("conta");
    expect(defaultAccountFor("expense", accounts, null)).toBe("conta");
  });

  it("keeps the last account when it is not a caixinha, a card included", () => {
    expect(defaultAccountFor("expense", [checking, card], "cartao")).toBe(
      "cartao",
    );
  });

  it("starts a transfer on a spendable account, not a card or a caixinha", () => {
    const accounts = [box, card, checking];
    expect(defaultAccountFor("transfer", accounts, "caixinha")).toBe("conta");
    expect(defaultAccountFor("transfer", accounts, "cartao")).toBe("conta");
    expect(defaultAccountFor("transfer", accounts, "conta")).toBe("conta");
  });

  it("never starts on a benefício, even the last one used", () => {
    const accounts = [vr, box, card, checking];
    expect(defaultAccountFor("expense", accounts, "vr")).toBe("conta");
    expect(defaultAccountFor("income", accounts, "vr")).toBe("conta");
    expect(defaultAccountFor("transfer", accounts, "vr")).toBe("conta");
    expect(defaultAccountFor("expense", accounts, null)).toBe("conta");
  });

  it("falls back to the first account when none is spendable", () => {
    expect(defaultAccountFor("expense", [box, card], null)).toBe("caixinha");
    expect(defaultAccountFor("transfer", [card, box], null)).toBe("cartao");
    expect(defaultAccountFor("expense", [], null)).toBeNull();
  });
});
