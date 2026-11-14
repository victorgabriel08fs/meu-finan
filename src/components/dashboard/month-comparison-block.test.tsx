import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { compareAmounts } from "@/lib/finance";
import type {
  MonthComparison,
  MonthComparisonCategory,
} from "@/server/domain/month-comparison";
import {
  MonthComparisonBlock,
  MonthComparisonFutureInvite,
  MonthComparisonInvite,
} from "./month-comparison-block";

// Server Actions are not importable outside Next (the quick add button).
vi.mock("@/server/actions/transactions", () => ({ setPaidAction: vi.fn() }));
vi.mock("@/server/actions/preferences", () => ({ setThemeAction: vi.fn() }));

const category = (
  id: string | null,
  name: string,
  current: number,
  baseline: number,
): MonthComparisonCategory => ({
  ...compareAmounts(current, baseline),
  key: id ?? "none",
  categoryId: id,
  name,
  icon: "house",
  color: "cat-1",
});

const comparison = (
  overrides: Partial<MonthComparison> = {},
): MonthComparison => ({
  month: "2026-11",
  previousMonth: "2026-10",
  current: { start: "2026-11-01", end: "2026-11-14" },
  previous: { start: "2026-10-01", end: "2026-10-14" },
  complete: false,
  total: compareAmounts(150_000, 130_000),
  categories: [category("c1", "Moradia", 32_000, 20_000)],
  ...overrides,
});

const render = (c: MonthComparison) =>
  renderToStaticMarkup(
    <MonthComparisonBlock
      comparison={c}
      monthName="novembro"
      previousMonthName="outubro"
      reportHref="/relatorios/categorias?periodo=1"
      hrefFor={(id) => `/relatorios/categorias/${id}`}
      minDiffCents={1_000}
    />,
  );

const plain = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ");

describe("MonthComparisonBlock", () => {
  it("names the region, says the window and links to the report", () => {
    const html = render(comparison());
    expect(html).toContain('aria-labelledby="inicio-comparado-mes"');
    expect(html).toContain('id="inicio-comparado-mes"');
    const text = plain(html);
    expect(text).toContain("Comparado ao mês passado");
    expect(text).toContain("Despesas pagas até hoje, contra 1/out – 14/out");
    expect(html).toContain('href="/relatorios/categorias?periodo=1"');
    expect(text).toContain("Ver relatório");
    expect(text).toContain("O que mais mudou");
  });

  it("says the direction in words, not only by icon or color", () => {
    const more = plain(render(comparison()));
    expect(more).toContain("a mais que em outubro (+15,4%)");
    const less = plain(
      render(comparison({ total: compareAmounts(100_000, 130_000) })),
    );
    expect(less).toContain("a menos que em outubro");
    expect(less).toContain("−23,1%");
    expect(
      plain(render(comparison({ total: compareAmounts(5, 5) }))),
    ).toContain("Igual a outubro");
  });

  it("lists one to three rows, 'Sem categoria' without a link", () => {
    const rows = [
      category("c1", "Moradia", 32_000, 20_000),
      category("c2", "Mercado", 5_000, 25_000),
      category(null, "Sem categoria", 9_000, 0),
    ];
    const html = render(comparison({ categories: rows }));
    expect(html.match(/<li/g)).toHaveLength(3);
    expect(html).toContain('href="/relatorios/categorias/c1"');
    expect(html).toContain('href="/relatorios/categorias/c2"');
    expect(html.match(/ver o detalhe da categoria/g)).toHaveLength(2);
    expect(plain(html)).toContain("Nova no mês");
    expect(plain(html)).toContain("a mais que em outubro");
    expect(plain(html)).toContain("a menos que em outubro");
  });

  it("puts every amount of the person inside Money, none in a label", () => {
    const html = render(comparison());
    expect(html).toContain("data-privacy-value");
    expect(html).not.toMatch(/(?:aria-label|title)="[^"]*R\$/);
  });

  it("explains when no category changed enough", () => {
    const text = plain(render(comparison({ categories: [] })));
    expect(text).toContain("Nenhuma categoria mudou mais de R$ 10,00.");
  });

  it("shows only the note, without a list or the previous line, with no baseline", () => {
    const html = render(
      comparison({ total: compareAmounts(40_000, 0), categories: [] }),
    );
    const text = plain(html);
    expect(text).toContain("Sem despesas pagas em outubro até esse ponto");
    expect(text).not.toContain("O que mais mudou");
    expect(text).not.toContain("Em outubro, até");
  });

  it("compares whole months once the month is over", () => {
    const text = plain(render(comparison({ complete: true })));
    expect(text).toContain(
      "Despesas pagas em novembro, contra outubro inteiro",
    );
    expect(text).toContain("Em outubro:");
  });
});

describe("invites", () => {
  it("invites to add an expense when nothing was paid in either month", () => {
    const text = plain(
      renderToStaticMarkup(
        <MonthComparisonInvite
          monthName="novembro"
          previousMonthName="outubro"
        />,
      ),
    );
    expect(text).toContain("Nenhuma despesa para comparar");
    expect(text).toContain(
      "Quando houver despesas pagas, o bloco compara novembro com outubro.",
    );
    expect(text).toContain("Adicionar despesa");
  });

  it("says the month ahead has not started, with no action", () => {
    const html = renderToStaticMarkup(
      <MonthComparisonFutureInvite monthName="dezembro" />,
    );
    const text = plain(html);
    expect(text).toContain("Dezembro ainda não começou");
    expect(text).toContain(
      "A comparação com o mês anterior aparece quando o mês começar.",
    );
    expect(html).not.toContain("<button");
  });
});
