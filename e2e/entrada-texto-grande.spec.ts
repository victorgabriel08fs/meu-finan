import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";
import { BIG_TEXT, expectNoHorizontalScroll } from "./layout";

// Telas de entrada com texto grande (doc 02 §6.1): o texto é em rem e cresce
// com o ajuste do navegador; nada rola para o lado e o botão segue alcançável.

test.use({
  storageState: { cookies: [], origins: [] },
  reducedMotion: "reduce",
});

const PAGES = [
  "/entrar",
  "/primeiro-acesso",
  "/recuperar",
  "/convite/token-invalido",
];

for (const width of [360, 430]) {
  for (const path of PAGES) {
    test(`${path} a ${width} px: 100% e 200%`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width, height: 800 });
      await page.goto(path);
      const h1 = page.getByRole("heading", { level: 1 });
      await expect(h1).toBeVisible();
      const small = Number.parseFloat(
        await h1.evaluate((e) => getComputedStyle(e).fontSize),
      );
      await page.addStyleTag({ content: BIG_TEXT });
      const big = Number.parseFloat(
        await h1.evaluate((e) => getComputedStyle(e).fontSize),
      );
      expect(big).toBeGreaterThanOrEqual(small * 1.9);
      await expectNoHorizontalScroll(page, path);
      const button = page
        .locator("main button[type=submit], main a[href]")
        .first();
      if (await button.count()) {
        await button.scrollIntoViewIfNeeded();
        const box = await button.boundingBox();
        if (box) expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
      }
      const fields = await page
        .locator("main input:visible, main label:visible")
        .evaluateAll((els) =>
          els.map((e) => e.getBoundingClientRect().toJSON()),
        );
      void fields;
    });
  }
}

test("telas de entrada a 200% sem violações, nos dois temas", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 360, height: 800 });
  for (const theme of ["dark", "light"]) {
    await page.addInitScript((value) => {
      localStorage.setItem("theme", value);
    }, theme);
    for (const path of PAGES) {
      await page.goto(path);
      await page.addStyleTag({ content: BIG_TEXT });
      await expectNoA11yViolations(page);
    }
  }
});
