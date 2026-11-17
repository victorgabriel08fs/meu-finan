import { readFile } from "node:fs/promises";
import {
  type BrowserContext,
  devices,
  expect,
  type Page,
  test,
} from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

// Exportar todos os dados e Excluir minha conta (Ajustes › Dados, doc 02
// §6.14). Ana (administradora, dona do app) convida "Fábio Exclusão", uma
// conta comum que exporta e se exclui; depois Ana vê o registro em Atividade
// e o bloqueio da própria conta. A sessão antiga (sem login recente) fica
// nos testes de integração: o e2e não envelhece sessões.

test.describe.configure({ mode: "serial" });

const EMAIL = "fabio.e2e@exemplo.com";
const PASSWORD = "a senha do fabio e2e";

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

let guestContext: BrowserContext;
let guest: Page;

test("Ana convida e Fábio entra com sessão recente", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  await page.goto("/admin/usuarios");
  await page.getByRole("button", { name: "Convidar pessoa" }).click();
  const sheet = page.getByRole("dialog", { name: "Convidar pessoa" });
  await sheet.getByLabel("Nome").fill("Fábio Exclusão");
  await sheet.getByLabel("E-mail", { exact: true }).fill(EMAIL);
  await sheet.getByRole("button", { name: "Criar convite" }).click();
  const field = page.getByTestId("access-link");
  await expect(field).toBeVisible({ timeout: 30_000 });
  const url = await field.inputValue();

  guestContext = await browser.newContext({
    ...devices["Pixel 7"],
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    storageState: { cookies: [], origins: [] },
    acceptDownloads: true,
  });
  guest = await guestContext.newPage();
  await guest.goto(url);
  await guest.getByLabel("Senha", { exact: true }).fill(PASSWORD);
  await guest.getByLabel("Confirme a senha").fill(PASSWORD);
  await guest.getByRole("button", { name: "Criar senha e entrar" }).click();
  await expect(guest).toHaveURL(/\/ajustes\/seguranca\?primeiro=1$/, {
    timeout: 30_000,
  });
});

test("exportar todos os dados baixa um ZIP", async () => {
  test.setTimeout(90_000);
  const errors = collectErrors(guest);
  await guest.goto("/ajustes");
  const row = guest.getByRole("button", { name: /Exportar todos os dados/ });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expectNoA11yViolations(guest);
  const [download] = await Promise.all([
    guest.waitForEvent("download", { timeout: 30_000 }),
    row.click(),
  ]);
  expect(download.suggestedFilename()).toMatch(
    /^prumo-dados-\d{4}-\d{2}-\d{2}\.zip$/,
  );
  const path = await download.path();
  const bytes = await readFile(path);
  expect(bytes.subarray(0, 2).toString("latin1")).toBe("PK");
  expect(errors).toEqual([]);
});

test("excluir minha conta pede o e-mail, apaga e leva a /entrar com o aviso", async () => {
  test.setTimeout(90_000);
  const errors = collectErrors(guest);
  await guest.goto("/ajustes");
  await guest.getByRole("button", { name: /Excluir minha conta/ }).click();
  const sheet = guest.getByRole("dialog", { name: "Excluir a sua conta?" });
  await expect(sheet).toBeVisible();
  const confirm = sheet.getByRole("button", { name: "Excluir minha conta" });
  await expect(confirm).toBeDisabled();
  await expectNoA11yViolations(guest);
  await sheet.getByLabel(/Para confirmar, digite/).fill("outro@exemplo.com");
  await expect(confirm).toBeDisabled();
  await sheet.getByLabel(/Para confirmar, digite/).fill(EMAIL.toUpperCase());
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(guest).toHaveURL(/\/entrar\?excluida=1$/, { timeout: 30_000 });
  await expect(
    guest.getByText("Sua conta foi excluída, com todos os dados."),
  ).toBeVisible();

  // Nothing opens anymore: the page goes back to the sign-in, and the old
  // password no longer works.
  await guest.goto("/inicio");
  await expect(guest).toHaveURL(/\/entrar/);
  await guest.getByLabel("E-mail").fill(EMAIL);
  await guest.getByLabel("Senha", { exact: true }).fill(PASSWORD);
  await guest.getByRole("button", { name: "Entrar com senha" }).click();
  await expect(guest).toHaveURL(/\/entrar/);
  await expect(guest.getByRole("alert").first()).toBeVisible({
    timeout: 15_000,
  });
  // The deletion's own redirects are not errors; a failed sign-in logs a 401.
  expect(errors.filter((error) => !error.includes("401"))).toEqual([]);
  await guestContext.close();
});

test("Atividade registra a exclusão e a conta da dona não pode ser excluída", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto("/admin/atividade");
  await expect(
    page.getByText("Fábio Exclusão excluiu a própria conta").first(),
  ).toBeVisible({ timeout: 30_000 });

  await page.goto("/ajustes");
  await page.getByRole("button", { name: /Excluir minha conta/ }).click();
  const sheet = page.getByRole("dialog", {
    name: "Não dá para excluir esta conta",
  });
  await expect(sheet).toBeVisible();
  await expectNoA11yViolations(page);
  await sheet.getByRole("button", { name: "Entendi" }).click();
  await expect(sheet).toBeHidden();
});
