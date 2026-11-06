import { expect, type Page, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";
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
