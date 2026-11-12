import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  defaultHomeLayout,
  packHomeLayout,
  visibleHomeBlocks,
} from "@/lib/home/layout";
import { HomeGrid } from "./dashboard-layout";

// Server Actions are not available outside Next (the header's bell, news dot and
// theme toggle).
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

const blocksIn = (html: string) =>
  [...html.matchAll(/data-home-block="([a-z-]+)"/g)].map((match) => match[1]);

describe("HomeGrid", () => {
  it("lays the default Início out in its three columns, in order", () => {
    const html = renderToStaticMarkup(
      <HomeGrid
        sections={packHomeLayout(visibleHomeBlocks(defaultHomeLayout()))}
        renderBlock={(id) => <p>{id}</p>}
      />,
    );
    expect(blocksIn(html)).toEqual([
      "balance",
      "month-totals",
      "budget",
      "upcoming-bills",
      "accounts",
      "goals",
      "insight",
    ]);
    // The first column spans the width at md, over the other two.
    expect(html.match(/md:basis-full xl:basis-0 xl:grow/g)).toHaveLength(1);
    expect(html.match(/md:flex-1/g)).toHaveLength(2);
    // The tiles sit 12px under the Saldo.
    expect(html).toMatch(/data-home-block="month-totals" class="[^"]*-mt-4/);
  });

  it("gives a wide block a row of its own, sized by its container", () => {
    const html = renderToStaticMarkup(
      <HomeGrid
        sections={packHomeLayout([
          "balance",
          "goals",
          "spending-calendar",
          "accounts",
        ])}
        renderBlock={(id) => <p>{id}</p>}
      />,
    );
    expect(blocksIn(html)).toEqual([
      "balance",
      "goals",
      "spending-calendar",
      "accounts",
    ]);
    expect(html).toMatch(
      /<\/div><\/div><div data-home-block="spending-calendar" class="[^"]*@container/,
    );
  });

  it("puts the Saldo beside a wide block right after it, from xl", () => {
    const html = renderToStaticMarkup(
      <HomeGrid
        sections={packHomeLayout(["balance", "spending-calendar", "goals"])}
        renderBlock={(id) => <p>{id}</p>}
      />,
    );
    expect(blocksIn(html)).toEqual(["balance", "spending-calendar", "goals"]);
    expect(html).toMatch(
      /<div class="flex flex-col gap-7 xl:grid xl:grid-cols-3 xl:items-start"><div data-home-block="balance"[^>]*>.*?<\/div><div data-home-block="spending-calendar" class="[^"]*@container xl:col-span-2/,
    );
  });

  it("hides a block, a column or a row that renders nothing", () => {
    const html = renderToStaticMarkup(
      <HomeGrid
        sections={packHomeLayout(["balance", "insight"])}
        renderBlock={(id) => (id === "insight" ? null : <p>{id}</p>)}
      />,
    );
    expect(html).toContain("not-has-[&gt;:not(template)]:hidden");
    expect(html).toContain(
      "not-has-[&gt;[data-home-block]&gt;:not(template)]:hidden",
    );
    expect(html).toContain(
      "not-has-[&gt;div&gt;[data-home-block]&gt;:not(template)]:hidden",
    );
  });
});
