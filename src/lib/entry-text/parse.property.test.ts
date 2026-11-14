import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatBRL } from "@/lib/format/money";
import { tagKey } from "@/lib/tags/name";
import { type EntryTextAccount, parseEntryText } from "./parse";

const today = { year: 2026, month: 11, day: 14 };
const accounts: EntryTextAccount[] = [
  { id: "a1", name: "Nubank" },
  { id: "a2", name: "Itaú Conta" },
  { id: "a3", name: "Dinheiro" },
];
const parse = (text: string) => parseEntryText(text, { today, accounts });

describe("parseEntryText (properties)", () => {
  it("never throws and respects the limits", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary" }), (text) => {
        const result = parse(text);
        expect([...result.description].length).toBeLessThanOrEqual(120);
        expect(result.tagNames.length).toBeLessThanOrEqual(10);
        const keys = result.tagNames.map(tagKey);
        expect(new Set(keys).size).toBe(keys.length);
        for (const name of result.tagNames) {
          expect([...name].length).toBeGreaterThanOrEqual(1);
          expect([...name].length).toBeLessThanOrEqual(30);
          expect(name.startsWith("#")).toBe(false);
        }
        if (result.accountId !== null) {
          expect(accounts.map((a) => a.id)).toContain(result.accountId);
        }
      }),
    );
  });

  it("reads back what formatBRL writes", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 99_999_999_999 }), (cents) => {
        expect(parse(formatBRL(cents)).amountCents).toBe(cents);
      }),
    );
  });

  it("finds no amount in a text without digits", () => {
    fc.assert(
      fc.property(
        fc.string().filter((text) => !/\d/.test(text)),
        (text) => {
          expect(parse(text).amountCents).toBeNull();
        },
      ),
    );
  });

  const word = fc.constantFrom("café", "mercado", "uber", "padaria", "pizza");
  const amount = fc.tuple(
    fc.integer({ min: 1, max: 99_999 }),
    fc.integer({ min: 0, max: 99 }),
    fc.constantFrom("br", "comma", "dot", "reais", "plain"),
  );
  const dates = fc.constantFrom(
    ["hoje", "2026-11-14"],
    ["ontem", "2026-11-13"],
    ["anteontem", "2026-11-12"],
    ["05/11", "2026-11-05"],
  );
  const accountPart = fc.constantFrom(
    ["no nubank", "a1"],
    ["na itau", "a2"],
    ["em dinheiro", "a3"],
  );
  const tag = fc.constantFrom("viagem", "casa", "trabalho");

  it("recovers each part of a composed phrase, rotated", () => {
    fc.assert(
      fc.property(
        fc.array(word, { minLength: 1, maxLength: 4 }),
        amount,
        dates,
        accountPart,
        fc.uniqueArray(tag, { maxLength: 3 }),
        fc.nat(),
        (
          words,
          [reais, centsPart, style],
          [dateText, date],
          [accText, id],
          tags,
          seed,
        ) => {
          const whole = String(reais);
          const withCents = reais * 100 + centsPart;
          const [text, expected] =
            style === "br"
              ? [formatBRL(withCents), withCents]
              : style === "comma"
                ? [`${whole},${String(centsPart).padStart(2, "0")}`, withCents]
                : style === "dot"
                  ? [
                      `${whole}.${String(centsPart).padStart(2, "0")}`,
                      withCents,
                    ]
                  : style === "reais"
                    ? [`${whole} reais`, reais * 100]
                    : [whole, reais * 100];
          const parts = [
            words.join(" "),
            text,
            dateText,
            accText,
            ...tags.map((t) => `#${t}`),
          ];
          // A rotation keeps each part (the account's preposition too) whole.
          const shift = seed % parts.length;
          const phrase = [...parts.slice(shift), ...parts.slice(0, shift)].join(
            " ",
          );
          const result = parse(phrase);
          expect(result.amountCents).toBe(expected);
          expect(result.occurredOn).toBe(date);
          expect(result.accountId).toBe(id);
          expect([...result.tagNames].sort()).toEqual([...tags].sort());
        },
      ),
    );
  });
});
