import { expect, type Page, test } from "@playwright/test";

// Filtros do Extrato (doc 02 §5.12, §6.4), as Ana, on the month before the
// current one: every day of it already happened, so the demo has Reserva,
// Mercado and Receitas there whatever day the suite runs. A choice made in
// the sheet must change the URL (it once was undone by the sheet's own step
// back in history), and Back with the sheet open only closes it.

test.describe.configure({ mode: "serial" });

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

const MONTH = previousMonth();
const UNFILTERED = new RegExp(`/extrato\\?mes=${MONTH}$`);

async function openStatement(page: Page, query = "") {
  await page.goto(`/extrato?mes=${MONTH}${query}`);
  await expect(page.getByText("Carregando…")).toHaveCount(0, {
    timeout: 30_000,
  });
  await expect(filterChip(page, "Conta")).toBeVisible({ timeout: 30_000 });
}

/**
 * The main button of a filter chip ("Conta: Reserva", "Conta: Contas").
 * Hidden nodes are skipped: while the list streams in, React keeps a hidden
 * copy of it for an instant.
 */
function filterChip(page: Page, label: string, value?: string) {
  return page
    .getByRole("button", {
      name: value ? `${label}: ${value}` : new RegExp(`^${label}: `),
      exact: true,
    })
    .and(page.locator(":visible"));
}

const sheetOf = (page: Page, name: string) =>
  page.getByRole("dialog", { name: `Filtrar por ${name}` });

/** The accessible names of the statement rows on screen. */
function rowLabels(page: Page) {
  return page
    .locator('li:has(> div > [data-slot="transaction-row"]) > button')
    .evaluateAll((nodes) =>
      nodes
        .filter((node) => node.checkVisibility())
        .map((node) => node.getAttribute("aria-label") ?? ""),
    );
}

/** Waits until the list has rows and every one of them passes `test`. */
async function expectRows(page: Page, test: (label: string) => boolean) {
  await expect
    .poll(
      async () => {
        const labels = await rowLabels(page);
        return labels.length > 0 && labels.every(test);
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  await expect(page.locator("[data-pending]")).toHaveCount(0);
}

/** Waits until some row on screen passes `test`. */
async function expectSomeRow(page: Page, test: (label: string) => boolean) {
  await expect
    .poll(async () => (await rowLabels(page)).some(test), { timeout: 30_000 })
    .toBe(true);
}

/** "…, receita de R$ 1.234,56, …" → { kind: "receita", cents: 123456 }. */
function amountOf(label: string) {
  const match =
    /, (receita|despesa|transferência|ajuste de saldo) de R\$\s([\d.]+),(\d{2}),/.exec(
      label,
    );
  if (!match) throw new Error(`linha sem valor: ${label}`);
  return {
    kind: match[1],
    cents: Number(`${(match[2] ?? "").replaceAll(".", "")}${match[3]}`),
  };
}

/** A stat of the summary card, in cents ("R$ 1.234,56" → 123456). */
async function summaryCents(page: Page, stat: "Entradas" | "Saídas") {
  const text = await page
    .locator('section[aria-label^="Resumo de"]:visible div')
    .filter({ has: page.getByText(stat, { exact: true }) })
    .locator("dd [data-privacy-value] > [aria-hidden]")
    .innerText();
  return Number(text.replace(/\D/g, ""));
}

/** Entradas and Saídas are the sums of the rows (transfers count in none). */
async function expectTotalsOfRows(page: Page) {
  const amounts = (await rowLabels(page)).map(amountOf);
  const sum = (kind: string) =>
    amounts
      .filter((amount) => amount.kind === kind)
      .reduce((total, amount) => total + amount.cents, 0);
  expect(await summaryCents(page, "Entradas")).toBe(sum("receita"));
  expect(await summaryCents(page, "Saídas")).toBe(sum("despesa"));
}

const inReserva = (label: string) =>
  /, Reserva, |para Reserva, |de Reserva para /.test(label);
const inMercado = (label: string) => label.includes(", Mercado, ");
const isIncome = (label: string) => amountOf(label).kind === "receita";

test("conta escolhida pela folha filtra, fica no recarregar e Voltar desfaz", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openStatement(page);
  await expect(filterChip(page, "Conta", "Contas")).toBeVisible();

  await filterChip(page, "Conta").click();
  const sheet = sheetOf(page, "conta");
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: /^Reserva/ }).click();
  await expect(sheet).toBeHidden();

  await expect(page).toHaveURL(/conta=/);
  await expect(filterChip(page, "Conta", "Reserva")).toBeVisible();
  await expectRows(page, inReserva);
  await expectTotalsOfRows(page);

  await page.reload();
  await expect(filterChip(page, "Conta", "Reserva")).toBeVisible({
    timeout: 30_000,
  });
  await expectRows(page, inReserva);

  await page.goBack();
  await expect(page).toHaveURL(UNFILTERED);
  await expect(filterChip(page, "Conta", "Contas")).toBeVisible();
  await expectSomeRow(page, (label) => !inReserva(label));
});

