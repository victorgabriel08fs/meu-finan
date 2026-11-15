import { expect, type Page, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";
import { expectNoHorizontalScroll } from "./layout";
import { chooseTheme } from "./theme";

// Retrospectiva do mês (doc 02 §6.12): a sequência em tela cheia que conta o
// mês que fechou. Roda como Ana, cujo demo tem sobra a guardar e caixinha.
// Nada é gravado: "Guardar a sobra" só abre a Nova transação.

test.describe.configure({ mode: "serial" });

const part = (page: Page) => page.getByRole("group", { name: /^\d+ de \d+: / });

async function openRecap(page: Page, query = "") {
  await page.goto(`/retrospectiva${query}`);
  await expect(part(page)).toBeVisible({ timeout: 30_000 });
}

/** "2 de 8: Entrou e saiu" → { index: 2, total: 8 }. */
async function position(page: Page) {
  const label = (await part(page).getAttribute("aria-label")) ?? "";
  const [, index, total] = label.match(/^(\d+) de (\d+)/) ?? [];
  return { index: Number(index), total: Number(total) };
}

async function goToPart(page: Page, id: string) {
  const target = page.locator(`[data-slide="${id}"]`);
  for (let i = 0; i < 12 && !(await target.isVisible()); i++) {
    await page.getByRole("button", { name: "Próximo", exact: true }).click();
    await page.waitForTimeout(350);
  }
  await expect(target).toBeVisible();
}

test("abre na primeira parte, com título, e avança com o Próximo até o fim", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openRecap(page);
  await expect(page.locator('[data-slide="intro"]')).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /^Retrospectiva · /, level: 1 }),
  ).toBeAttached();
  await expect(
    page.getByRole("heading", { name: /fechou$/, level: 2 }),
  ).toBeVisible();
  const { total } = await position(page);
  expect(total).toBeGreaterThanOrEqual(4);
  // "Voltar" is hidden on the first part.
  await expect(page.getByRole("button", { name: "Voltar" })).toBeHidden();

  for (let step = 2; step <= total; step++) {
    await page.getByRole("button", { name: "Próximo", exact: true }).click();
    await expect(part(page)).toHaveAttribute(
      "aria-label",
      new RegExp(`^${step} de ${total}: `),
    );
    // The focus follows the title of the new part.
    await expect(page.locator("[data-recap-title]").first()).toBeFocused();
  }
  // The last part has no "Próximo": the closing actions take its place.
  await expect(page.locator('[data-slide="outro"]')).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Próximo", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Ver o fechamento completo" }),
  ).toHaveAttribute("href", /\/relatorios\/fechamento\?mes=\d{4}-\d{2}$/);
});

test("setas, Home e End percorrem as partes, e Esc fecha para o Fechamento", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openRecap(page);
  const { total } = await position(page);
  await page.keyboard.press("ArrowRight");
  await expect(part(page)).toHaveAttribute("aria-label", /^2 de /);
  await page.keyboard.press("ArrowRight");
  await expect(part(page)).toHaveAttribute("aria-label", /^3 de /);
  await page.keyboard.press("ArrowLeft");
  await expect(part(page)).toHaveAttribute("aria-label", /^2 de /);
  await page.keyboard.press("End");
  await expect(part(page)).toHaveAttribute(
    "aria-label",
    new RegExp(`^${total} de `),
  );
  await page.keyboard.press("Home");
  await expect(part(page)).toHaveAttribute("aria-label", /^1 de /);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/relatorios\/fechamento\?mes=\d{4}-\d{2}$/);
});

test("o Ver o fechamento completo leva ao Fechamento do mesmo mês", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openRecap(page);
  const month = new URL(page.url()).searchParams.get("mes");
  await page.keyboard.press("End");
  await page.getByRole("link", { name: "Ver o fechamento completo" }).click();
  await expect(page).toHaveURL(/\/relatorios\/fechamento\?mes=\d{4}-\d{2}$/);
  if (month) expect(page.url()).toContain(`mes=${month}`);
});

test("Guardar a sobra abre a transferência para a caixinha, preenchida", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openRecap(page);
  await page.keyboard.press("End");
  await page.getByRole("button", { name: "Guardar a sobra" }).click();
  const sheet = page.getByRole("dialog", { name: "Nova transação" });
  await expect(sheet).toBeVisible({ timeout: 30_000 });
  await expect(
    sheet.getByRole("radio", { name: "Transferência" }),
  ).toBeChecked();
  await expect(sheet.locator('input[value="Sobra de outubro"]')).toBeVisible();
  // With the sheet open the keys belong to it, not to the player.
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/retrospectiva/);
});

