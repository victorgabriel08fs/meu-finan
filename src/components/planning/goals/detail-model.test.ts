import { describe, expect, it } from "vitest";
import {
  addMonths,
  type GoalInput,
  isoMonth,
  projectGoal,
} from "@/lib/finance";
import { NBSP } from "@/lib/format/money";
import {
  chartSummary,
  contributionMessage,
  DEFAULT_PROJECTION_MONTHS,
  type GoalChartInput,
  type GoalHistoryMonth,
  goalChart,
  MAX_PROJECTION_MONTHS,
  pointDescription,
  pointTitle,
  projectionMonths,
  tableRows,
  xAxisLabels,
} from "./detail-model";

const today = { year: 2026, month: 10 };
const plain = (text: string) => text.replace(new RegExp(NBSP, "g"), " ");

/** The linked account's last 12 months (nov/2025 to out/2026), money in some. */
function history(
  contributions: Record<string, [contribution: number, balance: number]>,
): GoalHistoryMonth[] {
  return Array.from({ length: 12 }, (_, index) => {
    const month = isoMonth(addMonths({ year: 2025, month: 11 }, index));
    const [contributionCents, balanceCents] = contributions[month] ?? [0, 0];
    return { month, contributionCents, balanceCents };
  });
}

function input(
  patch: Partial<Omit<GoalChartInput, "projection">> & {
    targetMonth?: { year: number; month: number };
  } = {},
): GoalChartInput {
  const { targetMonth, ...rest } = patch;
  const base = {
    today,
    currentCents: 1_860_000,
    targetCents: 3_000_000,
    monthlyPlanCents: 100_000,
    monthlyRate: 0,
    deadline: targetMonth ?? null,
    history: [],
    linked: false,
    ...rest,
  };
  const goal: GoalInput = {
    currentCents: base.currentCents,
    targetCents: base.targetCents,
    monthlyCents: base.monthlyPlanCents,
    monthlyRate: base.monthlyRate,
    today,
    targetMonth: targetMonth,
  };
  return { ...base, projection: projectGoal(goal) };
}

describe("projectionMonths", () => {
  it("runs until the goal is reached", () => {
    // R$ 11.400 missing at R$ 1.000/mês: 11,4 → 12 months (out/2027).
    expect(projectionMonths(input())).toBe(12);
  });

  it("runs until a deadline still ahead when the goal is never reached", () => {
    expect(
      projectionMonths(
        input({ monthlyPlanCents: 0, targetMonth: { year: 2027, month: 4 } }),
      ),
    ).toBe(6);
  });

  it("shows a year without a plan or with a deadline already gone", () => {
    expect(projectionMonths(input({ monthlyPlanCents: 0 }))).toBe(
      DEFAULT_PROJECTION_MONTHS,
    );
    expect(
      projectionMonths(
        input({ monthlyPlanCents: 0, targetMonth: { year: 2026, month: 9 } }),
      ),
    ).toBe(DEFAULT_PROJECTION_MONTHS);
  });

  it("stops at fifty years", () => {
    // R$ 1/mês towards R$ 30.000: 1.140.000 months away.
    expect(projectionMonths(input({ monthlyPlanCents: 100 }))).toBe(
      MAX_PROJECTION_MONTHS,
    );
  });
});

