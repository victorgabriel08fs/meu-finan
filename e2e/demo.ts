import { expect, type Page } from "@playwright/test";

// Demo credentials created by `npm run demo` (local database only), and the
// session the setup project saves for the other tests.
export const EMAIL = "demo@meu-finan.local";
export const PASSWORD = "meu-finan-demo";
export const OWNER_STATE = "e2e/.auth/owner.json";

/** A regular account (not an administrator) with its own data. */
export const BRUNO_EMAIL = "bruno@meu-finan.local";
export const BRUNO_PASSWORD = "meu-finan-bruno";

/**
 * Resolves once a Server Action carrying `text` (a tip id, say) got its
 * answer. Start it before the click: a full navigation right after a click
 * would cancel the request.
 */
export function actionSaved(page: Page, text: string) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.request().headers()["next-action"] !== undefined &&
      (response.request().postData() ?? "").includes(text),
  );
}

/**
 * Turns the tip balloons on or off in Ajustes › Preferências, waiting for the
 * change to be saved (a navigation right after would cancel the request).
 */
export async function setTips(page: Page, on: boolean): Promise<void> {
  await page.goto("/ajustes/preferencias");
  const toggle = page.getByRole("switch", { name: "Mostrar dicas nas telas" });
  await expect(toggle).toBeVisible({ timeout: 30_000 });
  if ((await toggle.getAttribute("aria-checked")) !== String(on)) {
    await Promise.all([actionSaved(page, `"off":${!on}`), toggle.click()]);
  }
  await expect(toggle).toHaveAttribute("aria-checked", String(on));
}
