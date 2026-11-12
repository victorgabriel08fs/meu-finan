import { expect, test } from "@playwright/test";
import { BRUNO_EMAIL, BRUNO_PASSWORD } from "./demo";

// Novidades follow the person's feature flags (doc 01 §11.10). The demo turns
// importar_extrato off for Bruno only, and notificacoes_push and
// inicio_personalizavel (off by default) on for Ana only, so his Ajustes ›
// Novidades must announce neither the import, nor the notifications, nor the
// customizable Início, nor the non-business day alert, nor link to /importar or
// /ajustes/notificacoes, which
// he cannot open; and his Início stays the app's, with no way to change it.
// Runs as Bruno, signed in once (the sign-in rate limit is 5 per minute).
// Opening the list marks his novidades read; no other test reads them.

test.use({ storageState: { cookies: [], origins: [] } });

test("sem as flags, Novidades não anuncia o que ele não tem e o Início fica no padrão", async ({
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
  // No flag behind it: the subcategories reach him too.
  await expect(
    page.getByRole("heading", { name: "Subcategorias" }),
  ).toBeVisible();
  await expect(page.getByText("Importe o extrato do banco")).toHaveCount(0);
  await expect(page.locator('a[href="/importar"]')).toHaveCount(0);
  await expect(page.getByText("Notificações no aparelho")).toHaveCount(0);
  await expect(page.getByText("Avisos todo dia pela manhã")).toHaveCount(0);
  await expect(page.locator('a[href="/ajustes/notificacoes"]')).toHaveCount(0);
  await expect(page.getByText("Monte o seu Início")).toHaveCount(0);
  await expect(page.getByText("Mais blocos para o Início")).toHaveCount(0);
  await expect(page.getByText("Quanto dá para gastar por dia")).toHaveCount(0);
  // Nor the non-business day alert (alerta_dia_nao_util, on for Ana only).
  await expect(
    page.getByRole("heading", { name: "Vencimento em dia não útil" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("fim de semana ou num feriado", { exact: false }),
  ).toHaveCount(0);

  // Without notificacoes_push, no Notificações: neither the screen nor its
  // notices (nor the administrators' preview, which he would not get anyway).
  await page.goto("/ajustes/notificacoes");
  await expect(
    page.getByRole("heading", { name: "Página não encontrada" }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("switch")).toHaveCount(0);
  await expect(page.getByText("Enviar prévia dos avisos")).toHaveCount(0);

  // Without inicio_personalizavel: the app's own Início, with no way to
  // change it, here or in Preferências.
  await page.goto("/inicio");
  await expect
    .poll(
      () =>
        page.locator("[data-home-block]").evaluateAll((nodes) =>
          nodes
            .filter((node) => node.checkVisibility())
            .map((node) => node.getAttribute("data-home-block"))
            .filter((id) => id !== "insight"),
        ),
      { timeout: 30_000 },
    )
    .toEqual([
      "balance",
      "month-totals",
      "budget",
      "upcoming-bills",
      "accounts",
      "goals",
    ]);
  await expect(
    page.getByRole("button", { name: "Personalizar o Início" }),
  ).toHaveCount(0);

  await page.goto("/ajustes/preferencias");
  await expect(
    page.getByRole("heading", { name: "Mês financeiro" }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole("heading", { name: "Início", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("Personalizar o Início")).toHaveCount(0);
  await expect(page.locator('[data-tip="home-customize"]')).toHaveCount(0);
});
