import { expect, test as setup } from "@playwright/test";
import { EMAIL, OWNER_STATE, PASSWORD, setTips } from "./demo";

// Signs in once and saves the session for the other tests: signing in per
// test would hit the sign-in rate limit (5 per minute).
setup("entra com a conta de demonstração", async ({ page }) => {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(EMAIL);
  await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar com senha" }).click();
  await expect(page).toHaveURL(/\/inicio/);
  await page.context().storageState({ path: OWNER_STATE });
  // Tip balloons stay off for the suite, so they never sit over a screen a
  // test drives: `npm run test:e2e` already makes the demo with --sem-dicas,
  // and this covers a demo made without it. tips.spec.ts turns them on.
  await setTips(page, false);
});
