import {
  type Browser,
  devices,
  expect,
  type Page,
  test,
} from "@playwright/test";
import { expectNoA11yViolations } from "./axe";
import { BRUNO_STATE } from "./demo";
import { BIG_TEXT, expectNoHorizontalScroll } from "./layout";
import { chooseTheme } from "./theme";

// Caixinha compartilhada (ADR-13, doc 02 §6.18), as Ana and Bruno, who share
// the demo's group "Casa". Ana makes the box "Reforma {RUN}" (target and
// deadline), sets her plan and saves with and without the transfer to her own
// caixinha; Bruno (no caixinha of his own) saves too, and cannot take out more
// than he put in; Ana, who owns the group, sets percent parts; then the undo
// (the toast and a row of the history), a withdrawal, archive and unarchive.
// The demo's "Viagem para Salvador" is only read. The last tests turn the
// flag off for Bruno and put it back, and dismiss the notices the box wrote.

const RUN = Date.now().toString(36).slice(-5);
const BOX = `Reforma ${RUN}`;
const DEMO_BOX = "Viagem para Salvador";
const toast = (page: Page) => page.locator("[data-sonner-toast]");
const dialog = (page: Page, name: string | RegExp) =>
  page.getByRole("dialog", { name });
const bellOf = (page: Page) =>
  page.locator("main").getByRole("button", { name: /^Notificações/ });
const people = (page: Page) =>
  page.locator('section[aria-labelledby="caixinha-pessoas"]');
const history = (page: Page) =>
  page.locator('section[aria-labelledby="caixinha-historico"]');
const hero = (page: Page) =>
  page.getByRole("heading", { level: 2 }).filter({ hasText: "guardados" });

let boxUrl = "";
let boxesUrl = "";

async function asBruno(browser: Browser, baseURL: string | undefined) {
  const context = await browser.newContext({
    ...devices["Pixel 7"],
    baseURL,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    storageState: BRUNO_STATE,
  });
  return { context, page: await context.newPage() };
}

async function closeSheet(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 15_000 });
}

/** "Casa", then its Caixinhas tab, as a person would. */
async function openBoxes(page: Page) {
  await page.goto("/compartilhado");
  await page
    .getByRole("link", { name: /Casa/ })
    .first()
    .click({ timeout: 30_000 });
  await expect(page.locator("h1:visible")).toHaveText("Casa", {
    timeout: 30_000,
  });
  await page.getByRole("link", { name: "Caixinhas", exact: true }).click();
  await expect(page).toHaveURL(/\/caixinhas$/, { timeout: 30_000 });
  boxesUrl = new URL(page.url()).pathname;
}

async function openBox(page: Page, name: string) {
  await openBoxes(page);
  await page.getByRole("link", { name }).first().click({ timeout: 30_000 });
  await expect(page.locator("h1:visible")).toHaveText(name, {
    timeout: 30_000,
  });
}

/** Opens the box by the address saved when Ana made it. */
async function goToBox(page: Page, name = BOX) {
  await page.goto(boxUrl);
  await expect(page.locator("h1:visible")).toHaveText(name, {
    timeout: 30_000,
  });
}

/** Guardar or Resgatar: fills the amount and confirms, leaving the toast. */
async function move(
  page: Page,
  verb: "Guardar" | "Resgatar",
  amount: string,
  { record = true }: { record?: boolean } = {},
) {
  await page.getByRole("button", { name: verb, exact: true }).click();
  const sheet = dialog(page, verb);
  await expect(sheet).toBeVisible({ timeout: 30_000 });
  await sheet.getByLabel("Valor", { exact: true }).fill(amount);
  const record_ = sheet.getByRole("switch", { name: "Lançar no meu extrato" });
  if ((await record_.count()) > 0) {
    const on = (await record_.getAttribute("aria-checked")) === "true";
    if (on !== record) await record_.click();
  }
  return sheet;
}

