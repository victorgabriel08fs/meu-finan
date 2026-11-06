import { describe, expect, it } from "vitest";
import { foldText, matchesSearch } from "./search";

describe("foldText", () => {
  it.each([
    ["Saúde", "saude"],
    ["AÇAÍ", "acai"],
    ["Educação", "educacao"],
    ["Pão de Açúcar", "pao de acucar"],
    ["Ônibus", "onibus"],
    ["Mercado › Feira", "mercado › feira"],
  ])("%j → %j", (text, expected) => {
    expect(foldText(text)).toBe(expected);
  });
});

describe("matchesSearch", () => {
  it("ignores accents, ç and case on both sides", () => {
    expect(matchesSearch("Saúde", "saude")).toBe(true);
    expect(matchesSearch("Saude", "SAÚDE")).toBe(true);
    expect(matchesSearch("Educação", "educac")).toBe(true);
    expect(matchesSearch("Açougue", "acou")).toBe(true);
  });

  it("finds a parent and its subcategories by the whole label", () => {
    expect(matchesSearch("Mercado › Feira", "mercado")).toBe(true);
    expect(matchesSearch("Mercado › Feira", "feira")).toBe(true);
    expect(matchesSearch("Mercado › Feira", "transporte")).toBe(false);
  });

  it("trims the query, and a blank one matches everything", () => {
    expect(matchesSearch("Lazer", "  laz ")).toBe(true);
    expect(matchesSearch("Lazer", "")).toBe(true);
    expect(matchesSearch("Lazer", "   ")).toBe(true);
  });

  it("keeps the order of the words", () => {
    expect(matchesSearch("Conta corrente", "corrente conta")).toBe(false);
  });
});
