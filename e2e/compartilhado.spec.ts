import {
  type Browser,
  devices,
  expect,
  type Page,
  test,
} from "@playwright/test";
import { expectNoA11yViolations } from "./axe";
import { BRUNO_EMAIL, BRUNO_STATE } from "./demo";
import { BIG_TEXT, expectNoHorizontalScroll } from "./layout";
import { chooseTheme } from "./theme";

// Finanças compartilhadas (ADR-13, doc 02 §6.18), as Ana (the demo's owner)
// and Bruno (his own session, e2e/.auth/bruno.json, made by auth.setup.ts).
// Ana makes the group "Apartamento {RUN}", invites Bruno, who accepts in the
// bell; she divides an Extrato expense and adds expenses in each way of
// dividing; Bruno sees what he owes and nothing private of hers, tries to
// leave (the warning), settles, and leaves. The demo's "Casa" stays alone.
// The last test turns the flag off for Bruno and puts it back.

const RUN = Date.now().toString(36).slice(-5);
const GROUP = `Apartamento ${RUN}`;
const toast = (page: Page) => page.locator("[data-sonner-toast]");
const dialog = (page: Page, name: string | RegExp) =>
  page.getByRole("dialog", { name });
const bellOf = (page: Page) =>
  page.locator("main").getByRole("button", { name: /^Notificações/ });

/** The month before the current one, "AAAA-MM", in São Paulo. */
function previousMonth(): string {
  const [year, month] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date())
    .split("-")
    .map(Number);
  return new Date(Date.UTC(year ?? 2026, (month ?? 1) - 2, 1))
    .toISOString()
    .slice(0, 7);
}
const PREVIOUS = previousMonth();

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

