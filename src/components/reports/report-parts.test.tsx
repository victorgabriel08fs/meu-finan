import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NBSP } from "@/lib/format/money";
import type { CashFlowDayPoint, CashFlowReport } from "@/server/domain/reports";
import { RECURRENCE_HORIZON_DAYS } from "@/server/domain/transactions";
import { CashFlowCard, CashFlowChart, CashFlowLegend } from "./cash-flow-card";
import {
  CashFlowKpiTiles,
  cashFlowFutureNote,
  LowSupport,
} from "./cash-flow-kpis";
import {
  IncomeExpenseCard,
  IncomeExpenseChart,
  IncomeExpenseLegend,
} from "./income-expense-card";
import { NetWorthCard } from "./net-worth-card";

// The pieces the Início reuses (doc 02 §6.3): the same charts, legends and
// figures as the reports, under a heading of the caller's.

const plain = (html: string) => html.replaceAll(NBSP, " ");

function octoberDays(today: number | null): CashFlowDayPoint[] {
  return Array.from({ length: 31 }, (_, k) => {
    const day = k + 1;
    const balance = 2_000_000 - (day >= 15 ? 210_000 : 0);
    return {
      date: `2026-10-${String(day).padStart(2, "0")}`,
      realizedCents: today === null || day <= today ? balance : null,
      projectedCents: today !== null && day >= today ? balance : null,
    };
  });
}

const current: CashFlowReport = {
  phase: "current",
  hasAccounts: true,
  days: octoberDays(14),
  startCents: 2_000_000,
  endCents: 1_790_000,
  lowestRealized: { date: "2026-10-01", cents: 2_000_000 },
  lowestProjected: { date: "2026-10-15", cents: 1_790_000 },
  scheduled: [
    {
      date: "2026-10-15",
      label: "Aluguel",
      amountCents: -210_000,
      kind: "entry",
      overdue: false,
    },
  ],
  paidCount: 4,
};

const past: CashFlowReport = {
  ...current,
  phase: "past",
  days: octoberDays(null),
  lowestProjected: null,
};

describe("CashFlowChart and CashFlowLegend", () => {
  it("draws the chart with its day and table, without a heading of its own", () => {
    const html = plain(
      renderToStaticMarkup(
        <CashFlowChart report={current} today="2026-10-14" />,
      ),
    );
    expect(html).not.toContain("<h2");
    expect(html).not.toContain("<section");
    expect(html).toContain("qua, 14/out · hoje");
    expect(html).toContain('stroke-dasharray="5 4"');
    expect(html).toContain("Aluguel");
    expect(html).toContain('aria-label="Percorrer o saldo dia a dia"');
    expect(html).toContain(
      'aria-valuetext="14 de outubro, hoje: saldo R$ 20.000"',
    );
    expect(html).toContain(
      '<span data-privacy-mask="">Saldo de valor oculto hoje; previsto valor oculto em 31/out; menor saldo previsto valor oculto em 15/out.</span>',
    );
    expect(html).toContain("Ver como tabela");
  });

  it("puts the note under the chart", () => {
    const html = renderToStaticMarkup(
      <CashFlowChart
        report={{ ...current, phase: "future" }}
        today="2026-09-20"
        note="Só entra o que já está agendado."
      />,
    );
    expect(html).toContain("Só entra o que já está agendado.");
  });

  it("keys the realized and the projected lines, only when there is a projection", () => {
    const html = renderToStaticMarkup(<CashFlowLegend report={current} />);
    expect(html).toContain("Realizado");
    expect(html).toContain("Previsto");
    expect(html).toContain("border-dashed");
    expect(renderToStaticMarkup(<CashFlowLegend report={past} />)).toBe("");
    // A month ahead: only the projection.
    const future = renderToStaticMarkup(
      <CashFlowLegend
        report={{
          days: current.days.map((day) => ({ ...day, realizedCents: null })),
        }}
      />,
    );
    expect(future).not.toContain("Realizado");
    expect(future).toContain("Previsto");
  });

  it("keeps the report's card: heading, caption, legend and chart", () => {
    const html = renderToStaticMarkup(
      <CashFlowCard report={current} today="2026-10-14" />,
    );
    expect(html).toContain('<section aria-labelledby="relatorio-fluxo"');
    expect(html).toContain("Saldo em contas, sem os cartões");
    expect(html.match(/<h2/g)).toHaveLength(1);
    expect(html.indexOf("Realizado")).toBeLessThan(html.indexOf("qua, 14/out"));
  });
});

