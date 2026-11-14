import { expect, type Page, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";
import { actionSaved, OWNER_STATE } from "./demo";
import { chooseTheme } from "./theme";

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
  "shared",
];
const CALENDAR_SECOND = [
  "balance",
  "spending-calendar",
  "month-totals",
  "budget",
  "upcoming-bills",
  "accounts",
  "goals",
  "shared",
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
  // The calendar is out of the default: after the default blocks, hidden.
  const calendar = sheet.getByRole("switch", { name: "Calendário de gastos" });
  await expect(calendar).toHaveAttribute("aria-checked", "false");
  await calendar.click();
  await expect(calendar).toHaveAttribute("aria-checked", "true");

  // Up to right after the Saldo, by keyboard: the focus stays on the button
  // that moved the row, disabled (not removed from the tab order) at the top.
  const up = sheet.getByRole("button", { name: "Subir Calendário de gastos" });
  await up.focus();
  for (let step = 0; step < 7; step++) await page.keyboard.press("Enter");
  await expect(up).toBeFocused();
  await expect(up).toHaveAttribute("aria-disabled", "true");
  await expect(sheet.locator("output")).toHaveText(
    "Calendário de gastos na posição 2 de 17.",
  );
  // One more Enter at the top changes nothing.
  await page.keyboard.press("Enter");
  await expect(sheet.locator("output")).toHaveText(
    "Calendário de gastos na posição 2 de 17.",
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

// The blocks of the reports (doc 02 §6.3), out of the default: turned on
// here, after the Início is back in the default above, and off again at the
// end.

/** The default Início with the four blocks of the reports at the end. */
const WITH_REPORTS = [
  ...DEFAULT_ORDER,
  "cash-flow",
  "category-breakdown",
  "income-expense",
  "net-worth",
];

/** A block on screen by its heading's id (not the hidden streaming copy). */
const blockOf = (page: Page, headingId: string) =>
  page.locator(`section[aria-labelledby="${headingId}"]:visible`);

test("liga os blocos dos relatórios, cada um com o nome da folha e o caminho do relatório", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/inicio");
  await expectBlocks(page, DEFAULT_ORDER);

  await customizeButton(page).click();
  const sheet = sheetOf(page);
  for (const name of [
    "Fluxo de caixa",
    "Para onde foi o dinheiro",
    "Receitas × despesas por mês",
    "Patrimônio",
  ]) {
    const block = sheet.getByRole("switch", { name, exact: true });
    await expect(block).toHaveAttribute("aria-checked", "false");
    await block.click();
    await expect(block).toHaveAttribute("aria-checked", "true");
  }
  const saved = homeSaved(page);
  await sheet.getByRole("button", { name: "Salvar" }).click();
  expect((await saved).ok()).toBe(true);
  await expect(sheet).toBeHidden();
  await expectBlocks(page, WITH_REPORTS);

  // The heading is the block's name in the sheet (doc 02 §10.4).
  for (const [id, name, href] of [
    ["inicio-fluxo", "Fluxo de caixa", "/relatorios/fluxo"],
    [
      "inicio-categorias",
      "Para onde foi o dinheiro",
      "/relatorios/categorias?periodo=1",
    ],
    [
      "inicio-receitas-despesas",
      "Receitas × despesas por mês",
      "/relatorios/visao-geral?periodo=6",
    ],
    ["inicio-patrimonio", "Patrimônio", "/relatorios/patrimonio?periodo=6"],
  ] as const) {
    const block = blockOf(page, id);
    await expect(
      block.getByRole("heading", { level: 2, name, exact: true }),
    ).toBeVisible();
    await expect(
      block.getByRole("link", { name: "Ver relatório" }),
    ).toHaveAttribute("href", href);
  }
});

test("em outro mês, os blocos dos relatórios levam o mês aos relatórios", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const month = previousMonth();
  await page.goto(`/inicio?mes=${month}`);
  await expectBlocks(page, WITH_REPORTS);
  for (const [id, href] of [
    ["inicio-fluxo", `/relatorios/fluxo?mes=${month}`],
    // "Para onde foi o dinheiro" no longer goes to the statement.
    ["inicio-categorias", `/relatorios/categorias?periodo=1&mes=${month}`],
    [
      "inicio-receitas-despesas",
      `/relatorios/visao-geral?periodo=6&mes=${month}`,
    ],
    ["inicio-patrimonio", `/relatorios/patrimonio?periodo=6&mes=${month}`],
  ] as const) {
    await expect(
      blockOf(page, id).getByRole("link", { name: "Ver relatório" }),
    ).toHaveAttribute("href", href);
  }
  await expect(
    blockOf(page, "inicio-categorias").getByRole("link", {
      name: "Ver no extrato",
    }),
  ).toHaveCount(0);
});

