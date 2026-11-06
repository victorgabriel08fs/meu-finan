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
// Mercado brings its subcategories: Feira, and Padaria (archived).
const inMercado = (label: string) => /, (Mercado|Feira|Padaria), /.test(label);
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

test("tocar no próximo chip enquanto a folha anterior fecha abre a folha nova", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openStatement(page);
  // Where the Conta chip is: while a sheet is open the page behind it is
  // hidden from the accessibility tree, so it is measured now.
  const conta = await filterChip(page, "Conta").boundingBox();
  if (!conta) throw new Error("chip Conta");
  // CSS animations at a tenth of the speed. A sheet that closes fades its
  // scrim out in 160 ms (1.6 s here) and slides away in 240 ms (2.4 s): the
  // tap lands in between, on the chip, while the sheet is still leaving.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Animation.enable");
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 0.1 });

  await filterChip(page, "Tipo").tap();
  const tipo = sheetOf(page, "tipo");
  await expect(tipo).toBeVisible();
  await tipo.getByRole("button", { name: "Receitas", exact: true }).tap();
  await page.waitForFunction(
    () =>
      !document.querySelector('[data-slot="sheet-overlay"]') &&
      document.querySelector(
        '[data-slot="sheet-content"][data-state="closed"]',
      ),
  );
  await page.touchscreen.tap(
    conta.x + conta.width / 2,
    conta.y + conta.height / 2,
  );
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 });
  await expect(
    page.locator('[data-slot="sheet-content"][data-state="closed"]'),
  ).toHaveCount(0, { timeout: 10_000 });

  // The new sheet stays open (a tap outside the sheet that was leaving once
  // closed it on the `click` that follows a touch), and the choice went on.
  const sheet = sheetOf(page, "conta");
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(500);
  await expect(sheet).toBeVisible();
  await expect(page).toHaveURL(/tipo=receita/);

  // It closes as usual, and Back after that undoes the filter.
  await sheet.getByRole("button", { name: /^Reserva/ }).tap();
  await expect(sheet).toBeHidden({ timeout: 10_000 });
  await expect(page).toHaveURL(/conta=.*tipo=receita|tipo=receita.*conta=/);
  await page.goBack();
  await expect(page).toHaveURL(/tipo=receita/);
  await expect(page).not.toHaveURL(/conta=/);
});

/** Picks `option` in the sheet of a filter chip and waits for it to close. */
async function choose(
  page: Page,
  chip: string,
  sheetName: string,
  option: string | RegExp,
) {
  await filterChip(page, chip).click();
  const sheet = sheetOf(page, sheetName);
  await expect(sheet).toBeVisible();
  await sheet
    .getByRole("button", {
      name: option,
      exact: typeof option === "string",
    })
    .click();
  await expect(sheet).toBeHidden();
}

/** Text at 200% (the browser's own setting), as a person with low vision. */
const BIG_TEXT = "html { font-size: 200% }";

/** The rows of the statement on screen (buttons that open the detail). */
const statementRows = (page: Page) =>
  page
    .locator('li:has(> div > [data-slot="transaction-row"]) > button')
    .and(page.locator(":visible"));

test("o Limpar fica na tela com quatro filtros, a 360 e 430 px, a 100% e a 200%", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openStatement(page);
  await choose(page, "Conta", "conta", /^Reserva/);
  await expect(page).toHaveURL(/conta=/);
  await choose(page, "Categoria", "categoria", "Mercado");
  await expect(page).toHaveURL(/categoria=/);
  await choose(page, "Tipo", "tipo", "Despesas");
  await expect(page).toHaveURL(/tipo=despesa/);
  await page.getByRole("button", { name: "Pendentes" }).click();
  await expect(page).toHaveURL(/status=pendente/);
  const filtered = page.url();

  for (const width of [360, 430]) {
    for (const bigText of [false, true]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(filtered);
      if (bigText) await page.addStyleTag({ content: BIG_TEXT });
      await expect(filterChip(page, "Categoria", "Mercado")).toBeVisible({
        timeout: 30_000,
      });
      const clear = page
        .getByRole("button", { name: "Limpar", exact: true })
        .and(page.locator(":visible"));
      await expect(
        clear,
        `Limpar a ${width} px, texto ${bigText ? "200%" : "100%"}`,
      ).toBeInViewport({ ratio: 1 });
      // The chips scroll under the fade; the page itself never does.
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
  }
});

test("a 200% nenhum valor do Extrato sai do cartão nem da tela, nos três modos do resumo", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 360, height: 800 });

  const outside = () =>
    page.evaluate(() => {
      const bad: string[] = [];
      for (const money of document.querySelectorAll('[data-slot="money"]')) {
        if (!money.checkVisibility()) continue;
        const rect = money.getBoundingClientRect();
        const card = money.closest("ul, section")?.getBoundingClientRect();
        const left = Math.max(0, card?.left ?? 0);
        const right = Math.min(window.innerWidth, card?.right ?? Infinity);
        if (rect.left < left - 0.5 || rect.right > right + 0.5) {
          bad.push(`${money.textContent} (${rect.left}–${rect.right})`);
        }
      }
      return {
        bad,
        scrolls: document.documentElement.scrollWidth > window.innerWidth,
      };
    });
  const expectWhole = async () => {
    await page.waitForTimeout(300);
    expect(await outside()).toEqual({ bad: [], scrolls: false });
  };

  // Fluxo: the month, with its day totals and rows.
  await openStatement(page);
  await page.addStyleTag({ content: BIG_TEXT });
  await expectSomeRow(page, () => true);
  await expectWhole();

  // Agendados: the pending ones, with the summary of what is still to come.
  await page.goto(`/extrato?mes=${MONTH}&status=pendente`);
  await page.addStyleTag({ content: BIG_TEXT });
  await expect(filterChip(page, "Conta")).toBeVisible({ timeout: 30_000 });
  await expectWhole();

  // Transferências: only the moves between accounts.
  await page.goto(`/extrato?mes=${MONTH}&tipo=transferencia`);
  await page.addStyleTag({ content: BIG_TEXT });
  await expect(filterChip(page, "Tipo", "Transferências")).toBeVisible({
    timeout: 30_000,
  });
  await expectSomeRow(page, () => true);
  await expectWhole();
});

