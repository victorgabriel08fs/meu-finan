import { expect, type Page } from "@playwright/test";

export type ThemeName = "Claro" | "Escuro";

const DATA_THEME = { Claro: "light", Escuro: "dark" } as const;

/**
 * Picks the theme in Ajustes › Preferências and waits until it is saved on
 * the account (the Server Action's response), like a person would. Leaves the
 * page on Preferências, with the theme applied.
 */
export async function chooseTheme(page: Page, name: ThemeName) {
  await page.goto("/ajustes/preferencias");
  // The desktop sidebar has its own switch: use the one on the page.
  const option = page.locator("#conteudo").getByRole("radio", { name });
  await expect(option).toBeVisible({ timeout: 30_000 });
  if ((await option.getAttribute("aria-checked")) !== "true") {
    const saved = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.request().headers()["next-action"] !== undefined,
    );
    await option.click();
    expect((await saved).ok()).toBe(true);
  }
  await expect(option).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme",
    DATA_THEME[name],
  );
}