test("antes do primeiro registro, os quatro blocos e os relatórios dizem 'Sem registros'", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/inicio?mes=2000-01");
  await expectBlocks(page, WITH_REPORTS);
  // The invites are blocks without a section of their own: one heading, one
  // line and one button for each of the four.
  await expect(
    page.getByRole("heading", { name: "Sem registros em janeiro de 2000" }),
  ).toHaveCount(4);
  await expect(page.getByText(/^Seus registros começam em /)).toHaveCount(4);
  const goTo = page.getByRole("link", { name: /^Ir para / });
  await expect(goTo).toHaveCount(4);
  for (const link of await goTo.all()) {
    await expect(link).toHaveAttribute("href", /^\/inicio\?mes=\d{4}-\d{2}$/);
  }

  // The Fluxo and the Patrimônio say the same, with the button that goes to
  // where the records begin.
  for (const [path, label] of [
    ["/relatorios/fluxo?mes=2000-01", "Fluxo"],
    ["/relatorios/patrimonio?periodo=6&mes=2000-01", "Patrimônio"],
  ] as const) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: "Sem registros em janeiro de 2000" }),
      label,
    ).toBeVisible({ timeout: 30_000 });
    const go = page.getByRole("link", { name: /^Ir para / });
    await expect(go, label).toBeVisible();
    const box = await go.boundingBox();
    expect(box?.height ?? 0, label).toBeGreaterThanOrEqual(44 - 1);
    await go.click();
    await expect(page, label).toHaveURL(/mes=\d{4}-\d{2}/);
    await expect(
      page.getByRole("heading", { name: /^Sem registros em / }),
      label,
    ).toHaveCount(0);
  }
});

test("os relatórios por período mantêm o mês e dizem até onde vão", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const month = previousMonth();
  await page.goto(`/relatorios/visao-geral?periodo=6&mes=${month}`);
  await expect(page.getByText(/^Até /).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByRole("link", { name: "Voltar para hoje" }),
  ).toHaveAttribute("href", "/relatorios/visao-geral?periodo=6");
  await expect(
    page.getByRole("link", { name: "Categorias", exact: true }),
  ).toHaveAttribute("href", `/relatorios/categorias?periodo=6&mes=${month}`);
  await page.getByRole("link", { name: "Voltar para hoje" }).click();
  await expect(page).not.toHaveURL(/mes=/);
});

test("no modo discreto, os gráficos dos blocos não falam valores", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/inicio");
  await expectBlocks(page, WITH_REPORTS);
  const scrub = blockOf(page, "inicio-fluxo").getByRole("slider", {
    name: "Percorrer o saldo dia a dia",
  });
  await expect(scrub).toHaveAttribute("aria-valuetext", /R\$/);

  const toggle = page.getByRole("button", { name: "Ocultar valores" });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(scrub).toHaveAttribute("aria-valuetext", /valor oculto/);
  await expect(scrub).not.toHaveAttribute("aria-valuetext", /R\$/);
  // Names from text, swapped by CSS like <Money>.
  await expect(
    blockOf(page, "inicio-receitas-despesas").locator(
      'button[aria-pressed="true"]',
    ),
  ).toHaveAccessibleName(/receitas valor oculto, despesas valor oculto$/);
  // The sparkline (a masked amount is an image too: "valor oculto").
  await expect(
    blockOf(page, "inicio-patrimonio").locator('[role="img"][aria-labelledby]'),
  ).toHaveAccessibleName(/^Patrimônio .*valor oculto/);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(scrub).toHaveAttribute("aria-valuetext", /R\$/);
});

