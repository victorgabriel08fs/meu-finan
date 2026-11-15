import { expect, type Locator, type Page, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";
import { BIG_TEXT, expectNoHorizontalScroll } from "./layout";
import { chooseTheme } from "./theme";

// Nova transação com o teclado (task 23; doc 02 §5.14, §6.5, §7.4): Tipo e
// Valor nunca ficam atrás do teclado próprio nem do teclado do sistema.
// Chromium não tem teclado virtual: o do iOS (layout que não encolhe, só o
// `visualViewport`) é simulado por um `visualViewport` falso; o do Android
// (`resizes-content`) por um viewport mais baixo. Aparelho real não testado.

const SIZES = [
  { width: 360, height: 560 },
  { width: 360, height: 640 },
  { width: 430, height: 932 },
] as const;
const KEYBOARD = 300;
/** Distance a focused field keeps above the system keyboard (doc 02 §7.4). */
const GAP = 24;

declare global {
  interface Window {
    __keyboard?: (px: number) => void;
  }
}

/** Replaces `window.visualViewport` by one the test moves (iOS keyboard). */
async function fakeIosKeyboard(page: Page) {
  await page.addInitScript(() => {
    const target = new EventTarget();
    let covered = 0;
    const fake = Object.defineProperties(target, {
      offsetLeft: { value: 0 },
      offsetTop: { value: 0 },
      pageLeft: { value: 0 },
      pageTop: { value: 0 },
      scale: { value: 1 },
      width: { get: () => document.documentElement.clientWidth },
      height: {
        get: () => document.documentElement.clientHeight - covered,
      },
    });
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      get: () => fake,
    });
    window.__keyboard = (px: number) => {
      covered = px;
      target.dispatchEvent(new Event("resize"));
    };
  });
}

async function setIosKeyboard(page: Page, px: number) {
  await page.evaluate((value) => window.__keyboard?.(value), px);
  await page.waitForTimeout(500);
}

/** The element is on screen and nothing else is drawn over it. */
async function expectUnobstructed(
  locator: Locator,
  what: string,
  visibleHeight: number,
) {
  const result = await locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const points = [
      [box.left + box.width / 2, box.top + box.height / 2],
      [box.left + box.width / 2, box.top + 6],
      [box.left + box.width / 2, box.bottom - 6],
    ];
    const covered = points.some(([x, y]) => {
      const hit = document.elementFromPoint(x, y);
      // A toast floats over the page on purpose (and goes away by itself).
      if (hit?.closest("[data-sonner-toast]")) return false;
      return !hit || !(element === hit || element.contains(hit));
    });
    return { top: box.top, bottom: box.bottom, covered };
  });
  expect(result.top, `${what} começa acima da tela`).toBeGreaterThanOrEqual(-1);
  expect(
    result.bottom,
    `${what} termina abaixo da área visível (${visibleHeight} px)`,
  ).toBeLessThanOrEqual(visibleHeight + 1);
  expect(result.covered, `${what} está coberto por outro elemento`).toBe(false);
}

