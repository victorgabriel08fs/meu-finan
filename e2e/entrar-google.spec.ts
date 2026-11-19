import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";
import { expectNoHorizontalScroll } from "./layout";

// Entrar com Google (ADR-15): the flag entrar_com_google is off by default.
// Google itself is never reached: accounts.google.com is intercepted and the
// request the app builds is checked. Runs as the owner (an administrator),
// who turns the flag on for everyone and puts it back at the end.

const GOOGLE = "https://accounts.google.com/**";

test("entrar com Google: desligado some, ligado leva ao Google e mostra os erros", async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  const owner = await context.storageState();
  const loggedOut = async () => {
    await context.clearCookies();
  };
  const loggedIn = async () => {
    await context.addCookies(owner.cookies);
  };

  // Off (default): the sign-in screen and Ajustes are as before.
  await loggedOut();
  await page.goto("/entrar");
  await expect(
    page.getByRole("button", { name: "Entrar com senha" }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole("button", { name: "Continuar com o Google" }),
  ).toHaveCount(0);
  await loggedIn();
  await page.goto("/ajustes/seguranca");
  await expect(
    page.getByRole("heading", { name: "Passkeys" }).first(),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Conta Google")).toHaveCount(0);

  const card = page.locator('[data-flag="entrar_com_google"]');
  await page.goto("/admin/flags");
  await card.getByRole("radio", { name: "Ligado", exact: true }).click();
  try {
    await expect(
      card.getByRole("radio", { name: "Ligado", exact: true }),
    ).toBeChecked({
      timeout: 15_000,
    });
    // Give the server action time to finish before navigating.
    await expect(page.getByText(/Entrar com Google ligado/)).toBeVisible({
      timeout: 15_000,
    });

    // Ajustes › Segurança: the card, and "Vincular" goes to Google.
    await page.goto("/ajustes/seguranca");
    const link = page.getByRole("button", { name: "Vincular conta Google" });
    await expect(link).toBeVisible({ timeout: 30_000 });
    await expectNoHorizontalScroll(page, "Ajustes › Segurança");
    let linkUrl: URL | undefined;
    await page.route(GOOGLE, async (route) => {
      linkUrl = new URL(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "ok",
      });
    });
    await link.click();
    await expect.poll(() => linkUrl?.hostname).toBe("accounts.google.com");
    expect(linkUrl?.searchParams.get("client_id")).toBe(
      "123456789-e2e.apps.googleusercontent.com",
    );
    expect(linkUrl?.searchParams.get("redirect_uri")).toMatch(
      /\/api\/auth\/callback\/google$/,
    );
    expect(linkUrl?.searchParams.get("prompt")).toBe("select_account");
    expect(linkUrl?.searchParams.get("code_challenge")).toBeTruthy();
    expect(linkUrl?.searchParams.get("state")).toBeTruthy();
    await page.unroute(GOOGLE);

    // A failed link says why, with the account's e-mail.
    await page.goto("/ajustes/seguranca?error=email_does_not_match");
    await expect(
      page
        .getByText(
          /Essa conta Google usa outro e-mail\. Escolha a conta com .+@/,
        )
        // A hidden copy of the streamed page can sit at the end of <body>.
        .locator("visible=true"),
    ).toBeVisible({ timeout: 30_000 });

    // Sign-in: the button, the Google request, the errors.
    await loggedOut();
    await page.goto("/entrar");
    const button = page.getByRole("button", { name: "Continuar com o Google" });
    await expect(button).toBeVisible({ timeout: 30_000 });
    expect((await button.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(
      44,
    );
    await expectNoHorizontalScroll(page, "Entrar");
    await expectNoA11yViolations(page);

    let signInUrl: URL | undefined;
    await page.route(GOOGLE, async (route) => {
      signInUrl = new URL(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "ok",
      });
    });
    await button.click();
    await expect.poll(() => signInUrl?.hostname).toBe("accounts.google.com");
    expect(signInUrl?.searchParams.get("client_id")).toBe(
      "123456789-e2e.apps.googleusercontent.com",
    );
    expect(signInUrl?.searchParams.get("prompt")).toBe("select_account");
    expect(signInUrl?.searchParams.get("code_challenge")).toBeTruthy();
    expect(signInUrl?.searchParams.get("state")).toBeTruthy();
    await page.unroute(GOOGLE);

    await page.goto("/entrar?error=account_not_linked");
    await expect(
      page.getByText(
        /Nenhuma conta do Prumo está vinculada a essa conta Google/,
      ),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("button", { name: "Continuar com o Google" }),
    ).toBeVisible();
    // Cancelling at Google shows no error.
    await page.goto("/entrar?error=access_denied");
    await expect(
      page.getByRole("button", { name: "Continuar com o Google" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/vinculada a essa conta Google/)).toHaveCount(
      0,
    );
  } finally {
    await loggedIn();
    await page.goto("/admin/flags");
    await card.getByRole("radio", { name: "Padrão" }).click();
    await expect(card.getByRole("radio", { name: "Padrão" })).toBeChecked({
      timeout: 15_000,
    });
  }
  // Back to off: the button is gone again.
  await loggedOut();
  await page.goto("/entrar");
  await expect(
    page.getByRole("button", { name: "Entrar com senha" }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole("button", { name: "Continuar com o Google" }),
  ).toHaveCount(0);
});
