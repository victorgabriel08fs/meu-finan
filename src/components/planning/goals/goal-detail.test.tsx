// Server render of the goal detail (the client view, with the Server Actions
// and the app router stubbed): key copy, links and the chart for the main
// states. The sheets open in a portal, so they are not part of this render.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { projectGoal } from "@/lib/finance";
import type { GoalHistoryMonth } from "./detail-model";
import type { GoalDetailData } from "./goal-detail";

vi.mock("server-only", () => ({}));
vi.mock("@/server/actions/planning", () => ({
  createGoalAction: vi.fn(),
  updateGoalAction: vi.fn(),
  archiveGoalAction: vi.fn(),
  contributeToGoalAction: vi.fn(),
  undoGoalContributionAction: vi.fn(),
}));
vi.mock("@/server/actions/transactions", () => ({
  discardCreatedAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const today = { year: 2026, month: 10 };
const market = {
  cdiAnnual: 0.1365,
  selicAnnual: 0.1375,
  ipcaAnnual: 0.045,
  source: "bcb" as const,
  asOf: "2026-10-13",
};

/** Visible text: no tags, no sr-only spoken amounts, no privacy masks. */
const text = (html: string) =>
  html
    .replace(/<span class="sr-only">.*?<\/span>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/ /g, " ")
    .replace(/R\$\s?••••/g, "");

function goal(patch: Partial<GoalDetailData> = {}): GoalDetailData {
  const base = {
    id: "0192f1a2-7c3e-7b1a-9d2e-5f6a7b8c9d0e",
    name: "Reserva de emergência",
    icon: "piggy-bank",
    color: "cat-3",
    targetCents: 3_000_000,
    currentCents: 1_860_000,
    targetDate: "2027-06-30",
    monthlyPlanCents: 100_000,
    expectedRate: { index: "cdi" as const, pct: 1 },
    rateLabel: "100% do CDI",
    accountId: "0192f1a2-7c3e-7b1a-9d2e-5f6a7b8c9d0f",
    accountName: "Reserva",
    monthlyRate: 0,
    linked: true,
    ...patch,
  };
  return {
    ...base,
    progress: Math.min(1, base.currentCents / base.targetCents),
    projection: projectGoal({
      currentCents: base.currentCents,
      targetCents: base.targetCents,
      monthlyCents: base.monthlyPlanCents,
      monthlyRate: base.monthlyRate,
      today,
      targetMonth: base.targetDate
        ? {
            year: Number(base.targetDate.slice(0, 4)),
            month: Number(base.targetDate.slice(5, 7)),
          }
        : undefined,
    }),
  };
}

const history: GoalHistoryMonth[] = [
  { month: "2026-08", contributionCents: 150_000, balanceCents: 1_660_000 },
  { month: "2026-09", contributionCents: 100_000, balanceCents: 1_760_000 },
  { month: "2026-10", contributionCents: 100_000, balanceCents: 1_860_000 },
];

async function render(data: GoalDetailData, months = history) {
  const { GoalDetailView } = await import("./goal-detail");
  return renderToStaticMarkup(
    <GoalDetailView
      goal={data}
      history={months}
      accounts={[
        { id: "a1", name: "Conta principal", balanceCents: 500_000 },
        {
          id: data.accountId ?? "a2",
          name: "Reserva",
          balanceCents: 1_860_000,
        },
      ]}
      sources={[
        {
          id: "a1",
          name: "Conta principal",
          icon: "landmark",
          color: "cat-1",
          balanceCents: 500_000,
        },
      ]}
      market={market}
      today={today}
      todayIso="2026-10-14"
    />,
  );
}

describe("GoalDetailView", () => {
  it("shows the progress, the plan and the projection of a linked goal", async () => {
    const html = await render(goal());
    const visible = text(html);
    expect(visible).toContain("Reserva de emergência");
    expect(visible).toContain("Guardado");
    expect(visible).toContain("Atrasada");
    expect(visible).toContain("Para chegar em jun/2027, aporte");
    expect(visible).toContain("Aportar");
    expect(visible).toContain("Projeção");
    expect(visible).toContain("Aportes");
    expect(visible).toContain("Ver como tabela");
    expect(visible).toContain("Falta juntar");
    expect(visible).toContain("Para cumprir o prazo");
    expect(visible).toContain("Ajustar plano");
    expect(visible).toContain("Projeções em valores brutos, antes do IR");
    expect(html).toContain('aria-label="Reserva de emergência: 62% concluído"');
    // Back to the list, the linked account, header actions with names.
    expect(html).toContain('href="/planejar/metas"');
    expect(html).toContain(
      'href="/contas/0192f1a2-7c3e-7b1a-9d2e-5f6a7b8c9d0f"',
    );
    expect(html).toContain('aria-label="Editar meta"');
    expect(html).toContain('aria-label="Arquivar meta"');
    // The chart scrubs with a range input that speaks the selected point.
    expect(html).toContain('type="range"');
    expect(html).toContain('aria-label="Percorrer a projeção mês a mês"');
    expect(html).toMatch(/aria-valuetext="[^"]+, projeção: saldo de/);
  });

  it("hides the amounts of the projection sentence in privacy mode", async () => {
    const html = await render(goal());
    // "aporte R$ 1.425/mês": the amount sits in a value/mask pair.
    expect(html).toMatch(
      /<span data-privacy-value="">R\$\s1\.425<\/span><span data-privacy-mask=""/,
    );
  });

  it("explains a goal without a linked account", async () => {
    const html = await render(
      goal({
        accountId: null,
        accountName: null,
        linked: false,
        targetDate: null,
        expectedRate: null,
        rateLabel: "sem rendimento",
      }),
      [],
    );
    const visible = text(html);
    expect(visible).toContain("Sem conta vinculada");
    expect(visible).toContain("Valor informado por você.");
    expect(visible).toContain("Sem rendimento");
    expect(visible).toContain("No ritmo atual, você chega lá em");
    expect(visible).not.toContain("Aportes");
    expect(visible).not.toContain("com CDI");
  });

  it("shows a calm success state once the goal is reached", async () => {
    const html = await render(goal({ currentCents: 3_100_000 }));
    const visible = text(html);
    expect(visible).toContain("Concluída");
    expect(visible).toContain("Meta atingida");
    expect(visible).toContain(
      "Você atingiu a meta Reserva de emergência. Que tal a próxima?",
    );
    expect(visible).toContain("Criar meta");
    expect(visible).toContain("Aportar");
    expect(visible).not.toContain("Projeção");
    expect(visible).not.toContain("Falta juntar");
    expect(html).not.toContain('type="range"');
  });
});