async function openSheet(page: Page) {
  await page.goto("/inicio");
  await page.getByRole("button", { name: "Nova transação" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Nova transação" });
  await expect(sheet).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(600);
  return sheet;
}

async function visibleHeight(page: Page, keyboard = 0) {
  const size = page.viewportSize();
  if (!size) throw new Error("sem viewport");
  return size.height - keyboard;
}

async function expectTypeAndAmount(
  sheet: Locator,
  page: Page,
  where: string,
  keyboard = 0,
) {
  const height = await visibleHeight(page, keyboard);
  await expectUnobstructed(
    sheet.getByRole("radiogroup", { name: "Tipo de lançamento" }),
    `Tipo (${where})`,
    height,
  );
  await expectUnobstructed(
    sheet.getByRole("textbox", { name: "Valor" }),
    `Valor (${where})`,
    height,
  );
}

for (const size of SIZES) {
  for (const bigText of [false, true]) {
    const scale = bigText ? "200%" : "100%";
    test(`${size.width}x${size.height}, texto ${scale}: tipo e valor ficam à vista`, async ({
      page,
    }) => {
      test.setTimeout(180_000);
      await page.setViewportSize(size);
      await fakeIosKeyboard(page);
      await page.goto("/inicio");
      if (bigText) await page.addStyleTag({ content: BIG_TEXT });
      await page
        .getByRole("button", { name: "Nova transação" })
        .first()
        .click();
      const sheet = page.getByRole("dialog", { name: "Nova transação" });
      await expect(sheet).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(600);

      // 1. Opening: scrolled to the top, type and amount over the keypad.
      // At 100% the sheet opens at the top; at 200% it may open scrolled so
      // that type and amount come into view (checked right below).
      if (!bigText) {
        expect(
          await sheet
            .locator("[data-slot=sheet-panel]")
            .evaluate((panel) => panel.scrollTop),
        ).toBe(0);
      }
      await expectTypeAndAmount(sheet, page, "ao abrir");
      const keypad = sheet.getByRole("group", { name: "Teclado numérico" });
      await expect(keypad).toBeVisible();
      const amount = await sheet
        .getByRole("textbox", { name: "Valor" })
        .boundingBox();
      const keys = await keypad.boundingBox();
      if (!amount || !keys) throw new Error("sem medidas");
      expect(amount.y + amount.height).toBeLessThanOrEqual(keys.y + 1);
      await expectNoHorizontalScroll(page, `Nova transação ${scale}`);

      // 2. After "Preencher" the success line grows the form: still in view.
      // (At 200% the text field has its own test below; here the keys type.)
      if (bigText) {
        for (const key of ["1", "2"]) {
          // dispatchEvent: a real click would scroll the sheet to the key.
          await keypad
            .getByRole("button", { name: key, exact: true })
            .dispatchEvent("click");
        }
      } else {
        const field = sheet.getByLabel("Escrever o lançamento");
        await field.fill("café 12 na conta principal ontem");
        await sheet.getByRole("button", { name: "Preencher" }).click();
        await expect(sheet.getByText(/^Preenchido: valor/)).toBeVisible({
          timeout: 30_000,
        });
      }
      await page.waitForTimeout(500);
      await expectTypeAndAmount(sheet, page, "com o valor preenchido");

      // 3. System keyboard on the description (iOS), then back to the amount.
      const description = sheet.getByPlaceholder("Descrição (opcional)");
      await description.click();
      await setIosKeyboard(page, KEYBOARD);
      const below = await visibleHeight(page, KEYBOARD);
      // At 200% on a short screen the area above the keyboard (260-340 px) is
      // smaller than header + footer of the sheet: nothing to assert there.
      if (!bigText || below >= 400) {
        await expectUnobstructed(
          description,
          "Descrição com o teclado",
          below - GAP,
        );
      }
      await sheet.getByRole("textbox", { name: "Valor" }).click();
      await setIosKeyboard(page, 0);
      await page.waitForTimeout(400);
      await expectTypeAndAmount(sheet, page, "depois do teclado do sistema");

      // 4. Save and keep adding: the amount is in view again.
      await sheet.getByLabel("Adicionar outra em seguida").check();
      const save = sheet.getByRole("button", { name: "Salvar despesa" });
      await save.scrollIntoViewIfNeeded();
      await save.click();
      await expect(page.getByText("Despesa de R$ 12,00 salva")).toBeVisible({
        timeout: 15_000,
      });
      await page.waitForTimeout(600);
      await expect(sheet).toBeVisible();
      await expectTypeAndAmount(
        sheet,
        page,
        "depois de salvar e adicionar outra",
      );
    });
  }
}

test("rascunho restaurado: tipo e valor seguem à vista a 360x560", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 360, height: 560 });
  let sheet = await openSheet(page);
  await sheet.getByRole("button", { name: "7", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  sheet = await (async () => {
    await page.getByRole("button", { name: "Nova transação" }).first().click();
    const again = page.getByRole("dialog", { name: "Nova transação" });
    await expect(again).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(600);
    return again;
  })();
  await expect(sheet.getByText("Rascunho restaurado")).toBeVisible();
  await expectTypeAndAmount(sheet, page, "com o rascunho restaurado");
  await sheet.getByRole("button", { name: "Limpar" }).click();
  await page.waitForTimeout(400);
  await expectTypeAndAmount(sheet, page, "depois de Limpar");
});

for (const width of [360, 430]) {
  test(`o campo de texto tem largura útil a 200%, a ${width} px`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 780 });
    await page.goto("/inicio");
    await page.addStyleTag({ content: BIG_TEXT });
    await page.getByRole("button", { name: "Nova transação" }).first().click();
    const sheet = page.getByRole("dialog", { name: "Nova transação" });
    await expect(sheet).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(600);
    const box = await sheet.getByLabel("Escrever o lançamento").boundingBox();
    expect(box?.width ?? 0, "largura do campo de texto").toBeGreaterThan(80);
  });
}

