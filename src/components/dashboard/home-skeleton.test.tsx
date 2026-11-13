import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { HOME_BLOCK_IDS } from "@/lib/home/blocks";
import { HomeBlockSkeleton } from "./dashboard-layout";

// Server Actions are not available outside Next (the header's bell, news dot and
// theme toggle, in the same module).
vi.mock("@/server/actions/preferences", () => ({ setThemeAction: vi.fn() }));
vi.mock("@/server/actions/notifications", () => ({
  markNotificationsReadAction: vi.fn(),
  dismissNotificationAction: vi.fn(),
  restoreNotificationAction: vi.fn(),
}));
vi.mock("@/server/actions/tips", () => ({
  markTipsSeenAction: vi.fn(),
  setTipsOffAction: vi.fn(),
  resetTipsAction: vi.fn(),
}));

const render = (id: (typeof HOME_BLOCK_IDS)[number]) =>
  renderToStaticMarkup(<HomeBlockSkeleton id={id} />);

const of = (
  id: (typeof HOME_BLOCK_IDS)[number],
  phase?: "past" | "current" | "future",
) => renderToStaticMarkup(<HomeBlockSkeleton id={id} phase={phase} />);

describe("HomeBlockSkeleton", () => {
  it("has a skeleton for every block but the highlight and Compartilhado", () => {
    for (const id of HOME_BLOCK_IDS) {
      expect(render(id) === "", id).toBe(id === "insight" || id === "shared");
    }
  });

  it("gives Contas, Metas and Próximas contas a header as tall as SectionHeader", () => {
    for (const id of ["accounts", "goals", "upcoming-bills"] as const) {
      // 24px line + 12px under it (36px), the bar centered in it.
      expect(render(id), id).toContain(
        '<div class="mb-3 flex h-6 items-center"><div',
      );
    }
    // 36 + 86 = 122px: the block with one bill (the usual case).
    expect(render("upcoming-bills")).toContain("h-21.5 rounded-card");
    // Another month: 10px less under the header, plus the caption line, 142px.
    for (const phase of ["past", "future"] as const) {
      const html = of("upcoming-bills", phase);
      expect(html).toContain('<div class="mb-0.5 flex h-6 items-center">');
      expect(html).toContain('<div class="mb-3 flex h-4.5 items-center">');
    }
    expect(render("upcoming-bills")).not.toContain("h-4.5");
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

  it("sizes the tiles, the budget and the reports by the month on screen", () => {
    // Where a phase measures like the current month it is the same markup.
    expect(of("month-totals", "future")).toBe(of("month-totals"));
    expect(of("income-expense", "future")).toBe(of("income-expense"));
    // A past month has no "até hoje" note: the tiles never wrap.
    expect(of("month-totals", "past")).not.toContain("@min-[23rem]");
    expect(
      of("month-totals", "past").split("h-32.5 rounded-card"),
    ).toHaveLength(3);
    // The budget's pace line breaks later without "N% do mês decorrido".
    expect(of("budget", "past")).toContain(
      "h-99.75 rounded-card @min-[24.5625rem]:h-94.75",
    );
    expect(of("budget", "future")).toContain(
      "h-99.75 rounded-card @min-[26.1875rem]:h-94.75",
    );
    // The ranking of a past month wraps its title later; a month ahead has
    // nothing paid, so it is the invite's size.
    expect(of("category-breakdown", "past")).toContain(
      "h-146.25 rounded-card @min-[19.5rem]:h-136.25",
    );
    expect(of("category-breakdown", "future")).toContain("h-40 rounded-card");
    expect(of("category-breakdown", "future")).toContain(
      "@min-[37.25rem]:h-18",
    );
    // No chart footnote in a past month.
    expect(of("income-expense", "past")).toContain("h-127.75 rounded-card");
    expect(of("income-expense", "past")).toContain("@min-[33.75rem]:h-106.75");
    for (const id of [
      "budget",
      "category-breakdown",
      "income-expense",
    ] as const) {
      expect(of(id, "past"), id).toMatch(/^<div class="@container">/);
      expect(of(id, "future"), id).toMatch(/^<div class="@container">/);
    }
  });

  it("leaves the other blocks alike in every phase", () => {
    const changing = [
      "cash-flow",
      "month-totals",
      "budget",
      "category-breakdown",
      "income-expense",
      "upcoming-bills",
    ];
    for (const id of HOME_BLOCK_IDS.filter((id) => !changing.includes(id))) {
      const html = render(id);
      for (const phase of ["past", "future"] as const) {
        expect(of(id, phase), `${id} ${phase}`).toBe(html);
      }
    }
  });

  it("measures the narrow blocks of the reports by their own width", () => {
    for (const [id, heights] of [
      ["category-breakdown", "h-146.25 rounded-card @xs:h-136.25"],
      [
        "income-expense",
        "h-132.25 rounded-card @xs:h-117.75 @min-[22.25rem]:h-112.25 @min-[33.75rem]:h-106.75",
      ],
      ["net-worth", "h-51.25 rounded-card @min-[21.75rem]:h-46.75"],
      [
        "daily-spend",
        "h-65.5 rounded-card @min-[19rem]:h-61 @min-[21rem]:h-55.5 @min-[31.25rem]:h-51",
      ],
      [
        "top-expenses",
        "h-75.5 rounded-card @min-[19.125rem]:h-73 @min-[20rem]:h-67.5",
      ],
    ] as const) {
      const html = render(id);
      expect(html, id).toMatch(/^<div class="@container">/);
      expect(html, id).toContain(heights);
    }
  });
});

describe("HomeBlockSkeleton of Quanto dá para gastar por dia", () => {
  const of = (dailySpend?: {
    lines: number;
    benefitLines?: number;
    chooser: boolean;
  }) =>
    renderToStaticMarkup(
      <HomeBlockSkeleton id="daily-spend" dailySpend={dailySpend} />,
    );

  it("keeps its height with one account (no lines, no button)", () => {
    expect(of({ lines: 0, chooser: false })).toBe(of());
  });

  it("grows by the button with lines all hidden", () => {
    const html = of({ lines: 0, chooser: true });
    // 44px button + 12px gap = 3.5rem.
    expect(html).toContain("--daily-spend-extra:3.5rem");
    expect(html).toContain(
      "h-[calc(16.375rem+var(--daily-spend-extra))] rounded-card",
    );
  });

  it("grows by each line, the button and the longer footnote", () => {
    const html = of({ lines: 3, chooser: true });
    // 29 + 3 × 42 + 56 = 211px.
    expect(html).toContain(`--daily-spend-extra:${211 / 16}rem`);
    expect(html).toContain(
      "h-[calc(18.625rem+var(--daily-spend-extra))] rounded-card",
    );
    expect(html).toContain(
      "@min-[57rem]:h-[calc(12.75rem+var(--daily-spend-extra))]",
    );
    expect(html).toMatch(/^<div class="@container">/);
  });

  it("adds the benefícios' section, after the accounts' or alone", () => {
    // 29 + 3 × 42 + 33 + 56 = 244px.
    const after = of({ lines: 2, benefitLines: 1, chooser: true });
    expect(after).toContain(`--daily-spend-extra:${244 / 16}rem`);
    // 29 + 42 + 22 + 56 = 149px.
    const alone = of({ lines: 0, benefitLines: 1, chooser: true });
    expect(alone).toContain(`--daily-spend-extra:${149 / 16}rem`);
    for (const html of [after, alone]) {
      expect(html).toMatch(/^<div class="@container">/);
      expect(html).toContain(
        "h-[calc(14.125rem+var(--daily-spend-extra)+var(--daily-spend-foot))] rounded-card",
      );
      expect(html).toContain(
        "@min-[21rem]:h-[calc(11.625rem+var(--daily-spend-extra)+var(--daily-spend-foot))]",
      );
    }
  });

  it("gives each footnote its own lines", () => {
    // Alone, one benefício: three lines, two from 22.6875rem, one from 42.125rem.
    expect(of({ lines: 0, benefitLines: 1, chooser: true })).toContain(
      "[--daily-spend-foot:3.375rem] @min-[22.6875rem]:[--daily-spend-foot:2.25rem] @min-[42.125rem]:[--daily-spend-foot:1.125rem]",
    );
    expect(of({ lines: 0, benefitLines: 2, chooser: true })).toContain(
      "[--daily-spend-foot:4.5rem] @min-[17.3125rem]:",
    );
    expect(of({ lines: 2, benefitLines: 1, chooser: true })).toContain(
      "@min-[69.1875rem]:[--daily-spend-foot:1.125rem]",
    );
    expect(of({ lines: 2, benefitLines: 2, chooser: true })).toContain(
      "@min-[70.75rem]:[--daily-spend-foot:1.125rem]",
    );
  });

  it("keeps the old shapes when the benefícios are hidden", () => {
    expect(of({ lines: 3, benefitLines: 0, chooser: true })).toBe(
      of({ lines: 3, chooser: true }),
    );
    expect(of({ lines: 0, benefitLines: 0, chooser: false })).toBe(of());
  });
});