test("sem violações do axe no tema claro: Início, relatórios e meses sem dados", async ({
  page,
}) => {
  test.setTimeout(240_000);
  try {
    await chooseTheme(page, "Claro");

    await page.goto("/inicio");
    await expectBlocks(page, WITH_REPORTS);
    await expect(
      blockOf(page, "inicio-patrimonio").getByRole("heading"),
    ).toBeVisible();
    await expectNoA11yViolations(page);

    const fluxo = blockOf(page, "inicio-fluxo");
    await fluxo.getByRole("button", { name: "Ver como tabela" }).click();
    await expect(
      fluxo.getByRole("region", { name: "Tabela do saldo dia a dia" }),
    ).toBeVisible();
    await expectNoA11yViolations(page);

    for (const path of [
      "/relatorios/visao-geral",
      "/relatorios/fluxo",
      "/relatorios/patrimonio",
    ]) {
      await page.goto(path);
      await expect(page.locator("h1:visible").first(), path).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText("Carregando…"), path).toHaveCount(0, {
        timeout: 30_000,
      });
      await expectNoA11yViolations(page);
    }

    // A month with no records ("Sem registros") and a month ahead.
    for (const path of ["/inicio?mes=2024-01", "/inicio?mes=2026-09"]) {
      await page.goto(path);
      await expectBlocks(page, WITH_REPORTS);
      await expectNoA11yViolations(page);
    }
  } finally {
    await chooseTheme(page, "Escuro");
  }
});

test("sem violações do axe no Início com os blocos dos relatórios e em Preferências", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto("/inicio");
  await expectBlocks(page, WITH_REPORTS);
  await expect(
    blockOf(page, "inicio-patrimonio").getByRole("heading"),
  ).toBeVisible();
  await expectNoA11yViolations(page);

  // The Fluxo's table: a region that scrolls, reachable by keyboard.
  const fluxo = blockOf(page, "inicio-fluxo");
  await fluxo.getByRole("button", { name: "Ver como tabela" }).click();
  await expect(
    fluxo.getByRole("region", { name: "Tabela do saldo dia a dia" }),
  ).toBeVisible();
  await expectNoA11yViolations(page);

  await customizeButton(page).click();
  await expect(sheetOf(page)).toBeVisible();
  await expectNoA11yViolations(page);
  await page.keyboard.press("Escape");
  await expect(sheetOf(page)).toBeHidden();

  await page.goto("/ajustes/preferencias");
  await expect(
    page.getByRole("heading", { name: "Mês financeiro" }),
  ).toBeVisible({ timeout: 30_000 });
  await expectNoA11yViolations(page);

  // Back to the default Início, as the other suites expect it.
  await page.goto("/inicio");
  await customizeButton(page).click({ timeout: 30_000 });
  const restored = homeSaved(page);
  await sheetOf(page).getByRole("button", { name: "Restaurar padrão" }).click();
  expect((await restored).ok()).toBe(true);
  await expectBlocks(page, DEFAULT_ORDER);
});

