import { describe, expect, it } from "vitest";
import { type ExistingEntry, matchLikelyDuplicates } from "./duplicates";

const entry = (
  id: string,
  occurredOn: string,
  amountCents: number,
): ExistingEntry => ({ id, occurredOn, amountCents, description: id });

describe("matchLikelyDuplicates", () => {
  it("matches the same amount up to a day apart", () => {
    const matches = matchLikelyDuplicates(
      [
        { key: 0, occurredOn: "2026-10-14", amountCents: -6450 },
        { key: 1, occurredOn: "2026-10-14", amountCents: -2290 },
        { key: 2, occurredOn: "2026-10-14", amountCents: -1000 },
      ],
      [
        entry("padaria", "2026-10-13", -6450),
        entry("uber", "2026-10-15", -2290),
        entry("longe", "2026-10-11", -1000),
        entry("sinal", "2026-10-14", 1000),
      ],
    );
    expect(matches.get(0)?.id).toBe("padaria");
    expect(matches.get(1)?.id).toBe("uber");
    expect(matches.has(2)).toBe(false);
  });

  it("pairs one to one", () => {
    const matches = matchLikelyDuplicates(
      [
        { key: 0, occurredOn: "2026-10-14", amountCents: -500 },
        { key: 1, occurredOn: "2026-10-14", amountCents: -500 },
      ],
      [entry("cafe", "2026-10-14", -500)],
    );
    expect([...matches.keys()]).toEqual([0]);
  });

  it("pairs same-day entries before nearby ones", () => {
    // Row 0 (13/out) could take the 14/out entry, but row 1 is that day.
    const matches = matchLikelyDuplicates(
      [
        { key: 0, occurredOn: "2026-10-13", amountCents: -500 },
        { key: 1, occurredOn: "2026-10-14", amountCents: -500 },
      ],
      [entry("a", "2026-10-14", -500), entry("b", "2026-10-12", -500)],
    );
    expect(matches.get(1)?.id).toBe("a");
    expect(matches.get(0)?.id).toBe("b");
  });

  it("prefers the earlier date at the same distance", () => {
    const matches = matchLikelyDuplicates(
      [{ key: 0, occurredOn: "2026-10-14", amountCents: -500 }],
      [entry("depois", "2026-10-15", -500), entry("antes", "2026-10-13", -500)],
    );
    expect(matches.get(0)?.id).toBe("antes");
  });

  it("crosses month boundaries", () => {
    const matches = matchLikelyDuplicates(
      [{ key: 0, occurredOn: "2026-11-01", amountCents: -500 }],
      [entry("ontem", "2026-10-31", -500)],
    );
    expect(matches.get(0)?.id).toBe("ontem");
  });
});