describe("goalChart", () => {
  const linked = input({
    linked: true,
    history: history({
      "2026-05": [150_000, 1_560_000],
      "2026-07": [100_000, 1_660_000],
      "2026-09": [100_000, 1_760_000],
      "2026-10": [100_000, 1_860_000],
    }),
  });

  it("puts past contributions as dots before today, then the projection", () => {
    const model = goalChart(linked);
    const kinds = model.points.map((point) => point.kind);
    expect(kinds.slice(0, 4)).toEqual([
      "history",
      "history",
      "history",
      "today",
    ]);
    expect(kinds.slice(4).every((kind) => kind === "projection")).toBe(true);
    expect(model.points).toHaveLength(3 + 1 + 12);
    // The axis starts at the first contribution (mai/2026), 5 months ago.
    expect(model.points.slice(0, 4).map((point) => point.offset)).toEqual([
      0, 2, 4, 5,
    ]);
    expect(model.points[0]).toEqual({
      month: "2026-05",
      offset: 0,
      kind: "history",
      balanceCents: 1_560_000,
      contributionCents: 150_000,
    });
    expect(model.todayIndex).toBe(3);
    expect(model.span).toBe(17);
  });

  it("starts the projection at today's amount and reaches the target at the eta", () => {
    const model = goalChart(linked);
    const today = model.points[model.todayIndex];
    expect(today).toMatchObject({
      month: "2026-10",
      balanceCents: 1_860_000,
      contributionCents: 100_000,
    });
    expect(model.points[4]).toMatchObject({
      month: "2026-11",
      offset: 6,
      balanceCents: 1_960_000,
      contributionCents: 100_000,
    });
    const last = model.points.at(-1);
    expect(last).toMatchObject({ month: "2027-10", balanceCents: 3_060_000 });
    expect(model.reachedIndex).toBe(model.points.length - 1);
    expect(model.maxCents).toBe(3_060_000);
    expect(model.deadlineOffset).toBeNull();
  });

  it("compounds the expected rate through the finance engine, in whole reais", () => {
    const model = goalChart(
      input({
        currentCents: 1_000_000,
        monthlyPlanCents: 0,
        monthlyRate: 0.01,
      }),
    );
    // R$ 10.000 at 1% a.m.: R$ 10.100 after one month, R$ 11.268,25 after 12.
    expect(model.points[1]?.balanceCents).toBe(1_010_000);
    expect(model.points[12]?.balanceCents).toBe(1_126_800);
  });

  it("has no history without a linked account", () => {
    const model = goalChart(input());
    expect(model.todayIndex).toBe(0);
    expect(model.points[0]).toMatchObject({
      kind: "today",
      offset: 0,
      contributionCents: null,
    });
    expect(model.span).toBe(12);
  });

  it("ignores the current month and empty months in the dots", () => {
    const model = goalChart(
      input({
        linked: true,
        history: history({ "2026-10": [300_000, 1_860_000] }),
      }),
    );
    expect(model.todayIndex).toBe(0);
    expect(model.points[0]?.contributionCents).toBe(300_000);
  });

  it("marks a deadline inside the axis and leaves one beyond it out", () => {
    // Behind: reaches out/2027, after a jun/2027 deadline.
    const behind = goalChart(input({ targetMonth: { year: 2027, month: 6 } }));
    expect(behind.deadlineOffset).toBe(8);
    expect(behind.reachedIndex).toBe(behind.points.length - 1);
    // Ahead: reached in out/2027, well before jun/2028.
    const ahead = goalChart(input({ targetMonth: { year: 2028, month: 6 } }));
    expect(ahead.deadlineOffset).toBeNull();
  });

  it("runs to the deadline, below the target, without a plan", () => {
    const model = goalChart(
      input({ monthlyPlanCents: 0, targetMonth: { year: 2027, month: 4 } }),
    );
    expect(model.span).toBe(6);
    expect(model.deadlineOffset).toBe(6);
    expect(model.reachedIndex).toBeNull();
    expect(model.points.at(-1)).toMatchObject({
      balanceCents: 1_860_000,
      contributionCents: null,
    });
    expect(model.maxCents).toBe(3_000_000);
  });

  it("does not reach the target on a capped axis", () => {
    const model = goalChart(input({ monthlyPlanCents: 100 }));
    expect(model.span).toBe(MAX_PROJECTION_MONTHS);
    expect(model.reachedIndex).toBeNull();
  });
});

describe("tableRows", () => {
  it("lists the projection month by month up to two years", () => {
    const model = goalChart(input());
    expect(tableRows(model)).toHaveLength(1 + 12);
  });

  it("goes year by year beyond that, ending on the last month", () => {
    // R$ 26.400 missing at R$ 1.000/mês: 27 months.
    const model = goalChart(input({ currentCents: 360_000 }));
    expect(model.span).toBe(27);
    const rows = tableRows(model);
    expect(rows.map((row) => row.month)).toEqual([
      "2026-10",
      "2027-10",
      "2028-10",
      "2029-01",
    ]);
  });
});

