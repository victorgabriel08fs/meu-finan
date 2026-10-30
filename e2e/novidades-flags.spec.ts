import { expect, test } from "@playwright/test";
import { BRUNO_EMAIL, BRUNO_PASSWORD } from "./demo";

// Novidades follow the person's feature flags (doc 01 §11.10). The demo turns
// importar_extrato off for Bruno only, and notificacoes_push (off by default)
// on for Ana only, so his Ajustes › Novidades must announce neither the import
// nor the notifications, nor link to /importar or /ajustes/notificacoes, which
// he cannot open. Runs as Bruno, signed in once (the sign-in rate limit is 5
// per minute). Opening the list marks his novidades read; no other test reads
// them.

test.use({ storageState: { cookies: [], origins: [] } });

test("sem as flags, Novidades não anuncia a importação nem as notificações", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(BRUNO_EMAIL);
  await page.getByLabel("Senha", { exact: true }).fill(BRUNO_PASSWORD);
  await page.getByRole("button", { name: "Entrar com senha" }).click();
  await expect(page).toHaveURL(/\/inicio/, { timeout: 30_000 });

  await page.goto("/ajustes/novidades");
  // By role: while React reveals the streamed list, a hidden copy of it can
  // still sit at the end of <body>, and getByText would match both.
  await expect(
    page.getByRole("heading", { name: "Três relatórios novos" }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Importe o extrato do banco")).toHaveCount(0);
  await expect(page.locator('a[href="/importar"]')).toHaveCount(0);
  await expect(page.getByText("Notificações no aparelho")).toHaveCount(0);
  await expect(page.locator('a[href="/ajustes/notificacoes"]')).toHaveCount(0);
});
