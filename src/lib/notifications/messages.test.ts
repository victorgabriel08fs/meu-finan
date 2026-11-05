import { describe, expect, it } from "vitest";
import {
  type BillReminderItem,
  billsDueMessage,
  comparisonText,
  type DailySummaryInput,
  dailySummaryMessage,
  dayWord,
  type IncomeCountdownInput,
  incomeCountdownMessage,
  joinNames,
  type MonthlySummaryInput,
  monthlySummaryMessage,
  type ReminderMessage,
  type WeeklySummaryInput,
  weeklySummaryMessage,
} from "./messages";

// Monday, 09/nov/2026.
const TODAY = "2026-11-09";
const WITH = { showAmounts: true, todayIso: TODAY };
const WITHOUT = { showAmounts: false, todayIso: TODAY };

/** formatBRL keeps a no-break space after "R$"; plain spaces read better here. */
const plain = (message: ReminderMessage | null) =>
  message && {
    title: message.title.replaceAll(" ", " "),
    body: message.body.replaceAll(" ", " "),
  };

/** Without amounts, nothing may carry money. */
const expectNoAmounts = (message: ReminderMessage | null) => {
  expect(message).not.toBeNull();
  expect(`${message?.title} ${message?.body}`).not.toMatch(/R\$/);
};

describe("helpers", () => {
  it("joins names, cutting past the limit", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["A"])).toBe("A");
    expect(joinNames(["A", "B"])).toBe("A e B");
    expect(joinNames(["A", "B", "C"])).toBe("A, B e C");
    expect(joinNames(["A", "B", "C"], 2)).toBe("A, B e mais 1");
    expect(joinNames(["A", "B", "C", "D", "E", "F"], 4)).toBe(
      "A, B, C, D e mais 2",
    );
    expect(joinNames(["A", "B"], 2)).toBe("A e B");
  });

  it("names the days, relative up to 6 days away (doc 02 §10.1)", () => {
    expect([0, 1, -1, 3, -6].map((days) => dayWord(days))).toEqual([
      "hoje",
      "amanhã",
      "ontem",
      "em 3 dias",
      "há 6 dias",
    ]);
    expect(dayWord(-6, "2026-11-03")).toBe("há 6 dias");
    expect(dayWord(-7, "2026-11-02")).toBe("em 2/nov");
  });

  it("compares with the average from 5% on", () => {
    const at = (ratio: number) => comparisonText({ averageCents: 1, ratio });
    expect(at(-0.18)).toBe("18% abaixo da sua média");
    expect(at(0.071)).toBe("7% acima da sua média");
    expect(at(-0.05)).toBe("5% abaixo da sua média");
    expect(at(0.049)).toBe("perto da sua média");
    expect(at(-0.03)).toBe("perto da sua média");
  });
});

