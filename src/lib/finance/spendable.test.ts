import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { finAccountType } from "@/server/db/schema";
import {
  canPayInvoice,
  isBenefitAccount,
  isBenefitType,
  isCountedSavingsBox,
  isDefaultEntryType,
  isSpendableAccount,
  isSpendableType,
  NON_SPENDABLE_ACCOUNT_TYPES,
} from "./spendable";

const active = { includeInNetWorth: true, archived: false };

describe("isSpendableAccount", () => {
  it.each([
    ["checking", active, true],
    ["savings", active, true],
    ["cash", active, true],
    ["investment", active, true],
    ["other", active, true],
    ["credit_card", active, false],
    ["savings_box", active, false],
    ["benefit", active, false],
    ["benefit", { includeInNetWorth: false, archived: false }, false],
    ["checking", { includeInNetWorth: false, archived: false }, false],
    ["checking", { includeInNetWorth: true, archived: true }, false],
  ])("%s %j -> %s", (type, facts, expected) => {
    expect(isSpendableAccount({ type, ...facts })).toBe(expected);
  });

  it("is never true for an archived, outside-the-net-worth or non-spendable account", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...finAccountType.enumValues),
        fc.boolean(),
        fc.boolean(),
        (type, includeInNetWorth, archived) => {
          const spendable = isSpendableAccount({
            type,
            includeInNetWorth,
            archived,
          });
          if (archived || !includeInNetWorth || !isSpendableType(type)) {
            expect(spendable).toBe(false);
          } else {
            expect(spendable).toBe(true);
          }
        },
      ),
    );
  });

  it("only names types that exist in the enum", () => {
    for (const type of NON_SPENDABLE_ACCOUNT_TYPES) {
      expect(finAccountType.enumValues).toContain(type);
    }
  });
});

describe("isCountedSavingsBox", () => {
  it("is a caixinha in the net worth and not archived", () => {
    expect(isCountedSavingsBox({ type: "savings_box", ...active })).toBe(true);
    expect(
      isCountedSavingsBox({
        type: "savings_box",
        includeInNetWorth: false,
        archived: false,
      }),
    ).toBe(false);
    expect(
      isCountedSavingsBox({
        type: "savings_box",
        includeInNetWorth: true,
        archived: true,
      }),
    ).toBe(false);
    expect(isCountedSavingsBox({ type: "checking", ...active })).toBe(false);
  });
});

describe("benefícios", () => {
  it.each([
    ["benefit", active, true],
    ["benefit", { includeInNetWorth: false, archived: false }, true],
    ["benefit", { includeInNetWorth: true, archived: true }, false],
    ["benefit", { includeInNetWorth: false, archived: true }, false],
    ["checking", active, false],
    ["savings_box", active, false],
    ["other", { includeInNetWorth: false, archived: false }, false],
  ])("isBenefitAccount %s %j -> %s", (type, facts, expected) => {
    expect(isBenefitAccount({ type, ...facts })).toBe(expected);
  });

  it.each([
    ["checking", true, true, true],
    ["savings", true, true, true],
    ["cash", true, true, true],
    ["investment", true, true, true],
    ["other", true, true, true],
    ["credit_card", false, false, true],
    ["savings_box", false, true, false],
    ["benefit", false, false, false],
  ])("%s: spendable %s, pays an invoice %s, opens the Nova transação %s", (type, spendable, pays, entry) => {
    expect(isSpendableType(type)).toBe(spendable);
    expect(canPayInvoice(type)).toBe(pays);
    expect(isDefaultEntryType(type)).toBe(entry);
    expect(isBenefitType(type)).toBe(type === "benefit");
  });

  it("never changes which accounts are spendable when benefícios join the list", () => {
    const facts = fc.record({
      includeInNetWorth: fc.boolean(),
      archived: fc.boolean(),
    });
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            type: fc.constantFrom(...finAccountType.enumValues),
            facts,
          }),
          { maxLength: 8 },
        ),
        fc.array(facts, { maxLength: 5 }),
        fc.nat(),
        (accounts, benefits, seed) => {
          const list = accounts.map((item, index) => ({
            id: `a${index}`,
            type: item.type as string,
            ...item.facts,
          }));
          const extra = benefits.map((item, index) => ({
            id: `b${index}`,
            type: "benefit",
            ...item,
          }));
          // Mixed in anywhere, the benefícios leave the spendable list as it was.
          const mixed = [...list];
          extra.forEach((benefit, index) => {
            mixed.splice((seed + index) % (mixed.length + 1), 0, benefit);
          });
          expect(mixed.filter(isSpendableAccount)).toEqual(
            list.filter(isSpendableAccount),
          );
          const ids = (items: { id: string }[]) =>
            items.map((item) => item.id).sort();
          expect(ids(mixed.filter(isBenefitAccount))).toEqual(
            ids(
              [...list, ...extra].filter(
                (item) => item.type === "benefit" && !item.archived,
              ),
            ),
          );
          for (const item of mixed) {
            expect(isSpendableAccount(item) && isBenefitAccount(item)).toBe(
              false,
            );
          }
        },
      ),
    );
  });
});
