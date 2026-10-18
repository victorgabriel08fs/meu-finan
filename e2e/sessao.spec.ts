import { readFile } from "node:fs/promises";
import {
  type BrowserContext,
  expect,
  type Page,
  type Route,
  test,
} from "@playwright/test";
import { BRUNO_EMAIL, BRUNO_PASSWORD, OWNER_STATE } from "./demo";

// Changing accounts on one device (doc 02 §6.1). Signing in and out are full
// page loads, so nothing kept in memory (the sign-in form, stores, pages the
// router keeps mounted) reaches the next account; what stays on the device
// (the simulator inputs, the account theme it synced) is kept per account.

test.use({
  storageState: { cookies: [], origins: [] },
  // A client address of its own: the sign-in limit (5 per minute) counts per
  // address, so the two sign-ins here leave the rest of the suite's alone.
  extraHTTPHeaders: { "x-forwarded-for": "203.0.113.10" },
});

const SYNCED_THEME_KEY = "meu-finan:tema-da-conta";
const THEME_KEY = "meu-finan:tema";
const SIMULATOR_KEY = "meu-finan:simulador:v1";

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

function stored(page: Page, key: string): Promise<string | null> {
  return page.evaluate((name) => localStorage.getItem(name), key);
}

/**
 * Marks the document on screen: a full page load replaces it, a client-side
 * navigation keeps it, and everything held in memory with it.
 */
async function markDocument(page: Page) {
  await page.evaluate(() => Reflect.set(window, "e2eMarca", true));
}

function stillMarked(page: Page): Promise<boolean> {
  return page.evaluate(() => Reflect.get(window, "e2eMarca") === true);
}

async function signInAsBruno(page: Page) {
  await page.getByLabel("E-mail").fill(BRUNO_EMAIL);
  await page.getByLabel("Senha", { exact: true }).fill(BRUNO_PASSWORD);
  await markDocument(page);
  await page.getByRole("button", { name: "Entrar com senha" }).click();
  await expect(page).toHaveURL(/\/inicio/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: /, Bruno$/ })).toBeVisible({
    timeout: 30_000,
  });
  expect(await stillMarked(page), "entrar carrega a página de novo").toBe(
    false,
  );
}

async function signOut(page: Page) {
  const button = page.getByRole("button", { name: "Sair deste aparelho" });
  await expect(button).toBeVisible({ timeout: 30_000 });
  await markDocument(page);
  await button.click();
  await expect(page).toHaveURL(/\/entrar$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  expect(await stillMarked(page), "sair carrega a página de novo").toBe(false);
}

test("trocar de conta no aparelho não leva nada da conta anterior", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);

  // Bruno signs in with the form, walks to Segurança inside the app and
  // signs out: the form comes back empty, and signing in again works.
  await page.goto("/entrar");
  await signInAsBruno(page);
  await page.getByRole("link", { name: /^Perfil e ajustes/ }).click();
  await expect(page).toHaveURL(/\/ajustes$/, { timeout: 30_000 });
  await page.getByRole("link", { name: /^Segurança/ }).click();
  await expect(page).toHaveURL(/\/ajustes\/seguranca$/, { timeout: 30_000 });
  await signOut(page);
  await expect(page.getByLabel("E-mail")).toHaveValue("");
  await expect(page.getByLabel("Senha", { exact: true })).toHaveValue("");
  await signInAsBruno(page);
  expect(errors).toEqual([]);

  // The device synced Bruno's theme under his id ("{userId}:{theme}").
  await expect
    .poll(() => stored(page, SYNCED_THEME_KEY), { timeout: 30_000 })
    .toMatch(/^[^:]+:(dark|light|system)$/);
  const brunoSynced = (await stored(page, SYNCED_THEME_KEY)) ?? "";
  const [brunoId] = brunoSynced.split(":");

  // His simulator inputs are kept under his id too.
  const brunoInputs = `${SIMULATOR_KEY}:${brunoId}`;
  await page.goto("/planejar/simulador");
  await expect
    .poll(() => stored(page, brunoInputs), { timeout: 30_000 })
    .not.toBeNull();
  await page.getByRole("slider", { name: "Prazo", exact: true }).fill("25");
  await expect(page.getByText("Em 25 anos você terá").first()).toBeVisible();
  await expect.poll(() => stored(page, brunoInputs)).toContain('"months":300');
  expect(await stored(page, SIMULATOR_KEY)).toBeNull();

  // He switches the theme while the save fails (offline, say): the device
  // keeps his choice, and the synced value goes back to his account's theme.
  await page.goto("/inicio");
  const toggle = page.getByRole("button", { name: "Tema escuro" });
  await expect(toggle).toHaveAttribute("aria-pressed", /^(true|false)$/, {
    timeout: 30_000,
  });
  const choice =
    (await page.locator("html").getAttribute("data-theme")) === "dark"
      ? "light"
      : "dark";
  const failSave = (route: Route) =>
    route.request().headers()["next-action"] ? route.abort() : route.fallback();
  await page.route("**/*", failSave);
  await toggle.click();
  await expect(
    page.getByText(
      "O tema mudou neste aparelho, mas não conseguimos salvá-lo na sua conta.",
    ),
  ).toBeVisible();
  await page.unroute("**/*", failSave);
  await expect(page.locator("html")).toHaveAttribute("data-theme", choice);
  expect(await stored(page, THEME_KEY)).toBe(choice);
  expect(await stored(page, SYNCED_THEME_KEY)).toBe(brunoSynced);

  // Bruno signs out and Ana opens the app on the same device (with her saved
  // session: the suite's sign-ins are limited).
  await page.goto("/ajustes/seguranca");
  await signOut(page);
  const owner = JSON.parse(await readFile(OWNER_STATE, "utf8")) as {
    cookies: Parameters<BrowserContext["addCookies"]>[0];
  };
  await page.context().addCookies(owner.cookies);
  await page.goto("/inicio");
  await expect(page.getByRole("heading", { name: /, Ana$/ })).toBeVisible({
    timeout: 30_000,
  });

  // The device takes Ana's theme, whatever Bruno left on it…
  await expect
    .poll(
      async () =>
        (await stored(page, SYNCED_THEME_KEY))?.startsWith(`${brunoId}:`),
      { timeout: 30_000 },
    )
    .toBe(false);
  const [anaId, anaTheme] = (
    (await stored(page, SYNCED_THEME_KEY)) ?? ""
  ).split(":");
  expect(anaTheme).toMatch(/^(dark|light|system)$/);
  await expect.poll(() => stored(page, THEME_KEY)).toBe(anaTheme);
  if (anaTheme !== "system") {
    await expect(page.locator("html")).toHaveAttribute("data-theme", anaTheme);
  }

  // …and her simulator starts from the defaults, not from Bruno's inputs.
  await page.goto("/planejar/simulador");
  await expect
    .poll(() => stored(page, `${SIMULATOR_KEY}:${anaId}`), {
      timeout: 30_000,
    })
    .not.toBeNull();
  await expect(page.getByText("Em 10 anos você terá").first()).toBeVisible();
  await expect(page.getByText("Em 25 anos você terá")).toHaveCount(0);
  expect(await stored(page, brunoInputs)).toContain('"months":300');
});
