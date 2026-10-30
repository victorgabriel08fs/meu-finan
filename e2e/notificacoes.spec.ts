import { expect, test } from "@playwright/test";

// Ajustes › Notificações (doc 02 §6.14), behind the notificacoes_push flag,
// which the demo turns on for Ana only. Runs as Ana, with the session saved by
// auth.setup.ts. A headless browser cannot reach a real push service, so this
// covers the screen and the service worker, not a delivered notification.
// Headless Chromium reports notifications as blocked even when granted, so
// the screen shows the device's note on how to unblock them.

test("com a flag ligada, Ajustes leva a Notificações e o aparelho pode ativá-las", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/ajustes");
  await page.getByRole("link", { name: /Notificações/ }).click();
  await expect(page).toHaveURL(/\/ajustes\/notificacoes$/);

  const toggle = page.getByRole("switch", { name: "Receber notificações" });
  await expect(toggle).toBeVisible({ timeout: 30_000 });
  // Not subscribed yet; the keys are configured (playwright.config.ts), so
  // the note is about this device, never about missing keys.
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  const blocked = await page.evaluate(
    () => Notification.permission === "denied",
  );
  await expect(
    page.getByText(
      blocked
        ? "As notificações do Meu Finan estão bloqueadas neste aparelho."
        : "Vale só para este aparelho.",
      { exact: false },
    ),
  ).toBeVisible();
  if (!blocked) await expect(toggle).toBeEnabled();
  await expect(
    page.getByText("VAPID_PUBLIC_KEY", { exact: false }),
  ).toHaveCount(0);
  await expect(page.getByText("Contas a vencer")).toBeVisible();

  // The page registered the service worker, which controls the app's scope.
  const scope = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return registration.scope;
  });
  expect(new URL(scope).pathname).toBe("/");
  expect(errors).toEqual([]);
});

test("o service worker abre sem sessão e sem cache", async ({ request }) => {
  const response = await request.get("/sw.js", {
    headers: { cookie: "" },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-cache");
  expect(response.headers()["content-type"]).toContain("javascript");
});
