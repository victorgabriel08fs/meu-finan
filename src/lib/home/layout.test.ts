import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  HOME_BLOCK_IDS,
  HOME_BLOCKS,
  type HomeBlockId,
  MOVABLE_HOME_BLOCK_IDS,
} from "./blocks";
import {
  canMoveHomeBlock,
  defaultHomeLayout,
  type HomeLayoutEntry,
  moveHomeBlock,
  packHomeLayout,
  resolveHomeLayout,
  setHomeBlockVisible,
  toStoredLayout,
  visibleHomeBlocks,
} from "./layout";

const plain = (entries: HomeLayoutEntry[]) =>
  entries.map(({ id, visible }) => ({ id, visible }));
const ids = (entries: HomeLayoutEntry[]) => entries.map((entry) => entry.id);

/** Anything the column could hold: valid items, junk and everything between. */
const storedItem = fc.oneof(
  fc.record({
    id: fc.constantFrom<string>(...HOME_BLOCK_IDS, "foo", "toString", ""),
    visible: fc.boolean(),
  }),
  fc.record({ id: fc.constantFrom(...HOME_BLOCK_IDS), visible: fc.anything() }),
  fc.anything(),
);
const stored = fc.oneof(fc.array(storedItem, { maxLength: 12 }), fc.anything());
const anyEntries = stored.map((value) => resolveHomeLayout(value).entries);
const visibleIds = fc
  .shuffledSubarray([...MOVABLE_HOME_BLOCK_IDS] as HomeBlockId[])
  .map((rest) => ["balance", ...rest] as HomeBlockId[]);

describe("defaultHomeLayout", () => {
  it("shows the Início of today, then the other blocks hidden", () => {
    expect(defaultHomeLayout()).toEqual([
      { id: "balance", visible: true },
      { id: "month-totals", visible: true },
      { id: "budget", visible: true },
      { id: "upcoming-bills", visible: true },
      { id: "accounts", visible: true },
      { id: "goals", visible: true },
      { id: "insight", visible: true },
      { id: "spending-calendar", visible: false },
      { id: "cash-flow", visible: false },
      { id: "category-breakdown", visible: false },
      { id: "income-expense", visible: false },
      { id: "net-worth", visible: false },
    ]);
  });
});

