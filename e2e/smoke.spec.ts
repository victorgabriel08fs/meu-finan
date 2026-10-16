import { expect, type Page, test } from "@playwright/test";

// Demo credentials created by `npm run demo` (local database only).
const EMAIL = "demo@meu-finan.local";
const PASSWORD = "meu-finan-demo";

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

async function signIn(page: Page) {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(EMAIL);
  await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar com senha" }).click();
  await expect(page).toHaveURL(/\/inicio/);
}

test("sem sessão, qualquer tela leva ao login", async ({ page }) => {
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

test("entra e abre todas as telas sem erros", async ({ page }) => {
  const errors = collectErrors(page);
  await signIn(page);
  for (const path of SCREENS) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBeLessThan(400);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1").first(), path).toBeVisible();
  }
  expect(errors).toEqual([]);
});
