import { expect, type Page, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";
import { chooseTheme } from "./theme";

// Caixinha (doc 02 §6.7, doc 03 §12): an account that counts in the net worth
// but not in the Saldo em contas. Runs as Ana and makes its own caixinha
// ("Caixinha {RUN}"); the demo's "Reserva" stays alone. The amounts of the
// demo move with the other specs, so every check compares with a reading
// taken here (a difference), never an absolute value. The caixinha is
// archived at the end.

test.describe.configure({ mode: "serial" });

const RUN = Date.now().toString(36).slice(-5);
const BOX = `Caixinha ${RUN}`;
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

async function openBox(page: Page) {
  await page.goto("/contas");
  await page
    .getByRole("link", { name: new RegExp(`^${BOX}`) })
    .first()
    .click({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/contas\/[0-9a-f-]+$/);
  await expect(page.locator("h1:visible")).toHaveText(BOX);
}

/** Guardar or Resgatar R$ 100,00 from the caixinha's screen. */
async function move(page: Page, action: "Guardar" | "Resgatar") {
  await openBox(page);
  await page.getByRole("button", { name: action, exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Nova transação" });
  await expect(sheet).toBeVisible({ timeout: 30_000 });
  for (const key of ["1", "0", "0"]) {
    await sheet.getByRole("button", { name: key, exact: true }).click();
  }
  await sheet.getByRole("button", { name: "Transferir" }).click();
  await expect(
    toast(page).filter({ hasText: "Transferência de R$ 100,00 feita" }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(sheet).toBeHidden();
}

let saldoBefore = 0;
let patrimonioBefore = 0;

test("cria uma caixinha: o Saldo em contas não muda e o patrimônio também não", async ({
  page,
}) => {
  test.setTimeout(120_000);
  saldoBefore = await saldo(page);
  patrimonioBefore = await patrimonio(page);

  await page.goto("/contas/nova?tipo=caixinha");
  await expect(page.getByLabel("Nome").filter({ visible: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page
      .getByText("Para guardar dinheiro à parte.", { exact: false })
      .filter({ visible: true }),
  ).toBeVisible();
  await page.getByLabel("Nome").filter({ visible: true }).fill(BOX);
  await page.getByRole("button", { name: "Criar caixinha" }).click();
  await expect(toast(page).filter({ hasText: "Caixinha criada" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page).toHaveURL(/\/contas\/[0-9a-f-]+$/);
  await expect(page.locator("h1:visible")).toHaveText(BOX);
  await expect(
    page.getByText("Não entra no Saldo em contas do Início."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Guardar" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Resgatar" })).toBeVisible();

  expect(await saldo(page)).toBe(saldoBefore);
  // With a caixinha, the Saldo says what is set aside (zero for now).
  await expect(
    page.getByText("Guardado em caixinhas:").filter({ visible: true }),
  ).toBeVisible();
  expect(await patrimonio(page)).toBe(patrimonioBefore);
  await expect(
    page.getByRole("heading", { name: "Caixinhas", level: 2 }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(BOX) })).toBeVisible();
});

test("guardar R$ 100,00 baixa o Saldo, mantém o patrimônio e mostra o guardado", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await move(page, "Guardar");

  expect(await saldo(page)).toBe(saldoBefore - 10_000);
  const line = page.getByText("Guardado em caixinhas:").locator("visible=true");
  await expect(line.first()).toContainText("100,00");
  expect(await patrimonio(page)).toBe(patrimonioBefore);
});

test("resgatar R$ 100,00 devolve o Saldo ao que era", async ({ page }) => {
  test.setTimeout(120_000);
  await move(page, "Resgatar");

  expect(await saldo(page)).toBe(saldoBefore);
  expect(await patrimonio(page)).toBe(patrimonioBefore);
});

test("sem violações de acessibilidade em Contas e no formulário, nos dois temas", async ({
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
        page.getByRole("heading", { name: "Caixinhas", level: 2 }),
      ).toBeVisible({ timeout: 30_000 });
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expectNoA11yViolations(page);

      await page.goto("/contas/nova?tipo=caixinha");
      await expect(
        page.getByLabel("Nome").filter({ visible: true }),
      ).toBeVisible({ timeout: 30_000 });
      await expectNoA11yViolations(page);
    }
  } finally {
    await chooseTheme(page, "Escuro");
  }
});

test("arquiva a caixinha ao fim: o grupo some e nada nos totais muda", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openBox(page);
  await page.getByRole("button", { name: "Arquivar", exact: true }).click();
  await page.getByRole("button", { name: "Arquivar conta" }).click();
  await expect(page).toHaveURL(/\/contas$/);
  await expect(
    page.getByRole("link", { name: new RegExp(`^${BOX}`) }),
  ).toHaveCount(0);
  expect(await patrimonio(page)).toBe(patrimonioBefore);
  expect(await saldo(page)).toBe(saldoBefore);
});