describe("Resumo do dia", () => {
  const input: DailySummaryInput = {
    hasLiquidAccount: true,
    balanceCents: 423_015,
    dueToday: [{ title: "Internet", amountCents: 9990 }],
    budget: { status: "on_track", perDayCents: 5305 },
    yesterdayExpenseCents: 12_000,
  };

  it("with amounts", () => {
    expect(plain(dailySummaryMessage(input, WITH))).toEqual({
      title: "Resumo do dia",
      body: "Saldo em contas: R$ 4.230,15. Vence hoje: Internet (R$ 99,90). Dá para gastar R$ 53,05 hoje. Ontem saíram R$ 120,00.",
    });
  });

  it("without amounts", () => {
    const message = dailySummaryMessage(input, WITHOUT);
    expectNoAmounts(message);
    expect(message).toEqual({
      title: "Resumo do dia",
      body: "Vence hoje: Internet. Gastos no ritmo do orçamento. Toque para ver o saldo.",
    });
  });

  it("nothing due, several due", () => {
    const nothing = { ...input, dueToday: [] };
    expect(dailySummaryMessage(nothing, WITHOUT)?.body).toBe(
      "Nada vence hoje. Gastos no ritmo do orçamento. Toque para ver o saldo.",
    );
    const several = {
      ...input,
      dueToday: [
        { title: "Internet", amountCents: 9990 },
        { title: "Aluguel", amountCents: 210_000 },
        { title: "Luz", amountCents: 18_980 },
      ],
    };
    expect(plain(dailySummaryMessage(several, WITH))?.body).toContain(
      "Vencem hoje: Internet, Aluguel e mais 1 (R$ 2.389,70).",
    );
    expect(dailySummaryMessage(several, WITHOUT)?.body).toContain(
      "Vencem hoje: Internet, Aluguel e mais 1.",
    );
  });

  it("the budget's pace", () => {
    const at = (status: "ahead" | "over" | "scheduled", perDayCents = 0) =>
      ({ ...input, budget: { status, perDayCents } }) as DailySummaryInput;
    expect(dailySummaryMessage(at("ahead", 100), WITHOUT)?.body).toContain(
      "Gastos acima do ritmo do orçamento.",
    );
    // Used up: the same words with and without amounts.
    expect(dailySummaryMessage(at("over"), WITHOUT)?.body).toContain(
      "O orçamento do mês já foi todo usado.",
    );
    expect(dailySummaryMessage(at("ahead", 0), WITHOUT)?.body).toContain(
      "O orçamento do mês já foi todo usado.",
    );
    expect(dailySummaryMessage(at("scheduled", 100), WITHOUT)?.body).toContain(
      "Gastos no ritmo do orçamento.",
    );
    expect(dailySummaryMessage(at("over"), WITH)?.body).toContain(
      "O orçamento do mês já foi todo usado.",
    );
    expect(dailySummaryMessage(at("ahead", 0), WITH)?.body).toContain(
      "O orçamento do mês já foi todo usado.",
    );
  });

  it("without budgets or spending yesterday, those sentences go", () => {
    const bare = { ...input, budget: null, yesterdayExpenseCents: 0 };
    expect(plain(dailySummaryMessage(bare, WITH))?.body).toBe(
      "Saldo em contas: R$ 4.230,15. Vence hoje: Internet (R$ 99,90).",
    );
    expect(dailySummaryMessage(bare, WITHOUT)?.body).toBe(
      "Vence hoje: Internet. Toque para ver o saldo.",
    );
  });

  it("a negative balance keeps its sign", () => {
    expect(
      plain(dailySummaryMessage({ ...input, balanceCents: -5000 }, WITH))?.body,
    ).toMatch(/^Saldo em contas: −R\$ 50,00\./);
  });

  it("nothing without an account in the Saldo", () => {
    expect(
      dailySummaryMessage({ ...input, hasLiquidAccount: false }, WITH),
    ).toBeNull();
  });
});