describe("resolveHomeLayout", () => {
  it("falls back to the default for null and anything but an array", () => {
    for (const value of [null, undefined, {}, "x", 42, { 0: "budget" }]) {
      expect(resolveHomeLayout(value)).toEqual({
        entries: defaultHomeLayout(),
        customized: false,
      });
    }
  });

  it("keeps the saved order and visibility, the Saldo first", () => {
    const { entries, customized } = resolveHomeLayout([
      { id: "spending-calendar", visible: true },
      { id: "net-worth", visible: true },
      { id: "budget", visible: false },
      { id: "month-totals", visible: true },
      { id: "upcoming-bills", visible: true },
      { id: "accounts", visible: false },
      { id: "goals", visible: true },
      { id: "insight", visible: true },
      { id: "cash-flow", visible: false },
      { id: "category-breakdown", visible: true },
      { id: "income-expense", visible: false },
    ]);
    expect(customized).toBe(true);
    expect(entries).toEqual([
      { id: "balance", visible: true },
      { id: "spending-calendar", visible: true },
      { id: "net-worth", visible: true },
      { id: "budget", visible: false },
      { id: "month-totals", visible: true },
      { id: "upcoming-bills", visible: true },
      { id: "accounts", visible: false },
      { id: "goals", visible: true },
      { id: "insight", visible: true },
      { id: "cash-flow", visible: false },
      { id: "category-breakdown", visible: true },
      { id: "income-expense", visible: false },
    ]);
  });

  it("ignores unknown, repeated, malformed and pinned items", () => {
    const { entries } = resolveHomeLayout([
      { id: "foo", visible: true },
      { id: "goals", visible: false },
      { id: "goals", visible: true },
      { id: "balance", visible: false },
      { id: "budget" },
      { id: "accounts", visible: "yes" },
      "insight",
      null,
      { id: "insight", visible: true, extra: 1 },
    ]);
    expect(entries[0]).toEqual({ id: "balance", visible: true });
    expect(entries.find((entry) => entry.id === "goals")).toEqual({
      id: "goals",
      visible: false,
    });
    expect(entries[1]).toEqual({ id: "goals", visible: false });
    expect(entries[2]).toEqual({ id: "insight", visible: true });
  });

  it("adds the blocks the person did not know at the end, hidden and new", () => {
    const { entries } = resolveHomeLayout([
      { id: "goals", visible: true },
      { id: "budget", visible: true },
    ]);
    expect(ids(entries)).toEqual([
      "balance",
      "goals",
      "budget",
      "month-totals",
      "upcoming-bills",
      "accounts",
      "insight",
      "spending-calendar",
      "cash-flow",
      "category-breakdown",
      "income-expense",
      "net-worth",
    ]);
    for (const entry of entries.slice(3)) {
      expect(entry).toMatchObject({ visible: false, isNew: true });
    }
    expect(entries[1]?.isNew).toBeUndefined();
  });

  it("marks a block out of the default new for its first 30 days", () => {
    // The calendar shipped on 2026-11-02, before the blocks of the reports.
    const newOnes = (stored: unknown, today: string) =>
      resolveHomeLayout(stored, { today })
        .entries.filter((entry) => entry.isNew)
        .map((entry) => entry.id);
    expect(newOnes(null, "2026-11-02")).toEqual(["spending-calendar"]);
    expect(newOnes(null, "2026-12-01")).toContain("spending-calendar");
    expect(newOnes(null, "2026-12-02")).not.toContain("spending-calendar");
    expect(newOnes(null, "2026-11-01")).toEqual([]);
    // Saved and even shown: still new while it is recent.
    const shown = [{ id: "spending-calendar", visible: true }];
    expect(newOnes(shown, "2026-11-10")).toContain("spending-calendar");
    expect(newOnes(shown, "2027-01-10")).not.toContain("spending-calendar");
    // Default blocks never are, unless missing from what was saved.
    expect(newOnes(null, "2026-11-02")).not.toContain("budget");
    expect(newOnes(shown, "2027-01-10")).toContain("budget");
    // Without today, only the blocks missing from what was saved.
    expect(newOnes(null, "")).toEqual([]);
    expect(resolveHomeLayout(null).entries.some((e) => e.isNew)).toBe(false);
  });

  it("marks the blocks of the reports new for 30 days from their release", () => {
    const reports: HomeBlockId[] = [
      "cash-flow",
      "category-breakdown",
      "income-expense",
      "net-worth",
    ];
    const since = HOME_BLOCKS["cash-flow"].since;
    for (const id of reports) expect(HOME_BLOCKS[id].since, id).toBe(since);
    const day = (offset: number) =>
      new Date(Date.parse(since) + offset * 86_400_000)
        .toISOString()
        .slice(0, 10);
    const newOnes = (today: string) =>
      resolveHomeLayout(null, { today })
        .entries.filter((entry) => entry.isNew && reports.includes(entry.id))
        .map((entry) => entry.id);
    expect(newOnes(day(-1))).toEqual([]);
    expect(newOnes(day(0))).toEqual(reports);
    expect(newOnes(day(29))).toEqual(reports);
    expect(newOnes(day(30))).toEqual([]);
    // An Início saved before them: they come at the end, hidden and new.
    const saved = resolveHomeLayout([{ id: "budget", visible: true }], {
      today: day(60),
    }).entries;
    expect(ids(saved).slice(-4)).toEqual(reports);
    for (const entry of saved.slice(-4)) {
      expect(entry).toMatchObject({ visible: false, isNew: true });
    }
  });

  it("keeps the order and visibility whatever today is", () => {
    fc.assert(
      fc.property(
        stored,
        fc.date({
          min: new Date("2026-01-01"),
          max: new Date("2028-01-01"),
          noInvalidDate: true,
        }),
        (value, date) => {
          const today = date.toISOString().slice(0, 10);
          expect(plain(resolveHomeLayout(value, { today }).entries)).toEqual(
            plain(resolveHomeLayout(value).entries),
          );
        },
      ),
    );
  });

  it("always lists the whole catalog, the pinned block first and shown", () => {
    fc.assert(
      fc.property(stored, (value) => {
        const { entries } = resolveHomeLayout(value);
        expect([...ids(entries)].sort()).toEqual([...HOME_BLOCK_IDS].sort());
        expect(entries[0]).toEqual({ id: "balance", visible: true });
      }),
    );
  });

  it("reads back what it stores", () => {
    fc.assert(
      fc.property(stored, (value) => {
        const first = resolveHomeLayout(value).entries;
        const again = resolveHomeLayout(toStoredLayout(first));
        expect(again.customized).toBe(true);
        expect(plain(again.entries)).toEqual(plain(first));
        expect(again.entries.some((entry) => entry.isNew)).toBe(false);
      }),
    );
  });
});

