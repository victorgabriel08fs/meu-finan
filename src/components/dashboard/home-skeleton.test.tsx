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

  it("measures the tiles and the budget by the block's width, not the screen's", () => {
    for (const id of ["month-totals", "budget"] as const) {
      const html = render(id);
      expect(html, id).toMatch(/^<div class="@container">/);
      expect(html, id).not.toContain("min-[26.25rem]");
      expect(html, id).not.toContain("xl:");
    }
    // Measured: the tiles wrap under 23rem (357px yes, 368px no), the budget
    // under 21rem (328px yes, 342px no).
    expect(
      render("month-totals").split("h-37 rounded-card @min-[23rem]:h-32.5"),
    ).toHaveLength(3);
    expect(render("budget")).toContain(
      "h-99.75 rounded-card @min-[21rem]:h-94.75",
    );
  });

  it("sizes the Fluxo de caixa by its slot and by the month on screen", () => {
    const of = (phase?: "past" | "current" | "future") =>
      renderToStaticMarkup(<HomeBlockSkeleton id="cash-flow" phase={phase} />);
    // The slot of a wide block is the @container (HomeGrid).
    expect(of()).not.toContain("@container");
    // Measured: the chart over the lowest balance, or beside it from @2xl.
    expect(of()).toContain("h-137.25 rounded-card @2xl:h-110.25");
    expect(of("current")).toBe(of());
    // No "Previsto" key in a past month.
    expect(of("past")).toContain("h-129.75 rounded-card @2xl:h-102.75");
    // A month ahead: the footnote in three, two or one line.
    expect(of("future")).toContain(
      "h-146.25 rounded-card @sm:h-141.75 @min-[27.5rem]:h-137.25 @2xl:h-110.25",
    );
  });

  it("leaves the other blocks alike in every phase", () => {
    for (const id of HOME_BLOCK_IDS.filter((id) => id !== "cash-flow")) {
      const html = render(id);
      for (const phase of ["past", "future"] as const) {
        expect(
          renderToStaticMarkup(<HomeBlockSkeleton id={id} phase={phase} />),
          `${id} ${phase}`,
        ).toBe(html);
      }
    }
  });

  it("measures the narrow blocks of the reports by their own width", () => {
    for (const [id, heights] of [
      ["category-breakdown", "h-146.25 rounded-card @xs:h-136.25"],
      [
        "income-expense",
        "h-131.25 rounded-card @xs:h-116.75 @min-[22.25rem]:h-111.25 @lg:h-105.75",
      ],
    ] as const) {
      const html = render(id);
      expect(html, id).toMatch(/^<div class="@container">/);
      expect(html, id).toContain(heights);
    }
  });
});
