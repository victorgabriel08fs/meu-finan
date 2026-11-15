import { expect, type Page, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";
import { expectNoHorizontalScroll } from "./layout";
import { chooseTheme } from "./theme";

// Retrospectiva do mês (doc 02 §6.12): a sequência em tela cheia que conta o
// mês que fechou. Roda como Ana, cujo demo tem sobra a guardar e caixinha.
// Nada é gravado: "Guardar a sobra" só abre a Nova transação.

test.describe.configure({ mode: "serial" });

const part = (page: Page) => page.getByRole("group", { name: /^\d+ de \d+: / });

async function openRecap(page: Page, query = "") {
  await page.goto(`/retrospectiva${query}`);
  await expect(part(page)).toBeVisible({ timeout: 30_000 });
}

/** "2 de 8: Entrou e saiu" → { index: 2, total: 8 }. */
async function position(page: Page) {
  const label = (await part(page).getAttribute("aria-label")) ?? "";
  const [, index, total] = label.match(/^(\d+) de (\d+)/) ?? [];
  return { index: Number(index), total: Number(total) };
}

/** Clicks "Próximo" and waits for the label of the next part. */
async function next(page: Page) {
  const { index, total } = await position(page);
  await page.getByRole("button", { name: "Próximo", exact: true }).click();
  await expect(part(page)).toHaveAttribute(
    "aria-label",
    new RegExp(`^${Math.min(index + 1, total)} de ${total}: `),
  );
}

async function goToPart(page: Page, id: string) {
  const target = page.locator(`[data-slide="${id}"]`);
  for (let i = 0; i < 12 && !(await target.isVisible()); i++) {
    await next(page);
  }
  await expect(target).toBeVisible();
}

/** "5.445 reais e 22 centavos" and "R$ 5.445,22" are the same 544522. */
function cents(value: string) {
  const [reais = "0", centavos = "0"] = value.replace(/[^\d,]/g, "").split(",");
  return Number(reais) * 100 + Number(centavos);
}

function spokenCents(spoken: string) {
  const [, reais = "0", centavos = "0"] =
    spoken.match(/([\d.]+) reais?(?: e (\d+) centavos?)?/) ?? [];
  return Number(reais.replace(/\./g, "")) * 100 + Number(centavos);
}

/** Waits until the part stopped moving: no running animation, figures steady. */
async function settled(page: Page) {
  await expect
    .poll(
      async () => {
        const first = await part(page).evaluate((el) => ({
          running: document
            .getAnimations()
            .filter((a) => a.playState === "running").length,
          text: (el as HTMLElement).innerText,
        }));
        await page.waitForTimeout(150);
        const second = await part(page).evaluate(
          (el) => (el as HTMLElement).innerText,
        );
        return first.running === 0 && first.text === second;
      },
      { timeout: 10_000 },
    )
    .toBe(true);
}

test("abre na primeira parte, com título, e avança com o Próximo até o fim", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openRecap(page);
  await expect(page.locator('[data-slide="intro"]')).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /^Retrospectiva · /, level: 1 }),
  ).toBeAttached();
  await expect(
    page.getByRole("heading", { name: /fechou$/, level: 2 }),
  ).toBeVisible();
  const { total } = await position(page);
  expect(total).toBeGreaterThanOrEqual(4);
  // "Voltar" is hidden on the first part.
  await expect(page.getByRole("button", { name: "Voltar" })).toBeHidden();

  for (let step = 2; step <= total; step++) {
    await page.getByRole("button", { name: "Próximo", exact: true }).click();
    await expect(part(page)).toHaveAttribute(
      "aria-label",
      new RegExp(`^${step} de ${total}: `),
    );
    // The focus follows the title of the new part.
    await expect(page.locator("[data-recap-title]").first()).toBeFocused();
  }
  // The last part has no "Próximo": the closing actions take its place.
  await expect(page.locator('[data-slide="outro"]')).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Próximo", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Ver o fechamento completo" }),
  ).toHaveAttribute("href", /\/relatorios\/fechamento\?mes=\d{4}-\d{2}$/);
});

