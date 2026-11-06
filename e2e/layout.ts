import { expect, type Page } from "@playwright/test";

/** Text at 200% (the browser's own setting), as a person with low vision. */
export const BIG_TEXT = "html { font-size: 200% }";

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

/**
 * Values (`[data-slot=money]`) that spill out of their card, or out of the
 * screen when they are not inside a sideways scroller (a carousel card is
 * meant to be partly off screen). Each entry reads "value (left–right)".
 */
export async function clippedValues(page: Page): Promise<string[]> {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("clippedValues needs a viewport");
  return page.evaluate((viewportWidth) => {
    const inSideScroller = (element: Element) => {
      for (
        let parent = element.parentElement;
        parent && parent !== document.body;
        parent = parent.parentElement
      ) {
        if (/(auto|scroll)/.test(getComputedStyle(parent).overflowX)) {
          return true;
        }
      }
      return false;
    };
    const bad: string[] = [];
    for (const money of document.querySelectorAll<HTMLElement>(
      '[data-slot="money"]',
    )) {
      if (!money.checkVisibility()) continue;
      const rect = money.getBoundingClientRect();
      const card =
        money.closest("section, li, a, [data-slot=card], .rounded-card") ??
        money.parentElement;
      const box = card?.getBoundingClientRect();
      const outOfCard =
        box !== undefined &&
        (rect.right > box.right + 1 || rect.left < box.left - 1);
      const outOfScreen =
        !inSideScroller(money) && (rect.right > viewportWidth || rect.left < 0);
      if (outOfCard || outOfScreen) {
        bad.push(
          `${money.textContent?.trim()} (${Math.round(rect.left)}–${Math.round(rect.right)})`,
        );
      }
    }
    return bad;
  }, viewport.width);
}

/** Words of a row that end up under its switch (the switch hides them). */
export async function textUnderSwitches(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const bad: string[] = [];
    for (const toggle of document.querySelectorAll('[role="switch"]')) {
      const box = toggle.getBoundingClientRect();
      const row = toggle.parentElement;
      if (!row || box.width === 0) continue;
      const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent?.trim();
        if (!text || toggle.contains(node)) continue;
        if (node.parentElement?.closest(".sr-only")) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) {
          if (
            rect.right > box.left + 1 &&
            rect.left < box.right &&
            rect.bottom > box.top &&
            rect.top < box.bottom
          ) {
            bad.push(`"${text.slice(0, 40)}" sob o interruptor`);
            break;
          }
        }
      }
    }
    return bad;
  });
}
