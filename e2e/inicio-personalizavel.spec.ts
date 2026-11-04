import { expect, type Page, test } from "@playwright/test";
import { OWNER_STATE } from "./demo";

// Início personalizável (doc 02 §6.3), as Ana: the demo turns the
// inicio_personalizavel flag on for her only. One serial flow that ends with
// the default Início again, since the tips suite plays the Início's tips on
// its default blocks. Bruno (flag off) is in novidades-flags.spec.ts.

test.describe.configure({ mode: "serial" });

/** The default Início, the Saldo first (src/lib/home/blocks.ts). */
const DEFAULT_ORDER = [
  "balance",
  "month-totals",
  "budget",
  "upcoming-bills",
  "accounts",
  "goals",
];
const CALENDAR_SECOND = [
  "balance",
  "spending-calendar",
  "month-totals",
  "budget",
  "upcoming-bills",
  "accounts",
  "goals",
];

/**
 * The blocks on screen, in order. The Destaque is left out: it shows only in
 * a month with a highlight. Hidden nodes are skipped: while a block streams
 * in, React keeps a hidden copy of it for an instant.
 */
function visibleBlocks(page: Page) {
  return page.locator("[data-home-block]").evaluateAll((nodes) =>
    nodes
      .filter((node) => node.checkVisibility())
      .map((node) => node.getAttribute("data-home-block"))
      .filter((id) => id !== "insight"),
  );
}

async function expectBlocks(page: Page, order: string[]) {
  await expect
    .poll(() => visibleBlocks(page), { timeout: 30_000 })
    .toEqual(order);
}

/** The Server Action of "Personalizar o Início" got its answer. */
function homeSaved(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.request().headers()["next-action"] !== undefined &&
      (response.request().postData() ?? "").includes('"blocks"'),
  );
}

/** "AAAA-MM" of the month before the current one, in São Paulo. */
function previousMonth(): string {
  const [year, month] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date())
    .split("-")
    .map(Number);
  const date = new Date(Date.UTC(year ?? 2026, (month ?? 1) - 2, 1));
  return date.toISOString().slice(0, 7);
}

const customizeButton = (page: Page) =>
  page.getByRole("button", { name: "Personalizar o Início" });
const sheetOf = (page: Page) =>
  page.getByRole("dialog", { name: "Personalizar o Início" });
const calendarDays = (page: Page) =>
  page
    .locator('section[aria-labelledby="inicio-calendario"]:visible')
    .locator("button[aria-pressed]");

test.afterAll(async ({ browser }) => {
  // Leaves Ana's Início in the default even if a test above failed halfway.
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    storageState: OWNER_STATE,
  });
  const page = await context.newPage();
  await page.goto("/inicio");
  await customizeButton(page).click({ timeout: 30_000 });
  const restore = sheetOf(page).getByRole("button", {
    name: "Restaurar padrão",
  });
  if (await restore.isVisible()) {
    const restored = homeSaved(page);
    await restore.click();
    await restored;
  }
  await context.close();
});

test("o Início padrão tem os blocos de sempre e o botão Personalizar", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/inicio");
  await expectBlocks(page, DEFAULT_ORDER);
  await expect(customizeButton(page)).toBeVisible();
});

