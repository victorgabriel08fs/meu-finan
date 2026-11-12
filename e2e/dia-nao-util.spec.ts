import { expect, type Page, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";
import { BIG_TEXT, clippedValues, expectNoHorizontalScroll } from "./layout";
import { chooseTheme } from "./theme";

// Conta que vence em dia não útil (doc 02 §6.3, §6.4, §6.6, §5.7), as Ana: o
// demo liga a flag alerta_dia_nao_util só para ela e cria o "Condomínio",
// pendente, no próximo sábado (1 a 7 dias à frente). Bruno (flag desligada)
// está em novidades-flags.spec.ts. O estado âmbar "Prazo até …" só existe do
// dia seguinte ao vencimento até o próximo dia útil, e o relógio daqui é o
// real: ele é coberto em teste de unidade e de integração, com data fixa.

test.describe.configure({ mode: "serial" });

/** "passa para seg, 16 nov": the next business day, whichever it is. */
const HINT = /Dia não útil · passa para \S+, \d{1,2} \S+/;

async function settle(page: Page) {
  await expect(page.getByText("Carregando…")).toHaveCount(0, {
    timeout: 30_000,
  });
  await expect(page.locator("h1:visible").first()).toBeVisible({
    timeout: 30_000,
  });
}

/** The hints a person can see (a row holds two, the container query shows one). */
const visibleHints = (page: Page) =>
  page.locator('[data-slot="non-business-hint"]:visible');

/** In the Extrato the row is a button over the row (doc 02 §5.7). */
const condominioButton = (page: Page) =>
  page.getByRole("button", { name: /^Condomínio, despesa/ });

test("Início: Próximas contas mostra a nota do Condomínio, sem valores e sem sobrepor o Pagar", async ({
  page,
}) => {
  await page.goto("/inicio");
  await settle(page);
  const section = page.locator('section[aria-labelledby="proximas-contas"]');
  const row = section.locator("li", { hasText: "Condomínio" });
  await expect(row).toBeVisible({ timeout: 30_000 });
  const hint = row.locator('[data-slot="non-business-hint"]:visible');
  await expect(hint).toHaveCount(1);
  await expect(hint).toHaveText(HINT);
  // Information, not an alert: the due label is still the plain one.
  await expect(row.getByText(/Prazo até|Venceu/)).toHaveCount(0);

  // "Pagar" and the line do not overlap.
  const pay = row.getByRole("button", { name: "Pagar Condomínio" });
  await expect(pay).toBeVisible();
  const [hintBox, payBox] = await Promise.all([
    hint.boundingBox(),
    pay.boundingBox(),
  ]);
  expect(hintBox).not.toBeNull();
  expect(payBox).not.toBeNull();
  if (hintBox && payBox) {
    const apart =
      hintBox.x + hintBox.width <= payBox.x + 1 ||
      payBox.x + payBox.width <= hintBox.x + 1 ||
      hintBox.y + hintBox.height <= payBox.y + 1 ||
      payBox.y + payBox.height <= hintBox.y + 1;
    expect(apart, "a nota não pode cobrir o botão Pagar").toBe(true);
  }
});

test("Extrato: a linha do Condomínio tem a nota, o nome acessível a anuncia e o detalhe explica", async ({
  page,
}) => {
  await page.goto("/extrato?status=pendente");
  await settle(page);
  const link = condominioButton(page);
  await expect(link).toBeVisible({ timeout: 30_000 });
  await expect(link).toHaveAttribute(
    "aria-label",
    /vence em dia não útil, passa para \S+, \d{1,2} de \S+/,
  );
  const row = page.locator("li", { hasText: "Condomínio" });
  await expect(
    row.locator('[data-slot="non-business-hint"]:visible'),
  ).toHaveText(HINT);
  // The badge on the right is the plain one: Vence em N dias / Agendado.
  await expect(row.getByText(/Prazo até|Venceu/)).toHaveCount(0);

  await link.click();
  const sheet = page.getByRole("dialog", { name: "Condomínio" });
  await expect(sheet).toBeVisible({ timeout: 30_000 });
  const fact = sheet.getByText("Dia não útil", { exact: true });
  await expect(fact).toBeVisible();
  await expect(sheet).toContainText("Vence num sábado, dia não útil.");
  await expect(sheet).toContainText(
    /O pagamento costuma passar para o próximo dia útil, \S+, \d{1,2} de \S+\./,
  );
  await expect(sheet).toContainText(
    /Se preferir não esperar, pague (até|hoje)/,
  );
  // Spelled-out dates, not the short form of the row.
  await expect(sheet).not.toContainText(HINT);
});

test("a nota passa para baixo da linha toda a 360 px com texto a 200%, sem rolar para o lado nem cortar valores", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  for (const path of ["/inicio", "/extrato?status=pendente"]) {
    await page.goto(path);
    await settle(page);
    await page.addStyleTag({ content: BIG_TEXT });
    await page.waitForTimeout(400);
    await expect(page.getByText("Condomínio").first()).toBeVisible({
      timeout: 30_000,
    });
    // One line is visible, and it fits inside its row.
    const hint = visibleHints(page).first();
    await expect(hint).toBeVisible();
    await expect(hint).toHaveText(HINT);
    const [hintBox, rowBox] = await Promise.all([
      hint.boundingBox(),
      hint
        .locator(
          "xpath=ancestor::*[self::li or @data-slot='transaction-row'][1]",
        )
        .boundingBox(),
    ]);
    expect(hintBox && rowBox).toBeTruthy();
    if (hintBox && rowBox) {
      expect(hintBox.x).toBeGreaterThanOrEqual(rowBox.x - 1);
      expect(hintBox.x + hintBox.width).toBeLessThanOrEqual(
        rowBox.x + rowBox.width + 1,
      );
    }
    await expectNoHorizontalScroll(page, path);
    expect(await clippedValues(page), path).toEqual([]);
  }
});

