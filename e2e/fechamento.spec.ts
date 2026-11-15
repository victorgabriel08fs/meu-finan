import { expect, type Page, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";
import { expectNoHorizontalScroll } from "./layout";
import { chooseTheme } from "./theme";

// Relatórios › Fechamento (doc 02 §6.12, doc 03 §12): how the last closed month
// went. Runs as Ana, whose demo has a paid bonus on the last day of the month
// that closed, so there is leftover still to save, and Restaurantes over its
// budget with a lower budget in the current month. The only write is the
// suggestion of Restaurantes, put back at the end.

test.describe.configure({ mode: "serial" });

const toast = (page: Page) => page.locator("[data-sonner-toast]");

async function openClosing(page: Page, query = "") {
  await page.goto(`/relatorios/fechamento${query}`);
  await expect(
    page.getByRole("heading", { name: /^Como foi /, level: 2 }),
  ).toBeVisible({ timeout: 30_000 });
}

test("a aba Fechamento mostra o mês que fechou, sem seta para o próximo", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openClosing(page);
  await expect(
    page.getByRole("link", { name: "Fechamento", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  const hero = page.getByRole("region", { name: /^Como foi / });
  await expect(hero.getByText("Receitas", { exact: true })).toBeVisible();
  await expect(hero.getByText("Despesas", { exact: true })).toBeVisible();
  await expect(hero.getByText(/^(Sobrou|Faltou)$/)).toBeVisible();
  await expect(page.getByRole("link", { name: /^Próximo mês/ })).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Ver o último fechamento" }),
  ).toHaveCount(0);

  // The current month, a future one and a malformed one fall back to it.
  const month = await page
    .getByRole("heading", { name: /^Como foi /, level: 2 })
    .textContent();
  for (const mes of ["2999-01", "abc"]) {
    await openClosing(page, `?mes=${mes}`);
    await expect(
      page.getByRole("heading", { name: month ?? "", level: 2 }),
    ).toBeVisible();
  }
  const current = new Date().toLocaleDateString("sv-SE", {
    timeZone: "America/Sao_Paulo",
  });
  await openClosing(page, `?mes=${current.slice(0, 7)}`);
  await expect(
    page.getByRole("heading", { name: month ?? "", level: 2 }),
  ).toBeVisible();
});

test("o mês anterior tem o chip de volta e só mostra o histórico", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openClosing(page);
  const latest = await page
    .getByRole("heading", { name: /^Como foi /, level: 2 })
    .textContent();
  await page.getByRole("link", { name: /^Mês anterior/ }).click();
  await expect(page).toHaveURL(/\/relatorios\/fechamento\?mes=\d{4}-\d{2}$/);
  await expect(
    page.getByRole("heading", { name: /^Como foi /, level: 2 }),
  ).not.toHaveText(latest ?? "");
  // Only the last closed month has actions.
  await expect(
    page.getByRole("button", { name: /^Usar a sugestão/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Guardar a sobra" }),
  ).toHaveCount(0);
  // The arrow forward is back, with the chip to the last closing.
  await expect(page.getByRole("link", { name: /^Próximo mês/ })).toBeVisible();
  await page.getByRole("link", { name: "Ver o último fechamento" }).click();
  await expect(
    page.getByRole("heading", { name: latest ?? "", level: 2 }),
  ).toBeVisible({ timeout: 30_000 });
});

test("Guardar a sobra abre a transferência para a caixinha, preenchida", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openClosing(page);
  const card = page.getByRole("region", { name: "Guardar a sobra" });
  await expect(card).toBeVisible();
  const text = (await card.textContent()) ?? "";
  // Ana already put some in her caixinha since the month began: what is left
  // to save is the figure of the sheet.
  const left = text.match(/Falta guardar R\$\s?([0-9.]+,[0-9]{2})/);
  const whole = text.match(/Sobraram R\$\s?([0-9.]+,[0-9]{2})/);
  const toSave = (left ?? whole)?.[1];
  expect(toSave, "valor a guardar na tela").toBeTruthy();

  await card.getByRole("button", { name: "Guardar a sobra" }).click();
  const sheet = page.getByRole("dialog", { name: "Nova transação" });
  await expect(sheet).toBeVisible({ timeout: 30_000 });
  await expect(
    sheet.getByRole("radio", { name: "Transferência" }),
  ).toBeChecked();
  await expect(
    sheet.getByRole("button", { name: /^De\s*Conta principal/ }),
  ).toBeVisible();
  await expect(
    sheet.getByRole("button", { name: /^Para\s*Caixinha Viagem/ }),
  ).toBeVisible();
  await expect(sheet.locator('input[value="Sobra de outubro"]')).toBeVisible();
  await expect(sheet).toContainText(toSave ?? "");
  // Nothing is saved: closing leaves the leftover where it was.
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await openClosing(page);
  await expect(
    page.getByRole("region", { name: "Guardar a sobra" }),
  ).toContainText(toSave ?? "");
});

test("Usar a sugestão grava o orçamento do mês atual, e o valor volta ao que era", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openClosing(page);
  const use = page.getByRole("button", {
    name: "Usar a sugestão de Restaurantes em novembro",
  });
  await expect(use).toBeVisible();
  // No amount in the button or its name (discreet mode).
  await expect(use).not.toContainText("R$");
  try {
    await use.click();
    await expect(
      toast(page).filter({
        hasText: "Orçamento de Restaurantes salvo para novembro.",
      }),
    ).toBeVisible({ timeout: 30_000 });
    // The suggestion is now covered by the budget.
    await expect(use).toBeHidden({ timeout: 30_000 });
    await expect(
      page.getByText("já tem", { exact: false }).first(),
    ).toBeVisible();
  } finally {
    // Back to the demo's R$ 400,00.
    await page.goto("/planejar/orcamentos");
    await page
      .getByRole("button", { name: /^Restaurantes:.*Editar orçamento$/ })
      .click({ timeout: 30_000 });
    const sheet = page.getByRole("dialog", { name: "Restaurantes" });
    await sheet.getByLabel("Quanto quer gastar no mês").fill("400,00");
    await sheet.getByRole("button", { name: "Salvar orçamento" }).click();
    await expect(
      toast(page).filter({ hasText: "Orçamento de Restaurantes salvo." }),
    ).toBeVisible({ timeout: 30_000 });
  }
  await openClosing(page);
  await expect(
    page.getByRole("button", {
      name: "Usar a sugestão de Restaurantes em novembro",
    }),
  ).toBeVisible();
});

test("sem erros de acessibilidade nos dois temas, a 360 px e no desktop", async ({
  page,
}) => {
  test.setTimeout(180_000);
  try {
    for (const [name, theme] of [
      ["Escuro", "dark"],
      ["Claro", "light"],
    ] as const) {
      await chooseTheme(page, name);
      for (const width of [360, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await openClosing(page);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expectNoA11yViolations(page);
        await expectNoHorizontalScroll(page, `fechamento a ${width} px`);
      }
    }
  } finally {
    await chooseTheme(page, "Escuro");
  }
});
