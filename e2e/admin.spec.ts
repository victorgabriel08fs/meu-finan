import { devices, expect, type Page, test } from "@playwright/test";
import { BRUNO_EMAIL, BRUNO_PASSWORD } from "./demo";

// Administração (doc 02 §6.17). Runs as the demo administrator (Ana), with
// the session saved by auth.setup.ts, except where noted.

test.describe.configure({ mode: "serial" });

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

test("convida uma pessoa e o convite leva ao onboarding num navegador novo", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await page.goto("/admin/usuarios");
  await expect(
    page.getByRole("heading", { name: "Administração" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Convidar pessoa" }).click();
  const sheet = page.getByRole("dialog", { name: "Convidar pessoa" });
  await sheet.getByLabel("Nome").fill("Elisa Convite");
  await sheet
    .getByLabel("E-mail", { exact: true })
    .fill("elisa.e2e@exemplo.com");
  await sheet.getByRole("button", { name: "Criar convite" }).click();

  const field = page.getByTestId("access-link");
  await expect(field).toBeVisible({ timeout: 30_000 });
  const url = await field.inputValue();
  expect(url).toMatch(/\/convite\/[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{43}$/);
  await page.getByRole("button", { name: "Concluir" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  const row = page.getByRole("button", { name: /^Elisa Convite/ });
  await expect(row).toBeVisible();
  await expect(row.getByText("Convite pendente")).toBeVisible();
  expect(errors).toEqual([]);

  // Someone else's phone: no session, only the link. (New contexts inherit
  // the project's options, the saved session included: clear it.)
  const guestContext = await browser.newContext({
    ...devices["Pixel 7"],
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    storageState: { cookies: [], origins: [] },
  });
  const guest = await guestContext.newPage();
  const guestErrors = collectErrors(guest);
  await guest.goto(url);
  await expect(
    guest.getByRole("heading", { name: "Olá, Elisa" }),
  ).toBeVisible();
  await expect(guest.getByLabel("E-mail")).toHaveValue("elisa.e2e@exemplo.com");
  await guest.getByLabel("Senha", { exact: true }).fill("a senha da elisa e2e");
  await guest.getByLabel("Confirme a senha").fill("a senha da elisa e2e");
  await guest.getByRole("button", { name: "Criar senha e entrar" }).click();
  await expect(guest).toHaveURL(/\/onboarding$/, { timeout: 30_000 });
  await expect(
    guest.getByRole("heading", {
      name: "Seu dinheiro, claro como deveria ser",
    }),
  ).toBeVisible({ timeout: 30_000 });
  expect(guestErrors).toEqual([]);

  // The link works once.
  await guest.goto(url);
  await expect(
    guest.getByRole("heading", { name: "Este link já foi usado" }),
  ).toBeVisible();
  await guestContext.close();

  await page.reload();
  await expect(
    page.getByRole("button", { name: /^Elisa Convite/ }).getByText("Ativo"),
  ).toBeVisible({ timeout: 30_000 });
});

test("desligar importar_extrato tira a entrada de Ajustes e fecha /importar", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  const card = page.locator('[data-flag="importar_extrato"]');
  await page.goto("/admin/flags");
  await card.getByRole("radio", { name: "Desligado" }).click();
  await expect(
    page.getByText("Importar extrato desligado para todos."),
  ).toBeVisible();
  try {
    await page.goto("/ajustes");
    await expect(
      page.getByRole("link", { name: /Exportar lançamentos/ }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("link", { name: /Importar extrato/ }),
    ).toHaveCount(0);
    await page.goto("/importar");
    await expect(
      page.getByRole("heading", { name: "Página não encontrada" }),
    ).toBeVisible({ timeout: 30_000 });
  } finally {
    // Back to the default, so the import test still finds the screen.
    await page.goto("/admin/flags");
    await card.getByRole("radio", { name: "Padrão" }).click();
    await expect(
      page.getByText(/Importar extrato voltou ao padrão/),
    ).toBeVisible();
  }
  await page.goto("/ajustes");
  await expect(
    page.getByRole("link", { name: /Importar extrato/ }),
  ).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});

test.describe("sem ser administrador", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("um usuário comum recebe 404 na administração", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/entrar");
    await page.getByLabel("E-mail").fill(BRUNO_EMAIL);
    await page.getByLabel("Senha", { exact: true }).fill(BRUNO_PASSWORD);
    await page.getByRole("button", { name: "Entrar com senha" }).click();
    await expect(page).toHaveURL(/\/inicio/, { timeout: 30_000 });

    // The 404 page instead of the content (the status is 200 once the
    // response streams), and nothing of the panel's data in the HTML.
    for (const path of [
      "/admin/usuarios",
      "/admin/flags",
      "/admin/atividade",
    ]) {
      await page.goto(path);
      await expect(
        page.getByRole("heading", { name: "Página não encontrada" }),
        path,
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        page.getByRole("button", { name: "Convidar pessoa" }),
      ).toHaveCount(0);
      const html = await page.content();
      for (const secret of ["carla@meu-finan.local", "demo@meu-finan.local"]) {
        expect(html, `${path} ${secret}`).not.toContain(secret);
      }
    }

    // Ajustes has no Administração; and the demo turned importar_extrato off
    // for Bruno only (a per-person flag).
    await page.goto("/ajustes");
    await expect(
      page.getByRole("link", { name: /Exportar lançamentos/ }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Administração")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /Importar extrato/ }),
    ).toHaveCount(0);
  });

  test("sem sessão, a administração leva ao login e um link falso não abre", async ({
    page,
  }) => {
    await page.goto("/admin/usuarios");
    await expect(page).toHaveURL(/\/entrar\?voltar=%2Fadmin%2Fusuarios/);
    await page.goto(`/convite/AAAAAAAAAAAAAAAA.${"A".repeat(43)}`);
    await expect(
      page.getByRole("heading", { name: "Página não encontrada" }),
    ).toBeVisible();
    await expect(page.getByLabel("Senha", { exact: true })).toHaveCount(0);
  });
});
