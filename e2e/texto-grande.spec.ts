import { expect, type Page, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";
import {
  BIG_TEXT,
  clippedValues,
  expectNoHorizontalScroll,
  textUnderSwitches,
} from "./layout";
import { chooseTheme } from "./theme";

// Texto grande (doc 02 §3.5, §4.2, §11): a 100% e a 200% (o ajuste do próprio
// navegador), a 360 e 430 px, nenhuma tela rola para o lado, nenhum valor sai
// do cartão e nada fica sob um interruptor. Roda no Pixel 7 (`isMobile`): a
// medida é a do viewport pedido, não a de `window.innerWidth`.

const SCREENS = [
  "/inicio",
  "/inicio?mes=2025-01",
  "/extrato",
  "/extrato?status=pendente",
  "/extrato?tipo=transferencia",
  "/planejar/orcamentos",
  "/planejar/metas",
  "/planejar/simulador",
  "/relatorios/visao-geral",
  "/relatorios/categorias",
  "/relatorios/fluxo",
  "/relatorios/patrimonio",
  "/relatorios/calendario",
  "/ajustes",
  "/ajustes/preferencias",
  "/ajustes/notificacoes",
  "/ajustes/categorias",
  "/ajustes/seguranca",
  "/ajustes/novidades",
  "/ajustes/sobre",
  "/contas",
  "/contas/nova",
  "/compartilhado",
  "/importar",
  "/admin/usuarios",
  "/admin/flags",
  "/admin/atividade",
  "/admin/rotina",
];

/** Screens that need an id: the first goal, account and card of the demo. */
async function screensWithIds(page: Page): Promise<string[]> {
  const first = async (path: string, selector: string) => {
    await page.goto(path);
    return page
      .locator(selector)
      .first()
      .getAttribute("href", { timeout: 30_000 })
      .catch(() => null);
  };
  const goal = await first("/planejar/metas", "a[href^='/planejar/metas/']");
  const account = await first(
    "/contas",
    "a[href^='/contas/']:not([href='/contas/nova'])",
  );
  const card = await first("/contas", "a[href^='/cartoes/']");
  const group = await first("/compartilhado", "a[href^='/compartilhado/']");
  return [goal, account, card, group].filter((href): href is string => !!href);
}

async function applyScale(page: Page, bigText: boolean) {
  if (bigText) await page.addStyleTag({ content: BIG_TEXT });
}

async function settle(page: Page) {
  await expect(page.getByText("Carregando…")).toHaveCount(0, {
    timeout: 30_000,
  });
  await expect(page.locator("h1:visible").first()).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(400);
}

test.describe("telas com texto grande", () => {
  for (const width of [360, 430]) {
    for (const bigText of [false, true]) {
      const scale = bigText ? "200%" : "100%";
      test(`sem rolagem lateral, valores inteiros e nada sob interruptores, a ${width} px e ${scale}`, async ({
        page,
      }) => {
        test.setTimeout(420_000);
        await page.setViewportSize({ width, height: 780 });
        // Opening Ajustes › Novidades marks Ana's novidades read (a Server
        // Action, POST to the page). Block it so this sweep leaves them unread
        // for tips.spec.ts, which runs later and expects their balloons.
        await page.route("**/ajustes/novidades", (route) =>
          route.request().method() === "POST"
            ? route.abort()
            : route.continue(),
        );
        const screens = [...SCREENS, ...(await screensWithIds(page))];
        const problems: string[] = [];
        for (const path of screens) {
          await page.goto(path);
          await applyScale(page, bigText);
          await settle(page);
          const where = `${path} a ${width} px, texto ${scale}`;
          const scrollWidth = await page.evaluate(
            () => document.documentElement.scrollWidth,
          );
          if (scrollWidth > width) {
            problems.push(`${where}: rola para o lado (${scrollWidth} px)`);
          }
          for (const value of await clippedValues(page)) {
            problems.push(`${where}: valor fora do cartão ${value}`);
          }
          for (const text of await textUnderSwitches(page)) {
            problems.push(`${where}: ${text}`);
          }
        }
        expect(problems, problems.join("\n")).toEqual([]);
      });
    }
  }

  test("a Nova transação aberta a 200% não rola para o lado", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/inicio");
    await applyScale(page, true);
    await settle(page);
    await page.getByRole("button", { name: "Nova transação" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.waitForTimeout(500);
    await expectNoHorizontalScroll(page, "Nova transação a 200%");
    expect(await clippedValues(page)).toEqual([]);
  });
});

test("a barra inferior a 200% fica só com ícones, com os quatro links nomeados", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/inicio");
  await settle(page);
  const bar = page.getByRole("navigation", { name: "Navegação principal" });
  const names = ["Início", "Extrato", "Planejar", "Relatórios"];
  const link = (name: string) => bar.getByRole("link", { name, exact: true });
  const labelWidth = async (name: string) =>
    (await link(name).locator("span").last().boundingBox())?.width ?? 0;

  // 100%: the words are on screen.
  for (const name of names) {
    await expect(link(name)).toBeVisible();
    expect(await labelWidth(name), name).toBeGreaterThan(8);
  }

  await applyScale(page, true);
  await page.waitForTimeout(300);
  for (const name of names) {
    await expect(link(name)).toBeVisible();
    // `sr-only`: one pixel wide, still the link's name.
    expect(await labelWidth(name), name).toBeLessThanOrEqual(2);
  }
  await expect(bar.getByRole("link")).toHaveCount(4);
  expect((await bar.boundingBox())?.height ?? 0).toBeLessThanOrEqual(81);
  const fab = (await page.locator('[data-slot="add-fab"]').boundingBox()) ?? {
    height: 0,
  };
  expect(fab.height).toBeLessThanOrEqual(60);
  expect(fab.height).toBeGreaterThanOrEqual(44);
  await expectNoHorizontalScroll(page, "Barra inferior a 200%");
});

test("telas a 200% sem problemas de acessibilidade, no escuro e no claro", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 360, height: 780 });
  const screens = [
    ["Notificações", "/ajustes/notificacoes"],
    ["Preferências", "/ajustes/preferencias"],
    ["Início", "/inicio"],
    ["Extrato", "/extrato"],
  ] as const;
  try {
    for (const [theme, name] of [
      ["dark", "Escuro"],
      ["light", "Claro"],
    ] as const) {
      await chooseTheme(page, name);
      for (const [label, path] of screens) {
        await page.goto(path);
        await applyScale(page, true);
        await settle(page);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        try {
          await expectNoA11yViolations(page);
        } catch (error) {
          throw new Error(`${label} a 200%, tema ${name}: ${String(error)}`);
        }
      }
    }
  } finally {
    await chooseTheme(page, "Escuro");
  }
});

