import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dismissedKey, readDismissed, writeDismissed } from "./insight-card";

/** A localStorage in memory, like the browser's. */
function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
    removeItem: (key: string) => {
      items.delete(key);
    },
  };
}

describe("dismissed highlights", () => {
  let storage: ReturnType<typeof memoryStorage>;

  beforeEach(() => {
    storage = memoryStorage({
      // The first release's map, shared by everyone on the device.
      "meu-finan:observacoes-dispensadas": JSON.stringify({ "cat-1": 1 }),
    });
    vi.stubGlobal("window", { localStorage: storage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keys the map by person", () => {
    expect(dismissedKey("ana")).toBe("meu-finan:observacoes-dispensadas:ana");
    expect(dismissedKey("bia")).not.toBe(dismissedKey("ana"));
  });

  it("keeps each person's dismissals apart on one device", () => {
    writeDismissed("ana", { "cat-1": 1_000 });
    expect(readDismissed("ana")).toEqual({ "cat-1": 1_000 });
    expect(readDismissed("bia")).toEqual({});
    writeDismissed("bia", { "cat-2": 2_000 });
    expect(readDismissed("ana")).toEqual({ "cat-1": 1_000 });
    expect(readDismissed("bia")).toEqual({ "cat-2": 2_000 });
  });

  it("drops the shared map of the first release instead of carrying it over", () => {
    expect(readDismissed("ana")).toEqual({});
    expect(storage.items.has("meu-finan:observacoes-dispensadas")).toBe(false);
  });

  it("ignores what is not a map", () => {
    storage.setItem(dismissedKey("ana"), "[1,2]");
    expect(readDismissed("ana")).toEqual({});
    storage.setItem(dismissedKey("ana"), "not json");
    expect(readDismissed("ana")).toEqual({});
  });

  it("survives storage that throws", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
        removeItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(readDismissed("ana")).toEqual({});
    expect(() => writeDismissed("ana", { "cat-1": 1 })).not.toThrow();
  });
});