test("setas, Home e End percorrem as partes, e Esc fecha para o Fechamento", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openRecap(page);
  const { total } = await position(page);
  await page.keyboard.press("ArrowRight");
  await expect(part(page)).toHaveAttribute("aria-label", /^2 de /);
  await page.keyboard.press("ArrowRight");
  await expect(part(page)).toHaveAttribute("aria-label", /^3 de /);
  await page.keyboard.press("ArrowLeft");
  await expect(part(page)).toHaveAttribute("aria-label", /^2 de /);
  await page.keyboard.press("End");
  await expect(part(page)).toHaveAttribute(
    "aria-label",
    new RegExp(`^${total} de `),
  );
  await page.keyboard.press("Home");
  await expect(part(page)).toHaveAttribute("aria-label", /^1 de /);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/relatorios\/fechamento\?mes=\d{4}-\d{2}$/);
});

test("o Ver o fechamento completo leva ao Fechamento do mesmo mês", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openRecap(page);
  const month = new URL(page.url()).searchParams.get("mes");
  await page.keyboard.press("End");
  await page.getByRole("link", { name: "Ver o fechamento completo" }).click();
  await expect(page).toHaveURL(/\/relatorios\/fechamento\?mes=\d{4}-\d{2}$/);
  if (month) expect(page.url()).toContain(`mes=${month}`);
});

test("Guardar a sobra abre a transferência para a caixinha, preenchida", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openRecap(page);
  await page.keyboard.press("End");
  await page.getByRole("button", { name: "Guardar a sobra" }).click();
  const sheet = page.getByRole("dialog", { name: "Nova transação" });
  await expect(sheet).toBeVisible({ timeout: 30_000 });
  await expect(
    sheet.getByRole("radio", { name: "Transferência" }),
  ).toBeChecked();
  await expect(sheet.locator('input[value="Sobra de outubro"]')).toBeVisible();
  // With the sheet open the keys belong to it, not to the player.
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/retrospectiva/);
});

test("com movimento reduzido, o valor que sobrou aparece inteiro de uma vez", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openRecap(page);
  await goToPart(page, "left");
  const left = page.locator('[data-slide="left"]');
  // The spoken amount is the final one; the drawn one must match at once.
  const spoken = (await left.locator(".sr-only").first().textContent()) ?? "";
  expect(spoken).toMatch(/reais/);
  const drawn = left.locator("[data-privacy-value] [aria-hidden]").first();
  await expect(drawn).toContainText(/R\$\s?[0-9.]+,[0-9]{2}/);
  const text = (await drawn.textContent()) ?? "";
  expect(cents(text)).toBe(spokenCents(spoken));
});

test("com movimento normal, a Abertura anima ao abrir", async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/retrospectiva");
  const intro = page.locator('[data-slide="intro"]');
  await expect(intro).toBeVisible({ timeout: 30_000 });
  // Right after it shows up the title is still coming in, not at rest.
  const title = intro.getByRole("heading", { level: 2 });
  const opacities: number[] = [];
  for (let i = 0; i < 6; i++) {
    // The opacity lives on the wrapper of the title: multiply up to the part.
    opacities.push(
      await title.evaluate((el) => {
        let opacity = 1;
        for (
          let node: Element | null = el;
          node && !node.hasAttribute("data-slide");
          node = node.parentElement
        ) {
          opacity *= Number(getComputedStyle(node).opacity);
        }
        return opacity;
      }),
    );
    await page.waitForTimeout(60);
  }
  expect(Math.min(...opacities)).toBeLessThan(1);
  await settled(page);
  expect(
    await title.evaluate((el) =>
      Number(getComputedStyle(el.parentElement ?? el).opacity),
    ),
  ).toBe(1);
});

test("com movimento normal, a contagem termina no valor exato", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openRecap(page);
  await goToPart(page, "left");
  const left = page.locator('[data-slide="left"]');
  // The spoken amount outside the drawn (aria-hidden) one is always the final.
  const final_ = left.locator(".sr-only:not([aria-hidden] *) .sr-only").first();
  await expect(final_).toContainText(/reais/);
  const spoken = (await final_.textContent()) ?? "";
  const final = spokenCents(spoken);
  expect(final).toBeGreaterThan(0);
  const drawn = left.locator("[data-privacy-value] [aria-hidden]").first();
  const seen: number[] = [];
  for (let i = 0; i < 25; i++) {
    seen.push(cents((await drawn.textContent()) ?? ""));
    await page.waitForTimeout(100);
  }
  // It started below the end (the count is visible) and never overshot.
  expect(seen[0]).toBeLessThan(final);
  expect(Math.max(...seen)).toBeLessThanOrEqual(final);
  await settled(page);
  expect(cents((await drawn.textContent()) ?? "")).toBe(final);
});

