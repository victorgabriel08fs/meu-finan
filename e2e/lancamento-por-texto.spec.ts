import { expect, type Page, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";
import { BIG_TEXT, expectNoHorizontalScroll } from "./layout";

// Lançamento por texto (task 21; doc 02 §6.5), as Ana: the demo turns
// lancamento_por_texto on for her only (Bruno's side is in
// novidades-flags.spec.ts). The field fills the form and never saves.

test.describe.configure({ mode: "serial" });

const RUN = `r${Date.now().toString(36).slice(-5)}`;
const TAG = `viagem-${RUN}`;
const TAG_NAME = `viagem ${RUN}`;
const DESCRIPTION = `Café ${RUN}`;

async function openSheet(page: Page) {
  await page.goto("/inicio");
  await page.getByRole("button", { name: "Nova transação" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Nova transação" });
  await expect(sheet).toBeVisible({ timeout: 30_000 });
  return sheet;
}

test("preenche valor, conta, data e etiqueta, e salva pelo botão de sempre", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const sheet = await openSheet(page);
  const field = sheet.getByLabel("Escrever o lançamento");
  await expect(field).toBeVisible();
  const fill = sheet.getByRole("button", { name: "Preencher" });
  await expect(fill).toBeDisabled();

  await field.fill(`${DESCRIPTION} 12 na conta principal ontem #${TAG}`);
  await expect(fill).toBeEnabled();
  await fill.click();

  await expect(sheet.getByText(/^Preenchido: valor, descrição/)).toBeVisible({
    timeout: 30_000,
  });
  await expect(sheet.getByRole("button", { name: "Ontem" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(sheet.getByPlaceholder("Descrição (opcional)")).toHaveValue(
    DESCRIPTION,
  );
  await expect(
    sheet.getByRole("button", { name: /^Mais opções/ }),
  ).toContainText(TAG_NAME);
  // The text stays, so it can be fixed and sent again.
  await expect(field).toHaveValue(/^Café /);

  // Saved right away, before the layout's tag list refreshed.
  await sheet.getByRole("button", { name: "Salvar despesa" }).click();
  await expect(page.getByText("Despesa de R$ 12,00 salva")).toBeVisible({
    timeout: 15_000,
  });
  await expect(sheet).toBeHidden({ timeout: 15_000 });

  await page.goto("/extrato");
  await expect(
    page.getByRole("button", { name: new RegExp(DESCRIPTION) }).first(),
  ).toBeVisible({ timeout: 30_000 });
  await page.goto("/ajustes/etiquetas");
  await expect(
    page.getByRole("button", { name: new RegExp(`^${TAG_NAME} 1 lançamento`) }),
  ).toBeVisible({ timeout: 30_000 });
});

test("Enter no campo preenche e não salva; sem valor, avisa", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const sheet = await openSheet(page);
  const field = sheet.getByLabel("Escrever o lançamento");
  await field.fill("almoço no shopping");
  await field.press("Enter");
  await expect(
    sheet.getByText("Não encontrei o valor: digite no teclado."),
  ).toBeVisible({ timeout: 30_000 });
  await expect(sheet.getByPlaceholder("Descrição (opcional)")).toHaveValue(
    "almoço no shopping",
  );
  await expect(sheet).toBeVisible();
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
});

test("a folha com o campo não tem violações, não rola para o lado e o campo some na transferência", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const sheet = await openSheet(page);
  await expect(sheet.getByLabel("Escrever o lançamento")).toBeVisible();
  await expectNoA11yViolations(page);
  await expectNoHorizontalScroll(page, "Nova transação com o campo de texto");
  await sheet.getByRole("radio", { name: "Receita" }).click();
  await expect(sheet.getByLabel("Escrever o lançamento")).toBeVisible();
  await sheet.getByRole("radio", { name: "Transferência" }).click();
  await expect(sheet.getByLabel("Escrever o lançamento")).toHaveCount(0);
});

// Learning (doc 02 §6.5): the "sugerida" badge follows what "Preencher" chose,
// and saving with another category teaches the rule. Digits vanish from the
// description key, so the run id is made of letters only.
const WORD = Date.now()
  .toString(36)
  .replace(/\d/g, (d) => "abcdefghij"[Number(d)] ?? "x");
const PHRASE = `feira ${WORD}`;

test("aprende a categoria corrigida e mostra o selo “sugerida”", async ({
  page,
}) => {
  test.setTimeout(240_000);

  async function fillText(text: string) {
    const sheet = await openSheet(page);
    await sheet.getByLabel("Escrever o lançamento").fill(text);
    await sheet.getByRole("button", { name: "Preencher" }).click();
    await expect(sheet.getByText(/^Preenchido: /)).toBeVisible({
      timeout: 30_000,
    });
    return sheet;
  }
  const chip = (sheet: ReturnType<Page["locator"]>, name: string) =>
    sheet.getByRole("button", {
      name: new RegExp(`^${name}(, sugerida)?$`),
    });
  const save = async (sheet: ReturnType<Page["locator"]>) => {
    await sheet.getByRole("button", { name: "Salvar despesa" }).click();
    await expect(sheet).toBeHidden({ timeout: 15_000 });
  };

  // (a) No history yet: no badge. Pick Mercado by hand and save.
  let sheet = await fillText(`${PHRASE} 10`);
  await expect(sheet.getByText("sugerida")).toHaveCount(0);
  await chip(sheet, "Mercado").click();
  await save(sheet);

  // (b) Suggested from the history, accepted.
  sheet = await fillText(`${PHRASE} 11`);
  await expect(
    sheet.getByRole("button", { name: /^Mercado, sugerida$/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await save(sheet);

  // (c) Suggested, then corrected: the badge goes away with another chip.
  sheet = await fillText(`${PHRASE} 12`);
  await expect(
    sheet.getByRole("button", { name: /^Mercado, sugerida$/ }),
  ).toBeVisible();
  await expectNoA11yViolations(page);
  await expectNoHorizontalScroll(page, "Nova transação com o selo sugerida");
  await chip(sheet, "Restaurantes").click();
  await expect(sheet.getByText("sugerida")).toHaveCount(0);
  await save(sheet);

  // (d) The corrected rule beats the two older Mercado entries.
  sheet = await fillText(`${PHRASE} 13`);
  await expect(
    sheet.getByRole("button", { name: /^Restaurantes, sugerida$/ }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("a 200% a 360 px o nome da categoria sugerida continua visível", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/inicio");
  await page.addStyleTag({ content: BIG_TEXT });
  await page.getByRole("button", { name: "Nova transação" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Nova transação" });
  await expect(sheet).toBeVisible({ timeout: 30_000 });
  await sheet.getByLabel("Escrever o lançamento").fill(`${PHRASE} 14`);
  await sheet.getByRole("button", { name: "Preencher" }).click();
  const suggested = sheet.getByRole("button", { name: /, sugerida$/ });
  await expect(suggested).toBeVisible({ timeout: 30_000 });
  const name = suggested.locator("span.truncate").first();
  const box = await name.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(0);
  await expectNoHorizontalScroll(page, "selo sugerida a 200% em 360 px");
});