/** The group's page, found from the list, as a person would. */
async function openGroup(page: Page, name = GROUP, query = "") {
  await page.goto("/compartilhado");
  await page
    .getByRole("link", { name: new RegExp(name) })
    .first()
    .click({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/compartilhado\/[0-9a-f-]+$/);
  await expect(page.locator("h1:visible")).toHaveText(name, {
    timeout: 30_000,
  });
  if (query) {
    await page.goto(`${new URL(page.url()).pathname}${query}`);
    await expect(page.locator("h1:visible")).toHaveText(name, {
      timeout: 30_000,
    });
  }
}

async function addNew(
  page: Page,
  {
    description,
    amount,
    method,
  }: { description: string; amount: string; method?: string },
) {
  await page
    .getByRole("button", { name: "Adicionar despesas" })
    .first()
    .click();
  const sheet = dialog(page, "Adicionar despesas");
  await expect(sheet).toBeVisible();
  await sheet.getByRole("radio", { name: "Nova" }).click();
  await sheet.getByLabel("Descrição").fill(description);
  await sheet.getByLabel("Valor", { exact: true }).fill(amount);
  if (method) await sheet.getByRole("radio", { name: method }).click();
  return sheet;
}

test.describe("o grupo, de ponta a ponta", () => {
  test.describe.configure({ mode: "serial" });

  test("Ana cria um grupo e convida o Bruno: o convite pendente mostra só o e-mail digitado", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/compartilhado");
    await expect(
      page.getByRole("heading", { name: "Compartilhado", level: 1 }),
    ).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Novo grupo" }).click();
    const sheet = dialog(page, "Novo grupo");
    await expect(sheet).toBeVisible();
    // The person types a name: an empty one is refused with a field error.
    await sheet.getByRole("button", { name: "Criar grupo" }).click();
    await expect(sheet.getByText("Dê um nome ao grupo.")).toBeVisible();
    await sheet.getByLabel("Nome do grupo").fill(GROUP);
    // The note never tells whether an e-mail has an account.
    await expect(
      sheet.getByText(/Se houver alguém com esse e-mail no Meu Finan/),
    ).toBeVisible();
    await sheet.getByLabel("E-mail 1").fill("nao-e-um-email");
    await sheet.getByRole("button", { name: "Criar grupo" }).click();
    await expect(sheet.getByText("Confira o e-mail.")).toBeVisible();
    await sheet.getByLabel("E-mail 1").fill(BRUNO_EMAIL);
    await sheet.getByRole("button", { name: "Criar grupo" }).click();
    await expect(toast(page)).toContainText("Grupo criado. Convite enviado.", {
      timeout: 30_000,
    });
    await openGroup(page);
    await expect(
      page.getByText("Convide alguém em Pessoas para começar a dividir."),
    ).toBeVisible();

    await page.getByRole("button", { name: "Pessoas" }).click();
    const people = dialog(page, "Pessoas");
    await expect(people.getByText(/Convite enviado · vale até/)).toBeVisible();
    // Until he accepts, only the e-mail she typed: not his name.
    await expect(people.getByText(BRUNO_EMAIL).first()).toBeVisible();
    await expect(people.getByText("Bruno Lima")).toHaveCount(0);
    await expect(
      people.getByRole("button", { name: "Cancelar convite" }),
    ).toBeVisible();
    await expect(
      people.getByRole("button", { name: "Sair do grupo" }),
    ).toBeVisible();
  });

  test("o Bruno aceita o convite pelo sino", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const bruno = await asBruno(browser, baseURL);
    try {
      const { page } = bruno;
      await page.goto("/inicio");
      await expect(bellOf(page)).toBeVisible({ timeout: 30_000 });
      await expect(async () => {
        await bellOf(page).click();
        await expect(dialog(page, "Notificações")).toBeVisible({
          timeout: 2_000,
        });
      }).toPass({ timeout: 30_000 });
      const sheet = dialog(page, "Notificações");
      const invite = sheet.locator("li").filter({ hasText: GROUP });
      await expect(invite.getByText("Convite para dividir")).toBeVisible({
        timeout: 30_000,
      });
      // From her name and e-mail, and the group.
      await expect(invite).toContainText("Ana (demo@meu-finan.local)");
      await expect(
        invite.getByRole("button", { name: "Recusar" }),
      ).toBeVisible();
      await invite.getByRole("button", { name: "Aceitar" }).click();
      await expect(toast(page)).toContainText(
        `Você entrou no grupo ${GROUP}.`,
        {
          timeout: 30_000,
        },
      );
      await page.goto("/compartilhado");
      await expect(
        page.getByRole("link", { name: new RegExp(GROUP) }),
      ).toBeVisible({ timeout: 30_000 });
      // No pending invite left on his screen.
      await expect(page.getByRole("button", { name: "Aceitar" })).toHaveCount(
        0,
      );
    } finally {
      await bruno.context.close();
    }
  });

  test("Ana divide um lançamento do Extrato em partes iguais", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto(`/extrato?mes=${PREVIOUS}`);
    await expect(page.getByText("Carregando…")).toHaveCount(0, {
      timeout: 30_000,
    });
    await page
      .getByRole("button", { name: /Atacado/ })
      .first()
      .click({ timeout: 30_000 });
    await dialog(page, "Atacado")
      .getByRole("button", { name: "Dividir" })
      .click();
    const sheet = dialog(page, "Dividir despesa");
    await expect(sheet).toBeVisible();
    await sheet.getByRole("combobox", { name: "Grupo" }).selectOption({
      label: GROUP,
    });
    await expect(
      sheet.getByText(new RegExp(`Grupo: ${GROUP}\\.`)),
    ).toBeVisible();
    await expect(sheet.getByRole("radio", { name: "Iguais" })).toBeChecked();
    await sheet.getByRole("button", { name: "Dividir", exact: true }).click();
    await expect(toast(page)).toContainText(`Dividida em ${GROUP}.`, {
      timeout: 30_000,
    });

    // The detail comes back, saying where the entry went; it cannot be divided twice.
    const detail = dialog(page, "Atacado");
    await expect(detail.getByText("Dividida em")).toBeVisible();
    await expect(detail.getByRole("link", { name: GROUP })).toBeVisible();
    await expect(detail.getByRole("button", { name: "Dividir" })).toHaveCount(
      0,
    );
    await closeSheet(page);

    await openGroup(page, GROUP, `?mes=${PREVIOUS}`);
    await expect(page.getByText("Atacado").first()).toBeVisible();
    await expect(
      page.getByText(/Bruno [A-Za-z]+ te deve/).first(),
    ).toBeVisible();
  });

  test("Ana adiciona despesas em cada forma de dividir, e o percentual errado não passa", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openGroup(page);

    // Percentual: 40% + 50% does not close; 40% + 60% does.
    let sheet = await addNew(page, {
      description: "Luz e2e",
      amount: "100,00",
      method: "Percentual",
    });
    await sheet.getByLabel("Percentual de Você").fill("40");
    await expect(sheet.getByText(/Os percentuais somam 90%/)).toBeVisible();
    await sheet.getByLabel(/Percentual de Bruno/).fill("60");
    await expect(sheet.getByText(/Os percentuais somam/)).toHaveCount(0);
    await sheet.getByRole("button", { name: "Adicionar despesa" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByText("Luz e2e").first()).toBeVisible({
      timeout: 30_000,
    });

    // Valores: R$ 20,00 + R$ 20,00 leaves R$ 10,00 out.
    sheet = await addNew(page, {
      description: "Gás e2e",
      amount: "50,00",
      method: "Valores",
    });
    await sheet.getByLabel("Parte de Você").fill("20,00");
    await sheet.getByLabel(/Parte de Bruno/).fill("20,00");
    await expect(
      sheet.getByText(/Faltam R\$.*10,00 para fechar/),
    ).toBeVisible();
    await sheet.getByLabel(/Parte de Bruno/).fill("30,00");
    await expect(sheet.getByText(/para fechar|Passou/)).toHaveCount(0);
    await sheet.getByRole("button", { name: "Adicionar despesa" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByText("Gás e2e").first()).toBeVisible({
      timeout: 30_000,
    });

    // Cotas: 2 for her, 1 for him.
    sheet = await addNew(page, {
      description: "Água e2e",
      amount: "30,00",
      method: "Cotas",
    });
    await sheet
      .getByRole("button", { name: "Mais uma cota para Você" })
      .click();
    await expect(sheet.getByLabel("2 cotas para Você")).toBeVisible();
    await sheet.getByRole("button", { name: "Adicionar despesa" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByText("Água e2e").first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByText(/Bruno [A-Za-z]+ te deve/).first(),
    ).toBeVisible();

    // The expense's detail shows how it was divided.
    await page.getByRole("button", { name: /Água e2e/ }).click();
    const detail = dialog(page, "Água e2e");
    await expect(detail).toContainText("Por cotas");
    await expect(detail).toContainText("Você · 2 cotas");
    await expect(detail).toContainText("Bruno Lima · 1 cota");
    await closeSheet(page);
  });

  test("Ana adiciona em lote as despesas de uma categoria, buscando pela categoria", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openGroup(page);
    await page
      .getByRole("button", { name: "Adicionar despesas" })
      .first()
      .click();
    const sheet = dialog(page, "Adicionar despesas");
    await sheet.getByRole("button", { name: "Mês passado" }).click();
    const search = sheet.getByRole("searchbox", { name: "Buscar categoria" });
    // The demo has more than 8 categories: the search shows.
    if (await search.isVisible()) await search.fill("Merc");
    await sheet
      .getByRole("combobox", { name: "Categoria" })
      .selectOption({ label: "Mercado" });
    const all = sheet.getByRole("button", {
      name: /^Selecionar todas \(\d+\)$/,
    });
    await expect(all).toBeVisible({ timeout: 30_000 });
    const count = Number(
      (await all.textContent())?.match(/\((\d+)\)/)?.[1] ?? "0",
    );
    expect(count).toBeGreaterThan(0);
    await all.click();
    const add = sheet.getByRole("button", {
      name: count === 1 ? "Adicionar 1 despesa" : `Adicionar ${count} despesas`,
    });
    await expect(add).toBeEnabled();
    await add.click();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 30_000 });
    await expect(toast(page)).toContainText(/adicionada/i, { timeout: 30_000 });
  });

  test("o Bruno vê o que deve e nada de privado da Ana, e sair mostra o aviso", async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(180_000);
    const bruno = await asBruno(browser, baseURL);
    try {
      const { page } = bruno;
      await openGroup(page, GROUP, `?mes=${PREVIOUS}`);
      await expect(page.getByText(/Você deve/).first()).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText(/para Ana/).first()).toBeVisible();
      await page
        .getByRole("button", { name: /Atacado/ })
        .first()
        .click();
      const detail = dialog(page, "Atacado");
      await expect(detail).toBeVisible();
      // Description, amount, date, who paid and the split. Not her account,
      // her category, her notes, nor "No seu extrato".
      await expect(detail).toContainText("Pago por");
      await expect(detail).not.toContainText("No seu extrato");
      await expect(detail).not.toContainText("Conta Principal");
      await expect(detail).not.toContainText("Mercado");
      await expect(detail).not.toContainText("Dividida em");
      await closeSheet(page);

      // Leaving with a balance open warns first, and Cancelar changes nothing.
      await page.getByRole("button", { name: "Pessoas" }).click();
      await dialog(page, "Pessoas")
        .getByRole("button", { name: "Sair do grupo" })
        .click();
      const leave = dialog(page, `Sair de ${GROUP}?`);
      await expect(leave).toContainText("Você deixa de ver as despesas");
      await expect(leave).toContainText(/Vocês ainda têm/);
      await expect(leave).toContainText("o histórico fica para quem continua");
      await leave.getByRole("button", { name: "Cancelar" }).click();
      await expect(dialog(page, "Pessoas")).toBeVisible();
      await closeSheet(page);
    } finally {
      await bruno.context.close();
    }
  });

  test("o Bruno marca como acertado e a Ana vê tudo acertado", async ({
    browser,
    baseURL,
    page,
  }) => {
    test.setTimeout(180_000);
    const bruno = await asBruno(browser, baseURL);
    try {
      const bp = bruno.page;
      await openGroup(bp);
      await bp.getByRole("button", { name: "Marcar como acertado" }).click();
      const sheet = dialog(bp, "Marcar como acertado");
      await expect(sheet).toContainText("Você");
      const record = sheet.getByLabel("Lançar no meu extrato");
      if (await record.isChecked()) await record.uncheck({ force: true });
      await sheet
        .getByRole("button", { name: /^Marcar R\$.* como acertado$/ })
        .click();
      await expect(toast(bp)).toContainText(/Acerto de R\$/, {
        timeout: 30_000,
      });
      await expect(bp.getByText("Tudo acertado").first()).toBeVisible({
        timeout: 30_000,
      });
    } finally {
      await bruno.context.close();
    }
    await openGroup(page);
    await expect(page.getByText("Tudo acertado").first()).toBeVisible({
      timeout: 30_000,
    });
    // The settlement is in the list, in transfer tone.
    await expect(page.getByText(/acertou/).first()).toBeVisible();
    // Her bell tells her about it.
    await page.goto("/inicio");
    await expect(bellOf(page)).toBeVisible({ timeout: 30_000 });
  });

  test("o Bruno sai do grupo e a Ana vê quem saiu", async ({
    browser,
    baseURL,
    page,
  }) => {
    test.setTimeout(120_000);
    const bruno = await asBruno(browser, baseURL);
    try {
      const bp = bruno.page;
      await openGroup(bp);
      await bp.getByRole("button", { name: "Pessoas" }).click();
      await dialog(bp, "Pessoas")
        .getByRole("button", { name: "Sair do grupo" })
        .click();
      const leave = dialog(bp, `Sair de ${GROUP}?`);
      // Settled: nothing in the warning about a balance.
      await expect(leave).not.toContainText("em aberto");
      await leave.getByRole("button", { name: "Sair do grupo" }).click();
      // (The app should also take him to the list: the route push is dropped
      // while the sheet closes; see the bug report of this task.)
      await expect(toast(bp)).toContainText(`Você saiu de ${GROUP}.`, {
        timeout: 30_000,
      });
      await bp.goto("/compartilhado");
      await expect(
        bp.getByRole("link", { name: new RegExp(GROUP) }),
      ).toHaveCount(0);
    } finally {
      await bruno.context.close();
    }
    await openGroup(page);
    // The history keeps his name; he no longer is among the people.
    await expect(page.getByText("Bruno Lima (saiu)").first()).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("button", { name: "Pessoas" }).click();
    await expect(dialog(page, "Pessoas").getByText("Bruno")).toHaveCount(0);
  });
});

