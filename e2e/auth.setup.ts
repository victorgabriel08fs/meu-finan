import { expect, test as setup } from "@playwright/test";
import { EMAIL, OWNER_STATE, PASSWORD, setTips } from "./demo";

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
  await page.context().storageState({ path: OWNER_STATE });
  // Tip balloons stay off for the suite, so they never sit over a screen a
  // test drives: `npm run test:e2e` already makes the demo with --sem-dicas,
  // and this covers a demo made without it. tips.spec.ts turns them on.
  await setTips(page, false);
});
