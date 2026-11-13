import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  dailySpendChooserIds,
  dailySpendLineIds,
  MAX_HIDDEN_ACCOUNTS,
  resolveDailySpendHidden,
} from "./block-settings";

const stored = (hiddenAccountIds: unknown) => ({
  "daily-spend": { hiddenAccountIds },
});

describe("resolveDailySpendHidden", () => {
  it("reads the hidden accounts of the block", () => {
    expect(resolveDailySpendHidden(stored(["a", "b"]))).toEqual(["a", "b"]);
  });

  it("reads anything malformed as none hidden", () => {
    for (const value of [
      null,
      undefined,
      "x",
      42,
      [],
      { "daily-spend": null },
      { "daily-spend": [] },
      { "daily-spend": { hiddenAccountIds: "a" } },
      { other: { hiddenAccountIds: ["a"] } },
    ]) {
      expect(resolveDailySpendHidden(value), JSON.stringify(value)).toEqual([]);
    }
  });

  it("skips what is not an id, and repeated ones", () => {
    expect(
      resolveDailySpendHidden(stored(["a", 1, null, "", "a", "x".repeat(65)])),
    ).toEqual(["a"]);
  });

  it("keeps at most 100", () => {
    const ids = Array.from({ length: 150 }, (_, k) => `id-${k}`);
    expect(resolveDailySpendHidden(stored(ids))).toHaveLength(
      MAX_HIDDEN_ACCOUNTS,
    );
  });
});

describe("dailySpendLineIds", () => {
  it("gives no lines with fewer than two accounts", () => {
    expect(dailySpendLineIds(null, [])).toEqual([]);
    expect(dailySpendLineIds(null, ["a"])).toEqual([]);
  });

  it("shows every account by default, in order", () => {
    expect(dailySpendLineIds(null, ["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("leaves the hidden ones out, and shows a new account on its own", () => {
    expect(dailySpendLineIds(stored(["b"]), ["a", "b", "c", "new"])).toEqual([
      "a",
      "c",
      "new",
    ]);
  });

  it("ignores unknown ids, and can hide them all", () => {
    expect(dailySpendLineIds(stored(["zz"]), ["a", "b"])).toEqual(["a", "b"]);
    expect(dailySpendLineIds(stored(["a", "b"]), ["a", "b"])).toEqual([]);
  });
});

describe("benefícios in Quanto dá para gastar por dia", () => {
  it("lists the benefícios in the chooser, after two or more accounts", () => {
    expect(dailySpendChooserIds([], [])).toEqual([]);
    expect(dailySpendChooserIds(["a"], [])).toEqual([]);
    expect(dailySpendChooserIds(["a"], ["vr"])).toEqual(["vr"]);
    expect(dailySpendChooserIds(["a", "b"], ["vr", "va"])).toEqual([
      "a",
      "b",
      "vr",
      "va",
    ]);
  });

  it("gives a benefício a line even with one account to spend from", () => {
    expect(dailySpendLineIds(null, ["a"], ["vr"])).toEqual(["vr"]);
    expect(dailySpendLineIds(null, ["a", "b"], ["vr"])).toEqual([
      "a",
      "b",
      "vr",
    ]);
  });

  it("leaves a hidden benefício out", () => {
    expect(dailySpendLineIds(stored(["vr"]), ["a"], ["vr"])).toEqual([]);
    expect(dailySpendLineIds(stored(["vr", "a"]), ["a", "b"], ["vr"])).toEqual([
      "b",
    ]);
  });

  const ids = (prefix: string, max: number) =>
    fc
      .integer({ min: 0, max })
      .map((n) => Array.from({ length: n }, (_, k) => `${prefix}${k}`));

  it("only gives lines to the chooser's accounts, in its order, never the hidden ones", () => {
    fc.assert(
      fc.property(
        ids("a", 5),
        ids("b", 3),
        fc.array(fc.constantFrom<string>("a0", "a1", "a2", "b0", "b1", "zz")),
        (spendable, benefits, hidden) => {
          const chooser = dailySpendChooserIds(spendable, benefits);
          const lines = dailySpendLineIds(stored(hidden), spendable, benefits);
          // A subsequence of the chooser: same order, nothing else.
          expect(lines).toEqual(chooser.filter((id) => lines.includes(id)));
          for (const id of benefits) expect(chooser).toContain(id);
          for (const id of hidden) expect(lines).not.toContain(id);
          expect(lines).toEqual(chooser.filter((id) => !hidden.includes(id)));
          if (spendable.length < 2) {
            for (const id of spendable) expect(lines).not.toContain(id);
          }
          // Benefícios always come after the accounts.
          const firstBenefit = lines.findIndex((id) => id.startsWith("b"));
          if (firstBenefit >= 0) {
            expect(
              lines.slice(firstBenefit).every((id) => id.startsWith("b")),
            ).toBe(true);
          }
        },
      ),
    );
  });
});
