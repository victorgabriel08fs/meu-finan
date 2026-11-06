import { expect, type Page, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";
import { BIG_TEXT, expectNoHorizontalScroll } from "./layout";
import { chooseTheme } from "./theme";

// Ajustes › Categorias com subcategorias (doc 02 §6.14, §6.4, §6.5). Runs as
// Ana, whose Mercado already has Feira and Padaria (archived), so it is the
// "mãe com filhas" of the demo. The tests that write make their own category
// ("Pet shop") and leave Mercado alone, since the statement specs read it.

test.describe.configure({ mode: "serial" });

const toast = (page: Page) => page.locator("[data-sonner-toast]");

async function openCategories(page: Page) {
  await page.goto("/ajustes/categorias");
  await expect(
    page.getByRole("button", { name: "Nova categoria de despesa" }),
  ).toBeVisible({ timeout: 30_000 });
}

/** Opens the edit sheet of the category whose row starts with `name`. */
async function editCategory(page: Page, name: string) {
  await page
    .locator("#conteudo")
    .getByRole("button", { name: new RegExp(`^${name}`) })
    .first()
    .click();
  const sheet = page.getByRole("dialog", { name: "Editar categoria" });
  await expect(sheet).toBeVisible();
  return sheet;
}

test("cria uma categoria e uma subcategoria dela, que aparecem no Extrato e na Nova transação", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openCategories(page);

  await page.getByRole("button", { name: "Nova categoria de despesa" }).click();
  let sheet = page.getByRole("dialog", { name: "Nova categoria" });
  await sheet.getByLabel("Nome").fill("Pet shop");
  await sheet.getByRole("button", { name: "Criar categoria" }).click();
  await expect(sheet).toBeHidden();
  await expect(
    toast(page).filter({ hasText: "Categoria Pet shop criada." }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Nova categoria de despesa" }).click();
  sheet = page.getByRole("dialog", { name: "Nova categoria" });
  await sheet.getByLabel("Nome").fill("Ração");
  // The mother is a main category of the same type: "Pet shop" is there,
  // and Feira (a subcategory) never is.
  const parent = sheet.getByLabel("Subcategoria de");
  await expect(parent).toBeEnabled();
  await expect(parent.locator("option", { hasText: "Feira" })).toHaveCount(0);
  await parent.selectOption({ label: "Pet shop" });
  await sheet.getByRole("button", { name: "Criar categoria" }).click();
  await expect(sheet).toBeHidden();
  // The first toast may still be on screen: look for this one by its text.
  await expect(
    toast(page).filter({ hasText: "Subcategoria Ração criada em Pet shop." }),
  ).toBeVisible();

  // In the list, right under the mother ("em Pet shop" is the legend).
  const rows = page.locator("#conteudo").getByRole("button", { name: /Ração/ });
  await expect(rows.first()).toBeVisible();
  await expect(rows.first()).toContainText("em Pet shop");

  // The statement lists it as "Pet shop › Ração".
  await page.goto("/extrato");
  await page
    .getByRole("button", { name: /^Categoria: / })
    .and(page.locator(":visible"))
    .click({ timeout: 30_000 });
  await expect(
    page
      .getByRole("dialog", { name: "Filtrar por categoria" })
      .getByRole("button", { name: "Pet shop › Ração", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  // And so does the grid of the new transaction, each one by its full name.
  await page.goto("/inicio");
  await page.getByRole("button", { name: "Nova transação" }).first().click();
  const quickAdd = page.getByRole("dialog", { name: "Nova transação" });
  await expect(quickAdd).toBeVisible({ timeout: 30_000 });
  await quickAdd.getByRole("button", { name: "Todas" }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Categorias" })
      .getByRole("button", { name: "Pet shop › Ração", exact: true }),
  ).toBeVisible();
});

test("a mãe com subcategorias fica como principal: o campo vem desabilitado com a dica", async ({
  page,
}) => {
  await openCategories(page);
  const sheet = await editCategory(page, "Mercado");
  await expect(sheet.getByLabel("Subcategoria de")).toBeDisabled();
  await expect(
    sheet.getByText(
      "Tem subcategorias, por isso fica como categoria principal.",
    ),
  ).toBeVisible();
  await expect(sheet.getByLabel("Subcategoria de")).toHaveAccessibleDescription(
    "Tem subcategorias, por isso fica como categoria principal.",
  );

  // A subcategory can be main again: the field is on and shows its mother.
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  const feira = await editCategory(page, "Feira");
  await expect(feira.getByLabel("Subcategoria de")).toBeEnabled();
  await expect(
    feira.getByLabel("Subcategoria de").locator("option:checked"),
  ).toHaveText("Mercado");
});

test("arquivar a mãe leva as subcategorias, e o Desfazer traz todas de volta", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openCategories(page);
  const sheet = await editCategory(page, "Pet shop");
  await sheet.getByRole("button", { name: "Arquivar categoria" }).click();

  const confirm = page.getByRole("dialog", { name: "Arquivar Pet shop?" });
  await expect(
    confirm.getByText("Ela e a subcategoria Ração saem das listas de escolha"),
  ).toBeVisible();
  await confirm.getByRole("button", { name: "Arquivar categoria" }).click();
  await expect(confirm).toBeHidden({ timeout: 30_000 });
  await expect(
    toast(page).filter({
      hasText: "Categoria Pet shop arquivada, com 1 subcategoria.",
    }),
  ).toBeVisible();
  const archived = page.getByRole("region", { name: "Arquivadas" });
  await expect(archived.getByText("Ração")).toBeVisible();
  await expect(archived.getByText("em Pet shop")).toBeVisible();

  // Desfazer brings the mother and the subcategory that went with her back.
  await toast(page).getByRole("button", { name: "Desfazer" }).click();
  await expect(
    page.getByRole("button", { name: "Restaurar Ração" }),
  ).toHaveCount(0);
  await expect(
    page.locator("#conteudo").getByRole("button", { name: /^Pet shop/ }),
  ).toBeVisible();
  await expect(
    page.locator("#conteudo").getByRole("button", { name: /Ração/ }),
  ).toBeVisible();
});

test("Categorias, com a folha aberta, sem problemas de acessibilidade no escuro e no claro", async ({
  page,
}) => {
  test.setTimeout(120_000);
  try {
    for (const [theme, name] of [
      ["dark", "Escuro"],
      ["light", "Claro"],
    ] as const) {
      await chooseTheme(page, name);
      await openCategories(page);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expectNoA11yViolations(page);
      const sheet = await editCategory(page, "Mercado");
      await expectNoA11yViolations(page);
      await sheet.getByRole("button", { name: "Fechar" }).click();
      await expect(sheet).toBeHidden();
    }
  } finally {
    await chooseTheme(page, "Escuro");
  }
});

// Mover, mesclar e ordenar (doc 02 §6.14). Each test makes its own categories
// with a suffix that is unique per run, and never touches Mercado, Feira or
// Padaria (the statement and report specs read them).

const RUN = Date.now().toString(36).slice(-5);
const name = (label: string) => `${label} ${RUN}`;

async function createCategory(page: Page, label: string) {
  await openCategories(page);
  await page.getByRole("button", { name: "Nova categoria de despesa" }).click();
  const sheet = page.getByRole("dialog", { name: "Nova categoria" });
  await sheet.getByLabel("Nome").fill(label);
  await sheet.getByRole("button", { name: "Criar categoria" }).click();
  await expect(sheet).toBeHidden({ timeout: 30_000 });
  await expect(
    toast(page).filter({ hasText: `Categoria ${label} criada.` }),
  ).toBeVisible({ timeout: 15_000 });
}

/** A R$ 10,00 expense in `category`, through the Nova transação sheet. */
async function addExpense(page: Page, category: string, description: string) {
  await page.goto("/inicio");
  await page.getByRole("button", { name: "Nova transação" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Nova transação" });
  await expect(sheet).toBeVisible({ timeout: 30_000 });
  for (const key of ["1", "0"]) {
    await sheet.getByRole("button", { name: key, exact: true }).click();
  }
  await sheet.getByPlaceholder("Descrição (opcional)").fill(description);
  await sheet.getByRole("button", { name: "Todas" }).click();
  await page
    .getByRole("dialog", { name: "Categorias" })
    .getByRole("button", { name: category, exact: true })
    .click();
  await sheet.getByRole("button", { name: "Salvar despesa" }).click();
  await expect(page.getByText("Despesa de R$ 10,00 salva")).toBeVisible({
    timeout: 15_000,
  });
  await expect(sheet).toBeHidden({ timeout: 15_000 });
}

/** The accessible names of the statement rows that match `description`. */
async function statementLabels(page: Page, description: string) {
  await page.goto(`/extrato?q=${encodeURIComponent(description)}`);
  const rows = page.locator(
    'li:has(> div > [data-slot="transaction-row"]) > button',
  );
  await expect(rows.first()).toBeVisible({ timeout: 30_000 });
  return rows.evaluateAll((nodes) =>
    nodes
      .filter((node) => node.checkVisibility())
      .map((node) => node.getAttribute("aria-label") ?? ""),
  );
}

test("arquivar passando os lançamentos: a contagem na folha e o lançamento no destino do Extrato", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const from = name("Mover A");
  const to = name("Mover B");
  const what = name("Item mover");
  await createCategory(page, from);
  await createCategory(page, to);
  await addExpense(page, from, what);

  await openCategories(page);
  const sheet = await editCategory(page, from);
  await sheet.getByRole("button", { name: "Arquivar categoria" }).click();
  const confirm = page.getByRole("dialog", { name: `Arquivar ${from}?` });
  await expect(
    confirm.getByText("Quer passar as despesas desta categoria para outra?"),
  ).toBeVisible();
  // Not moving is the default.
  await expect(
    confirm.getByRole("button", { name: "Arquivar categoria" }),
  ).toBeVisible();
  await confirm.getByText("Sim, escolher outra categoria").click();
  await confirm.getByLabel("Passar para").selectOption({ label: to });
  await expect(
    confirm.getByText(
      `1 despesa vai para ${to}. Não dá para desfazer: se restaurar ${from}, ela volta vazia.`,
    ),
  ).toBeVisible();
  await confirm
    .getByRole("button", { name: "Arquivar e passar despesas" })
    .click();
  await expect(confirm).toBeHidden({ timeout: 30_000 });
  const message = toast(page).filter({
    hasText: `Categoria ${from} arquivada. 1 despesa foi para ${to}.`,
  });
  await expect(message).toBeVisible();
  // Moving cannot be undone: no Desfazer.
  await expect(message.getByRole("button", { name: "Desfazer" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("region", { name: "Arquivadas" }).getByText(from),
  ).toBeVisible();

  const labels = await statementLabels(page, what);
  expect(
    labels.some((label) => label.includes(`, ${to},`)),
    labels.join("\n"),
  ).toBe(true);
  expect(labels.some((label) => label.includes(`, ${from},`))).toBe(false);
});

test("arquivar sem passar: os lançamentos ficam, e o toast tem Desfazer", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const from = name("Ficar A");
  await createCategory(page, from);
  await createCategory(page, name("Ficar B"));
  await addExpense(page, from, name("Item ficar"));

  await openCategories(page);
  const sheet = await editCategory(page, from);
  await sheet.getByRole("button", { name: "Arquivar categoria" }).click();
  const confirm = page.getByRole("dialog", { name: `Arquivar ${from}?` });
  await confirm.getByRole("button", { name: "Arquivar categoria" }).click();
  await expect(confirm).toBeHidden({ timeout: 30_000 });
  const message = toast(page).filter({
    hasText: `Categoria ${from} arquivada.`,
  });
  await expect(message).toBeVisible();
  const archived = page.getByRole("region", { name: "Arquivadas" });
  await expect(archived.getByText(from)).toBeVisible();

  await message.getByRole("button", { name: "Desfazer" }).click();
  await expect(
    toast(page).filter({ hasText: `Categoria ${from} restaurada.` }),
  ).toBeVisible();
  await expect(archived.getByText(from)).toHaveCount(0);
  await expect(
    page
      .locator("#conteudo")
      .getByRole("button", { name: new RegExp(`^${from}`) }),
  ).toBeVisible();
});

test("mesclar: os lançamentos vão para o destino e a origem fica em Arquivadas", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const from = name("Mescla A");
  const to = name("Mescla B");
  const what = name("Item mescla");
  await createCategory(page, from);
  await createCategory(page, to);
  await addExpense(page, from, what);

  await openCategories(page);
  const sheet = await editCategory(page, from);
  await sheet.getByRole("button", { name: "Mesclar com outra" }).click();
  const merge = page.getByRole("dialog", { name: `Mesclar ${from}` });
  await merge.getByLabel("Mesclar com").selectOption({ label: to });
  await expect(
    merge.getByText(`1 despesa vai para ${to}. Não dá para desfazer.`),
  ).toBeVisible();
  await merge.getByRole("button", { name: "Mesclar categorias" }).click();
  await expect(merge).toBeHidden({ timeout: 30_000 });
  await expect(
    toast(page).filter({ hasText: `Categoria ${from} mesclada com ${to}.` }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Arquivadas" }).getByText(from),
  ).toBeVisible();

  const labels = await statementLabels(page, what);
  expect(
    labels.some((label) => label.includes(`, ${to},`)),
    labels.join("\n"),
  ).toBe(true);
});

test("Mudar a ordem: a ordem nova vale na lista e na Nova transação, e o Desfazer devolve a antiga", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const first = name("Ordem A");
  const second = name("Ordem B");
  await createCategory(page, first);
  await createCategory(page, second);

  const listed = () =>
    page
      .locator("#conteudo")
      .getByRole("list", { name: "Despesas" })
      .getByRole("button")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.textContent?.trim() ?? ""),
      );
  const position = (names: string[], label: string) =>
    names.findIndex((text) => text.startsWith(label));
  const swapped = async () => {
    const names = await listed();
    return position(names, second) < position(names, first);
  };
  const before = await listed();
  expect(position(before, first)).toBeLessThan(position(before, second));

  await page.getByRole("button", { name: "Mudar a ordem" }).first().click();
  const order = page.getByRole("dialog", { name: "Ordem das despesas" });
  await expect(order).toBeVisible();
  const up = order.getByRole("button", { name: `Subir ${second}` });
  await up.click();
  await expect(up).toBeFocused();
  await expect(order.getByRole("status")).toContainText(`${second} na posição`);
  await order.getByRole("button", { name: "Salvar ordem" }).click();
  await expect(order).toBeHidden({ timeout: 30_000 });
  await expect(
    toast(page).filter({ hasText: "Ordem das despesas salva." }),
  ).toBeVisible();
  await expect.poll(swapped).toBe(true);

  // The "Todas" list of the Nova transação follows the same order.
  const grid = async () => {
    await page.goto("/inicio");
    await page.getByRole("button", { name: "Nova transação" }).first().click();
    const quickAdd = page.getByRole("dialog", { name: "Nova transação" });
    await expect(quickAdd).toBeVisible({ timeout: 30_000 });
    await quickAdd.getByRole("button", { name: "Todas" }).click();
    const all = page.getByRole("dialog", { name: "Categorias" });
    await expect(all.getByRole("button", { name: second })).toBeVisible();
    return all
      .locator("button[aria-pressed]")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("aria-label") ?? ""),
      );
  };
  const names = await grid();
  expect(names.indexOf(second)).toBeLessThan(names.indexOf(first));

  // Order again and undo it from the toast: the saved order comes back.
  await openCategories(page);
  await page.getByRole("button", { name: "Mudar a ordem" }).first().click();
  await page
    .getByRole("dialog", { name: "Ordem das despesas" })
    .getByRole("button", { name: `Descer ${second}` })
    .click();
  await page.getByRole("button", { name: "Salvar ordem" }).click();
  await expect.poll(swapped).toBe(false);
  await toast(page)
    .filter({ hasText: "Ordem das despesas salva." })
    .getByRole("button", { name: "Desfazer" })
    .click();
  await expect.poll(swapped).toBe(true);
});

test("as folhas de arquivar, mesclar e ordenar, sem problemas de acessibilidade no escuro e no claro", async ({
  page,
}) => {
  test.setTimeout(180_000);
  try {
    for (const [theme, label] of [
      ["dark", "Escuro"],
      ["light", "Claro"],
    ] as const) {
      await chooseTheme(page, label);
      await openCategories(page);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

      const sheet = await editCategory(page, "Mercado");
      await sheet.getByRole("button", { name: "Mesclar com outra" }).click();
      const merge = page.getByRole("dialog", { name: "Mesclar Mercado" });
      await expect(merge).toBeVisible();
      await expectNoA11yViolations(page);
      await merge.getByRole("button", { name: "Cancelar" }).click();

      await page
        .getByRole("dialog", { name: "Editar categoria" })
        .getByRole("button", { name: "Arquivar categoria" })
        .click();
      const archive = page.getByRole("dialog", { name: "Arquivar Mercado?" });
      await expect(archive).toBeVisible();
      await archive.getByText("Sim, escolher outra categoria").click();
      await expectNoA11yViolations(page);
      await archive.getByRole("button", { name: "Cancelar" }).click();
      await page
        .getByRole("dialog", { name: "Editar categoria" })
        .getByRole("button", { name: "Fechar" })
        .click();

      await page.getByRole("button", { name: "Mudar a ordem" }).first().click();
      const order = page.getByRole("dialog", { name: "Ordem das despesas" });
      await expect(order).toBeVisible();
      await expectNoA11yViolations(page);
      await order.getByRole("button", { name: "Fechar" }).click();
    }
  } finally {
    await chooseTheme(page, "Escuro");
  }
});

test("a 200% em 360 px, Salvar categoria, Arquivar e Mesclar continuam ao alcance", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 360, height: 780 });
  await openCategories(page);
  await page.addStyleTag({ content: BIG_TEXT });
  const sheet = await editCategory(page, "Mercado");
  await expectNoHorizontalScroll(page, "Editar categoria a 200%");

  // Reachable by scrolling, and clickable where they land (trial: no click).
  const save = sheet.getByRole("button", { name: "Salvar categoria" });
  await save.scrollIntoViewIfNeeded();
  await expect(save).toBeVisible();
  await save.click({ trial: true });
  const archive = sheet.getByRole("button", { name: "Arquivar categoria" });
  await archive.scrollIntoViewIfNeeded();
  await archive.click({ trial: true });

  await sheet.getByRole("button", { name: "Mesclar com outra" }).click();
  const merge = page.getByRole("dialog", { name: "Mesclar Mercado" });
  const mergeNow = merge.getByRole("button", { name: "Mesclar categorias" });
  await mergeNow.scrollIntoViewIfNeeded();
  await expect(mergeNow).toBeVisible();
  await mergeNow.click({ trial: true });
  await expectNoHorizontalScroll(page, "Mesclar a 200%");
  await merge.getByRole("button", { name: "Cancelar" }).click();

  await page
    .getByRole("dialog", { name: "Editar categoria" })
    .getByRole("button", { name: "Arquivar categoria" })
    .click();
  const confirm = page.getByRole("dialog", { name: "Arquivar Mercado?" });
  const destructive = confirm.getByRole("button", {
    name: "Arquivar categoria",
  });
  await destructive.scrollIntoViewIfNeeded();
  await expect(destructive).toBeVisible();
  await destructive.click({ trial: true });
  await expectNoHorizontalScroll(page, "Arquivar a 200%");
});
