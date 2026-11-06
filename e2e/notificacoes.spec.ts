import { expect, type Page, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";
import { actionSaved } from "./demo";
import { chooseTheme } from "./theme";

// Ajustes › Notificações (doc 02 §6.14), behind the notificacoes_push flag,
// which the demo turns on for Ana only. Runs as Ana, with the session saved by
// auth.setup.ts. A headless browser cannot reach a real push service, so this
// covers the screen and the service worker, not a delivered notification.
// Headless Chromium reports notifications as blocked even when granted, so
// the screen shows the device's note on how to unblock them; the device that
// turns them on below is a stand-in (see fakePushDevice). The Avisos end as
// the demo left them (the defaults), and the theme dark.

test.describe.configure({ mode: "serial" });

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
  await expect(
    page.getByText("Contas a vencer", { exact: true }),
  ).toBeVisible();

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

const NOTICES = [
  ["Resumo do dia", false],
  ["Contas a vencer", true],
  ["Próxima receita", false],
  ["Resumo semanal", true],
  ["Resumo mensal", true],
] as const;

const switchOf = (page: Page, name: string) =>
  page.getByRole("switch", { name, exact: true });

const leadTime = (page: Page) =>
  page.getByRole("radiogroup", { name: "Avisar com antecedência" });

async function openNotices(page: Page) {
  await page.goto("/ajustes/notificacoes");
  await expect(switchOf(page, "Resumo do dia")).toBeVisible({
    timeout: 30_000,
  });
}

/** Taps a control of the Avisos and waits for the choice to be saved. */
async function saveWith(page: Page, text: string, tap: () => Promise<void>) {
  const saved = actionSaved(page, text);
  await tap();
  expect((await saved).ok()).toBe(true);
}

test("Avisos: os padrões, e cada toque fica salvo na conta", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openNotices(page);
  for (const [name, on] of NOTICES) {
    await expect(switchOf(page, name)).toHaveAttribute(
      "aria-checked",
      String(on),
    );
  }
  await expect(
    switchOf(page, "Mostrar valores nas notificações"),
  ).toHaveAttribute("aria-checked", "false");
  await expect(
    leadTime(page).getByRole("radio", { name: "1 dia" }),
  ).toHaveAttribute("aria-checked", "true");
  // The demo account has no device that receives them.
  await expect(
    page.getByText("Nenhum aparelho recebe ainda", { exact: false }),
  ).toBeVisible();
  // Doc 02 §6.14: the old "Em breve" list is gone.
  await expect(page.getByText("Em breve")).toHaveCount(0);
  await expect(page.getByText("Fatura fechando")).toHaveCount(0);

  await saveWith(page, '"daily_summary":true', () =>
    switchOf(page, "Resumo do dia").click(),
  );
  await saveWith(page, '"billsLeadDays":3', () =>
    leadTime(page).getByRole("radio", { name: "3 dias" }).click(),
  );
  await page.reload();
  await expect(switchOf(page, "Resumo do dia")).toHaveAttribute(
    "aria-checked",
    "true",
    { timeout: 30_000 },
  );
  await expect(
    leadTime(page).getByRole("radio", { name: "3 dias" }),
  ).toHaveAttribute("aria-checked", "true");
  await expectNoA11yViolations(page);

  // Without Contas a vencer, nothing to choose about how early.
  await saveWith(page, '"bills_due":false', () =>
    switchOf(page, "Contas a vencer").click(),
  );
  await expect(leadTime(page)).toHaveCount(0);
  await page.reload();
  await expect(switchOf(page, "Contas a vencer")).toHaveAttribute(
    "aria-checked",
    "false",
    { timeout: 30_000 },
  );
  await expect(leadTime(page)).toHaveCount(0);

  // Back to the defaults.
  await saveWith(page, '"bills_due":true', () =>
    switchOf(page, "Contas a vencer").click(),
  );
  await saveWith(page, '"billsLeadDays":1', () =>
    leadTime(page).getByRole("radio", { name: "1 dia" }).click(),
  );
  await saveWith(page, '"daily_summary":false', () =>
    switchOf(page, "Resumo do dia").click(),
  );
});