test("categoria escolhida pela folha filtra, fica no recarregar e Voltar desfaz", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openStatement(page);

  await filterChip(page, "Categoria").click();
  const sheet = sheetOf(page, "categoria");
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Mercado", exact: true }).click();
  await expect(sheet).toBeHidden();

  await expect(page).toHaveURL(/categoria=/);
  await expect(filterChip(page, "Categoria", "Mercado")).toBeVisible();
  await expectRows(page, inMercado);
  await expectTotalsOfRows(page);

  await page.reload();
  await expect(filterChip(page, "Categoria", "Mercado")).toBeVisible({
    timeout: 30_000,
  });
  await expectRows(page, inMercado);

  await page.goBack();
  await expect(page).toHaveURL(UNFILTERED);
  await expect(filterChip(page, "Categoria", "Categorias")).toBeVisible();
});

test("tipo escolhido pela folha filtra, fica no recarregar e Voltar desfaz", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openStatement(page);

  await filterChip(page, "Tipo").click();
  const sheet = sheetOf(page, "tipo");
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Receitas", exact: true }).click();
  await expect(sheet).toBeHidden();

  await expect(page).toHaveURL(/tipo=receita/);
  await expect(filterChip(page, "Tipo", "Receitas")).toBeVisible();
  await expectRows(page, isIncome);
  await expectTotalsOfRows(page);
  expect(await summaryCents(page, "Saídas")).toBe(0);

  await page.reload();
  await expect(filterChip(page, "Tipo", "Receitas")).toBeVisible({
    timeout: 30_000,
  });
  await expectRows(page, isIncome);

  await page.goBack();
  await expect(page).toHaveURL(UNFILTERED);
  await expect(filterChip(page, "Tipo", "Tipo")).toBeVisible();
});

test("Mercado com Receitas não encontra nada, e Limpar filtros leva o foco ao primeiro chip", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openStatement(page);

  await filterChip(page, "Categoria").click();
  await sheetOf(page, "categoria")
    .getByRole("button", { name: "Mercado", exact: true })
    .click();
  await expect(sheetOf(page, "categoria")).toBeHidden();
  await expect(page).toHaveURL(/categoria=/);
  await expectRows(page, inMercado);

  await filterChip(page, "Tipo").click();
  await sheetOf(page, "tipo")
    .getByRole("button", { name: "Receitas", exact: true })
    .click();
  await expect(sheetOf(page, "tipo")).toBeHidden();
  await expect(page).toHaveURL(
    /categoria=.*tipo=receita|tipo=receita.*categoria=/,
  );
  await expect(page.getByText("Nada encontrado com esses filtros")).toBeVisible(
    { timeout: 30_000 },
  );
  await expect(filterChip(page, "Categoria", "Mercado")).toBeVisible();
  await expect(filterChip(page, "Tipo", "Receitas")).toBeVisible();

  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await expect(page).toHaveURL(UNFILTERED);
  await expect(filterChip(page, "Conta").first()).toBeFocused();
  await expect(filterChip(page, "Categoria", "Categorias")).toBeVisible();
  await expect(filterChip(page, "Tipo", "Tipo")).toBeVisible();
});