test("Android: com o viewport mais baixo, a Descrição fica acima do teclado", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 360, height: 780 });
  const sheet = await openSheet(page);
  const description = sheet.getByPlaceholder("Descrição (opcional)");
  await description.click();
  await page.setViewportSize({ width: 360, height: 780 - KEYBOARD });
  await page.waitForTimeout(500);
  await expectUnobstructed(
    description,
    "Descrição no Android",
    780 - KEYBOARD - GAP,
  );
  await sheet.getByRole("textbox", { name: "Valor" }).click();
  await page.setViewportSize({ width: 360, height: 780 });
  await page.waitForTimeout(500);
  await expectTypeAndAmount(sheet, page, "Android, teclado de volta");
});

test("o teclado próprio fica no rodapé quando cabe e logo abaixo do valor quando não cabe", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const where = async (
    size: { width: number; height: number },
    big = false,
  ) => {
    await page.setViewportSize(size);
    await page.goto("/inicio");
    if (big) await page.addStyleTag({ content: BIG_TEXT });
    await page.getByRole("button", { name: "Nova transação" }).first().click();
    const sheet = page.getByRole("dialog", { name: "Nova transação" });
    await expect(sheet).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(600);
    return sheet;
  };

  let sheet = await where({ width: 430, height: 932 });
  await expect(
    sheet.locator("[data-slot=sheet-footer]").getByRole("group", {
      name: "Teclado numérico",
    }),
  ).toBeVisible();

  for (const [size, big] of [
    [{ width: 360, height: 560 }, false],
    [{ width: 360, height: 780 }, true],
  ] as const) {
    sheet = await where(size, big);
    await expect(
      sheet.locator("[data-slot=sheet-top]").getByRole("group", {
        name: "Teclado numérico",
      }),
    ).toBeVisible();
    await sheet
      .getByRole("group", { name: "Teclado numérico" })
      .getByRole("button", { name: "1", exact: true })
      .click();
    // "Salvar" is reachable (scrolling the sheet when needed).
    const save = sheet.getByRole("button", { name: "Salvar despesa" });
    await save.scrollIntoViewIfNeeded();
    await save.click({ trial: true });
  }
});

test("outra folha no iOS: a folha sobe com o teclado e volta ao fundo sem ele", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 360, height: 780 });
  await fakeIosKeyboard(page);
  await page.goto("/ajustes/etiquetas");
  await page.getByRole("button", { name: "Nova etiqueta" }).click();
  const sheet = page.getByRole("dialog", { name: "Nova etiqueta" });
  await expect(sheet).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(600);
  const bottom = () =>
    sheet.evaluate((element) => element.getBoundingClientRect().bottom);

  const name = sheet.getByLabel("Nome");
  await name.click();
  await setIosKeyboard(page, KEYBOARD);
  expect(Math.abs((await bottom()) - (780 - KEYBOARD))).toBeLessThanOrEqual(1);
  await expectUnobstructed(name, "Nome com o teclado", 780 - KEYBOARD - GAP);

  await setIosKeyboard(page, 0);
  expect(Math.abs((await bottom()) - 780)).toBeLessThanOrEqual(1);
});

for (const theme of ["Escuro", "Claro"] as const) {
  test(`Nova transação a 200%, tema ${theme}: sem violações nem rolagem lateral`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await chooseTheme(page, theme);
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/inicio");
    await page.addStyleTag({ content: BIG_TEXT });
    await page.getByRole("button", { name: "Nova transação" }).first().click();
    const sheet = page.getByRole("dialog", { name: "Nova transação" });
    await expect(sheet).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(600);
    await expectNoHorizontalScroll(page, `Nova transação, ${theme}`);
    await expectNoA11yViolations(page);
  });
}
