import { expect, type Page, test } from "@playwright/test";

// Valor inicial da fatura (doc 03 §9.4), as Ana: criar um cartão com "Fatura
// atual" R$ 250,00 faz o valor aparecer na fatura aberta, como o lançamento
// "Valor inicial da fatura". O cartão é arquivado no fim.

test.describe.configure({ mode: "serial" });

const RUN = Date.now().toString(36).slice(-5);
const NAME = `Cartão inicial ${RUN}`;
const toast = (page: Page) => page.locator("[data-sonner-toast]");

test("criar o cartão com Fatura atual R$ 250,00 mostra o valor na fatura aberta", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/contas/nova?tipo=cartao");
  const visible = (label: string) =>
    page.getByLabel(label).filter({ visible: true });
  await expect(visible("Nome")).toBeVisible({ timeout: 30_000 });
  await visible("Nome").fill(NAME);
  await visible("Limite total").pressSequentially("1000");
  await visible("Fechamento").selectOption("1");
  await visible("Vencimento").selectOption("10");
  await expect(
    page.getByText("Entra na fatura aberta hoje.", { exact: false }).first(),
  ).toBeVisible();
  await visible("Fatura atual (valor devido hoje)").pressSequentially("250");
  await page.getByRole("button", { name: "Criar cartão" }).click();
  await expect(toast(page).filter({ hasText: "Cartão criado" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page).toHaveURL(/\/cartoes\/[0-9a-f-]+$/);
  await expect(page.locator("h1:visible")).toContainText(NAME);

  await expect(page.getByText("Aberta").first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("R$ 250,00").first()).toBeVisible();
  await expect(page.getByText("Valor inicial da fatura").first()).toBeVisible();
});

test("arquiva o cartão ao fim", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/contas");
  await page
    .getByRole("link", { name: new RegExp(`^${NAME}`) })
    .first()
    .click({ timeout: 30_000 });
  await page.getByRole("button", { name: "Arquivar cartão" }).first().click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Arquivar cartão" })
    .click();
  await expect(page).toHaveURL(/\/contas$/);
  await expect(
    page.getByRole("link", { name: new RegExp(`^${NAME}`) }),
  ).toHaveCount(0);
});