test("o detalhe da categoria e a folha de ordem a 200% não rolam para o lado nem cortam valores", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/relatorios/categorias?periodo=12");
  const mercado = page.getByRole("link", { name: /^Mercado.*Ver o detalhe/ });
  const href = await mercado.getAttribute("href", { timeout: 30_000 });
  expect(href).toMatch(/^\/relatorios\/categorias\/[0-9a-f-]+/);
  await page.goto(href ?? "");
  await applyScale(page, true);
  await expect(
    page.getByRole("heading", { name: "Mercado", level: 2 }),
  ).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(400);
  await expectNoHorizontalScroll(page, "Detalhe da categoria a 200%");
  expect(await clippedValues(page)).toEqual([]);

  await page.goto("/ajustes/categorias");
  await applyScale(page, true);
  await settle(page);
  await page.getByRole("button", { name: "Mudar a ordem" }).first().click();
  const order = page.getByRole("dialog", { name: "Ordem das despesas" });
  await expect(order).toBeVisible();
  await page.waitForTimeout(500);
  await expectNoHorizontalScroll(page, "Ordem das despesas a 200%");
  const save = order.getByRole("button", { name: "Salvar ordem" });
  await save.scrollIntoViewIfNeeded();
  await save.click({ trial: true });
});

test("Quanto dá para gastar por dia a 200% em 360 px não corta valores nem rola para o lado", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/inicio");
  await settle(page);
  const customize = page.getByRole("button", { name: "Personalizar o Início" });
  const sheet = page.getByRole("dialog", { name: "Personalizar o Início" });
  const name = "Quanto dá para gastar por dia";
  await customize.click();
  await sheet.getByRole("switch", { name, exact: true }).click();
  await sheet.getByRole("button", { name: "Salvar" }).click();
  await expect(sheet).toBeHidden();
  try {
    await applyScale(page, true);
    const block = page.locator(
      'section[aria-labelledby="inicio-gasto-por-dia"]:visible',
    );
    await expect(block).toBeVisible({ timeout: 30_000 });
    await block.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await expectNoHorizontalScroll(page, "Gasto por dia a 200%");
    // Only the strip may scroll, never the page, and it keeps the focus.
    const strip = block.getByRole("region", {
      name: "Quanto dá para gastar em cada dia",
    });
    await expect(strip).toHaveAttribute("tabindex", "0");
    expect(await clippedValues(page)).toEqual([]);
  } finally {
    await customize.click();
    await sheet.getByRole("switch", { name, exact: true }).click();
    await sheet.getByRole("button", { name: "Salvar" }).click();
    await expect(sheet).toBeHidden();
  }
});
