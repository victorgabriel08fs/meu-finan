import { describe, expect, it } from "vitest";
import {
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