test.describe("a caixinha do grupo, de ponta a ponta", () => {
  test.describe.configure({ mode: "serial" });

  test("Ana cria a caixinha com objetivo e prazo", async ({ page }) => {
    test.setTimeout(120_000);
    await openBoxes(page);
    await expect(page.getByRole("link", { name: DEMO_BOX })).toBeVisible();
    await page.getByRole("button", { name: "Nova caixinha" }).first().click();
    const sheet = dialog(page, "Nova caixinha");
    await expect(sheet).toBeVisible();
    // The objective starts off: a box without one only follows what was saved.
    await expect(
      sheet.getByRole("switch", { name: "Definir objetivo" }),
    ).toHaveAttribute("aria-checked", "false");
    await sheet.getByRole("button", { name: "Criar caixinha" }).click();
    await expect(sheet.getByText("Dê um nome à caixinha.")).toBeVisible();
    await sheet.getByLabel("Nome").fill(BOX);
    await sheet.getByRole("switch", { name: "Definir objetivo" }).click();
    await sheet.getByRole("button", { name: "Criar caixinha" }).click();
    await expect(
      sheet.getByText("Informe quanto querem juntar."),
    ).toBeVisible();
    await sheet.getByLabel("Quanto querem juntar").fill("6.000,00");
    await sheet.getByRole("switch", { name: "Definir prazo" }).click();
    // The deadline starts a year ahead: the default is valid.
    await expect(sheet.getByLabel("Mês")).toBeVisible();
    await sheet.getByRole("button", { name: "Criar caixinha" }).click();
    await expect(
      toast(page).filter({ hasText: `Caixinha ${BOX} criada.` }),
    ).toBeVisible({
      timeout: 30_000,
    });
    await expect(page).toHaveURL(/\/caixinhas\/[0-9a-f-]+$/, {
      timeout: 30_000,
    });
    await expect(page.locator("h1:visible")).toHaveText(BOX);
    boxUrl = new URL(page.url()).pathname;
    await expect(hero(page)).toContainText(
      /R\$\s*0.{0,12}guardados de R\$\s*6\.000/,
    );
    // With a deadline and no plan yet: what they would need to save.
    await expect(
      page
        .locator("p")
        .filter({ hasText: /Para chegar em .*, vocês precisam guardar/ })
        .first(),
    ).toBeVisible();
    await expect(
      page.getByText("Ninguém definiu quanto guarda por mês"),
    ).toBeVisible();
    await expect(
      history(page).getByText("Ninguém guardou ainda"),
    ).toBeVisible();
  });

  test("Ana define o plano e guarda, com e sem lançar no extrato", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await goToBox(page);
    await page.getByRole("button", { name: "Mudar meu plano" }).click();
    const plan = dialog(page, "Mudar meu plano");
    await plan.getByLabel("Quanto você guarda por mês").fill("500,00");
    await plan.getByRole("button", { name: "Salvar plano" }).click();
    await expect(toast(page).filter({ hasText: "Plano salvo." })).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      people(page).locator("li").filter({ hasText: "Você" }),
    ).toContainText(/Por mês\s*R\$\s*500/, { timeout: 30_000 });
    await expect(
      page.getByText(/Chegam em .*antes do prazo|No ritmo de vocês, chegam/),
    ).toBeVisible();

    // With the transfer: from "Conta principal" to her caixinha.
    const withTransfer = await move(page, "Guardar", "1.000,00");
    await withTransfer
      .getByLabel("Sai de")
      .selectOption({ label: "Conta principal" });
    await withTransfer
      .getByLabel("Vai para")
      .selectOption({ label: "Caixinha Viagem" });
    await withTransfer
      .getByRole("button", { name: /^Guardar R\$\s*1\.000,00$/ })
      .click();
    await expect(
      toast(page).filter({ hasText: `R$ 1.000,00 guardados em ${BOX}.` }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(hero(page)).toContainText(/R\$\s*1\.000.{0,12}guardados de/, {
      timeout: 30_000,
    });
    await expect(history(page)).toContainText("No seu extrato");

    // Without it: only the group knows.
    const plain = await move(page, "Guardar", "500,00", { record: false });
    await expect(plain.getByLabel("Sai de")).toHaveCount(0);
    await plain.getByRole("button", { name: /^Guardar R\$\s*500,00$/ }).click();
    await expect(hero(page)).toContainText(/R\$\s*1\.500.{0,12}guardados de/, {
      timeout: 30_000,
    });
    await expect(history(page).getByText("No seu extrato")).toHaveCount(1);

    // The transfer is in her Extrato, named after the box.
    await page.goto("/extrato");
    await expect(page.getByText(`Caixinha ${BOX}`).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test("o Bruno vê a caixinha, guarda sem caixinha dele e não resgata mais do que guardou", async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    const guest = await asBruno(browser, baseURL);
    try {
      const bp = guest.page;
      await openBox(bp, BOX);
      await expect(hero(bp)).toContainText(/R\$\s*1\.500.{0,12}guardados de/);
      // Nothing of Ana's accounts: only what she put in the box.
      await expect(people(bp)).toContainText("Ana");
      await expect(people(bp)).not.toContainText("Conta principal");
      await expect(
        bp.getByRole("button", { name: "Mudar partes" }),
      ).toHaveCount(0);
      // Resgatar stays off until he has put something in.
      await expect(
        bp.getByRole("button", { name: "Resgatar", exact: true }),
      ).toBeDisabled();

      const sheet = await move(bp, "Guardar", "300,00");
      await expect(
        sheet.getByText("Crie uma caixinha sua para lançar no extrato."),
      ).toBeVisible();
      await expect(
        sheet.getByRole("link", { name: "Criar caixinha" }),
      ).toHaveAttribute("href", "/contas/nova?tipo=caixinha");
      await sheet
        .getByRole("button", { name: /^Guardar R\$\s*300,00$/ })
        .click();
      await expect(hero(bp)).toContainText(/R\$\s*1\.800.{0,12}guardados de/, {
        timeout: 30_000,
      });
      await bp.getByRole("button", { name: "Mudar meu plano" }).click();
      await dialog(bp, "Mudar meu plano")
        .getByLabel("Quanto você guarda por mês")
        .fill("300,00");
      await dialog(bp, "Mudar meu plano")
        .getByRole("button", { name: "Salvar plano" })
        .click();
      await expect(
        people(bp).locator("li").filter({ hasText: "Você" }),
      ).toContainText(/Por mês\s*R\$\s*300/, { timeout: 30_000 });
      // The projection of each person, in the same list.
      await expect(people(bp).locator("li")).toHaveCount(2);
      await expect(people(bp)).toContainText(/chega em/);

      const take = await move(bp, "Resgatar", "400,00");
      await take
        .getByRole("button", { name: /^Resgatar R\$\s*400,00$/ })
        .click();
      await expect(
        take.getByText("Você pode resgatar até R$ 300,00, o que você guardou."),
      ).toBeVisible();
      await closeSheet(bp);
      await expect(hero(bp)).toContainText(/R\$\s*1\.800.{0,12}guardados de/);
    } finally {
      await guest.context.close();
    }
  });

  test("Ana, dona do grupo, divide o objetivo por percentual", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await goToBox(page);
    await page.getByRole("button", { name: "Mudar partes" }).click();
    const sheet = dialog(page, "Partes do objetivo");
    await sheet.getByRole("radio", { name: "Percentual" }).click();
    await sheet.getByLabel(/\(você\)/).fill("60");
    await sheet.getByLabel(/Bruno/).fill("30");
    await expect(
      sheet.getByText("Os percentuais somam 90%. Precisam somar 100%."),
    ).toBeVisible();
    await sheet.getByLabel(/Bruno/).fill("40");
    await expect(sheet.getByText("Os percentuais somam 100%.")).toBeVisible();
    await sheet.getByRole("button", { name: "Salvar partes" }).click();
    await expect(toast(page).filter({ hasText: "Partes salvas." })).toBeVisible(
      {
        timeout: 30_000,
      },
    );
    await expect(
      people(page).locator("li").filter({ hasText: "Você" }),
    ).toContainText(/\(60%\)/, { timeout: 30_000 });
    await expect(
      people(page).locator("li").filter({ hasText: "Bruno" }),
    ).toContainText(/Parte\s*R\$\s*2\.400/);
  });

  test("Ana resgata com transferência e desfaz pelo aviso e pela linha do histórico", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await goToBox(page);
    const take = await move(page, "Resgatar", "200,00");
    await take.getByRole("button", { name: /^Resgatar R\$\s*200,00$/ }).click();
    await expect(
      toast(page).filter({ hasText: `R$ 200,00 resgatados de ${BOX}.` }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(hero(page)).toContainText(/R\$\s*1\.600.{0,12}guardados de/, {
      timeout: 30_000,
    });
    await expect(toast(page)).toHaveCount(0, { timeout: 15_000 });

    // Desfazer in the toast.
    const first = await move(page, "Guardar", "50,00", { record: false });
    await first.getByRole("button", { name: /^Guardar R\$\s*50,00$/ }).click();
    await expect(hero(page)).toContainText(/R\$\s*1\.650.{0,12}guardados de/, {
      timeout: 30_000,
    });
    await toast(page)
      .filter({ hasText: "guardados em" })
      .getByRole("button", { name: "Desfazer" })
      .click();
    await expect(hero(page)).toContainText(/R\$\s*1\.600.{0,12}guardados de/, {
      timeout: 30_000,
    });

    // Desfazer in the row of the history, after a confirmation.
    const second = await move(page, "Guardar", "70,00", { record: false });
    await second.getByRole("button", { name: /^Guardar R\$\s*70,00$/ }).click();
    await expect(hero(page)).toContainText(/R\$\s*1\.670.{0,12}guardados de/, {
      timeout: 30_000,
    });
    const rows = history(page).getByRole("button", { name: /^Desfazer: / });
    const before = await rows.count();
    // Only her own rows have it: Bruno's does not.
    expect(before).toBeGreaterThan(0);
    await rows.first().click();
    const confirm = dialog(page, "Desfazer este lançamento?");
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 15_000 });
    await expect(hero(page)).toContainText(/R\$\s*1\.670.{0,12}guardados de/);
    await rows.first().click();
    await dialog(page, "Desfazer este lançamento?")
      .getByRole("button", { name: "Desfazer lançamento" })
      .click();
    await expect(
      toast(page).filter({ hasText: "Lançamento desfeito." }),
    ).toBeVisible({
      timeout: 30_000,
    });
    await expect(hero(page)).toContainText(/R\$\s*1\.600.{0,12}guardados de/, {
      timeout: 30_000,
    });
    await expect(rows).toHaveCount(before - 1);
  });

  test("qualquer membro arquiva a caixinha e ela volta com Desarquivar", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await goToBox(page);
    await page.getByRole("button", { name: "Editar caixinha" }).click();
    const sheet = dialog(page, "Editar caixinha");
    await sheet.getByRole("button", { name: "Arquivar caixinha" }).click();
    const confirm = dialog(page, `Arquivar ${BOX}?`);
    await confirm.getByRole("button", { name: "Arquivar caixinha" }).click();
    await expect(
      toast(page).filter({ hasText: `Caixinha ${BOX} arquivada.` }),
    ).toBeVisible({
      timeout: 30_000,
    });
    // Out of the list, but the address still opens it, read only.
    await page.goto(boxesUrl);
    await expect(page.getByRole("link", { name: DEMO_BOX })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("link", { name: BOX })).toHaveCount(0);
    await goToBox(page);
    await expect(
      page
        .getByText("Esta caixinha está arquivada. O histórico continua aqui.")
        .first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Guardar", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Desarquivar" }).click();
    await expect(
      toast(page).filter({ hasText: `Caixinha ${BOX} de volta.` }),
    ).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByRole("button", { name: "Guardar", exact: true }),
    ).toBeVisible({ timeout: 30_000 });
    await page.goto(boxesUrl);
    await expect(page.getByRole("link", { name: BOX })).toBeVisible({
      timeout: 30_000,
    });
  });

  test("o Bruno vê as caixinhas dos grupos em Planejar › Metas", async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    const guest = await asBruno(browser, baseURL);
    try {
      const bp = guest.page;
      await bp.goto("/planejar/metas");
      const section = bp.getByRole("region", {
        name: "Caixinhas compartilhadas",
      });
      await expect(section).toBeVisible({ timeout: 30_000 });
      await expect(section.getByRole("link", { name: BOX })).toBeVisible();
      await expect(section).toContainText("Casa ·");
      await section.getByRole("link", { name: DEMO_BOX }).click();
      await expect(bp).toHaveURL(
        /\/compartilhado\/[0-9a-f-]+\/caixinhas\/[0-9a-f-]+$/,
        {
          timeout: 30_000,
        },
      );
      await expect(bp.locator("h1:visible")).toHaveText(DEMO_BOX);
    } finally {
      await guest.context.close();
    }
  });
});

