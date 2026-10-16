import { describe, expect, it } from "vitest";
import {
  annualToMonthly,
  budgetPace,
  type CardCycle,
  futureValue,
  installmentSchedule,
  invoiceFor,
  iso,
  isoMonth,
  monthlyToAnnual,
  occurrencesBetween,
  parse,
  periodContaining,
  periodsToReach,
  projectGoal,
  requiredPayment,
  simulate,
  solveMonthly,
  solveMonths,
  splitInstallments,
  toAnnualRate,
  toMonthlyRate,
} from "./index";

/**
 * Doc 03 §13.1, one test per row of the table (plus the worked examples of
 * §2.1 and §11). Values are compared at the precision the doc prints.
 */

const D = parse;
const round2 = (value: number) => Math.round(value * 100) / 100;

const CDI = 0.1365;
const cdi100 = toMonthlyRate({ kind: "cdi", pct: 1, cdiAnnual: CDI });
const cdi102 = toMonthlyRate({ kind: "cdi", pct: 1.02, cdiAnnual: CDI });
const today = D("2026-10-14");
const october = periodContaining(today, 1);

describe("doc 03 §13.1 golden cases", () => {
  it("valor futuro simples: PV 1.000 · 1% a.m. · 12 meses = 1.126,83", () => {
    expect(round2(futureValue(1000, 0, 0.01, 12))).toBe(1126.83);
  });

  it("aportes no fim: PMT 100 · 1% a.m. · 12 meses = 1.268,25", () => {
    expect(round2(futureValue(0, 100, 0.01, 12))).toBe(1268.25);
    expect(round2(futureValue(0, 100, 0.01, 12, "end"))).toBe(1268.25);
  });

  it("aportes no início: PMT 100 · 1% a.m. · 12 meses = 1.280,93", () => {
    expect(round2(futureValue(0, 100, 0.01, 12, "start"))).toBe(1280.93);
  });

  it("conversão: 12% a.a. = 0,948879% a.m.", () => {
    expect((annualToMonthly(0.12) * 100).toFixed(6)).toBe("0.948879");
    expect(monthlyToAnnual(annualToMonthly(0.12))).toBeCloseTo(0.12, 14);
  });

  it("% do CDI: 102% de CDI 13,65% a.a. = 13,9411% a.a. (não 1,02 × 13,65%)", () => {
    const rate = { kind: "cdi", pct: 1.02, cdiAnnual: CDI } as const;
    expect((toAnnualRate(rate) * 100).toFixed(4)).toBe("13.9411");
    expect((monthlyToAnnual(toMonthlyRate(rate)) * 100).toFixed(4)).toBe(
      "13.9411",
    );
    expect((1.02 * CDI * 100).toFixed(4)).toBe("13.9230");
  });

  it("simulação padrão: 10.000 + 1.000/mês · 12% a.a. · 120 meses · IR · IPCA 4,5%", () => {
    const result = simulate({
      initial: 10_000,
      monthly: 1000,
      months: 120,
      rate: { kind: "annual", value: 0.12 },
      tax: "regressive",
      inflationAnnual: 0.045,
    });
    expect(round2(result.final.gross)).toBe(252_988.52);
    expect(round2(result.final.tax)).toBe(18_538.31);
    expect(round2(result.final.net)).toBe(234_450.21);
    expect(round2(result.final.netReal)).toBe(150_968.98);
    expect(result.crossoverMonth).toBe(65);
    expect(result.final.invested).toBe(130_000);
    expect(result.series).toHaveLength(121);
  });

  it("aporte necessário: alvo 25.000 · PV 9.500 · 100% do CDI · 14 meses = 930,22 (fórmula = solver)", () => {
    expect(round2(requiredPayment(25_000, 9500, cdi100, 14))).toBe(930.22);
    expect(
      solveMonthly(
        25_000,
        {
          initial: 9500,
          months: 14,
          rate: { kind: "cdi", pct: 1, cdiAnnual: CDI },
        },
        "gross",
      ),
    ).toBe(930.22);
  });

  it("prazo: alvo 30.000 · PV 18.600 · PMT 1.000 · 102% do CDI = 9,06 → 10 meses (fórmula = solver)", () => {
    const months = periodsToReach(30_000, 18_600, 1000, cdi102);
    expect(months?.toFixed(2)).toBe("9.06");
    expect(Math.ceil(months ?? Number.NaN)).toBe(10);
    expect(
      solveMonths(
        30_000,
        {
          initial: 18_600,
          monthly: 1000,
          rate: { kind: "cdi", pct: 1.02, cdiAnnual: CDI },
        },
        "gross",
      ),
    ).toBe(10);
  });

  it("aporte com IR: alvo líquido 100.000 · 60 meses · 12% a.a. · IR regressivo = 1.295,34", () => {
    const base = {
      initial: 0,
      months: 60,
      rate: { kind: "annual", value: 0.12 },
      tax: "regressive",
    } as const;
    const monthly = solveMonthly(100_000, base, "net");
    expect(monthly).toBe(1295.34);
    const net = (pmt: number) => simulate({ ...base, monthly: pmt }).final.net;
    expect(net(1295.34)).toBeGreaterThanOrEqual(100_000);
    expect(net(1295.33)).toBeLessThan(100_000);
  });

  it("parcelas: R$ 100,00 em 3x = [33,34; 33,33; 33,33]", () => {
    expect(splitInstallments(10_000, 3)).toEqual([3334, 3333, 3333]);
  });

  describe("fatura", () => {
    const dates = (purchase: string, card: CardCycle) => {
      const invoice = invoiceFor(D(purchase), card);
      return {
        closing: iso(invoice.closingDate),
        due: iso(invoice.dueDate),
        reference: isoMonth(invoice.referenceMonth),
      };
    };

    it("fecha 17, vence 25: compras 14/out · 17/out · 31/out · 20/dez/26", () => {
      const card = { closingDay: 17, dueDay: 25 };
      expect(dates("2026-10-14", card)).toEqual({
        closing: "2026-10-17",
        due: "2026-10-25",
        reference: "2026-10",
      });
      expect(dates("2026-10-17", card).due).toBe("2026-11-25");
      expect(dates("2026-10-31", card).due).toBe("2026-11-25");
      expect(dates("2026-12-20", card)).toEqual({
        closing: "2027-01-17",
        due: "2027-01-25",
        reference: "2027-01",
      });
    });

    it("fecha 28, vence 5: compras 10/out · 28/out/26", () => {
      const card = { closingDay: 28, dueDay: 5 };
      expect(dates("2026-10-10", card)).toEqual({
        closing: "2026-10-28",
        due: "2026-11-05",
        reference: "2026-11",
      });
      expect(dates("2026-10-28", card)).toEqual({
        closing: "2026-11-28",
        due: "2026-12-05",
        reference: "2026-12",
      });
    });

    it("fecha 31, vence 10: compras 15/fev · 28/fev/26", () => {
      const card = { closingDay: 31, dueDay: 10 };
      expect(dates("2026-02-15", card)).toEqual({
        closing: "2026-02-28",
        due: "2026-03-10",
        reference: "2026-03",
      });
      expect(dates("2026-02-28", card)).toEqual({
        closing: "2026-03-31",
        due: "2026-04-10",
        reference: "2026-04",
      });
    });
  });

  it("parcelas em fim de mês: 31/jan/27 em 3x (fecha 17) → 31/jan · 28/fev · 31/mar; faturas fev · mar · abr", () => {
    const schedule = installmentSchedule(D("2027-01-31"), 30_000, 3, {
      closingDay: 17,
      dueDay: 25,
    });
    expect(schedule.map((item) => iso(item.occurredOn))).toEqual([
      "2027-01-31",
      "2027-02-28",
      "2027-03-31",
    ]);
    expect(
      schedule.map((item) => item.invoiceMonth && isoMonth(item.invoiceMonth)),
    ).toEqual(["2027-02", "2027-03", "2027-04"]);
  });

  it("recorrência mensal dia 31, jan–abr/26 → 31/jan · 28/fev · 31/mar · 30/abr", () => {
    const dates = occurrencesBetween(
      { freq: "monthly", interval: 1, start: D("2026-01-31") },
      D("2026-01-01"),
      D("2026-04-30"),
    );
    expect(dates.map(iso)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  it("recorrência anual 29/fev, 2024–2028 → 28/fev nos anos comuns", () => {
    const dates = occurrencesBetween(
      { freq: "yearly", interval: 1, start: D("2024-02-29") },
      D("2024-01-01"),
      D("2028-12-31"),
    );
    expect(dates.map(iso)).toEqual([
      "2024-02-29",
      "2025-02-28",
      "2026-02-28",
      "2027-02-28",
      "2028-02-29",
    ]);
  });

  it("recorrência quinzenal: início 02/out/26, janela 10/out–15/nov → 16/out · 30/out · 13/nov", () => {
    const dates = occurrencesBetween(
      { freq: "weekly", interval: 2, start: D("2026-10-02") },
      D("2026-10-10"),
      D("2026-11-15"),
    );
    expect(dates.map(iso)).toEqual(["2026-10-16", "2026-10-30", "2026-11-13"]);
  });

  it("mês financeiro (início dia 5): 04/out/26 → 05/set/26 – 04/out/26", () => {
    const period = periodContaining(D("2026-10-04"), 5);
    expect(iso(period.start)).toBe("2026-09-05");
    expect(iso(period.end)).toBe("2026-10-04");
    expect(period.label).toEqual({ year: 2026, month: 9 });
  });

  it("orçamento: 4.500 · gasto 1.445 · agendado 2.100 · 14/out → R$ 53,05/dia, 18 dias restantes", () => {
    const pace = budgetPace({
      budgetCents: 450_000,
      spentCents: 144_500,
      scheduledCents: 210_000,
      period: october,
      today,
    });
    expect(pace.availableCents).toBe(95_500);
    expect(pace.perDayCents).toBe(5305);
    expect(pace.remainingDays).toBe(18);
    expect(pace.elapsedDays).toBe(14);
    expect(pace.totalDays).toBe(31);
    expect(Math.floor(pace.elapsedRatio * 100)).toBe(45);
  });

  it("estados de orçamento: Mercado · Restaurantes · Transporte · Moradia", () => {
    const status = (budget: number, spent: number, scheduled = 0) =>
      budgetPace({
        budgetCents: budget * 100,
        spentCents: spent * 100,
        scheduledCents: scheduled * 100,
        period: october,
        today,
      }).status;
    expect(status(900, 640)).toBe("ahead");
    expect(status(400, 410)).toBe("over");
    expect(status(450, 180)).toBe("on_track");
    expect(status(2100, 0, 2100)).toBe("scheduled");
  });

  describe("metas (hoje: out/2026)", () => {
    const month = { year: 2026, month: 10 };

    it("Reserva 18.600 → 30.000, 1.000/mês, 102% CDI: ago/2027 no ritmo", () => {
      const goal = projectGoal({
        currentCents: 1_860_000,
        targetCents: 3_000_000,
        monthlyCents: 100_000,
        monthlyRate: cdi102,
        today: month,
      });
      expect(goal.status).toBe("on_track");
      expect(goal.eta).toEqual({ year: 2027, month: 8 });
    });

    it("Japão 9.500 → 25.000 até dez/27, 800/mês, 100% CDI: fev/2028 atrasada, precisa R$ 931/mês", () => {
      const goal = projectGoal({
        currentCents: 950_000,
        targetCents: 2_500_000,
        monthlyCents: 80_000,
        monthlyRate: cdi100,
        today: month,
        targetMonth: { year: 2027, month: 12 },
      });
      expect(goal.status).toBe("behind");
      expect(goal.eta).toEqual({ year: 2028, month: 2 });
      expect(goal.requiredMonthlyCents).toBe(93_100);
      expect(goal.slackMonths).toBe(-2);
    });

    it("Carro 4.200 → 40.000 até dez/29, 900/mês, IPCA + 6% (IPCA 4,5%): ago/2029 adiantada", () => {
      const goal = projectGoal({
        currentCents: 420_000,
        targetCents: 4_000_000,
        monthlyCents: 90_000,
        monthlyRate: toMonthlyRate({
          kind: "ipca",
          spread: 0.06,
          ipcaAnnual: 0.045,
        }),
        today: month,
        targetMonth: { year: 2029, month: 12 },
      });
      expect(goal.status).toBe("ahead");
      expect(goal.eta).toEqual({ year: 2029, month: 8 });
      expect(goal.slackMonths).toBe(4);
    });
  });
});