describe("toStoredLayout", () => {
  it("leaves the pinned block out and keeps the order", () => {
    expect(toStoredLayout(defaultHomeLayout())).toEqual([
      { id: "month-totals", visible: true },
      { id: "budget", visible: true },
      { id: "upcoming-bills", visible: true },
      { id: "accounts", visible: true },
      { id: "goals", visible: true },
      { id: "insight", visible: true },
      { id: "spending-calendar", visible: false },
      { id: "cash-flow", visible: false },
      { id: "category-breakdown", visible: false },
      { id: "income-expense", visible: false },
      { id: "net-worth", visible: false },
    ]);
  });
});

describe("moveHomeBlock", () => {
  it("swaps a block with its neighbour", () => {
    const moved = moveHomeBlock(defaultHomeLayout(), "spending-calendar", "up");
    expect(ids(moved).slice(6, 8)).toEqual(["spending-calendar", "insight"]);
    const back = moveHomeBlock(moved, "spending-calendar", "down");
    expect(back).toEqual(defaultHomeLayout());
  });

  it("never moves the Saldo nor anything past it, and stops at the end", () => {
    const layout = defaultHomeLayout();
    expect(moveHomeBlock(layout, "balance", "down")).toEqual(layout);
    expect(moveHomeBlock(layout, "month-totals", "up")).toEqual(layout);
    expect(moveHomeBlock(layout, "net-worth", "down")).toEqual(layout);
  });

  it("keeps the same blocks, the Saldo first, whatever the moves", () => {
    fc.assert(
      fc.property(
        anyEntries,
        fc.array(
          fc.tuple(
            fc.constantFrom(...HOME_BLOCK_IDS),
            fc.constantFrom("up" as const, "down" as const),
          ),
          { maxLength: 20 },
        ),
        (start, moves) => {
          let entries = start;
          for (const [id, direction] of moves) {
            entries = moveHomeBlock(entries, id, direction);
            expect(entries[0]?.id).toBe("balance");
          }
          expect([...plain(entries)].sort(byId)).toEqual(
            [...plain(start)].sort(byId),
          );
        },
      ),
    );
  });
});

const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);

describe("canMoveHomeBlock", () => {
  it("is false at either end and around the Saldo", () => {
    const layout = defaultHomeLayout();
    expect(canMoveHomeBlock(layout, "balance", "up")).toBe(false);
    expect(canMoveHomeBlock(layout, "balance", "down")).toBe(false);
    expect(canMoveHomeBlock(layout, "month-totals", "up")).toBe(false);
    expect(canMoveHomeBlock(layout, "month-totals", "down")).toBe(true);
    expect(canMoveHomeBlock(layout, "spending-calendar", "up")).toBe(true);
    expect(canMoveHomeBlock(layout, "spending-calendar", "down")).toBe(true);
    expect(canMoveHomeBlock(layout, "net-worth", "up")).toBe(true);
    expect(canMoveHomeBlock(layout, "net-worth", "down")).toBe(false);
  });

  it("agrees with moveHomeBlock", () => {
    fc.assert(
      fc.property(
        anyEntries,
        fc.constantFrom(...HOME_BLOCK_IDS),
        fc.constantFrom("up" as const, "down" as const),
        (entries, id, direction) => {
          const moved = moveHomeBlock(entries, id, direction);
          expect(canMoveHomeBlock(entries, id, direction)).toBe(
            ids(moved).join() !== ids(entries).join(),
          );
        },
      ),
    );
  });
});

