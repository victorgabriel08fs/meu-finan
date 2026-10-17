import { expect, type Page, test } from "@playwright/test";
import { actionSaved, OWNER_STATE, setTips } from "./demo";

// Tips and novidades (doc 02 §6.16). The suite runs with the balloons off
// (see auth.setup.ts); these tests turn them on, play the first-access
// sequence of the Início and a novidade, and leave them off again. They need
// the fresh demo of `npm run test:e2e`: the demo account predates every
// novidade, and novidades, once seen, stay seen.

test.describe.configure({ mode: "serial" });

/** Longer than a balloon takes to appear on a settled page. */
const BALLOON_DELAY_MS = 3_000;

async function expectLoaded(page: Page) {
  await expect(page.getByText("Carregando…")).toHaveCount(0, {
    timeout: 30_000,
  });
}

/** "Rever dicas" in Preferências: back on, and off to the Início. */
async function reviewTips(page: Page) {
  await page.goto("/ajustes/preferencias");
  await page.getByRole("button", { name: /^Rever dicas/ }).click();
  await expect(page).toHaveURL(/\/inicio$/, { timeout: 30_000 });
}

test.afterAll(async ({ browser }) => {
  // Leaves the balloons off even if a test above failed halfway.
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    storageState: OWNER_STATE,
  });
  await setTips(await context.newPage(), false);
  await context.close();
});

test("primeiro acesso: dicas do Início em sequência, a partir do +", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await reviewTips(page);
  const first = page.getByRole("dialog", { name: "Registre em segundos" });
  await expect(first).toBeVisible({ timeout: 30_000 });
  await expect(first.getByText("Dica 1 de 3")).toBeVisible();

  // The balloon sits right above the "+", which stays reachable through the
  // spotlight.
  const plus = page.locator('[data-tip="quick-add"]:visible');
  const [plusBox, balloonBox] = await Promise.all([
    plus.boundingBox(),
    first.boundingBox(),
  ]);
  if (!plusBox || !balloonBox) throw new Error("sem caixa do + ou do balão");
  const centre = plusBox.x + plusBox.width / 2;
  expect(balloonBox.y + balloonBox.height).toBeLessThan(plusBox.y);
  expect(balloonBox.x).toBeLessThan(centre);
  expect(balloonBox.x + balloonBox.width).toBeGreaterThan(centre);
  const hit = await page.evaluate(
    ([x, y]) =>
      document
        .elementFromPoint(x ?? 0, y ?? 0)
        ?.closest("[data-tip]")
        ?.getAttribute("data-tip"),
    [centre, plusBox.y + plusBox.height / 2],
  );
  expect(hit).toBe("quick-add");

  await first.getByRole("button", { name: "Próxima" }).click();
  const second = page.getByRole("dialog", {
    name: "Quanto deve sobrar no mês",
  });
  await expect(second).toBeVisible();
  await expect(second.getByText("Dica 2 de 3")).toBeVisible();
  await second.getByRole("button", { name: "Próxima" }).click();
  const third = page.getByRole("dialog", { name: "Modo discreto" });
  await expect(third).toBeVisible();
  const saved = actionSaved(page, "inicio-modo-discreto");
  await third.getByRole("button", { name: "Entendi" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await saved;

  // Seen is seen: a reload does not bring them back.
  await page.reload();
  await expectLoaded(page);
  await page.waitForTimeout(BALLOON_DELAY_MS);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("“Rever dicas” traz as dicas de volta; “Pular dicas” oferece desligar", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await reviewTips(page);
  const first = page.getByRole("dialog", { name: "Registre em segundos" });
  await expect(first).toBeVisible({ timeout: 30_000 });

  // Esc dismisses one tip; the next comes.
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Quanto deve sobrar no mês" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Pular dicas" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Dicas desta tela puladas.")).toBeVisible();
  await page.getByRole("button", { name: "Não mostrar mais" }).click();
  await expect(page.getByText(/^Pronto, sem mais dicas/)).toBeVisible();

  await page.goto("/ajustes/preferencias");
  await expect(
    page.getByRole("switch", { name: "Mostrar dicas nas telas" }),
  ).toHaveAttribute("aria-checked", "false");
});

test("novidade: aparece para quem já usava o app antes dela", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await setTips(page, true);

  await page.goto("/relatorios/visao-geral");
  const news = page.getByRole("dialog", { name: "Três relatórios novos" });
  await expect(news).toBeVisible({ timeout: 30_000 });
  await expect(news.getByText("Novidade", { exact: true })).toBeVisible();
  const seen = actionSaved(page, "novidade-relatorios");
  await news.getByRole("button", { name: "Entendi" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await seen;
  // It stands in for the basic tip about the tabs: no second balloon.
  await page.waitForTimeout(BALLOON_DELAY_MS);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // The other novidades are still unread: the avatar says so…
  await page.goto("/inicio");
  await expect(
    page.getByRole("link", { name: /^Perfil e ajustes\W+3 novidades$/ }),
  ).toBeVisible({ timeout: 30_000 });

  // …and Ajustes › Novidades marks them, then reads them.
  const read = actionSaved(page, "novidade-atalhos-do-app");
  await page.goto("/ajustes/novidades");
  const item = (title: string) =>
    page.getByRole("listitem").filter({ hasText: title });
  await expect(item("Três relatórios novos")).toBeVisible({ timeout: 30_000 });
  await expect(
    item("Três relatórios novos").getByText("Nova", { exact: true }),
  ).toHaveCount(0);
  await expect(
    item("Atalhos no ícone do app").getByText("Nova", { exact: true }),
  ).toBeVisible();
  await read;

  await page.goto("/inicio");
  await expect(
    page.getByRole("link", { name: "Perfil e ajustes", exact: true }),
  ).toBeVisible({ timeout: 30_000 });
});

test("com as dicas desligadas, nenhum balão aparece", async ({ page }) => {
  test.setTimeout(120_000);
  await setTips(page, false);
  // The Extrato tip was never seen, and still does not show.
  await page.goto("/extrato");
  await expectLoaded(page);
  await page.waitForTimeout(BALLOON_DELAY_MS);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
