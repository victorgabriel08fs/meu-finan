import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CategoryRanking } from "./category-ranking";
import { IncomeExpenseCard } from "./income-expense-card";
import { NetWorthCard } from "./net-worth-card";
import { SavingsRateCard } from "./savings-rate-card";

const months = [
  {
    month: "2026-09",
    incomeCents: 870_000,
    expenseCents: 602_000,
    partial: false,
  },
  {
    month: "2026-10",
    incomeCents: 870_000,
    expenseCents: 150_000,
    partial: true,
  },
];

describe("report cards", () => {
  it("shows the selected month above the columns and marks the partial one", () => {
    const html = renderToStaticMarkup(
      <IncomeExpenseCard
        months={months}
        defaultSelected={0}
        summary="Resumo"
        partialProgress="até o dia 14 de 31"
      />,
    );
    expect(html).toContain("setembro");
    expect(html).toContain("* outubro parcial (até o dia 14 de 31)");
    expect(html).toContain("Ver como tabela");
    expect(html).toContain('aria-pressed="true"');
  });

  it("explains an empty savings chart", () => {
    const html = renderToStaticMarkup(
      <SavingsRateCard months={[]} rates={[]} />,
    );
    expect(html).toContain("mês completo com receita");
  });

  it("shows the net worth change", () => {
    const html = renderToStaticMarkup(
      <NetWorthCard
        points={[
          { month: "2026-09", cents: 1_000_000 },
          { month: "2026-10", cents: 1_200_000 },
        ]}
        period={1}
      />,
    );
    expect(html).toContain("Patrimônio líquido");
    expect(html).toContain("no mês");
    expect(html).toContain("Patrimônio subiu");
  });

  it("links categories to the statement and folds the tail", () => {
    const html = renderToStaticMarkup(
      <CategoryRanking
        items={[
          {
            categoryId: "c1",
            name: "Moradia",
            icon: "house",
            color: "cat-1",
            cents: 2_310_000,
            share: 0.6,
          },
          {
            categoryId: null,
            name: "Sem categoria",
            icon: "ellipsis",
            color: "neutral",
            cents: 1_540_000,
            share: 0.4,
          },
        ]}
        month="2026-10"
        limit={1}
      />,
    );
    expect(html).toContain("/extrato?categoria=c1&amp;mes=2026-10");
    expect(html).toContain("Outras 1 categoria");
  });
});