describe("Contas a vencer", () => {
  const rent: BillReminderItem = {
    type: "transaction",
    title: "Aluguel",
    amountCents: 210_000,
    accountName: "Conta Principal",
    dueOn: "2026-11-10",
    days: 1,
    overdue: false,
  };
  const invoice: BillReminderItem = {
    type: "invoice",
    title: "Fatura Nubank",
    amountCents: 138_042,
    accountName: "Nubank",
    dueOn: "2026-11-10",
    days: 1,
    overdue: false,
  };

  it("one bill, with and without amounts", () => {
    expect(plain(billsDueMessage([rent], WITH))).toEqual({
      title: "Aluguel vence amanhã",
      body: "R$ 2.100,00 · Conta Principal. Toque para ver e marcar como pago.",
    });
    const message = billsDueMessage([rent], WITHOUT);
    expectNoAmounts(message);
    expect(message).toEqual({
      title: "Aluguel vence amanhã",
      body: "Sai da Conta Principal. Toque para ver e marcar como pago.",
    });
  });

  it("one bill overdue or a few days ahead", () => {
    expect(
      billsDueMessage([{ ...rent, days: -1, overdue: true }], WITHOUT)?.title,
    ).toBe("Aluguel venceu ontem");
    expect(
      billsDueMessage(
        [{ ...rent, dueOn: "2026-11-03", days: -6, overdue: true }],
        WITHOUT,
      )?.title,
    ).toBe("Aluguel venceu há 6 dias");
    expect(
      billsDueMessage(
        [{ ...rent, dueOn: "2026-11-02", days: -7, overdue: true }],
        WITHOUT,
      )?.title,
    ).toBe("Aluguel venceu em 2/nov");
    expect(billsDueMessage([{ ...rent, days: 0 }], WITHOUT)?.title).toBe(
      "Aluguel vence hoje",
    );
    expect(billsDueMessage([{ ...rent, days: 3 }], WITHOUT)?.title).toBe(
      "Aluguel vence em 3 dias",
    );
  });

  it("one invoice", () => {
    expect(plain(billsDueMessage([invoice], WITH))).toEqual({
      title: "Fatura Nubank vence amanhã",
      body: "R$ 1.380,42 em aberto.",
    });
    const message = billsDueMessage([invoice], WITHOUT);
    expectNoAmounts(message);
    expect(message?.body).toBe("Toque para ver a fatura.");
  });

  const several: BillReminderItem[] = [
    { ...rent, title: "Internet", amountCents: 9990, days: 0 },
    rent,
    { ...rent, title: "Luz", amountCents: 18_980 },
    { ...invoice, days: -1, overdue: true },
  ];

  it("several, with and without amounts", () => {
    expect(plain(billsDueMessage(several, WITH))).toEqual({
      title: "4 contas para pagar",
      body: "Hoje: Internet (R$ 99,90). Amanhã: Aluguel (R$ 2.100,00) e Luz (R$ 189,80). Venceu ontem: Fatura Nubank (R$ 1.380,42).",
    });
    const message = billsDueMessage(several, WITHOUT);
    expectNoAmounts(message);
    expect(message?.body).toBe(
      "Hoje: Internet. Amanhã: Aluguel e Luz. Venceu ontem: Fatura Nubank.",
    );
  });

  it("several, none overdue", () => {
    expect(billsDueMessage(several.slice(0, 3), WITHOUT)).toEqual({
      title: "3 contas vencem em breve",
      body: "Hoje: Internet. Amanhã: Aluguel e Luz.",
    });
  });

  it("up to 4 names, then the rest counted", () => {
    const many = [
      ...several,
      { ...rent, title: "Água", days: 3 },
      { ...rent, title: "Escola", days: -2, overdue: true },
      { ...rent, title: "Gás", days: -2, overdue: true },
    ];
    expect(billsDueMessage(many, WITHOUT)).toEqual({
      title: "7 contas para pagar",
      body: "Hoje: Internet. Amanhã: Aluguel e Luz. Venceu ontem: Fatura Nubank. E mais 3 contas.",
    });
    expect(billsDueMessage(many.slice(0, 5), WITHOUT)?.body).toMatch(
      / E mais 1 conta.$/,
    );
    expect(
      billsDueMessage(
        [
          { ...rent, title: "Escola", days: -2, overdue: true },
          { ...rent, title: "Gás", days: -2, overdue: true },
        ],
        WITHOUT,
      )?.body,
    ).toBe("Venceram há 2 dias: Escola e Gás.");
  });

  it("nothing to say", () => {
    expect(billsDueMessage([], WITH)).toBeNull();
  });
});

