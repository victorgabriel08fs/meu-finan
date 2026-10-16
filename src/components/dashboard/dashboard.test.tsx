import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { BudgetPace } from "@/lib/finance/budget";
import type { AccountListItem } from "@/server/domain/accounts";
import type { UpcomingItem } from "@/server/domain/dashboard";
import type { GoalItem } from "@/server/domain/goals";
import { AccountsCarousel } from "./accounts-carousel";
import { BalanceHero } from "./balance-hero";
import { BudgetCard, BudgetInvite } from "./budget-card";
import { FirstRunChecklist } from "./first-run-checklist";
import { GoalsCard } from "./goals-card";
import { UpcomingBills } from "./upcoming-bills";

// Server Actions are not importable outside Next; the rows only need a function.
vi.mock("@/server/actions/transactions", () => ({ setPaidAction: vi.fn() }));

/**
 * Visible text without tags, the sr-only spoken amounts and the privacy-mode
 * masks ("R$ ••••") that <Money> also renders.
 */
const text = (html: string) =>
  html
    .replace(/<span class="sr-only">.*?<\/span>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/ /g, " ")
    .replace(/R\$\s?••••/g, "");

const pace = (overrides: Partial<BudgetPace> = {}): BudgetPace => ({
  totalDays: 31,
  elapsedDays: 14,
  remainingDays: 18,
  elapsedRatio: 14 / 31,
  expectedCents: 203_225,
  availableCents: 95_500,
  perDayCents: 5_305,
  status: "on_track",
  projectedCents: null,
  ...overrides,
});

describe("BalanceHero", () => {
  it("shows the balance, the month change and the forecast", () => {
    const html = renderToStaticMarkup(
      <BalanceHero
        balanceCents={2_767_015}
        monthChangeCents={124_010}
        monthName="outubro"
        forecast={{
          balanceCents: 2_767_015,
          pendingIncomeCents: 65_000,
          pendingExpenseCents: 226_480,
          invoicesDueCents: 138_042,
          forecastCents: 2_467_493,
        }}
        untilLabel="31/out"
      />,
    );
    const visible = text(html);
    expect(visible).toContain("Saldo em contas");
    expect(visible).toContain("+R$ 1.240,10");
    expect(visible).toContain("em outubro");
    expect(visible).toContain("Previsto para 31/out");
    expect(html).toContain('href="/contas"');
    expect(html).toContain('aria-label="Como calculamos o previsto"');
  });

  it("stays calm when nothing moved", () => {
    const html = renderToStaticMarkup(
      <BalanceHero
        balanceCents={0}
        monthChangeCents={0}
        monthName="outubro"
        forecast={{
          balanceCents: 0,
          pendingIncomeCents: 0,
          pendingExpenseCents: 0,
          invoicesDueCents: 0,
          forecastCents: 0,
        }}
        untilLabel="31/out"
      />,
    );
    expect(text(html)).toContain("Sem variação em outubro");
  });
});

describe("BudgetCard", () => {
  const items = ["over", "ahead", "on_track", "on_track"].map(
    (status, index) => ({
      id: `b${index}`,
      categoryId: `c${index}`,
      categoryName:
        ["Restaurantes", "Mercado", "Transporte", "Lazer"][index] ?? "",
      categoryIcon: "utensils",
      categoryColor: "cat-2",
      budgetCents: 40_000,
      spentCents: 41_000,
      scheduledCents: 0,
      pace: pace({ status: status as BudgetPace["status"] }),
    }),
  );

  it("shows spent of budget, the per-day pace and the 3 most urgent categories", () => {
    const html = renderToStaticMarkup(
      <BudgetCard
        total={{
          budgetCents: 450_000,
          spentCents: 144_500,
          scheduledCents: 210_000,
          pace: pace(),
        }}
        items={items}
        monthName="outubro"
        isCurrent
        endLabel="31/out"
        href="/planejar/orcamentos"
      />,
    );
    const visible = text(html);
    expect(visible).toContain("Orçamento de outubro");
    expect(visible).toContain("Pode gastar R$ 53,05 por dia até 31/out");
    expect(visible).toContain("Estourou");
    expect(visible).toContain("Acima do ritmo");
    expect(visible).toContain("Transporte");
    expect(visible).not.toContain("Lazer");
    expect(html).toContain('role="meter"');
    expect(html).toContain('href="/planejar/orcamentos"');
  });

  it("tells how a past month ended, without the today marker", () => {
    const html = renderToStaticMarkup(
      <BudgetCard
        total={{
          budgetCents: 450_000,
          spentCents: 470_000,
          scheduledCents: 0,
          pace: pace({ status: "over", remainingDays: 0, elapsedRatio: 1 }),
        }}
        items={[]}
        monthName="setembro"
        isCurrent={false}
        endLabel="30/set"
        href="/planejar/orcamentos?mes=2026-09"
      />,
    );
    const visible = text(html);
    expect(visible).toContain("Os gastos de setembro passaram R$ 200,00");
    expect(visible).not.toContain("Hoje");
  });

  it("invites to plan when there is no budget", () => {
    const html = renderToStaticMarkup(
      <BudgetInvite href="/planejar/orcamentos" />,
    );
    expect(text(html)).toContain("Planeje o mês");
  });
});

