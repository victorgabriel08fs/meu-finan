import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NBSP } from "@/lib/format/money";
import type { CashFlowDayPoint, CashFlowReport } from "@/server/domain/reports";
import {
  CashFlowBlock,
  CashFlowInvite,
  CashFlowNoAccountsInvite,
} from "./cash-flow-block";
import {
  CategoryBreakdownBlock,
  CategoryBreakdownInvite,
} from "./category-breakdown-block";
import {
  IncomeExpenseBlock,
  IncomeExpenseInvite,
} from "./income-expense-block";

// The blocks of the reports on the Início (doc 02 §6.3): the report's chart
// under a heading of its own, the way to the report, and an invite when
// there is nothing to show.

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

describe("CashFlowBlock", () => {
  const render = (
    report: CashFlowReport,
    today: string,
    reportHref = "/relatorios/fluxo",
  ) =>
    plain(
      renderToStaticMarkup(
        <CashFlowBlock
          report={report}
          start="2026-10-01"
          end="2026-10-31"
          today={today}
          reportHref={reportHref}
        />,
      ),
    );

  it("shows the report's daily balance, its lowest point and the way to it", () => {
    const html = render(current, "2026-10-14");
    expect(html).toContain('<section aria-labelledby="inicio-fluxo"');
    expect(html).toContain('id="inicio-fluxo"');
    expect(html).not.toContain('id="relatorio-fluxo"');
    // The name in "Personalizar o Início" (doc 02 §10.4).
    expect(html).toContain(">Fluxo de caixa</h2>");
    expect(html).toContain("Saldo dia a dia, sem os cartões");
    expect(html).toContain('href="/relatorios/fluxo"');
    expect(html).toContain("Ver relatório");
    expect(html).toContain("Realizado");
    expect(html).toContain('stroke-dasharray="5 4"');
    expect(html).toContain('aria-label="Percorrer o saldo dia a dia"');
    expect(html).toContain("Ver como tabela");
    // Only the lowest balance: today's and the forecast are the Saldo's.
    expect(html).toContain("Menor saldo previsto");
    expect(html).toContain("em 15/out");
    expect(html).not.toContain("Saldo hoje");
    expect(html).not.toContain("Previsto para 31/out");
    // A tile a step down from the card, beside the chart in a whole row.
    expect(html.match(/bg-surface-2 shadow-none/g)).toHaveLength(1);
    expect(html).toContain("@2xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]");
  });

  it("speaks no amount in privacy mode", () => {
    const html = render(current, "2026-10-14");
    expect(html).toContain(
      '<span data-privacy-mask="">Saldo de valor oculto hoje; previsto valor oculto em 31/out; menor saldo previsto valor oculto em 15/out.</span>',
    );
  });

  it("looks back on a past month and keeps its month in the link", () => {
    const html = render(
      {
        ...current,
        phase: "past",
        days: octoberDays(null),
        lowestProjected: null,
      },
      "2026-11-20",
      "/relatorios/fluxo?mes=2026-10",
    );
    expect(html).toContain('href="/relatorios/fluxo?mes=2026-10"');
    expect(html).toContain(">Menor saldo<");
    expect(html).toContain("em 1/out");
    expect(html).not.toContain("Variação no mês");
    expect(html).not.toContain("stroke-dasharray");
    expect(html).not.toContain("Só entra o que já está agendado");
  });

  it("says what a month ahead leaves out", () => {
    const html = render(
      {
        ...current,
        phase: "future",
        days: current.days.map((day) => ({ ...day, realizedCents: null })),
      },
      "2026-09-20",
      "/relatorios/fluxo?mes=2026-10",
    );
    expect(html).toContain("Menor saldo previsto");
    expect(html).not.toContain("Previsto em 1/out");
    expect(html).toContain("Só entra o que já está agendado");
  });

  it("invites to the accounts without any off the cards", () => {
    const html = renderToStaticMarkup(<CashFlowNoAccountsInvite />);
    expect(html).toContain("Nenhuma conta fora dos cartões");
    expect(html).toContain(
      "O fluxo de caixa acompanha o saldo das suas contas, sem os cartões.",
    );
    expect(html).toContain('href="/contas"');
    expect(html).toContain("Ver contas");
  });

  it("invites to add an entry in an empty month", () => {
    const html = renderToStaticMarkup(<CashFlowInvite monthName="janeiro" />);
    expect(html).toContain("Nenhum lançamento em janeiro");
    expect(html).toContain(
      "Quando houver, o gráfico mostra o saldo dia a dia.",
    );
    expect(html).toContain("Adicionar lançamento");
  });
});

