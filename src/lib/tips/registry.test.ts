import { describe, expect, it } from "vitest";
import {
  isTipId,
  MAX_TIPS_PER_SCREEN,
  NOVIDADE_IDS,
  TIP_FLAG_KEYS,
  TIP_IDS,
  TIPS,
  tipById,
} from "./registry";
import { matchRoute } from "./select";

const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** One concrete path per pattern, to find the tips that share a screen. */
const sample = (route: string) =>
  route.replace(/\/:[^/]+/g, "/x").replace(/\/\*$/, "/x");

describe("tips registry", () => {
  it("has unique, stable-looking ids", () => {
    expect(new Set(TIP_IDS).size).toBe(TIP_IDS.length);
    for (const id of TIP_IDS) expect(id).toMatch(KEBAB);
    expect(isTipId("inicio-lancamento-rapido")).toBe(true);
    expect(isTipId("*")).toBe(false);
    expect(isTipId(42)).toBe(false);
    expect(tipById("inicio-previsao")?.anchor).toBe("forecast");
  });

  it("dates every tip and keeps routes and anchors well formed", () => {
    for (const tip of TIPS) {
      expect(tip.since, tip.id).toMatch(ISO_DATE);
      for (const route of tip.routes) expect(route, tip.id).toMatch(/^\//);
      if (tip.anchor !== null) expect(tip.anchor, tip.id).toMatch(KEBAB);
      // A tip with a screen needs something to point at, and vice versa.
      expect(tip.routes.length > 0, tip.id).toBe(tip.anchor !== null);
      if (tip.kind === "primeiros-passos") {
        expect(tip.anchor, tip.id).not.toBeNull();
      }
    }
  });

  it("writes short copy in the app's voice", () => {
    for (const tip of TIPS) {
      expect(tip.title.length, tip.id).toBeLessThanOrEqual(32);
      for (const body of [tip.body, tip.desktopBody ?? ""]) {
        expect(body.length, tip.id).toBeLessThanOrEqual(150);
        expect(body.trim(), tip.id).toBe(body);
      }
      expect(tip.body, tip.id).toMatch(/[.!?]$/);
      // Plain words: no exclamation marks or emoji.
      expect(`${tip.title} ${tip.body}`, tip.id).not.toMatch(
        /!|\p{Emoji_Presentation}/u,
      );
    }
  });

  it("gives every novidade an icon and points replacements at basics", () => {
    for (const tip of TIPS) {
      if (tip.kind === "novidade") {
        expect(tip.icon, tip.id).toBeDefined();
        expect(NOVIDADE_IDS).toContain(tip.id);
      }
      for (const id of tip.replaces ?? []) {
        expect(tip.kind, tip.id).toBe("novidade");
        expect(tipById(id)?.kind, `${tip.id} → ${id}`).toBe("primeiros-passos");
      }
      if (tip.link) expect(tip.link.href, tip.id).toMatch(/^\//);
    }
  });

  it("keeps each screen within the sequence limit", () => {
    const paths = new Set(TIPS.flatMap((tip) => tip.routes.map(sample)));
    for (const path of paths) {
      const onScreen = TIPS.filter((tip) =>
        tip.routes.some((route) => matchRoute(route, path)),
      );
      expect(onScreen.length, path).toBeLessThanOrEqual(MAX_TIPS_PER_SCREEN);
    }
  });

  it("lists the feature flags tips depend on", () => {
    const used = TIPS.flatMap((tip) => (tip.when?.flag ? [tip.when.flag] : []));
    expect([...TIP_FLAG_KEYS].sort()).toEqual([...new Set(used)].sort());
  });
});
