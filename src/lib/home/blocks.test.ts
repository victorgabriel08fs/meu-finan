import { describe, expect, it } from "vitest";
import {
  DEFAULT_HOME_ORDER,
  HOME_BLOCK_IDS,
  HOME_BLOCKS,
  type HomeBlockDefinition,
  isHomeBlockId,
  isPinnedHomeBlock,
  MOVABLE_HOME_BLOCK_IDS,
  REPORT_BLOCKS_SINCE,
} from "./blocks";

const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe("home blocks catalog", () => {
  it("has unique kebab-case ids", () => {
    expect(new Set(HOME_BLOCK_IDS).size).toBe(HOME_BLOCK_IDS.length);
    for (const id of HOME_BLOCK_IDS) expect(id).toMatch(KEBAB);
  });

  it("pins only the Saldo, and keeps it in the default", () => {
    expect(HOME_BLOCK_IDS.filter(isPinnedHomeBlock)).toEqual(["balance"]);
    expect(HOME_BLOCKS.balance.inDefault).toBe(true);
    expect(DEFAULT_HOME_ORDER[0]).toBe("balance");
  });

  it("keeps the Início of today as the default, in order", () => {
    expect(DEFAULT_HOME_ORDER).toEqual([
      "balance",
      "month-totals",
      "budget",
      "upcoming-bills",
      "accounts",
      "goals",
      "insight",
    ]);
  });

  it("lists every block but the pinned one as movable", () => {
    expect([...MOVABLE_HOME_BLOCK_IDS]).toEqual(
      HOME_BLOCK_IDS.filter((id) => !isPinnedHomeBlock(id)),
    );
  });

  it("dates every block and writes its copy in pt-BR sentences", () => {
    for (const id of HOME_BLOCK_IDS) {
      const block: HomeBlockDefinition = HOME_BLOCKS[id];
      expect(block.since, id).toMatch(ISO_DATE);
      expect(block.label.length, id).toBeGreaterThan(0);
      expect(block.description, id).toMatch(/^\S.*\.$/);
      expect(block.errorTitle, id).toMatch(/^Não deu para carregar \S/);
      expect(block.weight, id).toBeGreaterThan(0);
    }
  });

  it("offers the spending calendar as a wide block, out of the default", () => {
    expect(HOME_BLOCKS["spending-calendar"].size).toBe("wide");
    expect(HOME_BLOCKS["spending-calendar"].inDefault).toBe(false);
  });

  it("offers the blocks of the reports out of the default, after the calendar", () => {
    expect(HOME_BLOCK_IDS.slice(-5)).toEqual([
      "spending-calendar",
      "cash-flow",
      "category-breakdown",
      "income-expense",
      "net-worth",
    ]);
    expect(HOME_BLOCKS["cash-flow"].size).toBe("wide");
    for (const id of [
      "cash-flow",
      "category-breakdown",
      "income-expense",
      "net-worth",
    ] as const) {
      expect(HOME_BLOCKS[id].inDefault, id).toBe(false);
      expect(HOME_BLOCKS[id].since, id).toBe(REPORT_BLOCKS_SINCE);
      if (id !== "cash-flow") expect(HOME_BLOCKS[id].size, id).toBe("narrow");
    }
    // Not "Receitas e despesas", the name of the tiles.
    expect(HOME_BLOCKS["income-expense"].label).toBe(
      "Receitas × despesas por mês",
    );
  });

  it("knows its own ids only", () => {
    expect(isHomeBlockId("budget")).toBe(true);
    expect(isHomeBlockId("toString")).toBe(false);
    expect(isHomeBlockId("foo")).toBe(false);
    expect(isHomeBlockId(42)).toBe(false);
    expect(isHomeBlockId(null)).toBe(false);
  });
});