test("sem conexão, o aviso volta ao que estava e o toast oferece Tentar de novo", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await openNotices(page);
  const weekly = switchOf(page, "Resumo semanal");
  await expect(weekly).toHaveAttribute("aria-checked", "true");

  await context.setOffline(true);
  await weekly.click();
  const toast = page
    .locator("[data-sonner-toast]")
    .filter({ hasText: "Não conseguimos salvar. Verifique a conexão." });
  await expect(toast).toBeVisible();
  await expect(weekly).toHaveAttribute("aria-checked", "true");

  await context.setOffline(false);
  await saveWith(page, '"weekly_summary":false', () =>
    toast.getByRole("button", { name: "Tentar de novo" }).click(),
  );
  await expect(weekly).toHaveAttribute("aria-checked", "false");
  await page.reload();
  await expect(weekly).toHaveAttribute("aria-checked", "false", {
    timeout: 30_000,
  });

  await saveWith(page, '"weekly_summary":true', () => weekly.click());
  await expect(weekly).toHaveAttribute("aria-checked", "true");
});

/**
 * A device whose notifications are allowed, for this page only. Headless
 * Chromium can neither grant them nor reach a push service, so the
 * subscription is a stand-in kept in localStorage: the server saves it like
 * a real one (an FCM endpoint), and nothing is ever sent to it here.
 */
async function fakePushDevice(page: Page) {
  await page.addInitScript(() => {
    const STORE = "e2e:push-endpoint";
    const keys = {
      p256dh:
        "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
      auth: "tBHItJI5svbpez7KI4CCXg",
    };
    const subscription = (
      endpoint: string,
      key: BufferSource | string | null,
    ) => ({
      endpoint,
      expirationTime: null,
      options: { applicationServerKey: key, userVisibleOnly: true },
      toJSON: () => ({ endpoint, expirationTime: null, keys }),
      unsubscribe: async () => {
        localStorage.removeItem(STORE);
        return true;
      },
    });
    Object.defineProperty(Notification, "permission", {
      get: () => "granted",
    });
    Notification.requestPermission = async () => "granted";
    PushManager.prototype.getSubscription = async () => {
      const endpoint = localStorage.getItem(STORE);
      return (
        endpoint ? subscription(endpoint, null) : null
      ) as PushSubscription | null;
    };
    PushManager.prototype.subscribe = async (options) => {
      const endpoint = "https://fcm.googleapis.com/fcm/send/e2e-ana";
      localStorage.setItem(STORE, endpoint);
      return subscription(
        endpoint,
        options?.applicationServerKey ?? null,
      ) as unknown as PushSubscription;
    };
  });
}

test("com o aparelho pronto: a nota do aparelho, 1 aparelho nos Avisos e a prévia para o administrador", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await fakePushDevice(page);
  await page.goto("/ajustes/notificacoes");
  const device = page.getByRole("switch", { name: "Receber notificações" });
  await expect(device).toBeEnabled({ timeout: 30_000 });
  await expect(device).toHaveAttribute("aria-checked", "false");
  // Ready to turn on: the note about this device (it never showed before).
  await expect(
    page.getByText("Vale só para este aparelho.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Enviar prévia dos avisos/ }),
  ).toHaveCount(0);

  await device.click();
  await expect(device).toHaveAttribute("aria-checked", "true");
  await expect(
    page.getByText("Notificações ativadas neste aparelho."),
  ).toBeVisible();
  // Ana is an administrator: the preview, next to the test.
  await expect(
    page.getByRole("button", { name: /^Enviar notificação de teste/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Enviar prévia dos avisos/ }),
  ).toBeVisible();
  // The count under Avisos comes from the server, refreshed.
  await expect(
    page.getByText("entre 6h e 7h (horário de Brasília), em 1 aparelho."),
  ).toBeVisible();
  await expectNoA11yViolations(page);

  // Off again: the demo account keeps no device.
  await device.click();
  await expect(device).toHaveAttribute("aria-checked", "false");
  await expect(
    page.getByText("Nenhum aparelho recebe ainda", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Enviar prévia dos avisos/ }),
  ).toHaveCount(0);
});

test("Notificações sem problemas de acessibilidade, no escuro e no claro", async ({
  page,
}) => {
  test.setTimeout(120_000);
  try {
    for (const [theme, name] of [
      ["dark", "Escuro"],
      ["light", "Claro"],
    ] as const) {
      await chooseTheme(page, name);
      await openNotices(page);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(leadTime(page)).toBeVisible();
      await expectNoA11yViolations(page);
    }
  } finally {
    await chooseTheme(page, "Escuro");
  }
});
