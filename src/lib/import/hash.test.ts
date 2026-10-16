import { createHash } from "node:crypto";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  assignExternalIds,
  type IdentifiableRow,
  rowHash,
  sha256Hex,
} from "./hash";

describe("sha256Hex", () => {
  it("matches the FIPS 180-4 vectors", () => {
    expect(sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(
      sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
    ).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
  });

  it("agrees with node:crypto on any text", () => {
    fc.assert(
      fc.property(fc.string({ unit: "grapheme", maxLength: 300 }), (text) => {
        expect(sha256Hex(text)).toBe(
          createHash("sha256").update(text, "utf8").digest("hex"),
        );
      }),
    );
  });
});

const row = (overrides: Partial<IdentifiableRow> = {}): IdentifiableRow => ({
  occurredOn: "2026-10-14",
  amountCents: -500,
  description: "CAFE DA ESQUINA",
  sourceId: null,
  ...overrides,
});

describe("assignExternalIds", () => {
  it("hashes rows without ids, telling identical rows apart by occurrence", () => {
    const ids = assignExternalIds(
      [row(), row(), row({ amountCents: -600 })],
      "id",
    );
    expect(ids[0]).toBe(rowHash(row(), 0));
    expect(ids[1]).toBe(rowHash(row(), 1));
    expect(new Set(ids).size).toBe(3);
    expect(ids[0]).toMatch(/^h:[0-9a-f]{32}$/);
  });

  it("is stable across files that overlap", () => {
    const first = assignExternalIds(
      [row({ occurredOn: "2026-10-13" }), row(), row()],
      "id",
    );
    // A later export of the same day has a third coffee and more rows.
    const second = assignExternalIds(
      [row(), row(), row(), row({ occurredOn: "2026-10-15" })],
      "id",
    );
    expect(second.slice(0, 2)).toEqual(first.slice(1, 3));
    expect(first).not.toContain(second[2]);
  });

  it("ignores case, accents and spacing in the description", () => {
    const [a] = assignExternalIds(
      [row({ description: "Café  da Esquina" })],
      "id",
    );
    const [b] = assignExternalIds(
      [row({ description: "CAFE DA ESQUINA" })],
      "id",
    );
    expect(a).toBe(b);
  });

  it("uses reliable bank ids, numbering the repeated ones", () => {
    expect(
      assignExternalIds(
        [
          row({ sourceId: " 001 " }),
          row({ sourceId: "002" }),
          row({ sourceId: "001" }),
          ...Array.from({ length: 20 }, (_, index) =>
            row({ sourceId: `x${index}` }),
          ),
        ],
        "ofx",
      ).slice(0, 3),
    ).toEqual(["ofx:001", "ofx:002", "ofx:001#2"]);
  });

  it("falls back to hashes when ids are missing or mostly repeated", () => {
    const missing = assignExternalIds([row({ sourceId: "1" }), row()], "ofx");
    expect(missing.every((id) => id.startsWith("h:"))).toBe(true);
    const repeated = assignExternalIds(
      [row({ sourceId: "0" }), row({ sourceId: "0", amountCents: -1 })],
      "id",
    );
    expect(repeated.every((id) => id.startsWith("h:"))).toBe(true);
    const tooLong = assignExternalIds(
      [row({ sourceId: "x".repeat(201) })],
      "id",
    );
    expect(tooLong[0]).toMatch(/^h:/);
  });

  it("gives every row of any file a distinct id", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            occurredOn: fc.constantFrom("2026-10-14", "2026-10-15"),
            amountCents: fc.constantFrom(-500, 500, -1),
            description: fc.constantFrom("A", "a", "B"),
            sourceId: fc.constant(null),
          }),
          { maxLength: 40 },
        ),
        (rows) => {
          const ids = assignExternalIds(rows, "id");
          expect(new Set(ids).size).toBe(rows.length);
        },
      ),
    );
  });
});