describe("Próxima receita", () => {
  const salary: IncomeCountdownInput = {
    description: "Salário",
    amountCents: 795_000,
    date: "2026-11-14",
    forecastCents: 42_600,
    perDayCents: 8520,
    hasBudget: true,
  };

  it("with amounts", () => {
    expect(plain(incomeCountdownMessage(salary, WITH))).toEqual({
      title: "Salário em 5 dias",
      body: "Faltam 5 dias para receber R$ 7.950,00 (sáb, 14 nov). Até lá, dá para gastar R$ 85,20 por dia.",
    });
  });

  it("without amounts", () => {
    const message = incomeCountdownMessage(salary, WITHOUT);
    expectNoAmounts(message);
    expect(message).toEqual({
      title: "Salário em 5 dias",
      body: "Faltam 5 dias (sáb, 14 nov). Toque para ver quanto dá para gastar por dia até lá.",
    });
  });

  it("tomorrow", () => {
    expect(
      plain(incomeCountdownMessage({ ...salary, date: "2026-11-10" }, WITH)),
    ).toEqual({
      title: "Salário amanhã",
      body: "Falta 1 dia para receber R$ 7.950,00 (ter, 10 nov). Hoje, dá para gastar R$ 85,20.",
    });
    expect(
      incomeCountdownMessage({ ...salary, date: "2026-11-10" }, WITHOUT)?.body,
    ).toBe(
      "Falta 1 dia (ter, 10 nov). Toque para ver quanto dá para gastar hoje.",
    );
  });

  it("the month's budget used up", () => {
    const used = { ...salary, perDayCents: 0 };
    expect(plain(incomeCountdownMessage(used, WITH))?.body).toBe(
      "Faltam 5 dias para receber R$ 7.950,00 (sáb, 14 nov). O orçamento do mês já foi todo usado.",
    );
    expect(incomeCountdownMessage(used, WITHOUT)?.body).toBe(
      "Faltam 5 dias (sáb, 14 nov). O orçamento do mês já foi todo usado.",
    );
    // Without budgets, a zero comes from the forecast itself.
    expect(
      plain(incomeCountdownMessage({ ...used, hasBudget: false }, WITH))?.body,
    ).toContain("Até lá, dá para gastar R$ 0,00 por dia.");
  });

  it("a negative forecast", () => {
    const short = { ...salary, forecastCents: -23_000, perDayCents: 0 };
    expect(plain(incomeCountdownMessage(short, WITH))?.body).toBe(
      "Faltam 5 dias para receber R$ 7.950,00 (sáb, 14 nov). Até lá, o saldo previsto fica em −R$ 230,00.",
    );
    const message = incomeCountdownMessage(short, WITHOUT);
    expectNoAmounts(message);
    expect(message?.body).toBe(
      "Faltam 5 dias (sáb, 14 nov). Até lá, o saldo previsto fica negativo.",
    );
  });

  it("nothing for today's or a past income", () => {
    expect(
      incomeCountdownMessage({ ...salary, date: TODAY }, WITHOUT),
    ).toBeNull();
    expect(
      incomeCountdownMessage({ ...salary, date: "2026-11-01" }, WITHOUT),
    ).toBeNull();
  });
});