test("Início e Extrato com a nota, sem problemas de acessibilidade, no escuro e no claro", async ({
  page,
}) => {
  test.setTimeout(120_000);
  try {
    for (const [theme, name] of [
      ["dark", "Escuro"],
      ["light", "Claro"],
    ] as const) {
      await chooseTheme(page, name);
      for (const path of ["/inicio", "/extrato?status=pendente"]) {
        await page.goto(path);
        await settle(page);
        await expect(visibleHints(page).first()).toBeVisible({
          timeout: 30_000,
        });
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expectNoA11yViolations(page);
      }
    }
  } finally {
    await chooseTheme(page, "Escuro");
  }
});

test("com a flag desligada para Ana, a nota some do Início, do Extrato e do detalhe", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/admin/flags");
  await page
    .locator('[data-flag="alerta_dia_nao_util"]')
    .getByRole("button", { name: "Ajustar" })
    .click();
  const sheet = page.getByRole("dialog", {
    name: "Vencimento em dia não útil por pessoa",
  });
  // The demo turns it on for Ana only: hers is the group with "Ligado" checked.
  const checkedOn = sheet.getByRole("radiogroup").filter({
    has: page.getByRole("radio", {
      name: "Ligado",
      exact: true,
      checked: true,
    }),
  });
  await expect(checkedOn).toHaveCount(1, { timeout: 30_000 });
  const groupName = await checkedOn.getAttribute("aria-label");
  expect(groupName).toMatch(/^Vencimento em dia não útil para /);
  const hers = sheet.getByRole("radiogroup", {
    name: groupName ?? "",
    exact: true,
  });
  const choose = async (name: "Desligado" | "Ligado") => {
    const saved = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.request().headers()["next-action"] !== undefined,
    );
    await hers.getByRole("radio", { name, exact: true }).click();
    expect((await saved).ok()).toBe(true);
    await expect(hers.getByRole("radio", { name, exact: true })).toBeChecked();
  };
  await choose("Desligado");
  try {
    await page.goto("/inicio");
    await settle(page);
    await expect(
      page
        .locator('section[aria-labelledby="proximas-contas"]')
        .getByText("Condomínio")
        .first(),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-slot="non-business-hint"]')).toHaveCount(
      0,
    );

    await page.goto("/extrato?status=pendente");
    await settle(page);
    const row = condominioButton(page);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).not.toHaveAttribute("aria-label", /dia não útil/);
    await expect(page.locator('[data-slot="non-business-hint"]')).toHaveCount(
      0,
    );
    await row.click();
    const detail = page.getByRole("dialog", { name: "Condomínio" });
    await expect(detail).toBeVisible({ timeout: 30_000 });
    await expect(detail.getByText("Dia não útil", { exact: true })).toHaveCount(
      0,
    );

    // The notices screen drops the row too (its saved choice is kept).
    await page.goto("/ajustes/notificacoes");
    await expect(
      page.getByRole("switch", { name: "Resumo do dia", exact: true }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("switch", {
        name: "Vencimento em dia não útil",
        exact: true,
      }),
    ).toHaveCount(0);
  } finally {
    await page.goto("/admin/flags");
    await page
      .locator('[data-flag="alerta_dia_nao_util"]')
      .getByRole("button", { name: "Ajustar" })
      .click();
    const again = page
      .getByRole("dialog", { name: "Vencimento em dia não útil por pessoa" })
      .getByRole("radiogroup", { name: groupName ?? "", exact: true });
    const saved = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.request().headers()["next-action"] !== undefined,
    );
    await again.getByRole("radio", { name: "Ligado", exact: true }).click();
    expect((await saved).ok()).toBe(true);
  }
});
