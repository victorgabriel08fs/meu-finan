import { expect, type Page } from "@playwright/test";

/**
 * The page does not scroll sideways. Compared with the width of the viewport
 * that was asked for (`page.viewportSize()`), not `window.innerWidth`: with
 * `isMobile` the browser widens `innerWidth` to fit the content, so
 * `scrollWidth <= innerWidth` holds even when the layout overflows.
 */
export async function expectNoHorizontalScroll(page: Page, where?: string) {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("expectNoHorizontalScroll needs a viewport");
  const scrollWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  expect(
    scrollWidth,
    `${where ?? "A página"} rola para o lado (${scrollWidth} px em ${viewport.width} px)`,
  ).toBeLessThanOrEqual(viewport.width);
}
