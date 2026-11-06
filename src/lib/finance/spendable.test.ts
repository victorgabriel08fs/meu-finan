import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { finAccountType } from "@/server/db/schema";
import {
  isCountedSavingsBox,
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