describe("setHomeBlockVisible", () => {
  it("shows and hides a block, never the Saldo", () => {
    const shown = setHomeBlockVisible(
      defaultHomeLayout(),
      "spending-calendar",
      true,
    );
    expect(visibleHomeBlocks(shown)).toContain("spending-calendar");
    const hidden = setHomeBlockVisible(shown, "budget", false);
    expect(visibleHomeBlocks(hidden)).not.toContain("budget");
    expect(setHomeBlockVisible(hidden, "balance", false)).toEqual(hidden);
  });
});

describe("visibleHomeBlocks", () => {
  it("lists the shown blocks in order", () => {
    expect(visibleHomeBlocks(defaultHomeLayout())).toEqual([
      "balance",
      "month-totals",
      "budget",
      "upcoming-bills",
      "accounts",
      "goals",
      "insight",
    ]);
  });
});

describe("packHomeLayout", () => {
  it("gives the default Início the three columns of today", () => {
    expect(packHomeLayout(visibleHomeBlocks(defaultHomeLayout()))).toEqual([
      {
        kind: "columns",
        groups: [
          ["balance", "month-totals"],
          ["budget", "upcoming-bills"],
          ["accounts", "goals", "insight"],
        ],
      },
    ]);
  });

  it("gives a wide block a row of its own, splitting the flow", () => {
    expect(
      packHomeLayout(["balance", "month-totals", "spending-calendar", "goals"]),
    ).toEqual([
      { kind: "columns", groups: [["balance"], ["month-totals"]] },
      { kind: "wide", id: "spending-calendar" },
      { kind: "columns", groups: [["goals"]] },
    ]);
  });

  it("never leaves the Saldo alone in a row: a wide block after it shares it", () => {
    expect(
      packHomeLayout([
        "balance",
        "spending-calendar",
        "month-totals",
        "budget",
        "upcoming-bills",
        "accounts",
      ]),
    ).toEqual([
      { kind: "hero-wide", hero: "balance", id: "spending-calendar" },
      {
        kind: "columns",
        // 126 | 380 | 252 + 156: the tallest column is as short as it gets.
        groups: [["month-totals"], ["budget"], ["upcoming-bills", "accounts"]],
      },
    ]);
  });

  it("puts the Fluxo de caixa beside the Saldo, the narrow reports in columns", () => {
    expect(
      packHomeLayout([
        "balance",
        "cash-flow",
        "category-breakdown",
        "income-expense",
        "net-worth",
      ]),
    ).toEqual([
      { kind: "hero-wide", hero: "balance", id: "cash-flow" },
      {
        kind: "columns",
        groups: [["category-breakdown"], ["income-expense"], ["net-worth"]],
      },
    ]);
    expect(
      packHomeLayout(["balance", "month-totals", "cash-flow", "net-worth"]),
    ).toEqual([
      { kind: "columns", groups: [["balance"], ["month-totals"]] },
      { kind: "wide", id: "cash-flow" },
      { kind: "columns", groups: [["net-worth"]] },
    ]);
  });

  it("puts each block in its own column when there are at most three", () => {
    expect(packHomeLayout(["balance", "goals", "insight"])).toEqual([
      { kind: "columns", groups: [["balance"], ["goals"], ["insight"]] },
    ]);
    expect(packHomeLayout(["balance"])).toEqual([
      { kind: "columns", groups: [["balance"]] },
    ]);
    expect(packHomeLayout(["balance", "spending-calendar"])).toEqual([
      { kind: "hero-wide", hero: "balance", id: "spending-calendar" },
    ]);
  });

  it("keeps the order and every block, in up to three columns", () => {
    fc.assert(
      fc.property(visibleIds, (visible) => {
        const sections = packHomeLayout(visible);
        const flat = sections.flatMap((section) =>
          section.kind === "wide"
            ? [section.id]
            : section.kind === "hero-wide"
              ? [section.hero, section.id]
              : section.groups.flat(),
        );
        expect(flat).toEqual(visible);
        // A wide block right after the Saldo always shares its row.
        const second = visible[1];
        if (second && HOME_BLOCKS[second].size === "wide") {
          expect(sections[0]?.kind).toBe("hero-wide");
        }
        sections.forEach((section, index) => {
          if (section.kind === "hero-wide") {
            expect(index).toBe(0);
            expect(section.hero).toBe("balance");
            expect(HOME_BLOCKS[section.id].size).toBe("wide");
          }
        });
        for (const section of sections) {
          if (section.kind !== "columns") {
            if (section.kind === "wide") {
              expect(HOME_BLOCKS[section.id].size).toBe("wide");
            }
            continue;
          }
          expect(section.groups.length).toBeGreaterThan(0);
          expect(section.groups.length).toBeLessThanOrEqual(3);
          for (const group of section.groups) {
            expect(group.length).toBeGreaterThan(0);
            for (const id of group) expect(HOME_BLOCKS[id].size).toBe("narrow");
          }
        }
      }),
    );
  });
});

