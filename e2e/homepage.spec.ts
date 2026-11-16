import { expect, type Page, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";
import { BIG_TEXT, expectNoHorizontalScroll } from "./layout";

// Homepage pública (doc 02 §6.19): estática, sem sessão, sem cadastro. Quem
// já tem sessão nunca a vê (o proxy manda para /inicio).

const NO_SESSION = { cookies: [], origins: [] };
const TITLE = "Seu dinheiro no prumo.";

/** Rola até o elemento e devolve o locator, como uma pessoa faria. */
async function scrollTo(page: Page, text: string | RegExp) {
  const target = page.getByText(text, { exact: typeof text === "string" });
  await target.first().scrollIntoViewIfNeeded();
  return target.first();
}

test.describe("sem sessão", () => {
  test.use({ storageState: NO_SESSION });

  test("mostra a marca, o convite e só uma ação: Entrar", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle("Prumo · Seu dinheiro no prumo.");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(TITLE);
    const enter = page.getByRole("link", { name: "Entrar", exact: true });
    await expect(enter).toHaveCount(2);
    for (const link of await enter.all()) {
      await expect(link).toHaveAttribute("href", "/entrar");
    }
    // O texto diz "não existe cadastro aberto"; o que não pode haver é ação.
    await expect(
      page.getByRole("link", { name: /Criar conta|Cadastr/i }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Criar conta|Cadastr/i }),
    ).toHaveCount(0);
    await expect(page.getByText(/Meu Finan/)).toHaveCount(0);
  });

  test("o rodapé dá o crédito do autor, com link para o GitHub", async ({
    page,
  }) => {
    await page.goto("/");
    const credit = page
      .locator("footer")
      .getByRole("link", { name: /Victor Gabriel/ });
    await expect(credit).toHaveAttribute(
      "href",
      "https://github.com/victorgabriel08fs",
    );
    await expect(credit).toHaveAttribute("target", "_blank");
    await expect(credit).toHaveAttribute("rel", /noopener/);
  });

  test("Entrar leva para a tela de entrada", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("link", { name: "Entrar", exact: true })
      .first()
      .click();
    await expect(page).toHaveURL(/\/entrar/);
  });

  test("movimento normal: cada valor termina no final em até 2 s", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    await scrollTo(page, "Um gasto, alguns toques.");
    await scrollTo(page, "Despesa de R$ 64,50 salva");
    await expect(page.getByText("R$ 64,50", { exact: true })).toBeVisible({
      timeout: 2_000,
    });
    await scrollTo(page, "O mês inteiro em uma tela.");
    await scrollTo(page, "Valores de exemplo.");
    await expect(page.getByText("R$ 4.823,50").first()).toBeVisible({
      timeout: 2_000,
    });
    await scrollTo(page, "Cada pessoa com as próprias finanças.");
    await scrollTo(page, "Valores ocultos");
    await expect(page.getByText("R$ ••••").first()).toBeVisible({
      timeout: 2_000,
    });
  });

  test("movimento reduzido: tudo já está no estado final, sem rolar", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    for (const text of [
      "R$ 64,50",
      "Despesa de R$ 64,50 salva",
      "Valores ocultos",
      "80%",
    ]) {
      await expect(page.getByText(text).first()).toBeAttached();
      expect(
        await page
          .getByText(text)
          .first()
          .evaluate((element) => Number(getComputedStyle(element).opacity)),
        text,
      ).toBeGreaterThan(0.99);
    }
    await expect(page.locator("[data-home-thread]")).toHaveCount(0);
  });

  test.describe("sem JavaScript", () => {
    test.use({ javaScriptEnabled: false });

    test("todo o texto das seções está visível", async ({ page }) => {
      await page.goto("/");
      for (const text of [
        TITLE,
        "Um gasto, alguns toques.",
        "O mês inteiro em uma tela.",
        "Planeje sem culpa.",
        "Cada pessoa com as próprias finanças.",
        "Abre como um app.",
        "Pronto quando você estiver.",
      ]) {
        await expect(page.getByText(text, { exact: true })).toBeVisible();
      }
    });
  });

  test("o controle de tema troca só o tema do aparelho", async ({ page }) => {
    await page.goto("/");
    const group = page.getByRole("radiogroup", { name: "Tema" });
    await group.scrollIntoViewIfNeeded();
    const light = group.getByRole("radio", { name: "Claro" });
    await expect(async () => {
      await light.click();
      await expect(page.locator("html")).toHaveAttribute(
        "data-theme",
        "light",
        {
          timeout: 1_000,
        },
      );
    }).toPass({ timeout: 15_000 });
    await group.getByRole("radio", { name: "Escuro" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("os ícones novos e o manifesto são servidos", async ({
    request,
    baseURL,
  }) => {
    for (const path of ["/icons/monochrome-512.png", "/icons/badge-96.png"]) {
      const response = await request.get(`${baseURL}${path}`);
      expect(response.status(), path).toBe(200);
      expect(response.headers()["content-type"], path).toContain("image/png");
    }
    const manifest = await request.get(`${baseURL}/manifest.webmanifest`);
    expect((await manifest.json()).name).toBe("Prumo");
  });

  for (const theme of ["dark", "light"] as const) {
    for (const [label, viewport] of [
      ["360 px", { width: 360, height: 780 }],
      ["desktop", { width: 1280, height: 800 }],
    ] as const) {
      test(`sem violações de acessibilidade (${theme}, ${label})`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.addInitScript((value) => {
          try {
            localStorage.setItem("meu-finan:tema", value);
          } catch {}
        }, theme);
        await page.goto("/");
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expectNoA11yViolations(page);
      });
    }
  }

  for (const width of [360, 430]) {
    test(`texto a 200% em ${width} px não rola para o lado`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");
      await page.addStyleTag({ content: BIG_TEXT });
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoHorizontalScroll(page, "A homepage");
    });
  }
});

test.describe("com sessão", () => {
  test("quem já entrou vai de / para /inicio", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/inicio/);
  });
});