test("com movimento reduzido, o valor que sobrou aparece inteiro de uma vez", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openRecap(page);
  await goToPart(page, "left");
  const left = page.locator('[data-slide="left"]');
  // The spoken amount is the final one; the drawn one must match at once.
  const spoken = (await left.locator(".sr-only").first().textContent()) ?? "";
  expect(spoken).toMatch(/reais/);
  const drawn = left.locator("[data-privacy-value] [aria-hidden]").first();
  await expect(drawn).toContainText(/R\$\s?[0-9.]+,[0-9]{2}/);
  const text = (await drawn.textContent()) ?? "";
  // "5.445 reais e 22 centavos" and "R$ 5.445,22" are the same 544522.
  const cents = (value: string) => {
    const [reais = "0", centavos = "0"] = value
      .replace(/[^\d,]/g, "")
      .split(",");
    return reais * 100 + Number(centavos);
  };
  const [reais = "0", centavos = "0"] = spoken.match(/\d[\d.]*/g) ?? [];
  expect(cents(text)).toBe(
    Number(reais.replace(/\./g, "")) * 100 + Number(centavos),
  );
});

test("no modo discreto nenhum valor aparece, só a máscara", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openRecap(page);
  await page.getByRole("button", { name: "Ocultar valores" }).click();
  await expect(
    page.getByRole("button", { name: "Ocultar valores" }),
  ).toHaveAttribute("aria-pressed", "true");
  const total = (await position(page)).total;
  for (let step = 1; step <= total; step++) {
    const slide = part(page);
    await expect(slide.locator("[data-privacy-value]:visible")).toHaveCount(0);
    // innerText is what is on screen: no amount, only the masks.
    const shown = await slide.evaluate((el) => (el as HTMLElement).innerText);
    expect(shown).not.toMatch(/R\$\s?\d/);
    if (step < total) {
      await page.getByRole("button", { name: "Próximo", exact: true }).click();
      await page.waitForTimeout(350);
    }
  }
  // Back to the default for the next tests.
  await page.getByRole("button", { name: "Ocultar valores" }).click();
});

test("o mês anterior não oferece o que continua nem guardar a sobra", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openRecap(page);
  const mes = new URL(page.url()).searchParams.get("mes") ?? "";
  const [year, month] = mes.split("-").map(Number);
  const before = new Date(Date.UTC(year ?? 2026, (month ?? 1) - 2, 1));
  const earlier = `${before.getUTCFullYear()}-${String(before.getUTCMonth() + 1).padStart(2, "0")}`;
  await page.goto(`/retrospectiva?mes=${earlier}`);
  // The demo may have nothing that early: then an empty state is the answer.
  const empty = page.getByRole("heading", {
    name: /^(Sem registros em|Nada pago em|O primeiro fechamento)/,
  });
  await expect(part(page).or(empty)).toBeVisible({ timeout: 30_000 });
  if (await empty.isVisible()) return;
  await page.keyboard.press("End");
  await expect(page.locator('[data-slide="next"]')).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Guardar a sobra" }),
  ).toHaveCount(0);
});

test("o Fechamento tem o botão Ver a retrospectiva", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/relatorios/fechamento");
  const link = page.getByRole("link", { name: "Ver a retrospectiva" });
  await expect(link).toBeVisible({ timeout: 30_000 });
  await link.click();
  await expect(page).toHaveURL(/\/retrospectiva\?mes=\d{4}-\d{2}$/);
  await expect(part(page)).toBeVisible({ timeout: 30_000 });
});

test("o fechar leva ao Fechamento e uma nova visita começa na primeira parte", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openRecap(page);
  await page.keyboard.press("ArrowRight");
  await page.getByRole("link", { name: "Fechar retrospectiva" }).click();
  await expect(page).toHaveURL(/\/relatorios\/fechamento/);
  await page.getByRole("link", { name: "Ver a retrospectiva" }).click();
  await expect(part(page)).toHaveAttribute("aria-label", /^1 de /, {
    timeout: 30_000,
  });
});

test("sem acessibilidade quebrada em cada parte, nos dois temas e em 360 px", async ({
  page,
}) => {
  test.setTimeout(240_000);
  for (const theme of ["Escuro", "Claro"] as const) {
    await chooseTheme(page, theme);
    await openRecap(page);
    const { total } = await position(page);
    for (let step = 1; step <= total; step++) {
      await page.waitForTimeout(1_000);
      await expectNoA11yViolations(page);
      await expectNoHorizontalScroll(page);
      if (step < total) {
        await page
          .getByRole("button", { name: "Próximo", exact: true })
          .click();
      }
    }
  }
  await chooseTheme(page, "Escuro");
});

test("o mês antes do primeiro registro mostra o vazio, sem violações", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/retrospectiva?mes=2000-01");
  // An old month clamps to the demo's first records or shows the empty state.
  await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible({
    timeout: 30_000,
  });
  await expectNoA11yViolations(page);
});