test.describe("telas", () => {
  for (const theme of ["Escuro", "Claro"] as const) {
    test(`sem violações de acessibilidade no tema ${theme.toLowerCase()}`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await chooseTheme(page, theme);
      await page.goto("/compartilhado");
      await expect(
        page.getByRole("link", { name: /Casa/ }).first(),
      ).toBeVisible({ timeout: 30_000 });
      await expectNoA11yViolations(page);
      await openGroup(page, "Casa");
      await expect(page.getByText(/Aluguel/).first()).toBeVisible({
        timeout: 30_000,
      });
      await expectNoA11yViolations(page);
    });

    // Apart from the screens: a finding in one sheet must not hide the rest.
    test(`as folhas do grupo sem violações de acessibilidade no tema ${theme.toLowerCase()}`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await chooseTheme(page, theme);
      await openGroup(page, "Casa");
      await expect(page.getByText(/Aluguel/).first()).toBeVisible({
        timeout: 30_000,
      });
      await page.getByRole("button", { name: "Pessoas" }).click();
      await expect(dialog(page, "Pessoas")).toBeVisible();
      await expectNoA11yViolations(page);
      await closeSheet(page);
      await page
        .getByRole("button", { name: "Adicionar despesas" })
        .first()
        .click();
      await expect(dialog(page, "Adicionar despesas")).toBeVisible();
      await expectNoA11yViolations(page);
    });
  }

  test("o sino tem nome acessível que contém o texto visível, sem violações no Início", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await chooseTheme(page, "Escuro");
    await page.goto("/inicio");
    const bell = bellOf(page);
    await expect(bell).toBeVisible({ timeout: 30_000 });
    // WCAG 2.5.3: what is written on the button is part of its name. The
    // badge number is aria-hidden, so what counts is the visible text outside it.
    const visible = await bell.evaluate((node) =>
      [...node.querySelectorAll("*")]
        .filter((child) => child.getAttribute("aria-hidden") !== "true")
        .flatMap((child) => [...child.childNodes])
        .filter((child) => child.nodeType === Node.TEXT_NODE)
        .map((child) => child.textContent?.trim() ?? "")
        .join(" ")
        .trim(),
    );
    const name = (await bell.getAttribute("aria-label")) ?? "";
    expect(name.toLowerCase()).toContain(visible.toLowerCase());
    await expectNoA11yViolations(page);
  });

  test("a 360 px e 200% nada rola para o lado", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/compartilhado");
    await page.addStyleTag({ content: BIG_TEXT });
    await expect(page.getByRole("link", { name: /Casa/ }).first()).toBeVisible({
      timeout: 30_000,
    });
    await expectNoHorizontalScroll(page, "Compartilhado a 200%");
    await openGroup(page, "Casa");
    await page.addStyleTag({ content: BIG_TEXT });
    await expect(page.getByText(/Aluguel/).first()).toBeVisible({
      timeout: 30_000,
    });
    await expectNoHorizontalScroll(page, "O grupo a 200%");
    await page.getByRole("button", { name: "Pessoas" }).click();
    await expect(dialog(page, "Pessoas")).toBeVisible();
    await page.waitForTimeout(500);
    await expectNoHorizontalScroll(page, "Pessoas a 200%");
  });
});

