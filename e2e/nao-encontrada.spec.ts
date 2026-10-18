import { devices, expect, type Page, test } from "@playwright/test";

// The 404 page (doc 02 §8) wherever it shows: in pt-BR, on the app's theme,
// inside one <main> and with a single brand row. The in-app case turns a flag
// off for everyone and puts it back to its default; nothing else changes.

const NOT_FOUND = "Página não encontrada";

/** The page has one landmark and draws the brand ("Meu Finan") only once. */
async function expectSingleFrame(page: Page) {
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(
    page.getByText("Meu Finan", { exact: true }).filter({ visible: true }),
  ).toHaveCount(1);
}

test.describe("sem sessão", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("um link de convite falso mostra a 404 na tela de acesso, com a marca uma vez", async ({
    page,
  }) => {
    await page.goto(`/convite/AAAAAAAAAAAAAAAA.${"A".repeat(43)}`);
    await expect(page.getByRole("heading", { name: NOT_FOUND })).toBeVisible();
    await expectSingleFrame(page);
    // Whoever opens a broken link has no session: the way out is the login.
    await expect(
      page.getByRole("link", { name: "Ir para o login" }),
    ).toHaveAttribute("href", "/entrar");
  });

  test("/primeiro-acesso depois da primeira conta mostra a 404 com a marca uma vez", async ({
    page,
  }) => {
    // npm run demo leaves SETUP_TOKEN set, so the page itself answers (an
    // account exists); without the token the proxy answers, as for
    // /recuperar below. Either way, one brand row.
    await page.goto("/primeiro-acesso");
    await expect(page.getByRole("heading", { name: NOT_FOUND })).toBeVisible();
    await expectSingleFrame(page);
    await expect(page.getByLabel("Código de configuração")).toHaveCount(0);
  });

  test("/recuperar sem RECOVERY_TOKEN responde 404 com a página do app", async ({
    page,
  }) => {
    // RECOVERY_TOKEN is unset in the demo's .env.local and in CI.
    const response = await page.goto("/recuperar");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: NOT_FOUND })).toBeVisible();
    await expectSingleFrame(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByLabel("Código de recuperação")).toHaveCount(0);
  });
});

test("um endereço que não existe responde 404, com a marca e o Início", async ({
  page,
}) => {
  const response = await page.goto("/pagina-que-nao-existe");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: NOT_FOUND })).toBeVisible();
  await expectSingleFrame(page);
  await page.getByRole("link", { name: "Ir para o Início" }).click();
  await expect(page).toHaveURL(/\/inicio$/);
});

test.describe("no computador", () => {
  // The desktop device without its browser type (a describe cannot change
  // it); the owner's session comes from the project.
  const { defaultBrowserType: _browserType, ...desktop } =
    devices["Desktop Chrome"];
  test.use(desktop);

  test("dentro do app, a 404 fica no conteúdo, sem repetir a marca da barra lateral", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const card = page.locator('[data-flag="importar_extrato"]');
    await page.goto("/admin/flags");
    await card.getByRole("radio", { name: "Desligado" }).click();
    await expect(
      page.getByText("Importar extrato desligado para todos."),
    ).toBeVisible();
    try {
      await page.goto("/importar");
      await expect(page.getByRole("heading", { name: NOT_FOUND })).toBeVisible({
        timeout: 30_000,
      });
      // One <main> (the shell's) and one brand (the sidebar's).
      await expectSingleFrame(page);
      await expect(
        page.getByRole("link", { name: "Ir para o Início" }),
      ).toHaveAttribute("href", "/inicio");
    } finally {
      // Back to the default, as the other files expect.
      await page.goto("/admin/flags");
      await card.getByRole("radio", { name: "Padrão" }).click();
      await expect(
        page.getByText(/Importar extrato voltou ao padrão/),
      ).toBeVisible();
    }
  });
});
