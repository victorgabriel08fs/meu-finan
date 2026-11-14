import { expect, type Page, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";
import { BRUNO_STATE } from "./demo";
import { expectNoHorizontalScroll } from "./layout";

// Etiquetas (task 18; doc 02 §5.12, §6.4–6.6, §6.12, §6.14), as Ana: Ajustes
// › Etiquetas, tags on a new entry (one created on the spot), the Extrato
// filter, the detail and the edit, and Relatórios › Etiquetas. The demo has
// "viagem" on four entries of last month. Bruno must not reach Ana's tags.

test.describe.configure({ mode: "serial" });

const RUN = Date.now().toString(36).slice(-5);
const PRAIA = `praia ${RUN}`;
const PRAIA_RENAMED = `praia ${RUN} ok`;
const toast = (page: Page) => page.locator("[data-sonner-toast]");
const DESCRIPTION = `Sorvete ${RUN}`;

let tagId = "";
let viagemId = "";

async function openTags(page: Page) {
  await page.goto("/ajustes/etiquetas");
  await expect(page.getByRole("button", { name: "Nova etiqueta" })).toBeVisible(
    { timeout: 30_000 },
  );
}

test("Ajustes › Etiquetas: cria, recusa o nome repetido, renomeia e arquiva com Desfazer", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openTags(page);
  await expect(page.getByText("viagem", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Nova etiqueta" }).click();
  let sheet = page.getByRole("dialog", { name: "Nova etiqueta" });
  await sheet.getByLabel("Nome").fill("VIAGEM");
  await sheet.getByRole("button", { name: "Criar etiqueta" }).click();
  await expect(
    sheet.getByText("Já existe uma etiqueta com esse nome."),
  ).toBeVisible({ timeout: 15_000 });

  await sheet.getByLabel("Nome").fill(PRAIA);
  await sheet.getByRole("button", { name: "Criar etiqueta" }).click();
  await expect(sheet).toBeHidden({ timeout: 15_000 });
  await expect(
    toast(page).filter({ hasText: `Etiqueta ${PRAIA} criada.` }),
  ).toBeVisible();
  const row = page.locator("#conteudo").getByRole("button", { name: PRAIA });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Nenhum lançamento");

  await row.click();
  sheet = page.getByRole("dialog", { name: "Editar etiqueta" });
  await sheet.getByLabel("Nome").fill(PRAIA_RENAMED);
  await sheet.getByRole("button", { name: "Salvar etiqueta" }).click();
  await expect(sheet).toBeHidden({ timeout: 15_000 });
  await expect(
    page.locator("#conteudo").getByRole("button", { name: PRAIA_RENAMED }),
  ).toBeVisible();

  await page
    .locator("#conteudo")
    .getByRole("button", { name: PRAIA_RENAMED })
    .click();
  sheet = page.getByRole("dialog", { name: "Editar etiqueta" });
  await sheet.getByRole("button", { name: "Arquivar etiqueta" }).click();
  await expect(sheet).toBeHidden({ timeout: 15_000 });
  const archived = toast(page).filter({
    hasText: `Etiqueta ${PRAIA_RENAMED} arquivada.`,
  });
  await expect(archived).toBeVisible();
  await expect(
    page.getByRole("button", { name: `Restaurar ${PRAIA_RENAMED}` }),
  ).toBeVisible();
  await archived.getByRole("button", { name: "Desfazer" }).click();
  await expect(
    page.getByRole("button", { name: `Restaurar ${PRAIA_RENAMED}` }),
  ).toHaveCount(0, { timeout: 15_000 });
  await expect(
    page.locator("#conteudo").getByRole("button", { name: PRAIA_RENAMED }),
  ).toBeVisible();
});

test("Nova transação: despesa com uma etiqueta existente e uma criada na hora", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto("/inicio");
  await page.getByRole("button", { name: "Nova transação" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Nova transação" });
  await expect(sheet).toBeVisible({ timeout: 30_000 });
  for (const key of ["1", "2"]) {
    await sheet.getByRole("button", { name: key, exact: true }).click();
  }
  await sheet.getByPlaceholder("Descrição (opcional)").fill(DESCRIPTION);
  await sheet.getByRole("button", { name: /^Mais opções/ }).click();

  const group = sheet.getByRole("group", { name: "Etiquetas" });
  await expect(group).toBeVisible();
  await group
    .getByRole("button", { name: "viagem", exact: true })
    .click({ timeout: 15_000 });
  await expect(
    group.getByRole("button", { name: "viagem", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  // Created on the spot: Enter on a name nobody has yet.
  const field = group.getByLabel("Buscar ou criar etiqueta");
  await field.fill(`sorvete ${RUN}`);
  await expect(
    group.getByRole("button", { name: `Criar “sorvete ${RUN}”` }),
  ).toBeVisible();
  await field.press("Enter");
  await expect(
    group.getByRole("button", { name: `sorvete ${RUN}`, exact: true }),
  ).toHaveAttribute("aria-pressed", "true", { timeout: 15_000 });
  await expect(
    sheet.getByRole("button", { name: /^Mais opções/ }),
  ).toContainText("2 etiquetas");

  await sheet.getByRole("button", { name: "Salvar despesa" }).click();
  await expect(page.getByText("Despesa de R$ 12,00 salva")).toBeVisible({
    timeout: 15_000,
  });
  await expect(sheet).toBeHidden({ timeout: 15_000 });

  // A transfer has no tags.
  await page.getByRole("button", { name: "Nova transação" }).first().click();
  const again = page.getByRole("dialog", { name: "Nova transação" });
  await expect(again).toBeVisible({ timeout: 30_000 });
  await again.getByRole("radio", { name: "Transferência" }).click();
  await expect(again.getByRole("group", { name: "Etiquetas" })).toHaveCount(0);
});

test("Extrato: o chip Etiqueta filtra, vai para a URL e o detalhe mostra e edita as etiquetas", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto("/extrato");
  const chip = page
    .getByRole("button", { name: /^Etiqueta: / })
    .and(page.locator(":visible"));
  await chip.click({ timeout: 30_000 });
  const filter = page.getByRole("dialog", { name: "Filtrar por etiqueta" });
  await filter
    .getByRole("button", { name: `sorvete ${RUN}`, exact: true })
    .click();
  await expect(page).toHaveURL(/etiqueta=[0-9a-f-]{36}/);
  tagId = new URL(page.url()).searchParams.get("etiqueta") ?? "";
  await expect(
    page.getByRole("button", { name: new RegExp(DESCRIPTION) }).first(),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page
      .getByRole("button", { name: new RegExp(`^Etiqueta: sorvete ${RUN}`) })
      .and(page.locator(":visible")),
  ).toBeVisible();
  await expectNoHorizontalScroll(page, "Extrato com etiqueta");

  // Detail: the tags are listed.
  await page
    .getByRole("button", { name: new RegExp(DESCRIPTION) })
    .first()
    .click();
  const detail = page.getByRole("dialog", { name: DESCRIPTION });
  await expect(detail).toBeVisible();
  await expect(detail.getByText("Etiquetas", { exact: true })).toBeVisible();
  await expect(detail.getByText(/^viagem,?$/)).toBeVisible();
  await expect(
    detail.getByText(new RegExp(`^sorvete ${RUN},?$`)),
  ).toBeVisible();

  // Edit: take "viagem" off.
  await detail.getByRole("button", { name: "Editar" }).click();
  const edit = page.getByRole("dialog", { name: "Editar lançamento" });
  const group = edit.getByRole("group", { name: "Etiquetas" });
  const viagem = group.getByRole("button", { name: "viagem", exact: true });
  await expect(viagem).toHaveAttribute("aria-pressed", "true");
  await viagem.click();
  await expect(viagem).toHaveAttribute("aria-pressed", "false");
  await edit.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(edit).toBeHidden({ timeout: 15_000 });

  // Saving goes back to the detail of the entry.
  const after = page.getByRole("dialog", { name: DESCRIPTION });
  await expect(after.getByText(new RegExp(`^sorvete ${RUN},?$`))).toBeVisible();
  await expect(after.getByText(/^viagem,?$/)).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Clearing the chip goes back to the whole month.
  await page
    .getByRole("button", { name: /^Limpar/ })
    .and(page.locator(":visible"))
    .first()
    .click();
  await expect(page).not.toHaveURL(/etiqueta=/);
});

test("Relatórios › Etiquetas: o total da viagem, o detalhe e o link para o Extrato", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto("/relatorios/etiquetas?periodo=3");
  const region = page.getByRole("region", { name: "Por etiqueta" });
  await expect(region).toBeVisible({ timeout: 30_000 });
  await expect(region).toContainText("só lançamentos pagos");
  const link = region.getByRole("link", { name: /^viagem\s/ });
  await expect(link).toBeVisible();
  await expect(link).toHaveAccessibleName(
    /^viagem \d+ lançamentos? Despesas .*reais/,
  );
  await expectNoHorizontalScroll(page, "Relatório por etiqueta");

  await link.click();
  await expect(page).toHaveURL(/\/relatorios\/etiquetas\/[0-9a-f-]{36}/);
  viagemId = new URL(page.url()).pathname.split("/").pop() ?? "";
  await expect(
    page.getByRole("heading", { name: "viagem", level: 2 }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Pousada").first()).toBeVisible();
  await expect(
    page.getByRole("link", { name: /^Ver (só |lançamentos de )/ }).first(),
  ).toHaveAttribute("href", /\/extrato\?etiqueta=[0-9a-f-]{36}/);
  await expectNoHorizontalScroll(page, "Detalhe da etiqueta");
});

test("as telas de etiquetas, sem problemas de acessibilidade nem rolagem lateral", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto("/ajustes/etiquetas");
  await expect(page.getByRole("button", { name: "Nova etiqueta" })).toBeVisible(
    { timeout: 30_000 },
  );
  await expectNoHorizontalScroll(page, "Ajustes › Etiquetas");
  await expectNoA11yViolations(page);

  await page.goto("/relatorios/etiquetas?periodo=3");
  await expect(page.getByRole("region", { name: "Por etiqueta" })).toBeVisible({
    timeout: 30_000,
  });
  await expectNoA11yViolations(page);

  await page.goto(`/extrato?etiqueta=${tagId}`);
  await expect(
    page
      .getByRole("button", { name: /^Etiqueta: / })
      .and(page.locator(":visible")),
  ).toBeVisible({ timeout: 30_000 });
  await expectNoA11yViolations(page);
});

test.describe("outra conta", () => {
  test.use({ storageState: BRUNO_STATE });

  test("Bruno não acende o chip nem abre a etiqueta da Ana", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    expect(tagId).not.toBe("");
    expect(viagemId).not.toBe("");
    await page.goto(`/extrato?etiqueta=${tagId}`);
    await expect(
      page.getByRole("heading", { name: "Extrato" }).first(),
    ).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("button", { name: /^Etiqueta: / })).toHaveCount(
      0,
    );
    await expect(page.getByText(DESCRIPTION)).toHaveCount(0);

    await page.goto(`/relatorios/etiquetas/${viagemId}`);
    await expect(
      page.getByText("Etiqueta não encontrada").filter({ visible: true }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Pousada")).toHaveCount(0);
  });
});
