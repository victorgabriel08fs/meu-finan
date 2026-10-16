import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type {
  CashFlowDayPoint,
  CashFlowReport,
  DaySpending,
  NetWorthBreakdownPoint,
} from "@/server/domain/reports";
import type { TransactionListItem } from "@/server/domain/transactions";
import { CashFlowCard } from "./cash-flow-card";
import { DayExpenses, DayExpensesHint } from "./day-expenses";
import { NetWorthReport } from "./net-worth-report";
import { ReportMonthSwitcher } from "./report-month";
import {
  ReportPeriodFilter,
  ReportTabs,
  ReportTabsFallback,
} from "./report-nav";
import { ScheduledList } from "./scheduled-list";
import { SpendingCalendar } from "./spending-calendar";

const nav = vi.hoisted(() => ({ pathname: "/relatorios/fluxo", query: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.query),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const at = (pathname: string, query = "") => {
  nav.pathname = pathname;
  nav.query = query;
};

const hrefOf = (html: string, label: string) =>
  new RegExp(`href="([^"]*)"[^>]*>${label}<`).exec(html)?.[1];

describe("report tabs", () => {
  it("scroll sideways and keep ?mes= between the month views", () => {
    at("/relatorios/fluxo", "mes=2026-09&dia=2026-09-14");
    const html = renderToStaticMarkup(<ReportTabs />);
    expect(html).toContain('aria-label="Visões dos relatórios"');
    expect(html).toContain("overflow-x-auto");
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="page"[^>]*>Fluxo/);
    expect(hrefOf(html, "Calendário")).toBe(
      "/relatorios/calendario?mes=2026-09",
    );
    expect(hrefOf(html, "Visão geral")).toBe("/relatorios/visao-geral");
  });

  it("keep ?periodo= between the period views", () => {
    at("/relatorios/categorias", "periodo=3");
    const html = renderToStaticMarkup(<ReportTabs />);
    expect(hrefOf(html, "Patrimônio")).toBe("/relatorios/patrimonio?periodo=3");
    expect(hrefOf(html, "Visão geral")).toBe(
      "/relatorios/visao-geral?periodo=3",
    );
    expect(hrefOf(html, "Fluxo")).toBe("/relatorios/fluxo");
  });

  it("mark the current view before the query is known", () => {
    at("/relatorios/patrimonio");
    const html = renderToStaticMarkup(<ReportTabsFallback />);
    expect(html).toMatch(/aria-current="page"[^>]*>Patrimônio/);
    expect(hrefOf(html, "Categorias")).toBe("/relatorios/categorias");
  });
});

describe("report period filter", () => {
  it("shows the chips on the period views only", () => {
    at("/relatorios/fluxo");
    expect(renderToStaticMarkup(<ReportPeriodFilter />)).toBe("");
    at("/relatorios/calendario");
    expect(renderToStaticMarkup(<ReportPeriodFilter />)).toBe("");
    at("/relatorios/patrimonio", "periodo=6");
    const html = renderToStaticMarkup(<ReportPeriodFilter />);
    expect(html).toContain('aria-label="Período dos relatórios"');
    expect(html).toContain('href="/relatorios/patrimonio?periodo=3"');
    expect(html).toMatch(
      /aria-current="true"[^>]*><span aria-hidden="true">6M/,
    );
  });
});

describe("month switcher of the month views", () => {
  it("links the months of the view, today's without the query", () => {
    const html = renderToStaticMarkup(
      <ReportMonthSwitcher
        path="/relatorios/fluxo"
        month="2026-09"
        currentMonth="2026-10"
        start="2026-09-05"
        end="2026-10-04"
        showRange
      />,
    );
    expect(html).toContain('href="/relatorios/fluxo?mes=2026-08"');
    expect(html).toMatch(/href="\/relatorios\/fluxo"[^>]*>Voltar para hoje/);
    expect(html).toContain("5/set – 4/out");
  });
});

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

const currentReport: CashFlowReport = {
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

describe("CashFlowCard", () => {
  it("draws the realized line, the dashed projection and the biggest item", () => {
    const html = renderToStaticMarkup(
      <CashFlowCard report={currentReport} today="2026-10-14" />,
    );
    expect(html).toContain("Saldo dia a dia");
    expect(html).toContain("Realizado");
    expect(html).toContain("Previsto");
    expect(html).toContain("border-dashed");
    expect(html).toContain('stroke-dasharray="5 4"');
    expect(html).toContain("Aluguel");
    expect(html).toContain("qua, 14/out · hoje");
    expect(html).toContain('aria-label="Percorrer o saldo dia a dia"');
    expect(html).toContain("Ver como tabela");
  });

  it("shows a past month as one solid line, without markers", () => {
    const html = renderToStaticMarkup(
      <CashFlowCard
        report={{
          ...currentReport,
          phase: "past",
          days: octoberDays(null),
          lowestProjected: null,
        }}
        today="2026-11-20"
      />,
    );
    expect(html).not.toContain("stroke-dasharray");
    expect(html).not.toContain("Aluguel");
    expect(html).toContain("sáb, 31/out");
    expect(html).toContain("Saldo ");
  });
});

describe("ScheduledList", () => {
  const item = (day: number, label: string, overdue = false) => ({
    date: `2026-10-${String(day).padStart(2, "0")}`,
    label,
    amountCents: -10_000,
    kind: "entry" as const,
    overdue,
  });

  it("lists what moves the projection and flags the overdue", () => {
    const html = renderToStaticMarkup(
      <ScheduledList
        items={[item(14, "Conta de luz", true), item(15, "Aluguel")]}
        endLabel="31/out"
        statementHref="/extrato?status=pendente"
      />,
    );
    expect(html).toContain("Agendados até 31/out");
    expect(html).toContain("Atrasado");
    expect(html).toContain('href="/extrato?status=pendente"');
    expect(html).toContain("Ver agendados no extrato");
  });

  it("sends the rest to the statement", () => {
    const html = renderToStaticMarkup(
      <ScheduledList
        items={Array.from({ length: 7 }, (_, k) => item(15 + k, `Conta ${k}`))}
        endLabel="31/out"
        statementHref="/extrato?status=pendente"
      />,
    );
    expect(html).toContain("Ver os 7 agendados no extrato");
    expect(html).not.toContain("Conta 6");
  });

  it("says when nothing is scheduled", () => {
    const html = renderToStaticMarkup(
      <ScheduledList items={[]} endLabel="31/out" statementHref="/extrato" />,
    );
    expect(html).toContain("Nada agendado");
  });
});

describe("NetWorthReport", () => {
  const points: NetWorthBreakdownPoint[] = [
    {
      month: "2026-07",
      netCents: 1_000_000,
      assetsCents: 1_100_000,
      liabilitiesCents: 100_000,
    },
    {
      month: "2026-10",
      netCents: 1_200_000,
      assetsCents: 1_250_000,
      liabilitiesCents: 50_000,
    },
  ];

  it("shows net worth with a scrub, then assets and liabilities apart", () => {
    const html = renderToStaticMarkup(
      <NetWorthReport points={points} period={3} />,
    );
    expect(html).toContain("Patrimônio líquido");
    expect(html).toContain(">Ativos<");
    expect(html).toContain(">Passivos<");
    expect(html).toContain("em 3 meses");
    expect(html).toContain('aria-label="Percorrer o patrimônio mês a mês"');
    // Two small multiples, each an image of its own.
    expect(
      html.match(/role="img" aria-label="(Ativos|Passivos) /g),
    ).toHaveLength(2);
    expect(html).toContain('href="/contas"');
    expect(html.match(/Ver como tabela/g)).toHaveLength(3);
  });
});

describe("SpendingCalendar", () => {
  const days: DaySpending[] = Array.from({ length: 31 }, (_, k) => ({
    date: `2026-10-${String(k + 1).padStart(2, "0")}`,
    paidCents: k < 14 ? (k + 1) * 1_000 : 0,
    paidCount: k < 14 ? 1 : 0,
    pendingCents: k === 19 ? 11_990 : 0,
    pendingCount: k === 19 ? 1 : 0,
  }));

  it("selects the day in ?dia= and names every day", () => {
    const html = renderToStaticMarkup(
      <NuqsTestingAdapter searchParams="?dia=2026-10-12">
        <SpendingCalendar
          days={days}
          today="2026-10-14"
          monthTitle="outubro de 2026"
        />
      </NuqsTestingAdapter>,
    );
    expect(html).toContain("Gastos por dia");
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toMatch(
      /aria-label="12 de outubro: [^"]*"[^>]*aria-pressed="true"/,
    );
    expect(html).toContain("20 de outubro: 1 despesa agendada");
    expect(html).toContain("menos");
    expect(html).toContain("Ver como tabela");
  });

  it("ignores a day outside the month", () => {
    const html = renderToStaticMarkup(
      <NuqsTestingAdapter searchParams="?dia=2026-11-12">
        <SpendingCalendar
          days={days}
          today="2026-10-14"
          monthTitle="outubro de 2026"
        />
      </NuqsTestingAdapter>,
    );
    expect(html).not.toContain('aria-pressed="true"');
  });
});

describe("DayExpenses", () => {
  const entry = (
    id: string,
    description: string,
    amountCents: number,
    status: "paid" | "pending" = "paid",
  ): TransactionListItem => ({
    id,
    description,
    amountCents,
    kind: "expense",
    status,
    occurredOn: "2026-10-12",
    accountId: "a1",
    accountName: "Conta principal",
    accountType: "checking",
    categoryId: null,
    categoryName: "Mercado",
    categoryIcon: "shopping-cart",
    categoryColor: "cat-3",
    transferId: null,
    counterpartName: null,
    installment: null,
    recurring: false,
    recurrence: null,
    notes: null,
  });

  it("lists the day's expenses with their total and the way to the statement", () => {
    const html = renderToStaticMarkup(
      <DayExpenses
        date="2026-10-12"
        items={[
          entry("t1", "Supermercado", -6_450),
          entry("t2", "Padaria", -1_200),
          entry("t3", "Luz", -15_000, "pending"),
        ]}
        hasMore={false}
        today="2026-10-14"
        statementHref="/extrato?tipo=despesa"
      />,
    );
    expect(html).toContain("seg, 12 out");
    expect(html).toContain("em 2 despesas");
    expect(html).toContain("Supermercado");
    expect(html).toContain('href="/extrato?tipo=despesa"');
    expect(html).toContain("Ver no extrato");
    expect(html).toContain("group-has-data-pending:opacity-60");
  });

  it("says when the day had none, and how to pick one", () => {
    const html = renderToStaticMarkup(
      <DayExpenses
        date="2026-10-13"
        items={[]}
        hasMore={false}
        today="2026-10-14"
        statementHref="/extrato"
      />,
    );
    expect(html).toContain("Nenhuma despesa neste dia.");
    expect(renderToStaticMarkup(<DayExpensesHint />)).toContain(
      "Toque num dia",
    );
  });
});
