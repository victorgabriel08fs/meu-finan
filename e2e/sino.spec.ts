import { expect, type Locator, type Page, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";
import { BIG_TEXT, expectNoHorizontalScroll } from "./layout";
import { chooseTheme } from "./theme";

// para Ana e Bruno e dá a Ana 3 avisos na lista (um não lido, "Condomínio vence
// em dia não útil", de hoje; "Sua semana", de ontem; "Resumo do mês", de 10 dias atrás,
// os dois últimos lidos) e um dispensado. Roda como Ana, no Pixel 7. O teste
// de "marcar todas" gasta o único aviso não lido: o demo recria os dados a
// cada `npm run test:e2e`. "Marcar como pago" não é clicado aqui: pagar o
// Condomínio mudaria as telas dos testes que rodam depois.

test.describe.configure({ mode: "serial" });

const bell = (page: Page) =>
  page.locator("main").getByRole("button", { name: /^Notificações/ });
const sheet = (page: Page) =>
  page.getByRole("dialog", { name: "Notificações" });

/** The answer of the next Server Action (a reload right after would cancel it). */
const actionDone = (page: Page) =>
  page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.request().headers()["next-action"] !== undefined,
  );

async function openBell(page: Page) {
  await page.goto("/inicio");
  await expect(bell(page)).toBeVisible({ timeout: 30_000 });
  // The server-rendered bell can be tapped a moment before it is hydrated.
  await expect(async () => {
    await bell(page).click();
    await expect(sheet(page)).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await expect(sheet(page).getByText("Carregando notificações…")).toHaveCount(
    0,
    { timeout: 30_000 },
  );
}

test("o sino mostra o número de não lidas e a folha agrupa por dia", async ({
  page,
}) => {
  await page.goto("/inicio");
  await expect(bell(page)).toHaveAccessibleName("Notificações, 1 não lida", {
    timeout: 30_000,
  });
  await bell(page).click();
  await expect(sheet(page)).toBeVisible();

  const today = sheet(page).locator('section[aria-labelledby="notices-today"]');
  await expect(today.getByText("Condomínio vence em dia não útil")).toBeVisible(
    {
      timeout: 30_000,
    },
  );
  await expect(today.getByText("Não lida:")).toHaveCount(1);
  await expect(
    sheet(page)
      .locator('section[aria-labelledby="notices-week"]')
      .getByText("Sua semana"),
  ).toBeVisible();
  await expect(
    sheet(page)
      .locator('section[aria-labelledby="notices-earlier"]')
      .getByText("Resumo do mês"),
  ).toBeVisible();
  // The dismissed one stays out of the list.
  await expect(sheet(page).getByText("Resumo do dia")).toHaveCount(0);
  // "Marcar como pago" shows for the pending Condomínio.
  await expect(
    today.getByRole("button", { name: "Marcar como pago" }),
  ).toBeVisible();
  await expect(
    sheet(page).getByRole("button", { name: "Marcar todas como lidas" }),
  ).toBeVisible();
  // Every dismiss button is named and at least 44 px.
  const dismiss = sheet(page).getByRole("button", { name: "Dispensar" });
  await expect(dismiss).toHaveCount(3);
  const box = await dismiss.first().boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test("dispensar tira o aviso da lista e Desfazer o traz de volta", async ({
  page,
}) => {
  await openBell(page);
  const week = sheet(page).getByText("Sua semana");
  await expect(week).toBeVisible();
  const dismissed = actionDone(page);
  await sheet(page)
    .locator("li", { hasText: "Sua semana" })
    .getByRole("button", { name: "Dispensar" })
    .click();
  await expect(week).toHaveCount(0);
  await expect(page.getByText("Notificação dispensada")).toBeVisible();
  expect((await dismissed).ok()).toBe(true);
  // The click is dispatched on the button: with the sheet open, a real tap
  // does not reach the toast (next test, a known bug).
  const restored = actionDone(page);
  await page.getByRole("button", { name: "Desfazer" }).dispatchEvent("click");
  await expect(week).toBeVisible();
  expect((await restored).ok()).toBe(true);

  // The server kept it: a fresh load lists it again.
  await openBell(page);
  await expect(sheet(page).getByText("Sua semana")).toBeVisible();
});

// BUG (reported to the dev): with the sheet open, Radix's modal leaves the
// page with `pointer-events: none` and the toast sits under that rule, so the
// "Desfazer" of "Notificação dispensada" cannot be tapped (the same goes for
// the other toasts with an action opened from a sheet). Expected to fail
// until the toaster takes pointer events back; remove `test.fail` then.
test("Desfazer do toast pode ser tocado com a folha aberta", async ({
  page,
}) => {
  test.fail();
  await openBell(page);
  const week = sheet(page).getByText("Sua semana");
  const dismissed = actionDone(page);
  await sheet(page)
    .locator("li", { hasText: "Sua semana" })
    .getByRole("button", { name: "Dispensar" })
    .click();
  await expect(week).toHaveCount(0);
  await dismissed;
  const undo = page.getByRole("button", { name: "Desfazer" });
  try {
    await undo.click({ timeout: 5_000 });
    await expect(week).toBeVisible();
  } finally {
    // Leave the notice as it was for the tests that follow.
    if ((await week.count()) === 0) {
      const restored = actionDone(page);
      await undo.dispatchEvent("click");
      await restored;
    }
    await expect(week).toBeVisible();
  }
});

// BUG (reported to the dev): NoticeRow closes the sheet (setOpen(false)) and
// then calls router.push(href); closing from the UI steps back over the
// sheet's history entry (use-back-to-close.ts), which undoes the push, so the
// page stays on /inicio. The sheet should navigate and let the page unmount
// it, or push inside afterSheetsClose. Expected to fail until then; remove
// `test.fail` when fixed.
test("tocar num aviso lido fecha a folha e abre o destino", async ({
  page,
}) => {
  test.fail();
  await openBell(page);
  await sheet(page)
    .getByRole("button", { name: /Sua semana/ })
    .click();
  await expect(page).toHaveURL(/\/relatorios\/calendario/, {
    timeout: 30_000,
  });
  await expect(sheet(page)).toHaveCount(0);
});

test("a folha aberta passa no axe, no escuro e no claro", async ({ page }) => {
  test.setTimeout(120_000);
  try {
    for (const [theme, name] of [
      ["dark", "Escuro"],
      ["light", "Claro"],
    ] as const) {
      await chooseTheme(page, name);
      await openBell(page);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      try {
        await expectNoA11yViolations(page);
      } catch (error) {
        throw new Error(`Sino, tema ${name}: ${String(error)}`);
      }
    }
  } finally {
    await chooseTheme(page, "Escuro");
  }
});

test("a 360 px e 200% o sino e a folha não rolam para o lado", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/inicio");
  await page.addStyleTag({ content: BIG_TEXT });
  await expect(bell(page)).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(400);
  await expectNoHorizontalScroll(page, "Início com o sino a 200%");
  await bell(page).click();
  await expect(sheet(page)).toBeVisible();
  await expect(
    sheet(page).getByText("Condomínio vence em dia não útil"),
  ).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(500);
  await expectNoHorizontalScroll(page, "Folha do sino a 200%");
  // "Marcar todas como lidas" stays inside the sheet.
  const readAll = sheet(page).getByRole("button", {
    name: "Marcar todas como lidas",
  });
  const [button, dialog] = await Promise.all([
    readAll.boundingBox(),
    sheet(page).boundingBox(),
  ]);
  expect(button).not.toBeNull();
  expect(dialog).not.toBeNull();
  if (button && dialog) {
    expect(button.x).toBeGreaterThanOrEqual(dialog.x);
    expect(button.x + button.width).toBeLessThanOrEqual(
      dialog.x + dialog.width + 1,
    );
  }
});

test("no desktop o item da barra lateral abre a mesma folha", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/inicio");
  const item = page
    .locator("aside")
    .getByRole("button", { name: /^Notificações/ });
  await expect(item).toBeVisible({ timeout: 30_000 });
  await expect(item).toHaveAccessibleName("Notificações, 1 não lida");
  await item.click();
  await expect(sheet(page)).toBeVisible();
  await expect(
    sheet(page).getByText("Condomínio vence em dia não útil"),
  ).toBeVisible({
    timeout: 30_000,
  });
  await page.keyboard.press("Escape");
  await expect(sheet(page)).toHaveCount(0);
  await expect(item).toBeFocused();
});

test("marcar todas como lidas zera o número, também depois de recarregar", async ({
  page,
}) => {
  await openBell(page);
  const readAll = sheet(page).getByRole("button", {
    name: "Marcar todas como lidas",
  });
  await readAll.click();
  await expect(readAll).toHaveCount(0);
  await expect(sheet(page).getByText("Não lida:")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(bell(page)).toHaveAccessibleName("Notificações");
  await page.reload();
  await expect(bell(page)).toHaveAccessibleName("Notificações", {
    timeout: 30_000,
  });
});

test("com a flag desligada para Ana, o sino some e o servidor recusa a lista", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const GROUP = "Central de notificações para Ana";
  const openOverrides = async () => {
    await page.goto("/admin/flags");
    await page
      .locator('[data-flag="central_notificacoes"]')
      .getByRole("button", { name: "Ajustar" })
      .click();
    return page
      .getByRole("dialog", { name: "Central de notificações por pessoa" })
      .getByRole("radiogroup", { name: GROUP, exact: true });
  };
  const choose = async (group: Locator, name: "Desligado" | "Ligado") => {
    const saved = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.request().headers()["next-action"] !== undefined,
    );
    await group.getByRole("radio", { name, exact: true }).click();
    expect((await saved).ok()).toBe(true);
    await expect(group.getByRole("radio", { name, exact: true })).toBeChecked();
  };
  const hers = await openOverrides();
  await expect(
    hers.getByRole("radio", { name: "Ligado", exact: true }),
  ).toBeChecked({ timeout: 30_000 });
  await choose(hers, "Desligado");
  try {
    await page.goto("/inicio");
    await expect(page.locator("h1:visible").first()).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(500);
    await expect(
      page.getByRole("button", { name: /^Notificações/ }),
    ).toHaveCount(0);
    const response = await page.request.get("/api/notificacoes?limite=0");
    expect(response.status()).toBe(404);
  } finally {
    await choose(await openOverrides(), "Ligado");
  }
});