describe("Resumo semanal", () => {
  const week: WeeklySummaryInput = {
    start: "2026-10-27",
    end: "2026-11-02",
    incomeCents: 795_000,
    expenseCents: 124_530,
    comparison: { averageCents: 151_866, ratio: -0.18 },
    topCategories: ["Mercado", "Restaurantes", "Transporte", "Lazer"],
  };

  it("with amounts", () => {
    expect(plain(weeklySummaryMessage(week, WITH))).toEqual({
      title: "Sua semana: 27/out – 2/nov",
      body: "Saíram R$ 1.245,30 (18% abaixo da sua média) e entraram R$ 7.950,00. Mais pesaram: Mercado, Restaurantes e Transporte.",
    });
  });

  it("without amounts", () => {
    const message = weeklySummaryMessage(week, WITHOUT);
    expectNoAmounts(message);
    expect(message?.body).toBe(
      "Despesas 18% abaixo da sua média. Mais pesaram: Mercado, Restaurantes e Transporte.",
    );
  });

  it("no income, no history, one category", () => {
    const quiet = {
      ...week,
      incomeCents: 0,
      comparison: null,
      topCategories: ["Mercado"],
    };
    expect(plain(weeklySummaryMessage(quiet, WITH))?.body).toBe(
      "Saíram R$ 1.245,30. Mais pesou: Mercado.",
    );
    expect(weeklySummaryMessage(quiet, WITHOUT)?.body).toBe(
      "Mais pesou: Mercado.",
    );
    expect(
      weeklySummaryMessage(
        { ...quiet, comparison: { averageCents: 1, ratio: 0.02 } },
        WITHOUT,
      )?.body,
    ).toBe("Despesas perto da sua média. Mais pesou: Mercado.");
  });

  it("only income", () => {
    const income = {
      ...week,
      expenseCents: 0,
      comparison: null,
      topCategories: [],
    };
    expect(plain(weeklySummaryMessage(income, WITH))?.body).toBe(
      "Entraram R$ 7.950,00.",
    );
    const message = weeklySummaryMessage(income, WITHOUT);
    expectNoAmounts(message);
    expect(message?.body).toBe("Nenhuma despesa na semana.");
  });

  it("nothing in or out: nothing to say", () => {
    expect(
      weeklySummaryMessage({ ...week, incomeCents: 0, expenseCents: 0 }, WITH),
    ).toBeNull();
  });
});

describe("Resumo mensal", () => {
  const october: MonthlySummaryInput = {
    month: "2026-10",
    incomeCents: 795_000,
    expenseCents: 612_040,
    budgets: { met: 5, over: ["Restaurantes", "Lazer"] },
  };

  it("with amounts", () => {
    expect(plain(monthlySummaryMessage(october, WITH))).toEqual({
      title: "Resumo de outubro",
      body: "Entraram R$ 7.950,00 e saíram R$ 6.120,40: sobraram R$ 1.829,60. Orçamentos: 5 cumpridos e 2 estourados (Restaurantes e Lazer).",
    });
  });

  it("without amounts", () => {
    const message = monthlySummaryMessage(october, WITHOUT);
    expectNoAmounts(message);
    expect(message?.body).toBe(
      "Você fechou outubro no azul. Orçamentos: 5 cumpridos e 2 estourados (Restaurantes e Lazer).",
    );
  });

  it("spending above income, or even", () => {
    const over = { ...october, expenseCents: 827_000, budgets: null };
    expect(plain(monthlySummaryMessage(over, WITH))?.body).toBe(
      "Entraram R$ 7.950,00 e saíram R$ 8.270,00: faltaram R$ 320,00.",
    );
    expect(monthlySummaryMessage(over, WITHOUT)?.body).toBe(
      "As despesas passaram das receitas.",
    );
    expect(
      monthlySummaryMessage(
        { ...october, expenseCents: 795_000, budgets: null },
        WITHOUT,
      )?.body,
    ).toBe("Receitas e despesas empataram.");
  });

  it("the budgets, kept and over", () => {
    const at = (met: number, over: string[]) =>
      monthlySummaryMessage({ ...october, budgets: { met, over } }, WITHOUT)
        ?.body;
    expect(at(5, [])).toBe(
      "Você fechou outubro no azul. Todos os 5 orçamentos cumpridos.",
    );
    expect(at(1, [])).toBe(
      "Você fechou outubro no azul. 1 orçamento cumprido.",
    );
    expect(at(1, ["Lazer"])).toBe(
      "Você fechou outubro no azul. Orçamentos: 1 cumprido e 1 estourado (Lazer).",
    );
    expect(at(0, ["A", "B", "C", "D", "E"])).toBe(
      "Você fechou outubro no azul. Orçamentos: 5 estourados (A, B, C, D e mais 1).",
    );
    expect(at(0, [])).toBe("Você fechou outubro no azul.");
  });

  it("nothing paid: nothing to say", () => {
    expect(
      monthlySummaryMessage(
        { ...october, incomeCents: 0, expenseCents: 0 },
        WITH,
      ),
    ).toBeNull();
  });
});
