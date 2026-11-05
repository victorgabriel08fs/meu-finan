import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { HOME_BLOCK_IDS } from "@/lib/home/blocks";
import { HomeBlockSkeleton } from "./dashboard-layout";

// Server Actions are not available outside Next (the header's news dot and
// theme toggle, in the same module).
vi.mock("@/server/actions/preferences", () => ({ setThemeAction: vi.fn() }));
vi.mock("@/server/actions/tips", () => ({
  markTipsSeenAction: vi.fn(),
  setTipsOffAction: vi.fn(),
  resetTipsAction: vi.fn(),
}));

const render = (id: (typeof HOME_BLOCK_IDS)[number]) =>
  renderToStaticMarkup(<HomeBlockSkeleton id={id} />);

describe("HomeBlockSkeleton", () => {
  it("has a skeleton for every block but the highlight", () => {
    for (const id of HOME_BLOCK_IDS) {
      expect(render(id) === "", id).toBe(id === "insight");
    }
  });

  it("gives Contas, Metas and Próximas contas a header as tall as SectionHeader", () => {
    for (const id of ["accounts", "goals", "upcoming-bills"] as const) {
      // 24px line + 12px under it (36px), the bar centered in it.
      expect(render(id), id).toContain(
        '<div class="mb-3 flex h-6 items-center"><div',
      );
    }
    // 36 + 216 = 252px, the block's measured height.
    expect(render("upcoming-bills")).toContain("h-54 rounded-card");
  });
});
