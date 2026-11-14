import { describe, expect, it } from "vitest";
import { tipById } from "@/lib/tips/registry";
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
      "shared",
    ]);
  });

  it("puts Compartilhado last in the default, after every other block", () => {
    expect(HOME_BLOCK_IDS.at(-1)).toBe("shared");
    expect(DEFAULT_HOME_ORDER.at(-1)).toBe("shared");
    expect(HOME_BLOCKS.shared.size).toBe("narrow");
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
    expect(HOME_BLOCK_IDS.slice(-11, -5)).toEqual([
      "spending-calendar",
      "cash-flow",
      "category-breakdown",
      "income-expense",
      "net-worth",
      "daily-spend",
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

  it("ships the blocks of the reports on the day of their novidade", () => {
    const novidade = tipById("novidade-inicio-blocos-relatorios");
    expect(novidade?.kind).toBe("novidade");
    expect(novidade?.since).toBe(REPORT_BLOCKS_SINCE);
    expect(novidade?.when).toEqual({ flag: "inicio_personalizavel" });
    expect(novidade?.link?.href).toBe("/ajustes/preferencias");
    // The first stage's novidade keeps its own day.
    expect(tipById("novidade-inicio-personalizavel")?.since).toBe("2026-11-02");
  });

  it("offers the gasto por dia as a wide block, out of the default, with its novidade", () => {
    const block = HOME_BLOCKS["daily-spend"];
    expect(block.label).toBe("Quanto dá para gastar por dia");
    expect(block.size).toBe("wide");
    expect(block.inDefault).toBe(false);
    const novidade = tipById("novidade-inicio-gasto-por-dia");
    expect(novidade?.kind).toBe("novidade");
    expect(novidade?.since).toBe(block.since);
    expect(novidade?.when).toEqual({ flag: "inicio_personalizavel" });
    expect(novidade?.link?.href).toBe("/ajustes/preferencias");
    expect(novidade?.body.length).toBeLessThanOrEqual(150);
  });

  it("offers the maior gasto da semana as a narrow block, out of the default, with its novidade", () => {
    const block = HOME_BLOCKS["top-expenses"];
    expect(block.label).toBe("Maior gasto da semana");
    expect(block.size).toBe("narrow");
    expect(block.inDefault).toBe(false);
    expect(block.since).toBe("2026-11-13");
    expect(HOME_BLOCK_IDS.at(-1)).toBe("shared");
    expect(HOME_BLOCK_IDS.at(-2)).toBe("subscriptions");
    expect(HOME_BLOCK_IDS.at(-3)).toBe("month-comparison");
    expect(HOME_BLOCK_IDS.at(-4)).toBe("installments-ending");
    expect(HOME_BLOCK_IDS.at(-5)).toBe("top-expenses");
    const novidade = tipById("novidade-inicio-maior-gasto-semana");
    expect(novidade?.kind).toBe("novidade");
    expect(novidade?.since).toBe(block.since);
    expect(novidade?.when).toEqual({ flag: "inicio_personalizavel" });
    expect(novidade?.link?.href).toBe("/ajustes/preferencias");
    expect(novidade?.body.length).toBeLessThanOrEqual(150);
  });

  it("offers the assinaturas do mês as a narrow block, out of the default, with its novidade", () => {
    const block = HOME_BLOCKS.subscriptions;
    expect(block.label).toBe("Assinaturas do mês");
    expect(block.size).toBe("narrow");
    expect(block.inDefault).toBe(false);
    expect(block.since).toBe("2026-11-14");
    expect(HOME_BLOCK_IDS.at(-2)).toBe("subscriptions");
    const novidade = tipById("novidade-inicio-assinaturas");
    expect(novidade?.kind).toBe("novidade");
    expect(novidade?.since).toBe(block.since);
    expect(novidade?.when).toEqual({ flag: "inicio_personalizavel" });
    expect(novidade?.link?.href).toBe("/ajustes/preferencias");
    expect(novidade?.body.length).toBeLessThanOrEqual(150);
  });

  it("offers the comparado ao mês passado as a narrow block, out of the default, with its novidade", () => {
    const block = HOME_BLOCKS["month-comparison"];
    expect(block.label).toBe("Comparado ao mês passado");
    expect(block.size).toBe("narrow");
    expect(block.inDefault).toBe(false);
    expect(HOME_BLOCK_IDS.indexOf("month-comparison")).toBeGreaterThan(
      HOME_BLOCK_IDS.indexOf("top-expenses"),
    );
    const novidade = tipById("novidade-inicio-comparado-mes-passado");
    expect(novidade?.kind).toBe("novidade");
    expect(novidade?.since).toBe(block.since);
    expect(novidade?.when).toEqual({ flag: "inicio_personalizavel" });
    expect(novidade?.link?.href).toBe("/ajustes/preferencias");
    expect(novidade?.body.length).toBeLessThanOrEqual(150);
  });

  it("knows its own ids only", () => {
    expect(isHomeBlockId("budget")).toBe(true);
    expect(isHomeBlockId("toString")).toBe(false);
    expect(isHomeBlockId("foo")).toBe(false);
    expect(isHomeBlockId(42)).toBe(false);
    expect(isHomeBlockId(null)).toBe(false);
  });
});
