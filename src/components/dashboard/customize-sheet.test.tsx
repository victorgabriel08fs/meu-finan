import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultHomeLayout, resolveHomeLayout } from "@/lib/home/layout";
import {
  HomeBlockList,
  HomeCustomizeButton,
  HomeCustomizeRow,
  homeLayoutSummary,
  persistHomeLayout,
  positionAnnouncement,
} from "./customize-sheet";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  toast: vi.fn(),
}));
// Server Actions are not available outside Next.
vi.mock("@/server/actions/preferences", () => ({
  saveHomeLayoutAction: mocks.save,
}));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

/** The <li> of one block in the list's markup. */
const row = (html: string, id: string) =>
  new RegExp(`<li[^>]*data-block="${id}"[^>]*>(.*?)</li>`).exec(html)?.[1] ??
  "";

const list = (entries = defaultHomeLayout()) =>
  renderToStaticMarkup(<HomeBlockList entries={entries} onChange={vi.fn()} />);

describe("HomeBlockList", () => {
  it("keeps the Saldo first, fixed and without controls", () => {
    const html = list();
    expect(html.indexOf('data-block="balance"')).toBeLessThan(
      html.indexOf('data-block="month-totals"'),
    );
    const balance = row(html, "balance");
    expect(balance).toContain("Saldo em contas");
    expect(balance).toContain("Sempre no topo");
    expect(balance).not.toContain("<button");
    expect(balance).not.toContain('role="switch"');
  });

  it("names Subir and Descer after the block, disabled only at the ends", () => {
    const html = list();
    const first = row(html, "month-totals");
    expect(first).toMatch(
      /aria-label="Subir Receitas e despesas" aria-disabled="true"/,
    );
    expect(first).toMatch(
      /aria-label="Descer Receitas e despesas"(?! aria-disabled)/,
    );
    const last = row(html, "month-comparison");
    expect(last).toMatch(
      /aria-label="Subir Comparado ao mês passado"(?! aria-disabled)/,
    );
    expect(last).toMatch(
      /aria-label="Descer Comparado ao mês passado" aria-disabled="true"/,
    );
    // aria-disabled, never disabled: the focus stays on the button.
    expect(html).not.toMatch(/<button[^>]* disabled=""/);
    expect(html.match(/aria-disabled="true"/g)).toHaveLength(2);
  });

  it("gives each block a switch named and described by its row", () => {
    const html = list();
    expect(html.match(/role="switch"/g)).toHaveLength(16);
    const budget = row(html, "budget");
    expect(budget).toContain('aria-checked="true"');
    const labelledBy = /aria-labelledby="([^"]+)"/.exec(budget)?.[1];
    const describedBy = /aria-describedby="([^"]+)"/.exec(budget)?.[1];
    expect(budget).toMatch(new RegExp(`id="${labelledBy}"[^>]*>Orçamento<`));
    expect(budget).toContain(`id="${describedBy}"`);
    expect(budget).toContain("Quanto do orçamento já foi");
    expect(row(html, "spending-calendar")).toContain('aria-checked="false"');
  });

  it("marks the blocks the person did not know yet", () => {
    const { entries } = resolveHomeLayout([{ id: "goals", visible: true }]);
    const html = list(entries);
    expect(row(html, "goals")).not.toContain("Novo");
    expect(row(html, "spending-calendar")).toContain("Novo");
    expect(row(html, "income-expense")).toContain("Novo");
    expect(html.match(/>Novo</g)).toHaveLength(15);
  });

  it("marks a recent block new and tells the switch about it", () => {
    const { entries } = resolveHomeLayout(null, { today: "2026-11-02" });
    const calendar = row(list(entries), "spending-calendar");
    const badge = /<span [^>]*id="([^"]+)"[^>]*>Novo</.exec(calendar)?.[1];
    expect(badge).toBeDefined();
    expect(calendar).toMatch(
      new RegExp(`aria-describedby="${badge} [^"]+-descricao"`),
    );
    // The badge sits by the name, out of the switch's name.
    const labelledBy = /aria-labelledby="([^"]+)"/.exec(calendar)?.[1];
    expect(calendar).toMatch(
      new RegExp(`id="${labelledBy}"[^>]*>Calendário de gastos</span>`),
    );
  });

  it("has a polite status region for the moves", () => {
    expect(list()).toContain('<output class="sr-only">');
  });
});

describe("positionAnnouncement", () => {
  it("counts the Saldo in the position", () => {
    expect(positionAnnouncement(defaultHomeLayout(), "month-totals")).toBe(
      "Receitas e despesas na posição 2 de 17.",
    );
    expect(positionAnnouncement(defaultHomeLayout(), "spending-calendar")).toBe(
      "Calendário de gastos na posição 9 de 17.",
    );
    expect(positionAnnouncement(defaultHomeLayout(), "net-worth")).toBe(
      "Patrimônio na posição 13 de 17.",
    );
  });
});

describe("homeLayoutSummary", () => {
  it("tells the default from a choice of the person's, without counting", () => {
    expect(
      homeLayoutSummary({ entries: defaultHomeLayout(), customized: false }),
    ).toBe("Padrão do app");
    expect(homeLayoutSummary(resolveHomeLayout([]))).toBe("Na sua ordem");
  });
});

describe("persistHomeLayout", () => {
  it("sends null to restore the default", async () => {
    mocks.save.mockResolvedValue({});
    expect(await persistHomeLayout(null)).toBe(true);
    expect(mocks.save).toHaveBeenCalledWith({ blocks: null });
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("sends the blocks in order", async () => {
    mocks.save.mockResolvedValue({});
    const blocks = [{ id: "goals" as const, visible: false }];
    expect(await persistHomeLayout(blocks)).toBe(true);
    expect(mocks.save).toHaveBeenCalledWith({ blocks });
  });

  it("explains what went wrong and reports nothing saved", async () => {
    mocks.save.mockResolvedValue({
      serverError: "Personalizar o Início não está disponível na sua conta.",
    });
    expect(await persistHomeLayout(null)).toBe(false);
    expect(mocks.toast).toHaveBeenLastCalledWith(
      "Personalizar o Início não está disponível na sua conta.",
    );

    mocks.save.mockResolvedValue({ validationErrors: { formErrors: [] } });
    expect(await persistHomeLayout(null)).toBe(false);
    expect(mocks.toast).toHaveBeenLastCalledWith(
      "Não conseguimos salvar. Atualize a página e tente de novo.",
    );

    mocks.save.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await persistHomeLayout(null)).toBe(false);
    expect(mocks.toast).toHaveBeenLastCalledWith(
      "Não conseguimos salvar. Verifique a conexão.",
    );
  });
});

describe("entry points", () => {
  const layout = { entries: defaultHomeLayout(), customized: false };

  it("opens from a button at the end of the Início", () => {
    const html = renderToStaticMarkup(<HomeCustomizeButton {...layout} />);
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain("Personalizar o Início");
  });

  it("opens from a row in Preferências, where the tip points", () => {
    const html = renderToStaticMarkup(<HomeCustomizeRow {...layout} />);
    expect(html).toContain('data-tip="home-customize"');
    expect(html).toContain(">Início<");
    expect(html).toContain("Padrão do app");
  });
});
