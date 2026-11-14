import { expect, type Page, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";
import { expectNoHorizontalScroll } from "./layout";

// Lançamento por texto (task 21; doc 02 §6.5), as Ana: the demo turns
// lancamento_por_texto on for her only (Bruno's side is in
// novidades-flags.spec.ts). The field fills the form and never saves.

test.describe.configure({ mode: "serial" });

const RUN = `r${Date.now().toString(36).slice(-5)}`;
const TAG = `viagem-${RUN}`;
const TAG_NAME = `viagem ${RUN}`;
const DESCRIPTION = `Café ${RUN}`;

async function openSheet(page: Page) {
  await page.goto("/inicio");
  await page.getByRole("button", { name: "Nova transação" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Nova transação" });
  await expect(sheet).toBeVisible({ timeout: 30_000 });
  return sheet;
}

test("preenche valor, conta, data e etiqueta, e salva pelo botão de sempre", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const sheet = await openSheet(page);
  const field = sheet.getByLabel("Escrever o lançamento");
  await expect(field).toBeVisible();
  const fill = sheet.getByRole("button", { name: "Preencher" });
  await expect(fill).toBeDisabled();

  await field.fill(`${DESCRIPTION} 12 na conta principal ontem #${TAG}`);
  await expect(fill).toBeEnabled();
  await fill.click();

  await expect(sheet.getByText(/^Preenchido: valor, descrição/)).toBeVisible({
    timeout: 30_000,
  });
  await expect(sheet.getByRole("button", { name: "Ontem" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(sheet.getByPlaceholder("Descrição (opcional)")).toHaveValue(
    DESCRIPTION,
  );
  await expect(
    sheet.getByRole("button", { name: /^Mais opções/ }),
  ).toContainText(TAG_NAME);
  // The text stays, so it can be fixed and sent again.
  await expect(field).toHaveValue(/^Café /);

  // Saved right away, before the layout's tag list refreshed.
  await sheet.getByRole("button", { name: "Salvar despesa" }).click();
  await expect(page.getByText("Despesa de R$ 12,00 salva")).toBeVisible({
    timeout: 15_000,
  });
  await expect(sheet).toBeHidden({ timeout: 15_000 });

  await page.goto("/extrato");
  await expect(
    page.getByRole("button", { name: new RegExp(DESCRIPTION) }).first(),
  ).toBeVisible({ timeout: 30_000 });
  await page.goto("/ajustes/etiquetas");
  await expect(
    page.getByRole("button", { name: new RegExp(`^${TAG_NAME} 1 lançamento`) }),
  ).toBeVisible({ timeout: 30_000 });
});

test("Enter no campo preenche e não salva; sem valor, avisa", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const sheet = await openSheet(page);
  const field = sheet.getByLabel("Escrever o lançamento");
  await field.fill("almoço no shopping");
  await field.press("Enter");
  await expect(
    sheet.getByText("Não encontrei o valor: digite no teclado."),
  ).toBeVisible({ timeout: 30_000 });
  await expect(sheet.getByPlaceholder("Descrição (opcional)")).toHaveValue(
    "almoço no shopping",
  );
  await expect(sheet).toBeVisible();
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
});

test("a folha com o campo não tem violações, não rola para o lado e o campo some na transferência", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const sheet = await openSheet(page);
  await expect(sheet.getByLabel("Escrever o lançamento")).toBeVisible();
  await expectNoA11yViolations(page);
  await expectNoHorizontalScroll(page, "Nova transação com o campo de texto");
  await sheet.getByRole("radio", { name: "Receita" }).click();
  await expect(sheet.getByLabel("Escrever o lançamento")).toBeVisible();
  await sheet.getByRole("radio", { name: "Transferência" }).click();
  await expect(sheet.getByLabel("Escrever o lançamento")).toHaveCount(0);
});
