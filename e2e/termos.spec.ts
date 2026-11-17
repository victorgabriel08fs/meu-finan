import { expect, type Page, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";
import { DANI_EMAIL, DANI_PASSWORD } from "./demo";
import { expectNoHorizontalScroll } from "./layout";
import { chooseTheme } from "./theme";

// Termos de uso e política de privacidade (doc 02 §6.20): páginas públicas e
// estáticas, e o aceite obrigatório em /aceitar-termos para quem ainda não
// aceitou a versão atual (Dani, do demo).

const NO_SESSION = { cookies: [], origins: [] };
const REQUIRED =
  "Aceite os termos de uso e a política de privacidade para continuar.";

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

const DOCUMENTS = [
  { path: "/termos", title: "Termos de uso", anchor: "#acesso" },
  {
    path: "/privacidade",
    title: "Política de privacidade",
    anchor: "#direitos",
  },
] as const;

test.describe("sem sessão", () => {
  test.use({ storageState: NO_SESSION });

  for (const { path, title, anchor } of DOCUMENTS) {
    test(`${path} abre sem sessão, com versão, sumário e sem estourar a tela`, async ({
      page,
    }) => {
      const errors = collectErrors(page);
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      expect(new URL(page.url()).pathname).toBe(path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
      await expect(
        page.getByText(/^Versão de \d{1,2} de \w+ de \d{4}$/),
      ).toBeVisible();
      const toc = page.getByRole("navigation", { name: "Nesta página" });
      await expect(toc.getByRole("link").first()).toBeVisible();
      await expect(toc.locator(`a[href="${anchor}"]`)).toHaveCount(1);
      await expect(page.locator(anchor)).toHaveCount(1);
      // Rodapé com os dois documentos.
      const docs = page.getByRole("navigation", { name: "Documentos" });
      await expect(
        docs.getByRole("link", { name: "Termos de uso" }),
      ).toHaveAttribute("href", "/termos");
      await expect(
        docs.getByRole("link", { name: "Política de privacidade" }),
      ).toHaveAttribute("href", "/privacidade");
      await expectNoHorizontalScroll(page);
      await expectNoA11yViolations(page);
      expect(errors).toEqual([]);
    });
  }

  test("a política diz como falar com quem cuida dos dados", async ({
    page,
  }) => {
    await page.goto("/privacidade");
    await expect(page.locator("#controlador")).toContainText("Victor Gabriel");
    await expect(page.locator("#contato, #controlador")).toContainText(
      /contato|e-mail/i,
    );
  });

  test("a homepage e a tela de entrada ligam aos dois documentos", async ({
    page,
  }) => {
    for (const path of ["/", "/entrar"]) {
      await page.goto(path);
      const docs = page.getByRole("navigation", { name: "Documentos" });
      await expect(
        docs.getByRole("link", { name: "Termos de uso" }),
      ).toHaveAttribute("href", "/termos");
      await expect(
        docs.getByRole("link", { name: "Política de privacidade" }),
      ).toHaveAttribute("href", "/privacidade");
    }
  });

  test("a tela de aceite pede sessão", async ({ page }) => {
    await page.goto("/aceitar-termos");
    await expect(page).toHaveURL(/\/entrar/);
  });
});

test.describe("com sessão (Ana)", () => {
  test("os documentos abrem sem redirecionar quem está conectada", async ({
    page,
  }) => {
    for (const { path, title } of DOCUMENTS) {
      await page.goto(path);
      expect(new URL(page.url()).pathname).toBe(path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    }
  });

  test("Ajustes › Sobre mostra os dois documentos e o aceite", async ({
    page,
  }) => {
    await page.goto("/ajustes");
    const terms = page.getByRole("link", { name: /Termos de uso/ });
    await expect(terms).toHaveAttribute("href", "/termos");
    await expect(terms).toContainText(/Aceitos em \d{1,2} de \w+ de \d{4}/);
    await expect(
      page.getByRole("link", { name: /Política de privacidade/ }),
    ).toHaveAttribute("href", "/privacidade");
    await page.goto("/aceitar-termos");
    await expect(page).toHaveURL(/\/inicio/);
  });

  test("lê no tema claro, trocado em Ajustes, sem violações do axe", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    try {
      await chooseTheme(page, "Claro");
      for (const { path } of DOCUMENTS) {
        await page.goto(path);
        await expect(page.locator("html")).toHaveAttribute(
          "data-theme",
          "light",
        );
        await expectNoA11yViolations(page);
      }
    } finally {
      await chooseTheme(page, "Escuro");
    }
  });
});

test.describe("conta de antes dos termos (Dani)", () => {
  test.describe.configure({ mode: "serial" });
  test.use({
    storageState: NO_SESSION,
    // Um endereço só dele: o limite de entradas conta por endereço.
    extraHTTPHeaders: { "x-forwarded-for": "203.0.113.20" },
  });

  test("é levada a /aceitar-termos, erra sem marcar e depois de aceitar chega ao Início", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors = collectErrors(page);
    await page.goto("/entrar");
    await page.getByLabel("E-mail").fill(DANI_EMAIL);
    await page.getByLabel("Senha", { exact: true }).fill(DANI_PASSWORD);
    await page.getByRole("button", { name: "Entrar com senha" }).click();
    await expect(page).toHaveURL(/\/aceitar-termos/, { timeout: 60_000 });
    await expect(
      page.getByRole("heading", { name: "Antes de continuar" }),
    ).toBeVisible();

    // Nenhuma outra tela abre antes do aceite.
    for (const path of ["/inicio", "/ajustes", "/admin"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/aceitar-termos/);
    }
    // Os documentos continuam abertos.
    await page.goto("/termos");
    expect(new URL(page.url()).pathname).toBe("/termos");
    await page.goto("/aceitar-termos");

    await expectNoHorizontalScroll(page);
    await expectNoA11yViolations(page);

    const box = page.getByRole("checkbox", { name: /Li e aceito/ });
    const accept = page.getByRole("button", {
      name: "Aceitar e continuar",
    });
    await expect(box).not.toBeChecked();
    await expect(
      page.getByRole("link", { name: /Termos de uso/ }),
    ).toHaveAttribute("target", "_blank");
    await expect(page.getByRole("button", { name: "Sair" })).toBeVisible();

    // Sem marcar: o erro aparece na caixa e o foco vai para ela.
    await accept.click();
    await expect(page.getByText(REQUIRED)).toBeVisible();
    await expect(box).toHaveAttribute("aria-invalid", "true");
    await expect(box).toBeFocused();
    await expectNoA11yViolations(page);

    await box.check();
    await expect(page.getByText(REQUIRED)).toHaveCount(0);
    await accept.click();
    await expect(page).toHaveURL(/\/inicio/, { timeout: 60_000 });

    // Aceito: a tela de aceite não volta e Ajustes mostra a data.
    await page.goto("/aceitar-termos");
    await expect(page).toHaveURL(/\/inicio/);
    await page.goto("/ajustes");
    await expect(
      page.getByRole("link", { name: /Termos de uso/ }),
    ).toContainText(/Aceitos em \d{1,2} de \w+ de \d{4}/);
    expect(errors).toEqual([]);
  });
});

// Depende do aceite da Dani acima (mesmo arquivo, em ordem).
test("o aceite da Dani aparece em Administração › Atividade (Ana)", async ({
  page,
}) => {
  await page.goto("/admin/atividade");
  await expect(
    page
      .getByText(
        "Dani Souza aceitou os termos de uso e a política de privacidade",
      )
      .first(),
  ).toBeVisible({ timeout: 30_000 });
});
