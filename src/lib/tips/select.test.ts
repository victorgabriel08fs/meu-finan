import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { TIPS } from "./registry";
import {
  isForAccount,
  matchRoute,
  meetsCondition,
  newsFeed,
  selectTips,
  type TipState,
  unreadNewsIds,
} from "./select";
import type { Tip, TipContext } from "./types";

const CONTEXT: TipContext = {
  hasAccounts: true,
  hasPasskey: false,
  role: null,
  flags: [],
};

const state = (patch: Partial<TipState> = {}): TipState => ({
  seen: new Set(),
  off: false,
  createdOn: "2026-10-17",
  context: CONTEXT,
  ...patch,
});

const tip = (patch: Partial<Tip> & Pick<Tip, "id">): Tip => ({
  kind: "primeiros-passos",
  routes: ["/inicio"],
  anchor: patch.id,
  title: "Título",
  body: "Texto.",
  since: "2026-10-17",
  order: 1,
  ...patch,
});

const ids = (tips: readonly Tip[]) => tips.map((item) => item.id);

describe("matchRoute", () => {
  it("matches literal paths, ignoring a trailing slash and the query", () => {
    expect(matchRoute("/inicio", "/inicio")).toBe(true);
    expect(matchRoute("/inicio", "/inicio/")).toBe(true);
    expect(matchRoute("/inicio", "/inicio?mes=2026-09")).toBe(true);
    expect(matchRoute("/inicio", "/inicio/mais")).toBe(false);
    expect(matchRoute("/inicio", "/extrato")).toBe(false);
    expect(matchRoute("/", "/")).toBe(true);
    expect(matchRoute("/", "/inicio")).toBe(false);
  });

  it("takes one segment for :param and one or more for a final *", () => {
    expect(matchRoute("/planejar/metas/:id", "/planejar/metas/abc")).toBe(true);
    expect(matchRoute("/planejar/metas/:id", "/planejar/metas")).toBe(false);
    expect(matchRoute("/planejar/metas/:id", "/planejar/metas/a/b")).toBe(
      false,
    );
    expect(matchRoute("/relatorios/*", "/relatorios/fluxo")).toBe(true);
    expect(matchRoute("/relatorios/*", "/relatorios/a/b")).toBe(true);
    expect(matchRoute("/relatorios/*", "/relatorios")).toBe(false);
    expect(matchRoute("/relatorios/*", "/relatoriosx/a")).toBe(false);
  });
});

describe("meetsCondition", () => {
  it("requires every key that is set", () => {
    expect(meetsCondition(undefined, CONTEXT)).toBe(true);
    expect(meetsCondition({ hasAccounts: true }, CONTEXT)).toBe(true);
    expect(meetsCondition({ hasAccounts: false }, CONTEXT)).toBe(false);
    expect(
      meetsCondition({ hasAccounts: true, hasPasskey: true }, CONTEXT),
    ).toBe(false);
  });

  it("reads roles and feature flags once the context has them", () => {
    expect(meetsCondition({ roles: ["admin"] }, CONTEXT)).toBe(false);
    expect(
      meetsCondition({ roles: ["admin"] }, { ...CONTEXT, role: "user" }),
    ).toBe(false);
    expect(
      meetsCondition({ roles: ["admin"] }, { ...CONTEXT, role: "admin" }),
    ).toBe(true);
    expect(meetsCondition({ flag: "importar_extrato" }, CONTEXT)).toBe(false);
    expect(
      meetsCondition(
        { flag: "importar_extrato" },
        { ...CONTEXT, flags: ["importar_extrato"] },
      ),
    ).toBe(true);
  });
});

describe("isForAccount", () => {
  const news = tip({ id: "nova", kind: "novidade", since: "2026-10-16" });

  it("shows a novidade only to accounts created before its day", () => {
    expect(isForAccount(news, "2026-10-15")).toBe(true);
    expect(isForAccount(news, "2026-10-16")).toBe(false);
    expect(isForAccount(news, "2026-11-01")).toBe(false);
    expect(isForAccount(news, null)).toBe(false);
  });

  it("shows basics to every account", () => {
    expect(isForAccount(tip({ id: "basica" }), null)).toBe(true);
    expect(isForAccount(tip({ id: "basica" }), "2030-01-01")).toBe(true);
  });
});

