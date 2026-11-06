import { expect, type Page, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";
import { chooseTheme } from "./theme";

// Relatórios › Categorias › detalhe da categoria (doc 02 §6.12, doc 03 §12).
// Runs as Ana, whose Mercado has Feira and Padaria (archived) and entries in
// Mercado itself ("Sem subcategoria"). Only reads.

async function openMercado(page: Page, period = 12) {
  await page.goto(`/relatorios/categorias?periodo=${period}`);
  const link = page.getByRole("link", {
    name: /^Mercado.*Ver o detalhe da categoria/,
  });
  await expect(link).toBeVisible({ timeout: 30_000 });
  await link.click();
  await expect(page).toHaveURL(/\/relatorios\/categorias\/[0-9a-f-]+/);
  await expect(
    page.getByRole("heading", { name: "Mercado", level: 2 }),
  ).toBeVisible({ timeout: 30_000 });
}

test("do ranking ao detalhe do Mercado, com Feira, Padaria (arquivada) e Sem subcategoria", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openMercado(page, 6);

  const split = page.getByRole("region", { name: "Por subcategoria" });
  await expect(split).toBeVisible();
  await expect(
    split.getByRole("link", { name: /^Feira.*Ver no extrato de /i }),
  ).toBeVisible();
  await expect(
    split.getByRole("link", { name: /^Padaria \(arquivada\)/ }),
  ).toBeVisible();
  await expect(split.getByText("Sem subcategoria")).toBeVisible();
  // The entries of Mercado itself have nowhere to go: not a link.
  await expect(
    split.getByRole("link", { name: /Sem subcategoria/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "O que mais pesou" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /^Ver lançamentos de .* no extrato$/ }),
  ).toHaveAttribute("href", /\/extrato\?categoria=[0-9a-f-]+&mes=/);

  // Back to the ranking keeps the window.
  await expect(
    page.getByRole("link", { name: "Todas as categorias" }),
  ).toHaveAttribute("href", /periodo=6/);
});

test("os chips de período e as abas mantêm o detalhe da categoria", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openMercado(page);
  const detail = new URL(page.url()).pathname;

  await page
    .getByRole("navigation", { name: "Período dos relatórios" })
    .getByRole("link", { name: "6 meses" })
    .click();
  await expect(page).toHaveURL(new RegExp(`${detail}\\?periodo=6`));
  await expect(
    page.getByRole("heading", { name: "Mercado", level: 2 }),
  ).toBeVisible();
});

test("categoria que não existe: a tela explica e leva às categorias", async ({
  page,
}) => {
  for (const id of ["00000000-0000-7000-8000-000000000000", "abc"]) {
    await page.goto(`/relatorios/categorias/${id}`);
    await expect(page.getByText("Categoria não encontrada")).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByText(
        "Ela pode ter sido mesclada com outra, ou o link está incompleto.",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Ver categorias" }),
    ).toBeVisible();
  }
});

test("o detalhe da categoria, sem problemas de acessibilidade no escuro e no claro", async ({
  page,
}) => {
  test.setTimeout(150_000);
  try {
    for (const [theme, label] of [
      ["dark", "Escuro"],
      ["light", "Claro"],
    ] as const) {
      await chooseTheme(page, label);
      await openMercado(page);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expectNoA11yViolations(page);
    }
  } finally {
    await chooseTheme(page, "Escuro");
  }
});
