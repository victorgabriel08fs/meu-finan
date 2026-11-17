import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test as setup } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";
import {
  BRUNO_EMAIL,
  BRUNO_PASSWORD,
  BRUNO_STATE,
  EMAIL,
  OWNER_PASSKEY,
  OWNER_STATE,
  PASSWORD,
  setTips,
} from "./demo";

// Signs in once and saves the session for the other tests: signing in per
// test would hit the sign-in rate limit (5 per minute).
setup("entra com a conta de demonstração", async ({ page }) => {
  setup.setTimeout(120_000);
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(EMAIL);
  await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar com senha" }).click();
  // On a fresh server the first /api/auth call (the passkey options /entrar
  // asks for on load) is slow and the sign-in waits behind it: on a busy
  // machine this setup has taken over 20 s.
  await expect(page).toHaveURL(/\/inicio/, { timeout: 60_000 });

  // The administrator is Ana: Administração asks for a session confirmed with
  // a passkey (doc 01 §11.9). A virtual authenticator (CDP) registers one and
  // confirms with it, so the saved session is the stamped one the specs use.
  // The credential is saved for admin-passkey.spec.ts, which confirms a new
  // password session with it. Needs the demo made fresh (`npm run demo`):
  // `npm run test:e2e` does.
  const cdp = await page.context().newCDPSession(page);
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
  await page.goto("/admin/usuarios");
  await expect(page).toHaveURL(/\/ajustes\/seguranca\/admin\?voltar=/, {
    timeout: 60_000,
  });
  await expect(
    page.getByRole("heading", { name: "Cadastre uma passkey" }),
    "a conta do Ana já tem passkey: rode `npm run demo` antes",
  ).toBeVisible({ timeout: 30_000 });
  await expectNoA11yViolations(page);
  await page
    .getByRole("button", { name: "Cadastrar passkey neste aparelho" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Confirme que é você" }),
  ).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Confirmar com passkey" }).click();
  await expect(page).toHaveURL(/\/admin\/usuarios$/, { timeout: 30_000 });
  const { credentials } = await cdp.send("WebAuthn.getCredentials", {
    authenticatorId,
  });
  expect(credentials).toHaveLength(1);
  mkdirSync("e2e/.auth", { recursive: true });
  writeFileSync(OWNER_PASSKEY, JSON.stringify(credentials[0]));
  await page.context().storageState({ path: OWNER_STATE });
  // Tip balloons stay off for the suite, so they never sit over a screen a
  // test drives: `npm run test:e2e` already makes the demo with --sem-dicas,
  // and this covers a demo made without it. tips.spec.ts turns them on.
  await setTips(page, false);
});

// Bruno, a regular account, for the specs where two people act on one group
// (compartilhado.spec.ts opens a second browser context with this session).
setup("entra com a conta do Bruno", async ({ browser, baseURL }) => {
  setup.setTimeout(120_000);
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(BRUNO_EMAIL);
  await page.getByLabel("Senha", { exact: true }).fill(BRUNO_PASSWORD);
  await page.getByRole("button", { name: "Entrar com senha" }).click();
  await expect(page).toHaveURL(/\/inicio/, { timeout: 60_000 });
  await context.storageState({ path: BRUNO_STATE });
  await context.close();
});