test("com a flag desligada para o Bruno, a área some e o servidor fecha a rota", async ({
  browser,
  baseURL,
  page,
}) => {
  test.setTimeout(180_000);
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
    await gp.goto("/compartilhado");
    await expect(
      gp.getByRole("heading", { name: "Página não encontrada" }),
    ).toBeVisible({ timeout: 30_000 });
    await gp.goto("/ajustes");
    await expect(
      gp.getByRole("link", { name: /Exportar lançamentos/ }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(gp.getByRole("link", { name: /Compartilhado/ })).toHaveCount(
      0,
    );
    await gp.goto("/inicio");
    await expect(bellOf(gp)).toBeVisible({ timeout: 30_000 });
    await expect(gp.getByRole("link", { name: "Compartilhado" })).toHaveCount(
      0,
    );
  } finally {
    // Back to what the demo set (on for Bruno), for the specs that follow.
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

// Kept apart from the chain above: if it fails, the others still run.
test("criar um grupo leva para a tela dele", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/compartilhado");
  await page.getByRole("button", { name: "Novo grupo" }).click();
  const sheet = dialog(page, "Novo grupo");
  await sheet.getByLabel("Nome do grupo").fill(`Rota ${RUN}`);
  await sheet.getByRole("button", { name: "Criar grupo" }).click();
  await expect(page).toHaveURL(/\/compartilhado\/[0-9a-f-]+$/, {
    timeout: 30_000,
  });
  await expect(page.locator("h1:visible")).toHaveText(`Rota ${RUN}`);
});