test.describe("telas", () => {
  for (const theme of ["Escuro", "Claro"] as const) {
    test(`sem violações de acessibilidade no tema ${theme.toLowerCase()}`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await chooseTheme(page, theme);
      await openBoxes(page);
      await expect(page.getByRole("link", { name: DEMO_BOX })).toBeVisible();
      await expectNoA11yViolations(page);
      await page.getByRole("link", { name: DEMO_BOX }).click();
      await expect(page.locator("h1:visible")).toHaveText(DEMO_BOX, {
        timeout: 30_000,
      });
      await expect(people(page).locator("li")).toHaveCount(2);
      await expectNoA11yViolations(page);
    });

    // Apart from the screens: a finding in one sheet must not hide the rest.
    test(`as folhas da caixinha sem violações de acessibilidade no tema ${theme.toLowerCase()}`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await chooseTheme(page, theme);
      await openBox(page, DEMO_BOX);
      for (const [button, title] of [
        ["Guardar", "Guardar"],
        ["Resgatar", "Resgatar"],
        ["Mudar meu plano", "Mudar meu plano"],
        ["Mudar partes", "Partes do objetivo"],
      ] as const) {
        await page.getByRole("button", { name: button, exact: true }).click();
        await expect(dialog(page, title)).toBeVisible({ timeout: 30_000 });
        await expectNoA11yViolations(page);
        await closeSheet(page);
      }
      await page.getByRole("button", { name: "Editar caixinha" }).click();
      await expect(dialog(page, "Editar caixinha")).toBeVisible();
      await expectNoA11yViolations(page);
    });
  }

  test("a 360 px e 200% nada rola para o lado", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 360, height: 780 });
    await openBoxes(page);
    await page.addStyleTag({ content: BIG_TEXT });
    await expect(page.getByRole("link", { name: DEMO_BOX })).toBeVisible();
    await expectNoHorizontalScroll(page, "A lista de caixinhas a 200%");
    await page.getByRole("link", { name: DEMO_BOX }).click();
    await expect(page.locator("h1:visible")).toHaveText(DEMO_BOX, {
      timeout: 30_000,
    });
    await page.addStyleTag({ content: BIG_TEXT });
    await expect(people(page).locator("li")).toHaveCount(2);
    await expectNoHorizontalScroll(page, "A caixinha a 200%");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(dialog(page, "Guardar")).toBeVisible();
    await page.waitForTimeout(500);
    await expectNoHorizontalScroll(page, "Guardar a 200%");
  });
});