describe("selectTips", () => {
  const fixture: Tip[] = [
    tip({ id: "c", order: 3 }),
    tip({ id: "a", order: 1 }),
    tip({ id: "b", order: 2 }),
    tip({ id: "d", order: 4 }),
    tip({ id: "outra-tela", routes: ["/extrato"] }),
    tip({ id: "sem-conta", order: 0, when: { hasAccounts: false } }),
    tip({
      id: "novidade",
      kind: "novidade",
      order: 0,
      since: "2026-10-16",
    }),
  ];

  it("orders basics before novidades and stops at three", () => {
    const old = state({ createdOn: "2026-01-01" });
    expect(ids(selectTips("/inicio", old, { tips: fixture }))).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(ids(selectTips("/inicio", old, { tips: fixture, max: 10 }))).toEqual(
      ["a", "b", "c", "d", "novidade"],
    );
  });

  it("leaves out seen tips, other screens and unmet conditions", () => {
    const seen = new Set(["a", "c"]);
    expect(
      ids(selectTips("/inicio", state({ seen }), { tips: fixture })),
    ).toEqual(["b", "d"]);
    expect(ids(selectTips("/extrato", state(), { tips: fixture }))).toEqual([
      "outra-tela",
    ]);
    expect(
      ids(
        selectTips(
          "/inicio",
          state({ context: { ...CONTEXT, hasAccounts: false } }),
          { tips: fixture, max: 1 },
        ),
      ),
    ).toEqual(["sem-conta"]);
  });

  it("shows novidades only to accounts that predate them", () => {
    const seen = new Set(["a", "b", "c", "d"]);
    expect(
      ids(selectTips("/inicio", state({ seen }), { tips: fixture })),
    ).toEqual([]);
    expect(
      ids(
        selectTips("/inicio", state({ seen, createdOn: "2026-10-15" }), {
          tips: fixture,
        }),
      ),
    ).toEqual(["novidade"]);
  });

  it("skips tips whose anchor is not on screen, keeping the order", () => {
    const visible = (anchor: string) => anchor !== "a";
    expect(
      ids(
        selectTips("/inicio", state(), { tips: fixture, isVisible: visible }),
      ),
    ).toEqual(["b", "c", "d"]);
  });

  it("shows nothing while tips are off", () => {
    expect(
      selectTips("/inicio", state({ off: true }), { tips: fixture }),
    ).toEqual([]);
  });

  it("lets a novidade stand in for the basics it replaces", () => {
    const tips = [
      tip({ id: "abas", routes: ["/relatorios/*"] }),
      tip({
        id: "novos",
        kind: "novidade",
        routes: ["/relatorios/*"],
        since: "2026-10-16",
        replaces: ["abas"],
      }),
    ];
    const newer = state({ createdOn: "2026-10-20" });
    const older = state({ createdOn: "2026-01-01" });
    expect(ids(selectTips("/relatorios/fluxo", newer, { tips }))).toEqual([
      "abas",
    ]);
    expect(ids(selectTips("/relatorios/fluxo", older, { tips }))).toEqual([
      "novos",
    ]);
    // Still replaced once the novidade is seen: the account knows the screen.
    expect(
      ids(
        selectTips(
          "/relatorios/fluxo",
          { ...older, seen: new Set(["novos"]) },
          { tips },
        ),
      ),
    ).toEqual([]);
  });

  it("never returns a seen, duplicated or unanchored tip, nor more than max", () => {
    fc.assert(
      fc.property(
        fc.subarray(TIPS.map((item) => item.id)),
        fc.constantFrom(
          "/inicio",
          "/extrato",
          "/planejar/metas",
          "/planejar/simulador",
          "/relatorios/fluxo",
          "/ajustes",
          "/contas",
        ),
        fc.boolean(),
        fc.boolean(),
        fc.constantFrom("2025-01-01", "2026-10-16", null),
        fc.integer({ min: 0, max: 5 }),
        (seenIds, path, hasAccounts, hasPasskey, createdOn, max) => {
          const result = selectTips(
            path,
            state({
              seen: new Set(seenIds),
              createdOn,
              context: { ...CONTEXT, hasAccounts, hasPasskey },
            }),
            { max },
          );
          expect(result.length).toBeLessThanOrEqual(max);
          expect(new Set(ids(result)).size).toBe(result.length);
          for (const item of result) {
            expect(seenIds).not.toContain(item.id);
            expect(item.anchor).not.toBeNull();
            expect(item.routes.some((route) => matchRoute(route, path))).toBe(
              true,
            );
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe("novidades feed", () => {
  const tips = [
    tip({ id: "basica" }),
    tip({
      id: "antiga",
      kind: "novidade",
      since: "2026-05-01",
      routes: [],
      anchor: null,
    }),
    tip({
      id: "recente",
      kind: "novidade",
      since: "2026-10-16",
      routes: [],
      anchor: null,
    }),
    tip({
      id: "so-admin",
      kind: "novidade",
      since: "2026-10-16",
      routes: [],
      anchor: null,
      when: { roles: ["admin"] },
    }),
  ];

  it("lists novidades newest first, unread only for older accounts", () => {
    const feed = newsFeed(
      { seen: new Set(), createdOn: "2026-06-01", context: CONTEXT },
      tips,
    );
    expect(feed.map((item) => [item.tip.id, item.unread])).toEqual([
      ["recente", true],
      ["antiga", false],
    ]);
  });

  it("counts what was not seen yet", () => {
    const old = { createdOn: "2026-01-01", context: CONTEXT };
    expect(unreadNewsIds({ ...old, seen: new Set() }, tips)).toEqual([
      "recente",
      "antiga",
    ]);
    expect(unreadNewsIds({ ...old, seen: new Set(["recente"]) }, tips)).toEqual(
      ["antiga"],
    );
    expect(
      unreadNewsIds(
        { ...old, seen: new Set(), context: { ...CONTEXT, role: "admin" } },
        tips,
      ),
    ).toEqual(["recente", "so-admin", "antiga"]);
  });

  it("covers the app's own novidades", () => {
    const old = { seen: new Set<string>(), createdOn: "2026-01-01" };
    const withImport: TipContext = { ...CONTEXT, flags: ["importar_extrato"] };
    const unread = unreadNewsIds({ ...old, context: withImport });
    expect(unread).toContain("novidade-relatorios");
    expect(unread).toContain("novidade-importar-extrato");
    // With importar_extrato off, the import is neither listed nor counted:
    // its link would lead to a page the person cannot open.
    expect(
      newsFeed({ ...old, context: CONTEXT }).map((item) => item.tip.id),
    ).not.toContain("novidade-importar-extrato");
    expect(unreadNewsIds({ ...old, context: CONTEXT })).not.toContain(
      "novidade-importar-extrato",
    );
    expect(
      unreadNewsIds({
        seen: new Set(),
        createdOn: "2026-10-17",
        context: withImport,
      }),
    ).toEqual([]);
  });
});
