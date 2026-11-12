import { expect, type Page, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

// Conta que paga a fatura (doc 02 §6.8), as Ana: o cartão da demo vem com a
// Conta principal; "Pagar fatura" abre nela, e a escolha nova vale na hora.
// Só o campo do cartão muda; no fim, volta à Conta principal.

test.describe.configure({ mode: "serial" });

const toast = (page: Page) => page.locator("[data-sonner-toast]");
const payer = (page: Page) => page.getByLabel("Conta que paga a fatura");

async function openCard(page: Page) {
  await page.goto("/contas");
  await page
    .getByRole("link", { name: /^Cartão Principal/ })
    .first()
    .click({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/cartoes\/[0-9a-f-]+$/);
  await expect(page.locator("h1:visible")).toContainText("Cartão Principal");
}

async function choosePayer(page: Page, account: string) {
  await page.getByRole("button", { name: "Editar cartão" }).click();
  const sheet = page.getByRole("dialog");
  await expect(payer(page)).toBeVisible({ timeout: 30_000 });
  await payer(page).selectOption({ label: account });
  await sheet.getByRole("button", { name: "Salvar" }).click();
  await expect(
    toast(page).filter({ hasText: "Alterações salvas" }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(sheet).toBeHidden();
}

/** The account "Pagar fatura" opens on (the checked radio of "Pagar com"). */
async function payingAccount(page: Page): Promise<string> {
  await page
    .getByRole("button", { name: "Pagar fatura" })
    .first()
    .click({ timeout: 30_000 });
  const sheet = page.getByRole("dialog", { name: "Pagar fatura" });
  await expect(sheet).toBeVisible();
  const checked = sheet
    .locator("label:has(input[type=radio]:checked)")
    .locator("span.truncate");
  const text = (await checked.textContent()) ?? "";
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  return text.trim();
}

test("o cartão da demo vem com a Conta principal e Pagar fatura abre nela", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openCard(page);
  await page.getByRole("button", { name: "Editar cartão" }).click();
  await expect(payer(page)).toBeVisible({ timeout: 30_000 });
  await expect(payer(page)).toHaveValue(/[0-9a-f-]{36}/);
  await expect(payer(page).locator("option:checked")).toHaveText(
    "Conta principal",
  );
  await expect(
    page.getByText("Sem conta escolhida, vale a do último pagamento.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  expect(await payingAccount(page)).toBe("Conta principal");
});

test("escolher outra conta muda onde Pagar fatura abre, e a folha passa no axe", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openCard(page);
  try {
    await choosePayer(page, "Carteira");
    await page.reload();
    expect(await payingAccount(page)).toBe("Carteira");

    await page.getByRole("button", { name: "Editar cartão" }).click();
    await expect(payer(page)).toBeVisible({ timeout: 30_000 });
    await expectNoA11yViolations(page);
    await page.keyboard.press("Escape");
  } finally {
    await openCard(page);
    await choosePayer(page, "Conta principal");
  }
  await page.reload();
  expect(await payingAccount(page)).toBe("Conta principal");
});

test("'Nenhuma' tira a conta: Pagar fatura volta a abrir na primeira conta da lista", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openCard(page);
  try {
    await choosePayer(page, "Nenhuma");
    await page.reload();
    await page.getByRole("button", { name: "Editar cartão" }).click();
    await expect(payer(page).locator("option:checked")).toHaveText("Nenhuma");
    await page.keyboard.press("Escape");
  } finally {
    await openCard(page);
    await choosePayer(page, "Conta principal");
  }
});
