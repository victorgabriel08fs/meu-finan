import { expect, type Page, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";
import { chooseTheme } from "./theme";

// Benefício (doc 02 §6.3, §6.7, §6.8; doc 03 §12): an account for vale-refeição
// or vale-alimentação. Runs as Ana and makes its own account ("VR antigo
// {RUN}") as "Outra" in the patrimônio, then turns it into a Benefício
// (Editar › Mudar o tipo). The demo's "Vale-refeição" stays alone. Amounts of
// the demo move with the other specs, so every check compares with a reading
// taken here. The account is archived at the end.

test.describe.configure({ mode: "serial" });

const RUN = Date.now().toString(36).slice(-5);
const VR = `VR antigo ${RUN}`;
const toast = (page: Page) => page.locator("[data-sonner-toast]");

/** Cents of the first amount under `locator` (display value, sign included). */
async function centsOf(locator: ReturnType<Page["locator"]>) {
  const text = await locator.first().textContent({ timeout: 30_000 });
  const cents = Number((text ?? "").replace(/\D/g, ""));
  return /[-−–]/.test(text ?? "") ? -cents : cents;
}

/** "Saldo em contas" of the Início, in cents. */
async function saldo(page: Page) {
  await page.goto("/inicio");
  const hero = page.locator('a[href="/contas"]:visible:has(#saldo-em-contas)');
  await expect(hero).toBeVisible({ timeout: 30_000 });
  return centsOf(hero.locator('[data-slot="money"] [aria-hidden="true"]'));
}

/** "Patrimônio líquido" of Contas, in cents. */
async function patrimonio(page: Page) {
  await page.goto("/contas");
  const title = page.locator('h2:visible:text-is("Patrimônio líquido")');
  await expect(title).toBeVisible({ timeout: 30_000 });
  return centsOf(
    title
      .locator('xpath=following-sibling::*[@data-slot="money"]')
      .locator('[aria-hidden="true"]'),
  );
}

async function openVr(page: Page) {
  await page.goto("/contas");
  await page
    .getByRole("link", { name: new RegExp(`^${VR}`) })
    .first()
    .click({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/contas\/[0-9a-f-]+$/);
  await expect(page.locator("h1:visible")).toHaveText(VR);
}

/** Saves the Editar sheet of the open account. */
async function saveEdit(page: Page) {
  const sheet = page.getByRole("dialog", { name: "Editar conta" });
  await sheet
    .getByRole("button", { name: "Salvar alterações" })
    .click({ timeout: 30_000 });
  await expect(
    toast(page).filter({ hasText: "Alterações salvas" }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(sheet).toBeHidden();
}

const customizeButton = (page: Page) =>
  page.getByRole("button", { name: "Personalizar o Início" });
const homeSheet = (page: Page) =>
  page.getByRole("dialog", { name: "Personalizar o Início" });
const BLOCK = "Quanto dá para gastar por dia";

async function toggleBlock(page: Page) {
  await page.goto("/inicio");
  await customizeButton(page).click();
  const sheet = homeSheet(page);
  await sheet.getByRole("switch", { name: BLOCK, exact: true }).click();
  await sheet.getByRole("button", { name: "Salvar" }).click();
  await expect(sheet).toBeHidden();
}

let saldoBefore = 0;
let patrimonioBefore = 0;

test("cria 'VR antigo' como Outra, com R$ 250,00: entra no Saldo e no patrimônio", async ({
  page,
}) => {
  test.setTimeout(120_000);
  saldoBefore = await saldo(page);
  patrimonioBefore = await patrimonio(page);

  await page.goto("/contas/nova");
  await expect(page.getByLabel("Nome").filter({ visible: true })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByLabel("Nome").filter({ visible: true }).fill(VR);
  await page
    .locator("label")
    .filter({ hasText: /^Outra$/, visible: true })
    .first()
    .click();
  await page
    .getByLabel("Saldo atual")
    .filter({ visible: true })
    .pressSequentially("250");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(toast(page).filter({ hasText: "Conta criada" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page).toHaveURL(/\/contas\/[0-9a-f-]+$/);

  // An "Outra" account in the patrimônio counts in the Saldo em contas.
  expect(await saldo(page)).toBe(saldoBefore + 25_000);
  expect(await patrimonio(page)).toBe(patrimonioBefore + 25_000);
});

test("Editar › Mudar o tipo para Benefício: sai do Saldo, o patrimônio fica como estava e entra no grupo Benefícios", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openVr(page);
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Editar conta" });
  await expect(sheet).toBeVisible({ timeout: 30_000 });
  await sheet
    .locator("label")
    .filter({ hasText: /^Benefício$/ })
    .click();
  await expect(
    sheet.getByText("Para vale-refeição ou vale-alimentação.", {
      exact: false,
    }),
  ).toBeVisible();
  await saveEdit(page);
  await expect(
    page.getByText("Não entra no Saldo em contas do Início."),
  ).toBeVisible();

  // Mudar o tipo never flips "Incluir no patrimônio".
  expect(await saldo(page)).toBe(saldoBefore);
  expect(await patrimonio(page)).toBe(patrimonioBefore + 25_000);
  await expect(
    page.getByRole("heading", { name: "Benefícios", level: 2 }),
  ).toBeVisible();
  const row = page.getByRole("link", { name: new RegExp(`^${VR}`) }).first();
  await expect(row).toContainText("Benefício");
  await expect(row).not.toContainText("fora do patrimônio");
});

test("desligar e ligar 'Incluir no patrimônio' move o benefício no patrimônio, nunca no Saldo", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openVr(page);
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Editar conta" });
  await expect(sheet).toBeVisible({ timeout: 30_000 });
  await sheet.getByLabel("Incluir no patrimônio").uncheck();
  await saveEdit(page);

  expect(await patrimonio(page)).toBe(patrimonioBefore);
  expect(await saldo(page)).toBe(saldoBefore);
  await page.goto("/contas");
  await expect(
    page.getByRole("link", { name: new RegExp(`^${VR}`) }).first(),
  ).toContainText("fora do patrimônio", { timeout: 30_000 });

  await openVr(page);
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await expect(sheet).toBeVisible({ timeout: 30_000 });
  await sheet.getByLabel("Incluir no patrimônio").check();
  await saveEdit(page);
  expect(await patrimonio(page)).toBe(patrimonioBefore + 25_000);
  expect(await saldo(page)).toBe(saldoBefore);
});

test("Quanto dá para gastar: o benefício tem linha em 'Fora do total' e esconder não muda o total", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const chooser = page.getByRole("dialog", { name: "Contas no bloco" });
  const block = page.locator(
    'section[aria-labelledby="inicio-gasto-por-dia"]:visible',
  );
  const today = () =>
    block
      .getByRole("region", { name: "Quanto dá para gastar em cada dia" })
      .getByRole("listitem")
      .first();
  const vrSwitch = (name: string) =>
    chooser.getByRole("switch", { name, exact: false });

  await toggleBlock(page);
  try {
    await expect(today()).toBeVisible({ timeout: 30_000 });
    await expect(today().getByText("Fora do total")).toBeVisible();
    await expect(today()).toContainText(VR);
    await expect(today()).toContainText("Vale-refeição");
    await expect(
      block.getByText("ficam fora do total", { exact: false }),
    ).toBeVisible();
    const totalBefore = await today()
      .locator('[data-slot="money"]')
      .first()
      .textContent();
    await expectNoA11yViolations(page);

    await block.getByRole("button", { name: "Escolher contas" }).click();
    await expect(chooser).toBeVisible();
    await expect(vrSwitch(VR)).toHaveAttribute("aria-checked", "true");
    await vrSwitch(VR).click();
    await chooser.getByRole("button", { name: "Salvar" }).click();
    await expect(chooser).toBeHidden({ timeout: 30_000 });
    await expect(today()).not.toContainText(VR);
    await expect(today()).toContainText("Vale-refeição");
    await expect(today().locator('[data-slot="money"]').first()).toHaveText(
      totalBefore ?? "",
    );
  } finally {
    await page.goto("/inicio");
    const choose = block.getByRole("button", { name: "Escolher contas" });
    const streamed = await choose
      .waitFor({ timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    if (streamed) {
      await choose.click();
      if ((await vrSwitch(VR).getAttribute("aria-checked")) !== "true") {
        await vrSwitch(VR).click();
        await chooser.getByRole("button", { name: "Salvar" }).click();
      } else {
        await page.keyboard.press("Escape");
      }
      await expect(chooser).toBeHidden({ timeout: 30_000 });
    }
    await toggleBlock(page);
  }
});

test("o benefício não paga fatura: fora de 'Pagar com' e de 'Conta que paga a fatura'", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/contas");
  await page
    .getByRole("link", { name: /^Cartão Principal/ })
    .first()
    .click({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/cartoes\/[0-9a-f-]+$/);

  await page
    .getByRole("button", { name: "Pagar fatura" })
    .first()
    .click({ timeout: 30_000 });
  const pay = page.getByRole("dialog", { name: "Pagar fatura" });
  await expect(pay).toBeVisible();
  await expect(pay.getByText("Conta principal").first()).toBeVisible();
  await expect(pay.getByText(VR)).toHaveCount(0);
  await expect(pay.getByText("Vale-refeição")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(pay).toBeHidden();

  await page.getByRole("button", { name: "Editar cartão" }).click();
  const payer = page.getByLabel("Conta que paga a fatura");
  await expect(payer).toBeVisible({ timeout: 30_000 });
  await expect(payer.locator("option", { hasText: VR })).toHaveCount(0);
  await expect(
    payer.locator("option", { hasText: "Vale-refeição" }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
});

test("Contas e o formulário do benefício sem violações de acessibilidade, nos dois temas", async ({
  page,
}) => {
  test.setTimeout(180_000);
  try {
    for (const [theme, label] of [
      ["dark", "Escuro"],
      ["light", "Claro"],
    ] as const) {
      await chooseTheme(page, label);
      await page.goto("/contas");
      await expect(
        page.getByRole("heading", { name: "Benefícios", level: 2 }),
      ).toBeVisible({ timeout: 30_000 });
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expectNoA11yViolations(page);

      await page.goto("/contas/nova?tipo=beneficio");
      await expect(
        page.getByLabel("Nome").filter({ visible: true }),
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        page.getByLabel("Nome").filter({ visible: true }),
      ).toHaveValue("Vale-refeição");
      await expect(
        page.getByLabel("Incluir no patrimônio").filter({ visible: true }),
      ).not.toBeChecked();
      await expect(
        page
          .getByRole("button", { name: "Criar benefício" })
          .filter({ visible: true }),
      ).toBeVisible();
      await expectNoA11yViolations(page);
    }
  } finally {
    await chooseTheme(page, "Escuro");
  }
});

test("arquiva o benefício ao fim: nada nos totais muda", async ({ page }) => {
  test.setTimeout(120_000);
  await openVr(page);
  await page.getByRole("button", { name: "Arquivar", exact: true }).click();
  await page.getByRole("button", { name: "Arquivar conta" }).click();
  await expect(page).toHaveURL(/\/contas$/);
  await expect(
    page.getByRole("link", { name: new RegExp(`^${VR}`) }),
  ).toHaveCount(0);
  expect(await patrimonio(page)).toBe(patrimonioBefore);
  expect(await saldo(page)).toBe(saldoBefore);
});