test("personaliza pelo teclado, salva e vale depois de recarregar e em outro aparelho", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  await page.goto("/inicio");
  await expectBlocks(page, DEFAULT_ORDER);

  await customizeButton(page).click();
  const sheet = sheetOf(page);
  await expect(sheet).toBeVisible();
  // The calendar is new, out of the default: last, hidden.
  const calendar = sheet.getByRole("switch", { name: "Calendário de gastos" });
  await expect(calendar).toHaveAttribute("aria-checked", "false");
  await calendar.click();
  await expect(calendar).toHaveAttribute("aria-checked", "true");

  // Up to right after the Saldo, by keyboard: the focus stays on the button
  // that moved the row, disabled (not removed from the tab order) at the top.
  const up = sheet.getByRole("button", { name: "Subir Calendário de gastos" });
  await up.focus();
  for (let step = 0; step < 6; step++) await page.keyboard.press("Enter");
  await expect(up).toBeFocused();
  await expect(up).toHaveAttribute("aria-disabled", "true");
  await expect(sheet.locator("output")).toHaveText(
    "Calendário de gastos na posição 2 de 8.",
  );
  // One more Enter at the top changes nothing.
  await page.keyboard.press("Enter");
  await expect(sheet.locator("output")).toHaveText(
    "Calendário de gastos na posição 2 de 8.",
  );

  const saved = homeSaved(page);
  await sheet.getByRole("button", { name: "Salvar" }).click();
  expect((await saved).ok()).toBe(true);
  await expect(sheet).toBeHidden();
  await expectBlocks(page, CALENDAR_SECOND);

  await page.reload();
  await expectBlocks(page, CALENDAR_SECOND);

  // Another device of the same account (same session, no new sign-in).
  const device = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    storageState: OWNER_STATE,
  });
  const other = await device.newPage();
  await other.goto("/inicio");
  await expectBlocks(other, CALENDAR_SECOND);
  await device.close();
});

test("Esc fecha a folha e devolve o foco ao botão", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/inicio");
  await expectBlocks(page, CALENDAR_SECOND);
  const button = customizeButton(page);
  await button.click();
  await expect(sheetOf(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheetOf(page)).toBeHidden();
  await expect(button).toBeFocused();
});

test("um dia do calendário abre o relatório nesse dia, no mês do Início", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/inicio");
  await expectBlocks(page, CALENDAR_SECOND);
  await calendarDays(page).first().click();
  await expect(page).toHaveURL(
    /\/relatorios\/calendario\?dia=\d{4}-\d{2}-\d{2}$/,
    { timeout: 30_000 },
  );

  const month = previousMonth();
  await page.goto(`/inicio?mes=${month}`);
  await expectBlocks(page, CALENDAR_SECOND);
  await calendarDays(page).first().click();
  await expect(page).toHaveURL(
    new RegExp(`/relatorios/calendario\\?mes=${month}&dia=${month}-\\d{2}$`),
    { timeout: 30_000 },
  );

  // A month without expenses: a compact invite instead of the calendar.
  await page.goto("/inicio?mes=2024-01");
  await expectBlocks(page, CALENDAR_SECOND);
  await expect(
    page.getByRole("heading", { name: "Nenhuma despesa em janeiro" }),
  ).toBeVisible();
  await expect(calendarDays(page)).toHaveCount(0);
});

test("restaurar padrão volta ao Início do app, com desfazer", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/inicio");
  await expectBlocks(page, CALENDAR_SECOND);

  await customizeButton(page).click();
  let restored = homeSaved(page);
  await sheetOf(page).getByRole("button", { name: "Restaurar padrão" }).click();
  expect((await restored).ok()).toBe(true);
  await expect(sheetOf(page)).toBeHidden();
  await expect(page.getByText("O Início voltou ao padrão.")).toBeVisible();
  await expectBlocks(page, DEFAULT_ORDER);

  const undone = homeSaved(page);
  await page.getByRole("button", { name: "Desfazer" }).click();
  expect((await undone).ok()).toBe(true);
  await expectBlocks(page, CALENDAR_SECOND);

  // And back to the default, as the other suites expect it.
  await customizeButton(page).click();
  restored = homeSaved(page);
  await sheetOf(page).getByRole("button", { name: "Restaurar padrão" }).click();
  expect((await restored).ok()).toBe(true);
  await expectBlocks(page, DEFAULT_ORDER);
  await page.reload();
  await expectBlocks(page, DEFAULT_ORDER);
  // Not customized any more: no "Restaurar padrão" in the sheet.
  await customizeButton(page).click();
  await expect(
    sheetOf(page).getByRole("button", { name: "Restaurar padrão" }),
  ).toHaveCount(0);
});