test("Mercado traz Feira e Padaria (arquivada) e a busca da folha acha a subcategoria", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openStatement(page);

  await choose(page, "Categoria", "categoria", "Mercado");
  await expect(page).toHaveURL(/categoria=/);
  await expectRows(page, inMercado);
  await expectSomeRow(page, (label) => label.includes(", Feira, "));
  await expectSomeRow(page, (label) => label.includes(", Padaria, "));
  await expectTotalsOfRows(page);

  // More than 8 categories: the sheet has a search field, without accents.
  await filterChip(page, "Categoria").click();
  const sheet = sheetOf(page, "categoria");
  const search = sheet.getByRole("searchbox", { name: "Buscar categoria" });
  await search.fill("mercado");
  await expect(
    sheet.getByRole("button", { name: "Mercado › Feira", exact: true }),
  ).toBeVisible();
  await expect(
    sheet.getByRole("button", { name: "Todas as categorias" }),
  ).toBeVisible();
  await search.fill("zzzz");
  await expect(sheet.getByRole("status")).toHaveText(
    "Nenhuma categoria com “zzzz”.",
  );
  await search.fill("");
  // The archived ones sit in a group of their own, at the end.
  await expect(
    sheet.getByRole("heading", { name: "Arquivadas" }),
  ).toBeVisible();
  await expect(
    sheet.getByRole("button", { name: "Mercado › Padaria", exact: true }),
  ).toBeVisible();
});

test("a Padaria arquivada filtra pela folha e pela URL, com o nome inteiro no chip e no detalhe", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openStatement(page);
  await choose(page, "Categoria", "categoria", "Mercado › Padaria");
  await expect(page).toHaveURL(/categoria=/);
  const url = page.url();

  // By the URL alone (a link of the reports does just that).
  await page.goto(url);
  const chip = page.getByRole("button", {
    name: "Categoria: Mercado › Padaria (arquivada)",
    exact: true,
  });
  await expect(chip).toBeVisible({ timeout: 30_000 });
  await expectRows(page, (label) => label.includes(", Padaria, "));

  // The detail names the category in full; the edit select keeps it listed.
  await statementRows(page).first().click();
  const detail = page.getByRole("dialog", { name: "Padaria" });
  await expect(detail.getByText("Mercado › Padaria (arquivada)")).toBeVisible();
  await detail.getByRole("button", { name: "Editar" }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Editar lançamento" })
      .getByLabel("Categoria")
      .locator("option:checked"),
  ).toHaveText("Mercado › Padaria (arquivada)");
});

test("tocar em outra linha enquanto o detalhe anterior fecha abre o novo, e Voltar o fecha", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openStatement(page);
  const rows = statementRows(page);
  await expect(rows.nth(1)).toBeVisible();
  // The two rows go to the top of the screen, above where a sheet reaches:
  // the tap must land on the row, not on the sheet that is still leaving.
  const top = await rows.nth(0).boundingBox();
  if (top) await page.evaluate((y) => window.scrollBy(0, y - 150), top.y);
  const second = await rows.nth(1).boundingBox();
  if (!second) throw new Error("segunda linha");
  const label = await rows.nth(1).getAttribute("aria-label");

  // The slide out takes 1.5 s: the tap lands on the row while the first
  // detail is still leaving.
  await page.addStyleTag({ content: ":root { --dur-3: 1500ms }" });
  await rows.nth(0).tap();
  const first = page.getByRole("dialog");
  await expect(first).toBeVisible();
  await page.waitForTimeout(400);
  await first.getByRole("button", { name: "Fechar" }).tap();
  await page.waitForFunction(
    () =>
      !document.querySelector('[data-slot="sheet-overlay"]') &&
      document.querySelector(
        '[data-slot="sheet-content"][data-state="closed"]',
      ),
  );
  await page.touchscreen.tap(
    second.x + second.width / 2,
    second.y + second.height / 2,
  );
  await expect(
    page.locator('[data-slot="sheet-content"][data-state="closed"]'),
  ).toHaveCount(0, { timeout: 10_000 });

  // The new detail stays open (the late "tap outside" used to close it).
  const detail = page.getByRole("dialog");
  await expect(detail).toBeVisible();
  await page.waitForTimeout(500);
  await expect(detail).toBeVisible();
  const description = label?.split(", ")[0] ?? "";
  await expect(page.getByRole("dialog", { name: description })).toBeVisible();

  // Back closes it and stays on the statement.
  await page.waitForTimeout(400);
  await page.goBack();
  await expect(detail).toBeHidden({ timeout: 10_000 });
  await expect(page).toHaveURL(UNFILTERED);
});