describe("UpcomingBills", () => {
  const bill = (overrides: Partial<UpcomingItem>): UpcomingItem => ({
    id: "t1",
    type: "transaction",
    title: "Aluguel",
    dueOn: "2026-10-15",
    amountCents: 210_000,
    overdue: false,
    icon: "house",
    color: "cat-1",
    accountName: "Conta principal",
    accountId: "a1",
    ...overrides,
  });

  it("puts overdue bills first and links invoices to their card", () => {
    const html = renderToStaticMarkup(
      <UpcomingBills
        today="2026-10-14"
        items={[
          bill({ id: "t2", title: "Internet", dueOn: "2026-10-20" }),
          bill({ id: "t1" }),
          bill({
            id: "i1",
            type: "invoice",
            title: "Fatura Cartão principal",
            dueOn: "2026-10-12",
            overdue: true,
            icon: "credit-card",
            accountId: "card-1",
          }),
        ]}
      />,
    );
    const visible = text(html);
    expect(visible.indexOf("Fatura Cartão principal")).toBeLessThan(
      visible.indexOf("Aluguel"),
    );
    expect(visible.indexOf("Aluguel")).toBeLessThan(
      visible.indexOf("Internet"),
    );
    expect(visible).toContain("Venceu há 2 dias");
    expect(visible).toContain("Vence amanhã");
    expect(visible).toContain("Vence 20/out · Conta principal");
    expect(html).toContain('href="/cartoes/card-1"');
    expect(html).toContain('aria-label="Pagar Aluguel"');
  });

  it("is reassuring when nothing is due", () => {
    const html = renderToStaticMarkup(
      <UpcomingBills today="2026-10-14" items={[]} />,
    );
    expect(text(html)).toContain("Nada vencendo nos próximos 7 dias.");
  });
});

describe("AccountsCarousel", () => {
  const account = (overrides: Partial<AccountListItem>): AccountListItem => ({
    id: "a1",
    name: "Conta principal",
    type: "checking",
    color: "cat-1",
    icon: "landmark",
    balanceCents: 892_015,
    pendingCents: 0,
    includeInNetWorth: true,
    archived: false,
    card: null,
    ...overrides,
  });

  it("links accounts to their screen, cards to the invoice, and ends with Adicionar conta", () => {
    const html = renderToStaticMarkup(
      <AccountsCarousel
        accounts={[
          account({}),
          account({
            id: "c1",
            name: "Cartão principal",
            type: "credit_card",
            icon: "credit-card",
            balanceCents: -138_042,
            card: { limitCents: 550_000, closingDay: 17, dueDay: 25 },
          }),
        ]}
      />,
    );
    const visible = text(html);
    expect(html).toContain('href="/contas/a1"');
    expect(html).toContain('href="/cartoes/c1"');
    expect(html).toContain('href="/contas/nova"');
    // Without the invoice, a card shows everything owed.
    expect(visible).toContain("Em aberto");
    expect(visible).toContain("R$ 1.380,42");
    expect(visible).toContain("Adicionar conta");
  });

  it("shows the current invoice of a card when it is known", () => {
    const html = renderToStaticMarkup(
      <AccountsCarousel
        accounts={[
          account({
            id: "c1",
            name: "Cartão principal",
            type: "credit_card",
            balanceCents: -138_042,
            card: { limitCents: 550_000, closingDay: 17, dueDay: 25 },
          }),
        ]}
        currentInvoiceCents={{ c1: 41_290 }}
      />,
    );
    const visible = text(html);
    expect(visible).toContain("Fatura atual");
    expect(visible).toContain("R$ 412,90");
    expect(visible).not.toContain("R$ 1.380,42");
  });
});

describe("GoalsCard", () => {
  const goal = (overrides: Partial<GoalItem>): GoalItem => ({
    id: "g1",
    name: "Reserva de emergência",
    icon: "piggy-bank",
    color: "cat-3",
    targetCents: 3_000_000,
    currentCents: 1_860_000,
    progress: 0.62,
    targetDate: null,
    monthlyPlanCents: 100_000,
    expectedRate: null,
    rateLabel: "sem rendimento",
    accountId: null,
    accountName: null,
    monthlyRate: 0,
    projection: {
      status: "on_track",
      eta: null,
      requiredMonthlyCents: null,
      slackMonths: null,
    },
    ...overrides,
  });

  it("shows at most two goals with ring and status", () => {
    const html = renderToStaticMarkup(
      <GoalsCard
        href="/planejar/metas"
        goals={[
          goal({}),
          goal({
            id: "g2",
            name: "Viagem",
            projection: {
              status: "behind",
              eta: null,
              requiredMonthlyCents: null,
              slackMonths: null,
            },
          }),
          goal({ id: "g3", name: "Carro" }),
        ]}
      />,
    );
    const visible = text(html);
    expect(visible).toContain("Reserva de emergência");
    expect(visible).toContain("No ritmo");
    expect(visible).toContain("Atrasada");
    expect(visible).not.toContain("Carro");
    expect(html).toContain('aria-label="Reserva de emergência: 62% concluído"');
  });
});

describe("FirstRunChecklist", () => {
  it("starts with the first account and explains why spending waits", () => {
    const html = renderToStaticMarkup(<FirstRunChecklist />);
    const visible = text(html);
    expect(visible).toContain("Comece por aqui");
    expect(visible).toContain("Disponível depois de criar uma conta.");
    expect(visible).toContain("Instalar o app");
    expect(html).toContain('href="/contas/nova"');
    expect(html).toContain('href="/planejar/orcamentos"');
  });
});