describe("CategoryBreakdownBlock", () => {
  const items = Array.from({ length: 7 }, (_, k) => ({
    categoryId: `c${k + 1}`,
    name: `Categoria ${k + 1}`,
    icon: "house",
    color: "cat-1",
    cents: (7 - k) * 10_000,
    share: (7 - k) / 28,
  }));
  const render = (isCurrent: boolean, link: { href: string; label: string }) =>
    plain(
      renderToStaticMarkup(
        <CategoryBreakdownBlock
          items={items}
          totalCents={280_000}
          month="2026-10"
          monthName="outubro"
          isCurrent={isCurrent}
          link={link}
        />,
      ),
    );

  it("ranks the five biggest categories and folds the rest", () => {
    const html = render(true, {
      href: "/relatorios/categorias?periodo=1",
      label: "Ver relatório",
    });
    expect(html).toContain('<section aria-labelledby="inicio-categorias"');
    expect(html).toContain('id="inicio-categorias"');
    expect(html).toContain("Para onde foi o dinheiro");
    expect(html).toContain("Despesas pagas em outubro, até hoje");
    expect(html).toContain('href="/relatorios/categorias?periodo=1"');
    expect(html).toContain(">Ver relatório</a>");
    for (const k of [1, 2, 3, 4, 5]) expect(html).toContain(`Categoria ${k}<`);
    expect(html).not.toContain("Categoria 6<");
    expect(html).toContain("Outras 2 categorias");
    expect(html).toContain("/extrato?categoria=c1&amp;mes=2026-10");
    // The total hides like <Money>; the shares stay visible.
    expect(html).toContain('<span data-privacy-value="">R$ 2.800,00</span>');
    expect(html).toContain(
      '<span data-privacy-mask="" role="img" aria-label="valor oculto">',
    );
    expect(html).toMatch(/>25(,0)?%</);
  });

  it("opens another month's expenses in the statement", () => {
    const html = render(false, {
      href: "/extrato?mes=2026-09&tipo=despesa&status=pago",
      label: "Ver no extrato",
    });
    expect(html).toContain("Despesas pagas em outubro<");
    expect(html).not.toContain("até hoje");
    expect(html).toContain(
      'href="/extrato?mes=2026-09&amp;tipo=despesa&amp;status=pago"',
    );
    expect(html).toContain(">Ver no extrato</a>");
  });

  it("invites to add an expense in a month without any paid", () => {
    const html = renderToStaticMarkup(
      <CategoryBreakdownInvite monthName="dezembro" />,
    );
    expect(html).toContain("Nenhuma despesa paga em dezembro");
    expect(html).toContain(
      "Quando houver, o ranking mostra para onde foi o dinheiro.",
    );
    expect(html).toContain("Adicionar despesa");
  });
});

describe("IncomeExpenseBlock", () => {
  const months = ["05", "06", "07", "08", "09", "10"].map((m, k) => ({
    month: `2026-${m}`,
    incomeCents: 870_000,
    expenseCents: 500_000 + k * 10_000,
    partial: m === "10",
  }));

  it("compares the 6 months up to the one on screen", () => {
    const html = plain(
      renderToStaticMarkup(
        <IncomeExpenseBlock
          months={months}
          endMonthName="outubro"
          partialProgress="até o dia 14 de 31"
          reportHref="/relatorios/visao-geral?periodo=6"
        />,
      ),
    );
    expect(html).toContain(
      '<section aria-labelledby="inicio-receitas-despesas"',
    );
    expect(html).toContain('id="inicio-receitas-despesas"');
    expect(html).not.toContain('id="relatorio-receitas-despesas"');
    expect(html).toContain(">Receitas × despesas por mês</h2>");
    expect(html).toContain("Últimos 6 meses, até outubro");
    expect(html).toContain('href="/relatorios/visao-geral?periodo=6"');
    expect(html.match(/aria-pressed=/g)).toHaveLength(6);
    // The last complete month is selected; the running one is partial.
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain("setembro");
    expect(html).toContain("* outubro parcial (até o dia 14 de 31)");
    expect(html).toContain("--swatch:var(--chart-3)");
    expect(html).toContain(
      '<span data-privacy-mask="" class="sr-only">maio de 2026: receitas valor oculto, despesas valor oculto</span>',
    );
  });

  it("invites to add entries after 6 empty months", () => {
    const html = renderToStaticMarkup(<IncomeExpenseInvite />);
    expect(html).toContain("Nenhuma receita ou despesa em 6 meses");
    expect(html).toContain(
      "Com seus lançamentos, o gráfico compara o que entrou e saiu a cada mês.",
    );
    expect(html).toContain("Adicionar lançamento");
  });
});