describe("toStoredLayout properties", () => {
  it("stores each movable block once, never the Saldo", () => {
    fc.assert(
      fc.property(anyEntries, (entries) => {
        const stored = toStoredLayout(entries);
        const storedIds = stored.map((block) => block.id);
        expect(storedIds).not.toContain("balance");
        expect([...storedIds].sort()).toEqual(
          [...MOVABLE_HOME_BLOCK_IDS].sort(),
        );
        for (const block of stored) {
          expect(Object.keys(block).sort()).toEqual(["id", "visible"]);
        }
      }),
    );
  });
});

const NARROW_IDS = HOME_BLOCK_IDS.filter(
  (id) => HOME_BLOCKS[id].size === "narrow",
);
const weightOf = (group: readonly HomeBlockId[]) =>
  group.reduce((sum, id) => sum + HOME_BLOCKS[id].weight, 0);

/** Every way to cut a run into 3 non-empty contiguous columns, in order. */
function allCuts(run: readonly HomeBlockId[]): [number, number][] {
  const cuts: [number, number][] = [];
  for (let i = 1; i < run.length - 1; i++) {
    for (let j = i + 1; j < run.length; j++) cuts.push([i, j]);
  }
  return cuts;
}

describe("packHomeLayout properties", () => {
  it("makes the tallest column as short as any cut, the earliest on ties", () => {
    fc.assert(
      fc.property(fc.shuffledSubarray(NARROW_IDS, { minLength: 4 }), (run) => {
        const [section, ...rest] = packHomeLayout(run);
        expect(rest).toEqual([]);
        if (section?.kind !== "columns") throw new Error("expected columns");
        expect(section.groups).toHaveLength(3);
        const tallest = Math.max(...section.groups.map(weightOf));
        const options = allCuts(run).map(([i, j]) => ({
          cut: [i, j],
          tallest: Math.max(
            weightOf(run.slice(0, i)),
            weightOf(run.slice(i, j)),
            weightOf(run.slice(j)),
          ),
        }));
        const best = Math.min(...options.map((option) => option.tallest));
        expect(tallest).toBe(best);
        const first = options.find((option) => option.tallest === best);
        const [a, b] = section.groups;
        expect([a?.length, (a?.length ?? 0) + (b?.length ?? 0)]).toEqual(
          first?.cut,
        );
      }),
    );
  });

  it("gives each block of a run of at most three a column of its own", () => {
    fc.assert(
      fc.property(fc.shuffledSubarray([...HOME_BLOCK_IDS]), (visible) => {
        // The Saldo followed by a wide block share a row of their own.
        const [first, second] = visible;
        const hero =
          first === "balance" &&
          second !== undefined &&
          HOME_BLOCKS[second].size === "wide";
        const runs: HomeBlockId[][] = [[]];
        for (const id of hero ? visible.slice(2) : visible) {
          if (HOME_BLOCKS[id].size === "wide") runs.push([]);
          else runs.at(-1)?.push(id);
        }
        const columns = packHomeLayout(visible).filter(
          (section) => section.kind === "columns",
        );
        const nonEmpty = runs.filter((run) => run.length > 0);
        expect(columns).toHaveLength(nonEmpty.length);
        nonEmpty.forEach((run, index) => {
          const groups = columns[index]?.groups;
          if (run.length <= 3) {
            expect(groups).toEqual(run.map((id) => [id]));
          } else {
            expect(groups).toHaveLength(3);
          }
        });
      }),
    );
  });
});