describe("CashFlowKpiTiles", () => {
  const render = (report: CashFlowReport, today: string, extra = {}) =>
    plain(
      renderToStaticMarkup(
        <CashFlowKpiTiles
          report={report}
          start="2026-10-01"
          end="2026-10-31"
          today={today}
          {...extra}
        />,
      ),
    );

  it("shows today, the end of the month and the lowest projected balance", () => {
    const html = render(current, "2026-10-14");
    expect(html).toContain("Saldo hoje");
    expect(html).toContain("em contas, sem cartões");
    expect(html).toContain("Previsto para 31/out");
    expect(html).toContain("Menor saldo previsto");
    expect(html).toContain("em 15/out");
  });

  it("looks back on a past month", () => {
    const html = render(past, "2026-11-20");
    expect(html).toContain("Saldo em 31/out");
    expect(html).toContain("Variação no mês");
    expect(html).toContain("de 1/out a 31/out");
    expect(html).toContain(">Menor saldo<");
  });

  it("starts a month ahead from its first day", () => {
    const html = render({ ...current, phase: "future" }, "2026-09-20");
    expect(html).toContain("Previsto em 1/out");
    expect(html).toContain("no início do mês");
  });

  it("styles every tile and the last one apart", () => {
    const html = render(current, "2026-10-14", {
      tileClassName: "bg-surface-2 shadow-none",
      lastTileClassName: "col-span-2",
    });
    expect(html.match(/bg-surface-2 shadow-none/g)).toHaveLength(3);
    expect(html.match(/col-span-2/g)).toHaveLength(1);
  });

  it("flags a balance that goes negative", () => {
    expect(
      renderToStaticMarkup(<LowSupport date="2026-10-25" tone={null} />),
    ).toBe("em 25/out");
    const danger = renderToStaticMarkup(
      <LowSupport date="2026-10-25" tone="danger" />,
    );
    expect(danger).toContain("negativo em 25/out");
    expect(danger).toContain("text-danger");
    expect(
      renderToStaticMarkup(<LowSupport date="2026-10-25" tone="warning" />),
    ).toContain("text-warning");
  });

  it("explains what a month ahead leaves out", () => {
    expect(cashFlowFutureNote({ phase: "future" })).toBe(
      `Só entra o que já está agendado; repetições aparecem até ${RECURRENCE_HORIZON_DAYS} dias à frente.`,
    );
    expect(cashFlowFutureNote({ phase: "current" })).toBeUndefined();
    expect(cashFlowFutureNote({ phase: "past" })).toBeUndefined();
  });
});

describe("IncomeExpenseChart and IncomeExpenseLegend", () => {
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

  it("draws the columns with the selected month, without a heading", () => {
    const html = plain(
      renderToStaticMarkup(
        <IncomeExpenseChart
          months={months}
          defaultSelected={0}
          summary="Resumo com R$ 6.020"
          hiddenSummary="Resumo com valor oculto"
          partialProgress="até o dia 14 de 31"
        />,
      ),
    );
    expect(html).not.toContain("<h2");
    expect(html).toContain("setembro");
    expect(html).toContain("* outubro parcial (até o dia 14 de 31)");
    expect(html).toContain(
      '<p class="sr-only"><span data-privacy-value="">Resumo com R$ 6.020</span><span data-privacy-mask="">Resumo com valor oculto</span></p>',
    );
    // Each month named by its content, with the version for privacy mode.
    expect(html).toContain(
      '<span data-privacy-value="" class="sr-only">outubro de 2026 (parcial): receitas R$ 8.700, despesas R$ 1.500</span><span data-privacy-mask="" class="sr-only">outubro de 2026 (parcial): receitas valor oculto, despesas valor oculto</span>',
    );
    expect(html).not.toContain('aria-label="setembro');
  });

  it("keys the two series", () => {
    const html = renderToStaticMarkup(<IncomeExpenseLegend />);
    expect(html).toContain("Receitas");
    expect(html).toContain("Despesas");
    expect(html).toContain("--swatch:var(--chart-3)");
    expect(html).toContain("--swatch:var(--chart-2)");
  });

  it("keeps the report's card and derives the summary without amounts", () => {
    const html = renderToStaticMarkup(
      <IncomeExpenseCard
        months={months}
        defaultSelected={0}
        summary="Resumo"
        partialProgress={null}
      />,
    );
    expect(html).toContain('aria-labelledby="relatorio-receitas-despesas"');
    expect(html).toContain('<span data-privacy-value="">Resumo</span>');
    expect(html).toContain(
      '<span data-privacy-mask="">Receitas superaram as despesas em todos os 2 meses; maior despesa em setembro, valor oculto. Outubro está parcial.</span>',
    );
    expect(html).toContain("* outubro parcial<");
  });
});

describe("NetWorthCard", () => {
  const points = [
    { month: "2026-09", cents: 1_000_000 },
    { month: "2026-10", cents: 1_200_000 },
  ];

  it("has one heading above the chart, by default the report's", () => {
    const html = renderToStaticMarkup(
      <NetWorthCard points={points} period={1} />,
    );
    expect(html).toContain('aria-labelledby="relatorio-patrimonio"');
    expect(html.match(/<h2/g)).toHaveLength(1);
    expect(html.indexOf("<h2")).toBeLessThan(html.indexOf("Ver como tabela"));
    expect(html).toContain(
      '<span data-privacy-mask="">Patrimônio subiu de valor oculto para valor oculto em 1 mês.</span>',
    );
    expect(html).not.toContain('aria-label="Patrimônio');
  });

  it("takes the heading id, a caption and an action from the Início", () => {
    const html = renderToStaticMarkup(
      <NetWorthCard
        points={points}
        period={6}
        headingId="inicio-patrimonio"
        caption="hoje"
        action={<a href="/relatorios/patrimonio?periodo=6">Ver relatório</a>}
      />,
    );
    expect(html).toContain('aria-labelledby="inicio-patrimonio"');
    expect(html).toContain('id="inicio-patrimonio"');
    expect(html).not.toContain('relatorio-patrimonio"');
    expect(html).toContain(">hoje</p>");
    expect(html).toContain('href="/relatorios/patrimonio?periodo=6"');
    expect(html).toContain("em 6 meses");
  });
});
