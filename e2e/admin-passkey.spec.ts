import { readFileSync } from "node:fs";
import { devices, expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";
import {
  BRUNO_EMAIL,
  BRUNO_PASSWORD,
  EMAIL,
  OWNER_PASSKEY,
  PASSWORD,
} from "./demo";

// Administração asks for a session opened (or confirmed) with a passkey
// (doc 01 §11.9). auth.setup.ts registered Ana's passkey on a virtual
// authenticator (CDP, no test-only route in the app) and saved the credential;
// here a new device signs in with the password and confirms with it.
// Serial, and kept apart from the other specs that sign in with a password
// (the limit is 5 per minute).

test.describe.configure({ mode: "serial" });

test.use({ storageState: { cookies: [], origins: [] } });

test("senha sozinha não abre a Administração; confirmar com a passkey abre", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const context = await browser.newContext({
    ...devices["Pixel 7"],
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(EMAIL);
  await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar com senha" }).click();
  await expect(page).toHaveURL(/\/inicio/, { timeout: 60_000 });

  // The authenticator comes after the password sign-in: it is a second device.
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send(
    "WebAuthn.addVirtualAuthenticator",
    {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    },
  );

  // Admin pages send the unconfirmed administrator to the confirmation.
  await page.goto("/admin/flags");
  await expect(page).toHaveURL(
    /\/ajustes\/seguranca\/admin\?voltar=%2Fadmin%2Fflags$/,
    { timeout: 30_000 },
  );
  await expect(
    page.getByRole("heading", { name: "Confirme que é você" }),
  ).toBeVisible({
    timeout: 30_000,
  });
  await expectNoA11yViolations(page);

  // Ajustes shows one line in place of the counts.
  await page.goto("/ajustes");
  await expect(
    page.getByRole("link", { name: /Confirme com sua passkey para abrir/ }),
  ).toBeVisible({ timeout: 30_000 });

  // Segurança: the banner, and the block on touching passkeys.
  await page.goto("/ajustes/seguranca");
  await expect(
    page.getByText(/Você entrou com senha\. Para mexer nas passkeys/),
  ).toBeVisible({ timeout: 30_000 });
  const sessionRows = await page
    .getByRole("listitem")
    .filter({ hasText: /Este aparelho|Último uso/ })
    .count();
  expect(sessionRows).toBeGreaterThan(1);
  await page
    .getByRole("button", { name: "Cadastrar passkey neste aparelho" })
    .click();
  await expect(
    page.getByText(
      "Confirme com uma passkey que você já tem antes de mexer nas passkeys.",
    ),
  ).toBeVisible({ timeout: 30_000 });

  // Confirm with the passkey saved by the setup.
  const credential = JSON.parse(readFileSync(OWNER_PASSKEY, "utf8"));
  await cdp.send("WebAuthn.addCredential", { authenticatorId, credential });
  await page.goto("/admin/flags");
  await page.getByRole("button", { name: "Confirmar com passkey" }).click();
  await expect(page).toHaveURL(/\/admin\/flags$/, { timeout: 30_000 });
  await expect(
    page.getByRole("heading", { name: "Administração" }),
  ).toBeVisible({ timeout: 30_000 });

  // Confirming ended the password session of this device: no ghost session
  // is left, so the list has as many rows as before.
  await page.goto("/ajustes/seguranca");
  const rows = page
    .getByRole("listitem")
    .filter({ hasText: /Este aparelho|Último uso/ });
  await expect(rows.filter({ hasText: "Este aparelho" })).toHaveCount(1, {
    timeout: 30_000,
  });
  await expect(rows).toHaveCount(sessionRows);
  await context.close();
});

test("quem não é administrador recebe a página 404 na confirmação e na Administração", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(BRUNO_EMAIL);
  await page.getByLabel("Senha", { exact: true }).fill(BRUNO_PASSWORD);
  await page.getByRole("button", { name: "Entrar com senha" }).click();
  await expect(page).toHaveURL(/\/inicio/, { timeout: 30_000 });

  // The 404 page instead of the content (the status is 200 once it streams).
  for (const path of ["/ajustes/seguranca/admin", "/admin/usuarios"]) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: "Página não encontrada" }),
      path,
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("heading", { name: "Confirme que é você" }),
    ).toHaveCount(0);
  }
});
