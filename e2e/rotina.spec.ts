import { expect, type Page, type Route, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";
import { BRUNO_EMAIL, BRUNO_PASSWORD } from "./demo";
import { BIG_TEXT, expectNoHorizontalScroll } from "./layout";
import { chooseTheme } from "./theme";

// Administração › Rotina diária (doc 02 §6.17). Runs as the demo
// administrator (Ana), except Bruno's 404. Serial: the first test sees the
// screen before any run; the next ones run the job from the button.
// "Rodar agora" is the real daily job on the local demo database: without a
// network the rates step fails, so Parcial and Falhou count as an answer too.

test.describe.configure({ mode: "serial" });

const RUN_NOW = "Rodar agora";
const ANSWER = /Rotina concluída|A rotina falhou/;

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

const runNowButton = (page: Page) =>
  page.getByRole("button", { name: /^(Rodar agora|Rodando…)$/ });

async function loaded(page: Page) {
  await expect(page.getByText("Carregando…")).toHaveCount(0, {
    timeout: 30_000,
  });
  await expect(
    page.getByRole("heading", { name: "Rotina diária", level: 2 }),
  ).toBeVisible({ timeout: 30_000 });
}

/** Starts the job from the button and waits for the toast with the answer. */
async function runFromButton(page: Page) {
  await runNowButton(page).click();
  const sheet = page.getByRole("dialog", { name: "Rodar a rotina agora?" });
  await sheet.getByRole("button", { name: "Rodar", exact: true }).click();
  await expect(sheet).toBeHidden();
}

test("Ana abre pelo menu: título, aviso de que o cron nunca rodou e lista vazia", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.goto("/ajustes");
  await page.getByRole("link", { name: /Rotina diária/ }).click();
  await expect(page).toHaveURL(/\/admin\/rotina$/, { timeout: 30_000 });
  await loaded(page);

  // The fourth tab of Administração, marked as the current one.
  const tabs = page.getByRole("navigation", { name: /administração/i });
  await expect(tabs.getByRole("link", { name: "Rotina" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(tabs.getByRole("link")).toHaveCount(4);

  await expect(
    page.getByText("Ainda não houve nenhuma execução automática."),
  ).toBeVisible();
  await expect(
    page.getByText(/Nenhuma execução ainda\. A primeira roda sozinha/),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Configuração" }),
  ).toBeVisible();
  // The secret is only ever "Definido" or "Não definido".
  await expect(
    page.getByText(/^(Definido|Não definido)$/).first(),
  ).toBeVisible();
  await expect(runNowButton(page)).toHaveText(RUN_NOW);
  expect(errors).toEqual([]);
});

test("Cancelar a confirmação devolve o foco ao botão Rodar agora", async ({
  page,
}) => {
  await page.goto("/admin/rotina");
  await loaded(page);
  await runNowButton(page).click();
  const sheet = page.getByRole("dialog", { name: "Rodar a rotina agora?" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText(/Pode levar até 4 minutos/)).toBeVisible();
  await sheet.getByRole("button", { name: "Cancelar" }).click();
  await expect(sheet).toBeHidden();
  await expect(runNowButton(page)).toBeFocused();
  // Nothing ran.
  await expect(page.getByText(/Nenhuma execução ainda/)).toBeVisible();
});

test("Rodar agora cria a execução, aberta, em português, e ela fica depois de recarregar", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors = collectErrors(page);
  await page.goto("/admin/rotina");
  await loaded(page);
  // Holds the action for a moment, so the busy state is there to be seen.
  const slow = async (route: Route) => {
    if (route.request().method() === "POST") {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    await route.continue().catch(() => {});
  };
  await page.route("**/admin/rotina", slow);
  await runFromButton(page);

  // While it runs: the busy state in words.
  await expect(runNowButton(page)).toHaveAttribute("aria-busy", "true");
  await expect(page.getByText("Rodando a rotina.")).toBeVisible();

  await expect(page.getByText(ANSWER).first()).toBeVisible({
    timeout: 270_000,
  });
  // The focus comes back to the button that was disabled meanwhile.
  await expect(runNowButton(page)).toBeFocused();

  const list = page.locator('section[aria-labelledby="rotina-execucoes"]');
  const row = list.getByRole("button", { expanded: true }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row).toContainText("Botão Rodar agora");
  await expect(list.getByText(/Nenhuma execução ainda/)).toHaveCount(0);

  // The steps are open: named in pt-BR, no `chave: valor` and no "fase F".
  await expect(list.getByText("Lançamentos recorrentes")).toBeVisible();
  await expect(list.getByText("Avisos por push")).toBeVisible();
  const notes = await list.locator("ol li ul li").allInnerTexts();
  for (const note of notes) {
    expect(note, note).not.toMatch(/\b[a-z]+[A-Z]?[A-Za-z]*: ?\d/);
    expect(note, note).not.toMatch(/fase F\d/i);
  }
  expect(await list.innerText()).not.toMatch(/fase F\d/i);

  // The refusals of "too soon" and "already running" come as a message.
  await runFromButton(page);
  await expect(
    page
      .getByText(
        /A rotina rodou há pouco\. Espere \d+ s para rodar de novo\.|Já tem uma execução em andamento/,
      )
      .first(),
  ).toBeVisible({ timeout: 60_000 });

  await page.reload();
  await loaded(page);
  const reloaded = page
    .locator('section[aria-labelledby="rotina-execucoes"]')
    .getByRole("button", { name: /Botão Rodar agora/ });
  await expect(reloaded).toHaveCount(1);
  // A run by hand says nothing about the cron: the notice stays.
  await expect(
    page.getByText("Ainda não houve nenhuma execução automática."),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("uma execução recolhe e abre pelo teclado", async ({ page }) => {
  await page.goto("/admin/rotina");
  await loaded(page);
  const row = page
    .locator('section[aria-labelledby="rotina-execucoes"]')
    .getByRole("button", { name: /Botão Rodar agora/ });
  await expect(row).toHaveAttribute("aria-expanded", "false");
  await row.focus();
  await page.keyboard.press("Enter");
  await expect(row).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Space");
  await expect(row).toHaveAttribute("aria-expanded", "false");
});

test("a 200% em 360 px a tela não rola para o lado, com a execução aberta", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/admin/rotina");
  await loaded(page);
  await page.addStyleTag({ content: BIG_TEXT });
  await page
    .locator('section[aria-labelledby="rotina-execucoes"]')
    .getByRole("button", { name: /Botão Rodar agora/ })
    .click();
  await page.waitForTimeout(500);
  await expectNoHorizontalScroll(page, "Rotina diária a 200%");
});

test("as abas de Administração, Planejar e Relatórios cabem a 100% e não se sobrepõem a 200%", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 360, height: 780 });
  const screens = [
    "/admin/rotina",
    "/admin/usuarios",
    "/planejar/orcamentos",
    "/relatorios/visao-geral",
  ];
  for (const bigText of [false, true]) {
    for (const path of screens) {
      await page.goto(path);
      await expect(page.locator("h1:visible").first()).toBeVisible({
        timeout: 30_000,
      });
      if (bigText) await page.addStyleTag({ content: BIG_TEXT });
      await page.waitForTimeout(400);
      const boxes = await page.evaluate(() => {
        const nav = [...document.querySelectorAll("nav")].find(
          (n) =>
            n.checkVisibility() &&
            n.closest("main") !== null &&
            n.querySelectorAll("ul li").length >= 2,
        );
        if (!nav) return null;
        const rect = (e: Element) => {
          const { left, right, top, bottom } = e.getBoundingClientRect();
          return { left, right, top, bottom };
        };
        return {
          nav: rect(nav),
          items: [...nav.querySelectorAll("li")].map(rect),
        };
      });
      const where = `${path} a ${bigText ? "200%" : "100%"}`;
      expect(boxes, `${where}: sem as abas`).not.toBeNull();
      if (!boxes) continue;
      // The Relatórios tabs are a row that scrolls inside its own track.
      const scrolls = path.startsWith("/relatorios");
      for (const item of scrolls ? [] : boxes.items) {
        expect(item.right, `${where}: aba fora do trilho`).toBeLessThanOrEqual(
          boxes.nav.right + 1,
        );
      }
      // No two tabs share space: at 200% they wrap instead of overlapping.
      for (const [i, a] of boxes.items.entries()) {
        for (const b of boxes.items.slice(i + 1)) {
          const overlap =
            a.left < b.right - 1 &&
            b.left < a.right - 1 &&
            a.top < b.bottom - 1 &&
            b.top < a.bottom - 1;
          expect(overlap, `${where}: abas sobrepostas`).toBe(false);
        }
      }
      await expectNoHorizontalScroll(page, where);
    }
  }
});

test("sem problemas de acessibilidade, no escuro e no claro", async ({
  page,
}) => {
  test.setTimeout(180_000);
  try {
    for (const [theme, name] of [
      ["dark", "Escuro"],
      ["light", "Claro"],
    ] as const) {
      await chooseTheme(page, name);
      await page.goto("/admin/rotina");
      await loaded(page);
      await page
        .locator('section[aria-labelledby="rotina-execucoes"]')
        .getByRole("button", { name: /Botão Rodar agora/ })
        .click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await page.waitForTimeout(400);
      try {
        await expectNoA11yViolations(page);
      } catch (error) {
        throw new Error(`Rotina diária, tema ${name}: ${String(error)}`);
      }
    }
  } finally {
    await chooseTheme(page, "Escuro");
  }
});

test.describe("sem ser administrador", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("Bruno recebe 404 em /admin/rotina e não vê a entrada em Ajustes", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/entrar");
    await page.getByLabel("E-mail").fill(BRUNO_EMAIL);
    await page.getByLabel("Senha", { exact: true }).fill(BRUNO_PASSWORD);
    await page.getByRole("button", { name: "Entrar com senha" }).click();
    await expect(page).toHaveURL(/\/inicio/, { timeout: 30_000 });

    await page.goto("/admin/rotina");
    await expect(
      page.getByRole("heading", { name: "Página não encontrada" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: RUN_NOW })).toHaveCount(0);
    expect(await page.content()).not.toContain("CRON_SECRET");

    await page.goto("/ajustes");
    await expect(
      page.getByRole("link", { name: /Exportar lançamentos/ }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: /Rotina diária/ })).toHaveCount(
      0,
    );
  });
});