test("com movimento reduzido, nada se move ao abrir nem ao trocar de parte", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openRecap(page);
  const moving = () =>
    page.evaluate(
      () =>
        document.getAnimations().filter((animation) => {
          const effect = animation.effect as KeyframeEffect | null;
          const target = effect?.target as HTMLElement | null;
          if (!target?.closest("[data-slide]")) return false;
          return effect
            ?.getKeyframes()
            .some((frame) =>
              ["transform", "translate", "scale", "width", "height"].some(
                (key) => key in frame,
              ),
            );
        }).length,
    );
  const title = page.locator("[data-slide] [data-recap-title]").first();
  await expect(title).toHaveCSS("opacity", "1");
  expect(await moving()).toBe(0);
  for (let i = 0; i < 3; i++) {
    await next(page);
    expect(await moving()).toBe(0);
  }
});

test("no modo discreto nenhum valor aparece, só a máscara", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openRecap(page);
  await page.getByRole("button", { name: "Ocultar valores" }).click();
  await expect(
    page.getByRole("button", { name: "Ocultar valores" }),
  ).toHaveAttribute("aria-pressed", "true");
  const total = (await position(page)).total;
  for (let step = 1; step <= total; step++) {
    const slide = part(page);
    await expect(slide.locator("[data-privacy-value]:visible")).toHaveCount(0);
    // innerText is what is on screen: no amount, only the masks.
    const shown = await slide.evaluate((el) => (el as HTMLElement).innerText);
    expect(shown).not.toMatch(/R\$\s?\d/);
    if (step < total) {
      await next(page);
    }
  }
  // Back to the default for the next tests.
  await page.getByRole("button", { name: "Ocultar valores" }).click();
});

test("o mês anterior não oferece o que continua nem guardar a sobra", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openRecap(page);
  const mes = new URL(page.url()).searchParams.get("mes") ?? "";
  const [year, month] = mes.split("-").map(Number);
  const before = new Date(Date.UTC(year ?? 2026, (month ?? 1) - 2, 1));
  const earlier = `${before.getUTCFullYear()}-${String(before.getUTCMonth() + 1).padStart(2, "0")}`;
  await page.goto(`/retrospectiva?mes=${earlier}`);
  // The demo may have nothing that early: then an empty state is the answer.
  const empty = page.getByRole("heading", {
    name: /^(Sem registros em|Nada pago em|O primeiro fechamento)/,
  });
  await expect(part(page).or(empty)).toBeVisible({ timeout: 30_000 });
  if (await empty.isVisible()) return;
  await page.keyboard.press("End");
  await expect(page.locator('[data-slide="next"]')).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Guardar a sobra" }),
  ).toHaveCount(0);
});

test("o Fechamento tem o botão Ver a retrospectiva", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/relatorios/fechamento");
  const link = page.getByRole("link", { name: "Ver a retrospectiva" });
  await expect(link).toBeVisible({ timeout: 30_000 });
  await link.click();
  await expect(page).toHaveURL(/\/retrospectiva\?mes=\d{4}-\d{2}$/);
  await expect(part(page)).toBeVisible({ timeout: 30_000 });
});

test("o fechar leva ao Fechamento e uma nova visita começa na primeira parte", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openRecap(page);
  await page.keyboard.press("ArrowRight");
  await page.getByRole("link", { name: "Fechar retrospectiva" }).click();
  await expect(page).toHaveURL(/\/relatorios\/fechamento/);
  await page.getByRole("link", { name: "Ver a retrospectiva" }).click();
  await expect(part(page)).toHaveAttribute("aria-label", /^1 de /, {
    timeout: 30_000,
  });
});

test("sem acessibilidade quebrada em cada parte, nos dois temas e em 360 px", async ({
  page,
}) => {
  test.setTimeout(240_000);
  for (const theme of ["Escuro", "Claro"] as const) {
    await chooseTheme(page, theme);
    await openRecap(page);
    const { total } = await position(page);
    for (let step = 1; step <= total; step++) {
      await settled(page);
      await expectNoA11yViolations(page);
      await expectNoHorizontalScroll(page);
      if (step < total) await next(page);
    }
  }
  await chooseTheme(page, "Escuro");
});

test("o mês antes do primeiro registro mostra o vazio, sem violações", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/retrospectiva?mes=2000-01");
  // An old month clamps to the demo's first records or shows the empty state.
  await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible({
    timeout: 30_000,
  });
  await expectNoA11yViolations(page);
});