describe("xAxisLabels", () => {
  it("labels the first month, today and the last month", () => {
    const model = goalChart(
      input({
        linked: true,
        history: history({ "2026-05": [150_000, 1_560_000] }),
      }),
    );
    expect(xAxisLabels(model)).toEqual([
      { position: 0, label: "mai/26" },
      { position: 5 / 17, label: "hoje" },
      { position: 1, label: "out/27" },
    ]);
  });

  it("drops a label that would collide, keeping today", () => {
    const model = goalChart(
      input({
        currentCents: 0,
        linked: true,
        history: history({ "2026-09": [10_000, 10_000] }),
      }),
    );
    // 1 month of history against 30 of projection.
    expect(model.span).toBe(31);
    expect(xAxisLabels(model).map((label) => label.label)).toEqual([
      "hoje",
      "abr/29",
    ]);
  });

  it("starts at today without history", () => {
    expect(xAxisLabels(goalChart(input()))).toEqual([
      { position: 0, label: "hoje" },
      { position: 1, label: "out/27" },
    ]);
  });
});

describe("texts", () => {
  const model = goalChart(
    input({
      linked: true,
      history: history({
        "2026-05": [150_000, 1_560_000],
        "2026-10": [100_000, 1_860_000],
      }),
    }),
  );

  it("titles and describes a point, without amounts in privacy mode", () => {
    const [first, today] = model.points;
    if (!first || !today) throw new Error("points");
    expect(pointTitle(first)).toBe("mai/2026");
    expect(pointTitle(today)).toBe("Hoje");
    expect(pointDescription(first, false)).toBe(
      "maio de 2026: aportes de 1.500 reais, saldo de 15.600 reais",
    );
    expect(pointDescription(today, false)).toBe(
      "Hoje: saldo de 18.600 reais, aportes de 1.000 reais neste mês",
    );
    const unlinked = goalChart(input()).points[0];
    if (!unlinked) throw new Error("today");
    expect(pointDescription(unlinked, false)).toBe(
      "Hoje: saldo de 18.600 reais",
    );
    const last = model.points.at(-1);
    if (!last) throw new Error("last point");
    expect(pointDescription(last, false)).toBe(
      "outubro de 2027, projeção: saldo de 30.600 reais",
    );
    expect(pointDescription(first, true)).toBe(
      "maio de 2026: aportes de valor oculto, saldo de valor oculto",
    );
  });

  it("summarises the chart", () => {
    expect(chartSummary(model, false)).toBe(
      "Hoje, 18.600 reais guardados. No ritmo atual, 30.600 reais em outubro de 2027, quando a meta de 30.000 reais é atingida. Houve aportes em 2 meses do último ano.",
    );
    const once = goalChart(
      input({
        linked: true,
        history: history({ "2026-05": [150_000, 1_560_000] }),
      }),
    );
    expect(chartSummary(once, false)).toContain(
      "Houve aporte em 1 mês do último ano.",
    );
    const short = goalChart(
      input({ monthlyPlanCents: 0, targetMonth: { year: 2027, month: 4 } }),
    );
    expect(chartSummary(short, true)).toBe(
      "Hoje, valor oculto guardados. No ritmo atual, valor oculto em abril de 2027, abaixo da meta de valor oculto.",
    );
  });

  it("words the toast after a contribution", () => {
    const message = (
      outcome: Parameters<typeof contributionMessage>[0]["outcome"],
    ) =>
      plain(
        contributionMessage({
          outcome,
          amountCents: 50_000,
          goalName: "Viagem",
          occurredOn: "2026-10-20",
        }),
      );
    expect(
      message({ kind: "transfer", scheduled: false, achieved: false }),
    ).toBe("Aporte de R$ 500,00 registrado");
    expect(
      message({ kind: "transfer", scheduled: true, achieved: false }),
    ).toBe("Aporte de R$ 500,00 agendado para 20/out");
    expect(message({ kind: "saved", achieved: false })).toBe(
      "Aporte de R$ 500,00 somado ao valor guardado",
    );
    expect(message({ kind: "saved", achieved: true })).toBe(
      "Você atingiu a meta Viagem. Que tal a próxima?",
    );
  });
});
