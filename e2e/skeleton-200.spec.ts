import { expect, test } from "@playwright/test";
import { BIG_TEXT } from "./layout";

// Skeletons com a altura do conteúdo, a 200% de texto (doc 02 §5.17): o
// critério é o deslocamento de layout (CLS) medido no navegador, não o pixel.
// Celular de 360 px, texto a 200% e movimento reduzido.

test.use({ reducedMotion: "reduce" });

/** Teto de CLS aceito por tela (o Core Web Vitals "bom" é 0,1). */
const CEILING = 0.02;

const PAGES = [
  "/inicio",
  "/relatorios/visao-geral",
  "/extrato",
  "/planejar/orcamentos",
  "/contas",
  "/relatorios/fluxo",
] as const;

declare global {
  interface Window {
    __shifts?: { value: number; sources: string[] }[];
  }
}

for (const path of PAGES) {
  test(`${path}: skeleton a 200% não desloca o conteúdo`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.addInitScript(() => {
      window.__shifts = [];
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as unknown as {
          value: number;
          hadRecentInput: boolean;
          sources?: { node?: Node }[];
        }[]) {
          if (entry.hadRecentInput) continue;
          window.__shifts?.push({
            value: entry.value,
            sources: (entry.sources ?? []).map((source) => {
              const node = source.node as Element | undefined;
              return node
                ? `${node.nodeName.toLowerCase()}.${String(node.className).slice(0, 60)}`
                : "?";
            }),
          });
        }
      }).observe({ type: "layout-shift", buffered: true });
    });
    // 200% before the first paint, so the skeleton is drawn at its real size.
    await page.addInitScript((css) => {
      const style = document.createElement("style");
      style.textContent = css;
      const add = () => {
        if (!document.documentElement) return false;
        document.documentElement.append(style);
        return true;
      };
      if (add()) return;
      const observer = new MutationObserver(
        () => add() && observer.disconnect(),
      );
      observer.observe(document, { childList: true });
    }, BIG_TEXT);
    await page.goto(path);
    await expect(page.locator("html")).toHaveCSS("font-size", "32px");
    await expect(page.locator("[data-slot=skeleton]")).toHaveCount(0, {
      timeout: 30_000,
    });
    await page.waitForTimeout(800);
    const shifts = (await page.evaluate(() => window.__shifts)) ?? [];
    const total = shifts.reduce((sum, shift) => sum + shift.value, 0);
    expect(
      total,
      `${path}: deslocamento ${total.toFixed(4)} ${JSON.stringify(shifts)}`,
    ).toBeLessThanOrEqual(CEILING);
  });
}

// Per block of the Início: the skeleton of the page's first chunk, put where
// the loaded block is, has about the height of the block (within 15%).
const BLOCK_TOLERANCE = 0.15;

test("/inicio a 200%: cada skeleton tem a altura do bloco carregado", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 360, height: 800 });
  const response = await page.goto("/inicio");
  const source = await response?.text();
  if (!source) throw new Error("sem HTML");
  await page.addStyleTag({ content: BIG_TEXT });
  await expect(page.locator("[data-home-block=goals]").last()).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(1500);
  const heights = await page.evaluate((html) => {
    const shell = new DOMParser().parseFromString(html, "text/html");
    const out: Record<string, [number, number]> = {};
    for (const live of document.querySelectorAll<HTMLElement>(
      "[data-home-block]",
    )) {
      const id = live.dataset.homeBlock ?? "";
      const fallback = shell.querySelector(`[data-home-block="${id}"]`);
      if (!fallback?.querySelector("[data-slot=skeleton]")) continue;
      const clone = fallback.cloneNode(true) as HTMLElement;
      clone.removeAttribute("data-home-block");
      live.after(clone);
      out[id] = [
        clone.getBoundingClientRect().height,
        live.getBoundingClientRect().height,
      ];
      clone.remove();
    }
    return out;
  }, source);
  expect(Object.keys(heights).length).toBeGreaterThan(3);
  for (const [id, [skeleton, loaded]] of Object.entries(heights)) {
    // The skeleton is one bill; the demo shows two (the shift is accepted,
    // §5.17): only its height for one bill, 14.5rem a bill, is fixed here.
    if (id === "upcoming-bills") {
      expect(skeleton).toBeCloseTo(72 + 464, -1);
      continue;
    }
    expect(
      Math.abs(skeleton - loaded) / loaded,
      `${id}: skeleton ${Math.round(skeleton)} px, bloco ${Math.round(loaded)} px`,
    ).toBeLessThanOrEqual(BLOCK_TOLERANCE);
  }
});