test("o × e o Limpar dos chips deixam o foco num chip", async ({ page }) => {
  test.setTimeout(120_000);
  await openStatement(page);

  await filterChip(page, "Tipo").click();
  await sheetOf(page, "tipo")
    .getByRole("button", { name: "Receitas", exact: true })
    .click();
  await expect(sheetOf(page, "tipo")).toBeHidden();
  await expect(filterChip(page, "Tipo", "Receitas")).toBeVisible();
  await expectRows(page, isIncome);

  await page
    .getByRole("button", { name: "Limpar filtro de tipo" })
    .and(page.locator(":visible"))
    .click();
  await expect(page).toHaveURL(UNFILTERED);
  await expect(filterChip(page, "Tipo", "Tipo")).toBeFocused();

  await filterChip(page, "Conta").click();
  await sheetOf(page, "conta")
    .getByRole("button", { name: /^Reserva/ })
    .click();
  await expect(sheetOf(page, "conta")).toBeHidden();
  await expect(filterChip(page, "Conta", "Reserva")).toBeVisible();
  await expectRows(page, inReserva);

  await page
    .getByRole("button", { name: "Limpar", exact: true })
    .and(page.locator(":visible"))
    .click();
  await expect(page).toHaveURL(UNFILTERED);
  await expect(filterChip(page, "Conta", "Contas")).toBeFocused();
});

test("Voltar com a folha aberta só fecha a folha", async ({ page }) => {
  test.setTimeout(120_000);
  await openStatement(page);
  await filterChip(page, "Categoria").click();
  const sheet = sheetOf(page, "categoria");
  await expect(sheet).toBeVisible();
  // The sheet pushes its history entry in a timer (useBackToClose).
  await page.waitForTimeout(400);

  await page.goBack();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(UNFILTERED);
  await expect(filterChip(page, "Categoria", "Categorias")).toBeVisible();
});

test("escolher o que já está marcado só fecha a folha", async ({ page }) => {
  test.setTimeout(120_000);
  await openStatement(page);

  // "Todas as contas" with no account chosen: the URL stays.
  await filterChip(page, "Conta").click();
  let sheet = sheetOf(page, "conta");
  await expect(
    sheet.getByRole("button", { name: "Todas as contas" }),
  ).toHaveAttribute("aria-pressed", "true");
  await sheet.getByRole("button", { name: "Todas as contas" }).click();
  await expect(sheet).toBeHidden();
  await page.waitForTimeout(400);
  await expect(page).toHaveURL(UNFILTERED);

  await filterChip(page, "Conta").click();
  sheet = sheetOf(page, "conta");
  await sheet.getByRole("button", { name: /^Reserva/ }).click();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/conta=/);
  const filtered = page.url();
  await expectRows(page, inReserva);

  // Reserva again: no new history entry, so one Back undoes the filter.
  await filterChip(page, "Conta").click();
  sheet = sheetOf(page, "conta");
  const reserva = sheet.getByRole("button", { name: /^Reserva/ });
  await expect(reserva).toHaveAttribute("aria-pressed", "true");
  await reserva.click();
  await expect(sheet).toBeHidden();
  await page.waitForTimeout(400);
  expect(page.url()).toBe(filtered);

  await page.goBack();
  await expect(page).toHaveURL(UNFILTERED);
});

test("conta e tipo que não valem não acendem chip nem Limpar", async ({
  page,
}) => {
  await openStatement(page, "&conta=lixo&tipo=xyz");
  await expect(filterChip(page, "Conta", "Contas")).toBeVisible();
  await expect(filterChip(page, "Tipo", "Tipo")).toBeVisible();
  await expect(
    page.locator('button[aria-label^="Limpar filtro"]:visible'),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("button", { name: "Limpar", exact: true })
      .and(page.locator(":visible")),
  ).toHaveCount(0);
  // The server ignores them too: the whole month is there.
  await expectSomeRow(page, (label) => amountOf(label).kind === "despesa");
  await expectSomeRow(page, (label) => !inReserva(label));
});