test("mostra Quanto dá para gastar por dia pela folha, na horizontal, e esconde de novo", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/inicio");
  await customizeButton(page).click();
  const sheet = sheetOf(page);
  const name = "Quanto dá para gastar por dia";
  const toggle = sheet.getByRole("switch", { name, exact: true });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(
    sheet.getByText(
      "Quanto dá para gastar por dia em cada um dos próximos 14 dias.",
    ),
  ).toBeVisible();
  await toggle.click();
  let saved = homeSaved(page);
  await sheet.getByRole("button", { name: "Salvar" }).click();
  expect((await saved).ok()).toBe(true);
  await expect(sheet).toBeHidden();

  const block = blockOf(page, "inicio-gasto-por-dia");
  await expect(
    block.getByRole("heading", { level: 2, name, exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(block.getByRole("link", { name: "Ver fluxo" })).toHaveAttribute(
    "href",
    "/relatorios/fluxo",
  );
  // A focusable strip of day cards, today first (a single card on the last
  // day of the month), and a page that never scrolls sideways.
  const strip = block.getByRole("region", {
    name: "Quanto dá para gastar em cada dia",
  });
  await expect(strip).toHaveAttribute("tabindex", "0");
  const items = strip.getByRole("listitem");
  await expect(items.first()).toContainText("Hoje");
  await expect(items.first()).toHaveAttribute("aria-current", "date");
  expect(await items.count()).toBeLessThanOrEqual(14);
  await expect(strip.locator('[aria-current="date"]')).toHaveCount(1);
  await expect(block.getByText("sem o orçamento")).toBeVisible();
  await strip.focus();
  await expect(strip).toBeFocused();
  for (const width of [360, 430]) {
    await page.setViewportSize({ width, height: 780 });
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      )
      .toBe(true);
  }
  await expectNoA11yViolations(page);
  try {
    await chooseTheme(page, "Claro");
    await page.goto("/inicio");
    await expect(strip).toBeVisible();
    await expectNoA11yViolations(page);
  } finally {
    await chooseTheme(page, "Escuro");
  }

  await customizeButton(page).click();
  await sheet.getByRole("switch", { name, exact: true }).click();
  saved = homeSaved(page);
  await sheet.getByRole("button", { name: "Salvar" }).click();
  expect((await saved).ok()).toBe(true);
  await expect(blockOf(page, "inicio-gasto-por-dia")).toHaveCount(0);
});

test("mostra Maior gasto da semana pela folha, com o caminho do Extrato, e esconde de novo", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/inicio");
  await customizeButton(page).click();
  const sheet = sheetOf(page);
  const name = "Maior gasto da semana";
  const toggle = sheet.getByRole("switch", { name, exact: true });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(
    sheet.getByText("Os 3 maiores gastos dos últimos 7 dias."),
  ).toBeVisible();
  await toggle.click();
  const saved = homeSaved(page);
  await sheet.getByRole("button", { name: "Salvar" }).click();
  expect((await saved).ok()).toBe(true);
  await expect(sheet).toBeHidden();

  // The demo's dates are relative to today: the last 7 days may or may not
  // hold an expense, so the block is the list or its invite, never both.
  const block = blockOf(page, "inicio-maior-gasto");
  const invite = page.getByRole("heading", {
    name: "Nenhum gasto nos últimos 7 dias",
  });
  await expect(block.or(invite)).toBeVisible({ timeout: 30_000 });
  if (await block.isVisible()) {
    await expect(
      block.getByRole("heading", { level: 2, name, exact: true }),
    ).toBeVisible();
    await expect(block.getByText("Pagas nos últimos 7 dias")).toBeVisible();
    const rows = block.getByRole("listitem");
    expect(await rows.count()).toBeLessThanOrEqual(3);
    await expect(
      block.getByRole("link", { name: "Ver no Extrato" }),
    ).toHaveAttribute("href", "/extrato?tipo=despesa");
    // Each row opens the statement narrowed to its account and kind.
    await expect(rows.first().getByRole("link").first()).toHaveAttribute(
      "href",
      /^\/extrato\?.*tipo=despesa/,
    );
    // The day is said once in the row's name.
    const rowName = await rows
      .first()
      .locator("[aria-label]")
      .first()
      .getAttribute("aria-label");
    expect(rowName?.match(/hoje|ontem/gi)?.length ?? 0).toBeLessThanOrEqual(1);

    // Discreet mode masks the amounts of the rows.
    const hide = page.getByRole("button", { name: "Ocultar valores" });
    await hide.click();
    await expect(hide).toHaveAttribute("aria-pressed", "true");
    await expect(block.locator("[data-privacy-value]").first()).toBeHidden();
    await expect(block.locator("[data-privacy-mask]").first()).toBeVisible();
    await hide.click();
    await expect(hide).toHaveAttribute("aria-pressed", "false");

    await block.getByRole("link", { name: "Ver no Extrato" }).click();
    await expect(page).toHaveURL(/\/extrato\?tipo=despesa/);
    await page.goto("/inicio");
    await expect(blockOf(page, "inicio-maior-gasto")).toBeVisible({
      timeout: 30_000,
    });
  }
  await expectNoA11yViolations(page);

  await customizeButton(page).click();
  await sheet.getByRole("switch", { name, exact: true }).click();
  const hidden = homeSaved(page);
  await sheet.getByRole("button", { name: "Salvar" }).click();
  expect((await hidden).ok()).toBe(true);
  await expect(blockOf(page, "inicio-maior-gasto")).toHaveCount(0);
});

