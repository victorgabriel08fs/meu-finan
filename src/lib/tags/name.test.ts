import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  filterTags,
  findByKey,
  MAX_ACTIVE_TAGS,
  MAX_TAGS_PER_ENTRY,
  normalizeTagName,
  sortTags,
  TAG_NAME_MAX,
  tagKey,
} from "./name";

describe("limits", () => {
  it("match the spec", () => {
    expect(TAG_NAME_MAX).toBe(30);
    expect(MAX_TAGS_PER_ENTRY).toBe(10);
    expect(MAX_ACTIVE_TAGS).toBe(100);
  });
});

describe("normalizeTagName", () => {
  it("drops the leading hash, trims and collapses spaces, keeping the case", () => {
    expect(normalizeTagName("  #Viagem   Chile ")).toBe("Viagem Chile");
    expect(normalizeTagName("##praia")).toBe("praia");
    expect(normalizeTagName("a#b")).toBe("a#b");
    expect(normalizeTagName("#   ")).toBe("");
    expect(normalizeTagName("")).toBe("");
  });

  it("is idempotent", () => {
    fc.assert(
      fc.property(fc.string(), (raw) => {
        const once = normalizeTagName(raw);
        expect(normalizeTagName(once)).toBe(once);
      }),
    );
  });
});

describe("tagKey", () => {
  it("is the same for case, accent, hash and space variants", () => {
    const keys = ["Viagem", "viagem", "#viagem", " VIAGEM ", "víagem"].map(
      tagKey,
    );
    expect(new Set(keys).size).toBe(1);
    expect(tagKey("Férias")).toBe(tagKey("ferias"));
    expect(tagKey("viagem  chile")).toBe(tagKey("Viagem Chile"));
    expect(tagKey("viagem")).not.toBe(tagKey("viagens"));
  });

  it("does not change when the name is normalized first", () => {
    fc.assert(
      fc.property(fc.string(), (raw) => {
        expect(tagKey(normalizeTagName(raw))).toBe(tagKey(raw));
      }),
    );
  });
});

describe("findByKey", () => {
  const list = [{ name: "Viagem" }, { name: "Férias" }, { name: "Trabalho" }];

  it("finds ignoring case and accents", () => {
    expect(findByKey(list, "#ferias")).toBe(list[1]);
    expect(findByKey(list, " VIAGEM ")).toBe(list[0]);
  });

  it("finds nothing for an empty or unknown name", () => {
    expect(findByKey(list, "")).toBeUndefined();
    expect(findByKey(list, "#")).toBeUndefined();
    expect(findByKey(list, "praia")).toBeUndefined();
  });
});

describe("filterTags", () => {
  const list = [{ name: "Viagem" }, { name: "Férias" }, { name: "Trabalho" }];

  it("keeps the tags that contain the query", () => {
    expect(filterTags(list, "FER")).toEqual([{ name: "Férias" }]);
    expect(filterTags(list, "a")).toHaveLength(3);
    expect(filterTags(list, "zzz")).toEqual([]);
  });

  it("returns everything for an empty query, as a copy", () => {
    const all = filterTags(list, "  ");
    expect(all).toEqual(list);
    expect(all).not.toBe(list);
  });
});

describe("sortTags", () => {
  it("orders by name in pt-BR without mutating the input", () => {
    const list = [{ name: "viagem" }, { name: "Ágora" }, { name: "casa" }];
    expect(sortTags(list).map((tag) => tag.name)).toEqual([
      "Ágora",
      "casa",
      "viagem",
    ]);
    expect(list[0]?.name).toBe("viagem");
  });
});
