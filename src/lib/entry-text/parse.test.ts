import { describe, expect, it } from "vitest";
import { parseEntryText } from "./parse";

// Saturday, 14 Nov 2026.
const today = { year: 2026, month: 11, day: 14 };
const accounts = [
  { id: "nubank", name: "Nubank" },
  { id: "cartao-nubank", name: "Cartão Nubank" },
  { id: "itau", name: "Itaú Conta" },
  { id: "c6", name: "C6 Bank" },
  { id: "dinheiro", name: "Dinheiro" },
  { id: "vale", name: "Vale Refeição" },
];

const parse = (text: string, list = accounts, on = today) =>
  parseEntryText(text, { today: on, accounts: list });

describe("parseEntryText", () => {
  it("understands a whole phrase", () => {
    expect(parse("café 12 no nubank ontem #viagem")).toEqual({
      amountCents: 1200,
      occurredOn: "2026-11-13",
      accountId: "nubank",
      ambiguousAccount: null,
      unmatchedAccount: null,
      description: "café",
      tagNames: ["viagem"],
      droppedTags: { tooMany: 0, tooLong: [] },
    });
  });

  describe("amount", () => {
    it.each([
      ["12,50", 1250],
      ["12.50", 1250],
      ["12,5", 1250],
      ["R$12", 1200],
      ["r$ 12", 1200],
      ["R$ 1.234,56", 123456],
      ["R$ 1.234,56", 123456],
      ["1.000", 100000],
      ["1.5", 150],
      ["12 reais", 1200],
      ["12 real", 1200],
    ])("reads %s", (value, cents) => {
      const result = parse(`almoço ${value}`);
      expect(result.amountCents).toBe(cents);
      expect(result.description).toBe("almoço");
    });

    it.each([
      "12,505",
      "2x",
      "99food",
      "abc",
    ])("%s is not an amount", (value) => {
      const result = parse(`almoço ${value}`);
      expect(result.amountCents).toBeNull();
      expect(result.description).toBe(`almoço ${value}`);
    });

    it("takes the last loose number and keeps the others", () => {
      const result = parse("uber 2 viagens 30");
      expect(result.amountCents).toBe(3000);
      expect(result.description).toBe("uber 2 viagens");
    });

    it("prefers a marked amount, then one with decimals", () => {
      expect(parse("R$ 30 uber 2")).toMatchObject({
        amountCents: 3000,
        description: "uber 2",
      });
      expect(parse("uber 12,50 2")).toMatchObject({
        amountCents: 1250,
        description: "uber 2",
      });
    });

    it("refuses zero and values above the limit", () => {
      expect(parse("x 0").amountCents).toBeNull();
      expect(parse("x 999999999,99").amountCents).toBe(99_999_999_999);
      expect(parse("x 1.000.000.000").amountCents).toBeNull();
      expect(parse("x 99999999999999").amountCents).toBeNull();
      expect(parse("x 1.000.000.000").description).toBe("x 1.000.000.000");
    });
  });

  describe("date", () => {
    it.each([
      ["hoje", "2026-11-14"],
      ["ontem", "2026-11-13"],
      ["anteontem", "2026-11-12"],
      ["dia 5", "2026-11-05"],
      ["dia 14", "2026-11-14"],
      ["dia 20", "2026-10-20"],
      ["dia 31", "2026-10-31"],
      ["05/11", "2026-11-05"],
      ["5/11/26", "2026-11-05"],
      ["05-11-2025", "2025-11-05"],
      ["20/11", "2026-11-20"],
    ])("reads %s", (word, date) => {
      const result = parse(`pizza 40 ${word}`);
      expect(result.occurredOn).toBe(date);
      expect(result.description).toBe("pizza");
    });

    it.each([
      ["segunda", "2026-11-09"],
      ["segunda-feira", "2026-11-09"],
      ["segunda feira", "2026-11-09"],
      ["terça", "2026-11-10"],
      ["sexta", "2026-11-13"],
      ["sexta passada", "2026-11-06"],
      ["sexta-feira passada", "2026-11-06"],
      ["sábado", "2026-11-07"],
      ["sabado", "2026-11-07"],
      ["domingo", "2026-11-08"],
      ["domingo passado", "2026-11-08"],
    ])("reads %s on a Friday", (word, date) => {
      const friday = { year: 2026, month: 11, day: 13 };
      const result = parse(`pizza 40 ${word}`, accounts, friday);
      expect(result.occurredOn).toBe(date);
      expect(result.description).toBe("pizza");
    });

    it('the weekday of today is today, unless it is "passada"', () => {
      expect(parse("x 5 sábado").occurredOn).toBe("2026-11-14");
      expect(parse("x 5 sábado passado").occurredOn).toBe("2026-11-07");
    });

    it("eats the preposition before the date", () => {
      expect(parse("pizza 40 no dia 5")).toMatchObject({
        occurredOn: "2026-11-05",
        description: "pizza",
      });
    });

    it("does not read a day that the month does not have", () => {
      const march = { year: 2026, month: 3, day: 15 };
      const result = parse("conta dia 31 50", accounts, march);
      expect(result.occurredOn).toBeNull();
      expect(result.amountCents).toBe(5000);
    });

    it("leaves an invalid date in the description", () => {
      const result = parse("pizza 40 31/02");
      expect(result.occurredOn).toBeNull();
      expect(result.description).toBe("pizza 31/02");
    });

    it("the first date wins", () => {
      const result = parse("pizza 40 ontem hoje");
      expect(result.occurredOn).toBe("2026-11-13");
      expect(result.description).toBe("pizza hoje");
    });
  });

  describe("account", () => {
    it.each([
      ["na itau", "itau"],
      ["no c6", "c6"],
      ["em dinheiro", "dinheiro"],
      ["pelo vale refeição", "vale"],
      ["no cartão nubank", "cartao-nubank"],
    ])("%s", (term, id) => {
      const result = parse(`mercado 50 ${term}`);
      expect(result.accountId).toBe(id);
      expect(result.description).toBe("mercado");
      expect(result.amountCents).toBe(5000);
    });

    it("needs a preposition and an existing account", () => {
      const result = parse("almoço 30 no shopping");
      expect(result.accountId).toBeNull();
      expect(result.ambiguousAccount).toBeNull();
      expect(result.unmatchedAccount).toBe("shopping");
      expect(result.description).toBe("almoço no shopping");
      expect(parse("almoço 30 nubank").accountId).toBeNull();
    });

    it("an equal name beats a longer one", () => {
      const list = [
        { id: "pj", name: "Nubank PJ" },
        { id: "pf", name: "Nubank" },
      ];
      expect(parse("x 5 no nubank", list).accountId).toBe("pf");
    });

    it("reports an ambiguous term and consumes it", () => {
      const list = [
        { id: "a", name: "Cartão Itaú" },
        { id: "b", name: "Cartão Nubank" },
      ];
      const result = parse("x 5 no cartão", list);
      expect(result.accountId).toBeNull();
      expect(result.ambiguousAccount).toBe("cartão");
      expect(result.description).toBe("x");
    });
  });

  describe("tags", () => {
    it("turns - and _ into spaces", () => {
      expect(parse("x 5 #viagem-chile #a_b").tagNames).toEqual([
        "viagem chile",
        "a b",
      ]);
    });

    it("ignores repeated # and a lone #", () => {
      const result = parse("x 5 ##y # z");
      expect(result.tagNames).toEqual(["y"]);
      expect(result.description).toBe("x z");
    });

    it("keeps one tag per name, ignoring case and accents", () => {
      expect(parse("x 5 #Viagem #viagem #VIAGEM").tagNames).toEqual(["Viagem"]);
      expect(parse("x 5 #café #cafe").tagNames).toEqual(["café"]);
    });

    it("keeps 10 tags and counts the rest", () => {
      const text = `x 5 ${Array.from({ length: 12 }, (_, i) => `#t${i}`).join(" ")}`;
      const result = parse(text);
      expect(result.tagNames).toHaveLength(10);
      expect(result.droppedTags.tooMany).toBe(2);
    });

    it("drops a name over 30 characters", () => {
      const long = "a".repeat(31);
      const result = parse(`x 5 #${long}`);
      expect(result.tagNames).toEqual([]);
      expect(result.droppedTags.tooLong).toEqual([long]);
    });
  });

  describe("description", () => {
    it("trims loose prepositions at the edges", () => {
      expect(parse("de café com leite 12 no").description).toBe(
        "café com leite",
      );
    });

    it("is empty when only the amount was written", () => {
      expect(parse("12").description).toBe("");
      expect(parse("R$ 12,50").amountCents).toBe(1250);
    });

    it("is cut at 120 characters", () => {
      const result = parse(`${"a".repeat(200)} 5`);
      expect([...result.description]).toHaveLength(120);
    });

    it("an empty text gives nothing", () => {
      expect(parse("   ")).toMatchObject({
        amountCents: null,
        occurredOn: null,
        accountId: null,
        description: "",
        tagNames: [],
      });
    });
  });

  it.each([
    "__proto__",
    "constructor",
    "toString",
    "hasOwnProperty",
  ])("treats %j as plain description, not a weekday", (word) => {
    const result = parse(`${word} 12`);
    expect(result.occurredOn).toBeNull();
    expect(result.amountCents).toBe(1200);
    expect(result.description).toBe(word);
  });
});