test("mostra Parcelas a terminar pela folha, com o Tênis em 6x do demo, e esconde de novo", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/inicio");
  await customizeButton(page).click();
  const sheet = sheetOf(page);
  const name = "Parcelas a terminar";
  const toggle = sheet.getByRole("switch", { name, exact: true });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(
    sheet.getByText(
      "Compras parceladas que ainda faltam pagar e quanto saem por mês.",
    ),
  ).toBeVisible();
  await toggle.click();
  const saved = homeSaved(page);
  await sheet.getByRole("button", { name: "Salvar" }).click();
  expect((await saved).ok()).toBe(true);
  await expect(sheet).toBeHidden();

  // The demo has the Tênis de corrida in 6x, bought ~40 days ago: always
  // with installments left.
  const block = blockOf(page, "inicio-parcelas-a-terminar");
  await expect(block).toBeVisible({ timeout: 30_000 });
  await expect(
    block.getByRole("heading", { level: 2, name, exact: true }),
  ).toBeVisible();
  await expect(block.getByText(/^Saem .* por mês$/)).toBeVisible();
  const rows = block.getByRole("listitem");
  expect(await rows.count()).toBeLessThanOrEqual(3);
  const shoes = block.getByRole("link", {
    name: /^Tênis de corrida, parcela \d de 6, faltam? .*; abrir no Extrato$/,
  });
  await expect(shoes).toBeVisible();
  await expect(shoes).toHaveAttribute(
    "href",
    /^\/extrato\?.*tipo=despesa.*status=pendente.*q=T%C3%AAnis/,
  );
  await expect(block.getByText("falta pagar").first()).toBeVisible();

  // Discreet mode masks the amounts.
  const hide = page.getByRole("button", { name: "Ocultar valores" });
  await hide.click();
  await expect(hide).toHaveAttribute("aria-pressed", "true");
  await expect(block.locator("[data-privacy-value]").first()).toBeHidden();
  await expect(block.locator("[data-privacy-mask]").first()).toBeVisible();
  await hide.click();
  await expect(hide).toHaveAttribute("aria-pressed", "false");

  await expectNoA11yViolations(page);

  await shoes.click();
  await expect(page).toHaveURL(/\/extrato\?.*status=pendente/);
  await page.goto("/inicio");
  await expect(blockOf(page, "inicio-parcelas-a-terminar")).toBeVisible({
    timeout: 30_000,
  });

  await customizeButton(page).click();
  await sheet.getByRole("switch", { name, exact: true }).click();
  const hidden = homeSaved(page);
  await sheet.getByRole("button", { name: "Salvar" }).click();
  expect((await hidden).ok()).toBe(true);
  await expect(blockOf(page, "inicio-parcelas-a-terminar")).toHaveCount(0);
});

test("mostra Comparado ao mês passado pela folha, com o relatório, e esconde de novo", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/inicio");
  await customizeButton(page).click();
  const sheet = sheetOf(page);
  const name = "Comparado ao mês passado";
  const toggle = sheet.getByRole("switch", { name, exact: true });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(
    sheet.getByText(
      "Seu gasto do mês até hoje contra o mesmo ponto do mês passado.",
    ),
  ).toBeVisible();
  await toggle.click();
  const saved = homeSaved(page);
  await sheet.getByRole("button", { name: "Salvar" }).click();
  expect((await saved).ok()).toBe(true);
  await expect(sheet).toBeHidden();

  // The demo's dates are relative to today: the block is the comparison or
  // its invite, never both.
  const block = blockOf(page, "inicio-comparado-mes");
  const invite = page.getByRole("heading", {
    name: "Nenhuma despesa para comparar",
  });
  await expect(block.or(invite)).toBeVisible({ timeout: 30_000 });
  if (await block.isVisible()) {
    await expect(
      block.getByRole("heading", { level: 2, name, exact: true }),
    ).toBeVisible();
    await expect(
      block.getByText("Despesas pagas", { exact: false }),
    ).toBeVisible();
    // Up, down or equal is always said in words.
    await expect(
      block
        .getByText(
          /a mais que em |a menos que em |Igual a |Sem despesas pagas em /,
        )
        .first(),
    ).toBeVisible();
    expect(await block.getByRole("listitem").count()).toBeLessThanOrEqual(3);
    await expect(
      block.getByRole("link", { name: "Ver relatório" }),
    ).toHaveAttribute("href", "/relatorios/categorias?periodo=1");

    // Discreet mode masks the amounts.
    const hide = page.getByRole("button", { name: "Ocultar valores" });
    await hide.click();
    await expect(hide).toHaveAttribute("aria-pressed", "true");
    await expect(block.locator("[data-privacy-value]").first()).toBeHidden();
    await expect(block.locator("[data-privacy-mask]").first()).toBeVisible();
    await hide.click();
    await expect(hide).toHaveAttribute("aria-pressed", "false");

    await block.getByRole("link", { name: "Ver relatório" }).click();
    await expect(page).toHaveURL(/\/relatorios\/categorias\?periodo=1/);
    await page.goto("/inicio");
    await expect(blockOf(page, "inicio-comparado-mes")).toBeVisible({
      timeout: 30_000,
    });
  }
  await expectNoA11yViolations(page);

  // A month ahead has nothing to compare yet.
  const next = new Date();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + 2);
  const month = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
  await page.goto(`/inicio?mes=${month}`);
  await expect(
    page.getByRole("heading", { name: /ainda não começou$/ }),
  ).toBeVisible({ timeout: 30_000 });
  await page.goto("/inicio");

  await customizeButton(page).click();
  await sheet.getByRole("switch", { name, exact: true }).click();
  const hidden = homeSaved(page);
  await sheet.getByRole("button", { name: "Salvar" }).click();
  expect((await hidden).ok()).toBe(true);
  await expect(blockOf(page, "inicio-comparado-mes")).toHaveCount(0);
});

