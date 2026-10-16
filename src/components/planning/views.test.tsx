// Smoke renders of the Planejar screens (server render of the client views,
// with the Server Actions stubbed): they must render their key copy without
// throwing for the main states.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { BudgetPace } from "@/lib/finance";

vi.mock("server-only", () => ({}));
vi.mock("@/server/actions/planning", () => ({
  upsertBudgetAction: vi.fn(),
  deleteBudgetAction: vi.fn(),
  copyBudgetsAction: vi.fn(),
  createGoalAction: vi.fn(),
  updateGoalAction: vi.fn(),
  archiveGoalAction: vi.fn(),
}));

const market = {
  cdiAnnual: 0.1365,
  selicAnnual: 0.1375,
  ipcaAnnual: 0.045,
  source: "bcb" as const,
  asOf: "2026-10-13",
};

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

describe("Orçamentos", () => {
  it("shows the summary, the rows and the copy action", async () => {
    const { BudgetsView } = await import("./budgets/budgets-view");
    const html = renderToStaticMarkup(
      <BudgetsView
        month="2026-10"
        monthName="outubro"
        previousMonthName="setembro"
        timing="current"
        items={[
          {
            id: "b1",
            categoryId: "c1",
            categoryName: "Mercado",
            categoryIcon: "shopping-cart",
            categoryColor: "cat-3",
            budgetCents: 90_000,
            spentCents: 64_000,
            scheduledCents: 0,
            pace: pace({ status: "ahead", availableCents: 26_000 }),
          },
        ]}
        total={{
          budgetCents: 450_000,
          spentCents: 144_500,
          scheduledCents: 210_000,
          pace: pace(),
        }}
        unbudgeted={[]}
        averages={{}}
        copyable={2}
        suggestions={[]}
      />,
    );
    expect(html).toContain("Disponível em outubro");
    expect(html).toContain("por dia");
    expect(html).toContain("hoje é o dia 14 de 31");
    expect(html).toContain("Acima do ritmo");
    expect(html).toContain("Copiar de setembro");
  });

  it("offers the suggestion when there are no budgets", async () => {
    const { BudgetsView } = await import("./budgets/budgets-view");
    const html = renderToStaticMarkup(
      <BudgetsView
        month="2026-10"
        monthName="outubro"
        previousMonthName="setembro"
        timing="current"
        items={[]}
        total={null}
        unbudgeted={[]}
        averages={{}}
        copyable={0}
        suggestions={[
          {
            categoryId: "c1",
            name: "Mercado",
            icon: "shopping-cart",
            color: "cat-3",
            averageCents: 86_012,
            amountCents: 87_000,
          },
        ]}
      />,
    );
    expect(html).toContain("Planeje o mês");
    expect(html).toContain("Usar sugestão");
  });
});

describe("Metas", () => {
  it("shows the status pill, the projection and the plan action", async () => {
    const { GoalsView } = await import("./goals/goals-view");
    const html = renderToStaticMarkup(
      <GoalsView
        goals={[
          {
            id: "g1",
            name: "Viagem ao Japão",
            icon: "plane",
            color: "cat-1",
            targetCents: 2_500_000,
            currentCents: 950_000,
            progress: 0.38,
            targetDate: "2027-12-31",
            monthlyPlanCents: 80_000,
            expectedRate: { index: "cdi", pct: 1 },
            rateLabel: "100% do CDI",
            accountId: null,
            accountName: null,
            projection: {
              status: "behind",
              eta: { year: 2028, month: 2 },
              requiredMonthlyCents: 93_100,
              slackMonths: -2,
            },
          },
        ]}
        accounts={[]}
        market={market}
        today={{ year: 2026, month: 10 }}
      />,
    );
    expect(html).toContain("Guardado em metas");
    expect(html).toContain("Atrasada");
    expect(html).toContain("Para chegar em dez/2027");
    expect(html).toContain("Ajustar plano");
  });
});

describe("Simulador", () => {
  it("renders the default simulation", async () => {
    const { CompoundSimulator } = await import("./simulator/simulator");
    const html = renderToStaticMarkup(
      <CompoundSimulator market={market} today={{ year: 2026, month: 10 }} />,
    );
    expect(html).toContain("Em 10 anos você terá");
    expect(html).toContain("Líquido de IR");
    expect(html).toContain("Em valores de hoje");
    expect(html).toContain("Percorrer o gráfico ano a ano");
    expect(html).toContain("Não é recomendação de investimento");
  });
});