test("com a flag desligada para o Bruno, a caixinha some e o servidor fecha a rota", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000);
  // The addresses, from the demo box (this test must not depend on the chain).
  await openBox(page, DEMO_BOX);
  const demoUrl = new URL(page.url()).pathname;
  await page.goto("/admin/flags");
  await page
    .locator('[data-flag="financas_compartilhadas"]')
    .getByRole("button", { name: "Ajustar" })
    .click();
  const sheet = dialog(page, "Finanças compartilhadas por pessoa");
  const bruno = sheet.getByRole("radiogroup", {
    name: "Finanças compartilhadas para Bruno Lima",
  });
  await expect(bruno).toBeVisible({ timeout: 30_000 });
  const guest = await asBruno(browser, baseURL);
  try {
    const saved = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.request().headers()["next-action"] !== undefined,
    );
    await bruno.getByRole("radio", { name: "Desligado", exact: true }).click();
    expect((await saved).ok()).toBe(true);

    const gp = guest.page;
    await gp.goto(demoUrl);
    await expect(
      gp.getByRole("heading", { name: "Página não encontrada" }),
    ).toBeVisible({ timeout: 30_000 });
    await gp.goto(boxesUrl);
    await expect(
      gp.getByRole("heading", { name: "Página não encontrada" }),
    ).toBeVisible({ timeout: 30_000 });
    await gp.goto("/planejar/metas");
    await expect(gp.locator("h1:visible")).toBeVisible({ timeout: 30_000 });
    await expect(
      gp.getByRole("heading", { name: "Caixinhas compartilhadas" }),
    ).toHaveCount(0);
  } finally {
    const restored = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.request().headers()["next-action"] !== undefined,
    );
    await bruno.getByRole("radio", { name: "Ligado", exact: true }).click();
    expect((await restored).ok()).toBe(true);
    await expect(
      bruno.getByRole("radio", { name: "Ligado", exact: true }),
    ).toBeChecked();
    await guest.context.close();
  }
});

/** Dismisses, in the bell, the notices that name the box of this run. */
async function dismissBoxNotices(page: Page) {
  await page.goto("/inicio");
  await expect(bellOf(page)).toBeVisible({ timeout: 30_000 });
  await expect(async () => {
    await bellOf(page).click();
    await expect(dialog(page, "Notificações")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  const sheet = dialog(page, "Notificações");
  await expect(sheet.getByText("Carregando notificações…")).toHaveCount(0, {
    timeout: 30_000,
  });
  const mine = sheet.locator("li").filter({ hasText: BOX });
  while ((await mine.count()) > 0) {
    const before = await mine.count();
    await mine.first().getByRole("button", { name: "Dispensar" }).click();
    await expect(mine).toHaveCount(before - 1, { timeout: 15_000 });
  }
}

// Last: the notices of the box in the bells are dismissed, so the specs that
// count the demo's notices (sino.spec.ts) find them as they were.
test("Ana e Bruno dispensam os avisos da caixinha do sino", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  await dismissBoxNotices(page);
  const guest = await asBruno(browser, baseURL);
  try {
    await dismissBoxNotices(guest.page);
  } finally {
    await guest.context.close();
  }
});