test("Quanto dá para gastar, por conta: uma linha por conta, esconder uma, total igual e vale depois de recarregar", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const name = "Quanto dá para gastar por dia";
  const sheet = sheetOf(page);
  const chooser = page.getByRole("dialog", { name: "Contas no bloco" });
  const block = blockOf(page, "inicio-gasto-por-dia");
  const today = () =>
    block
      .getByRole("region", { name: "Quanto dá para gastar em cada dia" })
      .getByRole("listitem")
      .first();
  const accountSwitch = (account: string) =>
    chooser.getByRole("switch", { name: account, exact: true });

  await page.goto("/inicio");
  await customizeButton(page).click();
  await sheet.getByRole("switch", { name, exact: true }).click();
  let saved = homeSaved(page);
  await sheet.getByRole("button", { name: "Salvar" }).click();
  expect((await saved).ok()).toBe(true);
  try {
    await expect(today()).toBeVisible({ timeout: 30_000 });
    // One line per account to spend from under the total (the demo has
    // three; smoke.spec.ts archives Carteira later in the run).
    for (const account of ["Conta principal", "Reserva"]) {
      await expect(today()).toContainText(account);
    }
    await expect(today().getByText("Total", { exact: true })).toBeVisible();
    // Ana's vale-refeição has its own line, outside the total.
    await expect(today().getByText("Fora do total")).toBeVisible();
    await expect(today()).toContainText("Vale-refeição");
    await expect(
      block.getByText("Em cada conta, o saldo e o agendado dela", {
        exact: false,
      }),
    ).toBeVisible();
    const totalBefore = await today()
      .locator('[data-slot="money"]')
      .first()
      .textContent();
    await expectNoA11yViolations(page);

    // Hide "Reserva": its line goes, the total stays.
    await block.getByRole("button", { name: "Escolher contas" }).click();
    await expect(chooser).toBeVisible();
    await expect(accountSwitch("Reserva")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await accountSwitch("Reserva").click();
    saved = actionSaved(page, "hiddenAccountIds");
    await chooser.getByRole("button", { name: "Salvar" }).click();
    expect((await saved).ok()).toBe(true);
    await expect(chooser).toBeHidden();
    await expect(today()).not.toContainText("Reserva");
    await expect(today()).toContainText("Conta principal");
    await expect(today().locator('[data-slot="money"]').first()).toHaveText(
      totalBefore ?? "",
    );

    // The choice is on the account, not on the device: it survives a reload.
    await page.reload();
    await expect(today()).toBeVisible({ timeout: 30_000 });
    await expect(today()).not.toContainText("Reserva");
    await expect(today().locator('[data-slot="money"]').first()).toHaveText(
      totalBefore ?? "",
    );
  } finally {
    // Back to the default: every account shown, the block off.
    await page.goto("/inicio");
    const choose = block.getByRole("button", { name: "Escolher contas" });
    const streamed = await choose
      .waitFor({ timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    if (streamed) {
      await choose.click();
      if (
        (await accountSwitch("Reserva").getAttribute("aria-checked")) !== "true"
      ) {
        await accountSwitch("Reserva").click();
        const restored = actionSaved(page, "hiddenAccountIds");
        await chooser.getByRole("button", { name: "Salvar" }).click();
        await restored;
      } else {
        await page.keyboard.press("Escape");
      }
      await expect(chooser).toBeHidden();
    }
    await customizeButton(page).click();
    await sheet.getByRole("switch", { name, exact: true }).click();
    const off = homeSaved(page);
    await sheet.getByRole("button", { name: "Salvar" }).click();
    await off;
  }
});
