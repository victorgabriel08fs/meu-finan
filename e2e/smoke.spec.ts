import { expect, type Page, test } from "@playwright/test";
import { EMAIL } from "./demo";

// Every test runs with the session saved by auth.setup.ts, except those in
// "sem sessão".

const SCREENS = [
  "/inicio",
  "/extrato",
  "/contas",
  "/planejar/orcamentos",
  "/planejar/metas",
  "/planejar/simulador",
  "/relatorios/visao-geral",
  "/relatorios/categorias",
  "/ajustes",
  "/ajustes/seguranca",
  "/ajustes/preferencias",
  "/ajustes/categorias",
  "/ajustes/sobre",
];

test.describe.configure({ mode: "serial" });

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

/**
 * The page streamed in: no skeleton left and a title on screen. Prefetches of
 * the other tabs keep the network busy, so "networkidle" would wait for them.
 */
async function expectLoaded(page: Page, label: string) {
  await expect(page.getByText("Carregando…"), label).toHaveCount(0, {
    timeout: 30_000,
  });
  await expect(page.locator("h1").first(), label).toBeVisible();
}

test.describe("sem sessão", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("qualquer tela leva ao login", async ({ page }) => {
    await page.goto("/extrato?mes=2026-10");
    await expect(page).toHaveURL(/\/entrar\?voltar=/);
    await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  });

  test("senha errada não entra", async ({ page }) => {
    await page.goto("/entrar");
    await page.getByLabel("E-mail").fill(EMAIL);
    await page.getByLabel("Senha", { exact: true }).fill("uma senha qualquer");
    await page.getByRole("button", { name: "Entrar com senha" }).click();
    await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
    await expect(page).toHaveURL(/\/entrar/);
  });
});

test("abre todas as telas sem erros", async ({ page }) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page);
  for (const path of SCREENS) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBeLessThan(400);
    await expectLoaded(page, path);
  }
  // Account and card details are reached from Contas.
  for (const prefix of ["/contas/", "/cartoes/"]) {
    await page.goto("/contas");
    await expectLoaded(page, "/contas");
    await page.locator(`a[href^="${prefix}"]`).first().click();
    await expect(page).toHaveURL(new RegExp(prefix));
    await expectLoaded(page, prefix);
  }
  expect(errors).toEqual([]);
});

test("lança uma despesa pelo + e ela aparece no extrato", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.goto("/extrato");
  await expectLoaded(page, "/extrato");
  await page
    .getByRole("button", { name: "Nova transação", exact: true })
    .and(page.locator(":visible"))
    .click();
  const sheet = page.getByRole("dialog", { name: "Nova transação" });
  await expect(sheet).toBeVisible();
  for (const key of ["4", "2"]) {
    await sheet.getByRole("button", { name: key, exact: true }).click();
  }
  await sheet
    .getByPlaceholder("Descrição (opcional)")
    .fill("Pastel da feira e2e");
  await sheet.getByRole("button", { name: "Salvar despesa" }).click();
  await expect(page.getByText("Despesa de R$ 42,00 salva")).toBeVisible();
  await expect(sheet).toBeHidden();
  await expect(page.getByText("Pastel da feira e2e").first()).toBeVisible({
    timeout: 30_000,
  });
  expect(errors).toEqual([]);
});

test("edita todos os lançamentos de uma recorrência", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.goto("/extrato");
  await expectLoaded(page, "/extrato");
  await page
    .getByRole("button", { name: /^Internet,/ })
    .first()
    .click();
  const sheet = page.getByRole("dialog", { name: "Internet" });
  await expect(sheet.getByText("Todo mês, no dia 20")).toBeVisible();
  await sheet.getByRole("button", { name: "Editar" }).click();
  await page.getByLabel("Descrição").fill("Internet fibra");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await page.getByRole("button", { name: "Todos", exact: true }).click();
  await expect(page.getByText("Lançamentos atualizados")).toBeVisible();
  // The sheet goes back to the details; close it. Closing steps back in
  // history, and the list must keep the updated entry (not an older render).
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(
    page.getByRole("button", { name: /^Internet fibra,/ }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Internet,/ })).toHaveCount(0);
  // Next month's occurrence (already scheduled) got the new name too.
  await page.getByRole("link", { name: /^Próximo mês/ }).click();
  await expect(
    page.getByRole("button", { name: /^Internet fibra,/ }),
  ).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});

test("voltar fecha a folha em vez de sair da tela", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.goto("/inicio");
  await expectLoaded(page, "/inicio");
  await page.goto("/extrato");
  await expectLoaded(page, "/extrato");
  const plus = page
    .getByRole("button", { name: "Nova transação", exact: true })
    .and(page.locator(":visible"));
  const sheet = page.getByRole("dialog", { name: "Nova transação" });

  await plus.click();
  await expect(sheet).toBeVisible();
  await page.goBack();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/extrato$/);

  // Closed by its own button, the sheet leaves no entry behind: back leaves.
  await plus.click();
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Fechar" }).click();
  await expect(sheet).toBeHidden();
  await page.goBack();
  await expect(page).toHaveURL(/\/inicio$/);
  expect(errors).toEqual([]);
});

test("arquiva uma conta e volta para Contas", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.goto("/contas");
  await expectLoaded(page, "/contas");
  await page
    .getByRole("link", { name: /^Carteira/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/contas\/[0-9a-f-]+$/);
  await expectLoaded(page, "Carteira");
  await page.getByRole("button", { name: "Arquivar", exact: true }).click();
  await page.getByRole("button", { name: "Arquivar conta" }).click();
  await expect(page).toHaveURL(/\/contas$/);
  await expect(page.getByText("Arquivadas (1)")).toBeVisible();
  expect(errors).toEqual([]);
});
