// Server render of the cards of Fechamento (doc 02 §6.12): key copy, links and
// the buttons that only the last closed month has.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ClosingBudget } from "@/server/domain/month-closing";

vi.mock("server-only", () => ({}));
vi.mock("@/server/actions/planning", () => ({ upsertBudgetAction: vi.fn() }));
const openQuickAdd = vi.fn();
vi.mock("@/stores/quick-add", () => ({
  useQuickAddStore: (select: (state: unknown) => unknown) =>
    select({ openQuickAdd }),
}));

const { ClosingBudgetsCard, ClosingNoBudgetsCard } = await import(
  "./closing-budgets-card"
);
const { ClosingSummaryCard } = await import("./closing-summary-card");
const { SaveLeftoverCard } = await import("./save-leftover-card");
const { SaveLeftoverButton } = await import("./save-leftover-button");

/** Visible text: no tags, no sr-only spoken amounts, no privacy masks. */
const text = (html: string) =>
  html
    .replace(/<span class="sr-only">.*?<\/span>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/ /g, " ")
    .replace(/R\$\s?••••/g, "");

type SummaryProps = Parameters<typeof ClosingSummaryCard>[0];
const summary = (over: Partial<SummaryProps>) =>
  renderToStaticMarkup(
    <ClosingSummaryCard
      monthName="outubro"
      previousMonthName="setembro"
      incomeCents={500_000}
      expenseCents={317_040}
      leftCents={182_960}
      previousLeftCents={120_000}
      hasPending={false}
      pendingHref="/extrato?mes=2026-10&status=pending"
      recapHref="/retrospectiva?mes=2026-10"
      {...over}
    />,
  );

const restaurants: ClosingBudget = {
  categoryId: "cat-1",
  categoryName: "Restaurantes",
  categoryIcon: "utensils",
  categoryColor: "cat-1",
  budgetCents: 60_000,
  spentCents: 75_000,
  averageCents: 79_050,
  nextBudgetCents: null,
};

type BudgetsProps = Parameters<typeof ClosingBudgetsCard>[0];
const budgets = (over: Partial<BudgetsProps>) =>
  renderToStaticMarkup(
    <ClosingBudgetsCard
      monthName="outubro"
      currentMonthName="novembro"
      currentMonth="2026-11"
      month="2026-10"
      metCount={2}
      over={[restaurants]}
      latest
      {...over}
    />,
  );

describe("ClosingSummaryCard", () => {
  it("says Sobrou, compares with the month before and has no pending note", () => {
    const html = summary({});
    const visible = text(html);
    expect(visible).toContain("Como foi outubro");
    expect(visible).toContain("Você fechou outubro no azul.");
    expect(visible).toContain("Receitas");
    expect(visible).toContain("Despesas");
    expect(visible).toContain("Sobrou");
    expect(visible).not.toContain("Faltou");
    expect(visible).toContain("Em setembro, sobraram");
    expect(visible).not.toContain("pendentes");
    expect(html).toContain('aria-labelledby="fechamento-resumo"');
  });

  it("says Faltou in magnitude, with no red", () => {
    const html = summary({ leftCents: -40_000, previousLeftCents: -5_000 });
    const visible = text(html);
    expect(visible).toContain("Faltou");
    expect(visible).toContain("As despesas passaram das receitas.");
    expect(visible).toContain("Em setembro, faltaram");
    expect(html).not.toContain("text-danger");
  });

  it("leaves the month before out when it had nothing paid", () => {
    expect(text(summary({ previousLeftCents: null }))).not.toContain(
      "Em setembro",
    );
  });

  it("warns about pending entries and links to them", () => {
    const html = summary({ hasPending: true });
    expect(text(html)).toContain(
      "Há lançamentos de outubro ainda pendentes: eles não entram nesta conta.",
    );
    expect(html).toMatch(
      /href="\/extrato\?mes=2026-10&amp;status=pending"[^>]*>Ver pendentes/,
    );
  });
});

describe("ClosingBudgetsCard", () => {
  it("summarises and lists the over budgets with the excess", () => {
    const html = budgets({});
    const visible = text(html);
    expect(visible).toContain("Orçamentos de outubro");
    expect(visible).toContain("2 cumpridos e 1 estourado.");
    expect(visible).toContain("Restaurantes");
    expect(visible).toContain("acima");
    expect(html).toContain('href="/planejar/orcamentos?mes=2026-10"');
  });

  it("offers to create the budget of the current month from the average", () => {
    const html = budgets({});
    const visible = text(html);
    expect(visible).toContain("Média dos últimos 3 meses:");
    expect(visible).toContain("Sugestão para novembro:");
    expect(html).toContain(
      'aria-label="Usar a sugestão de Restaurantes em novembro"',
    );
    expect(visible).toContain("Usar em novembro");
    // The button and its name carry no amount (discreet mode).
    expect(html).not.toMatch(/aria-label="[^"]*R\$/);
  });

  it("offers to raise a budget that is too low", () => {
    const html = budgets({
      over: [{ ...restaurants, nextBudgetCents: 60_000 }],
    });
    const visible = text(html);
    expect(visible).toContain("Novembro tem");
    expect(visible).toContain("Usar a sugestão");
    expect(visible).not.toContain("Sugestão para novembro");
  });

  it("says when the current budget already covers it, with no button", () => {
    const html = budgets({
      over: [{ ...restaurants, nextBudgetCents: 90_000 }],
    });
    expect(text(html)).toContain("já tem");
    expect(text(html)).toContain("que cobre a média dos últimos 3 meses.");
    expect(html).not.toContain("Usar a sugestão de");
  });

  it("offers nothing without an average", () => {
    const html = budgets({
      over: [{ ...restaurants, averageCents: null }],
    });
    expect(html).not.toContain("Média dos últimos 3 meses");
    expect(html).not.toContain("Usar a sugestão de");
  });

  it("has no suggestions or buttons in a month before the last closed one", () => {
    const html = budgets({ latest: false });
    expect(html).not.toContain("Média dos últimos 3 meses");
    expect(html).not.toContain("Usar a sugestão de");
    expect(text(html)).toContain("Restaurantes");
  });

  it("congratulates when every budget was kept", () => {
    const html = budgets({ over: [], metCount: 3 });
    expect(text(html)).toContain("Todos os 3 orçamentos cumpridos.");
    expect(html).not.toContain("<ul");
  });

  it("invites to create budgets when the month had none", () => {
    const html = renderToStaticMarkup(
      <ClosingNoBudgetsCard monthName="outubro" />,
    );
    expect(text(html)).toContain("Você não tinha orçamentos em outubro.");
    expect(html).toMatch(/href="\/planejar\/orcamentos"[^>]*>Criar orçamentos/);
  });
});

describe("SaveLeftoverCard", () => {
  const boxes = [{ id: "box-1", name: "Reserva" }];
  const card = (over: Partial<Parameters<typeof SaveLeftoverCard>[0]>) =>
    renderToStaticMarkup(
      <SaveLeftoverCard
        monthName="outubro"
        start="2026-10-01"
        leftCents={182_960}
        savedCents={0}
        boxes={boxes}
        spendableId="acc-1"
        {...over}
      />,
    );

  it("offers the whole leftover", () => {
    const html = card({});
    const visible = text(html);
    expect(visible).toContain("Guardar a sobra");
    expect(visible).toContain("Sobraram");
    expect(visible).toContain("em outubro.");
    expect(visible).not.toContain("Falta guardar");
    expect(html).toContain('aria-haspopup="dialog"');
  });

  it("says what is left to save after part went to a caixinha", () => {
    const visible = text(card({ savedCents: 50_000 }));
    expect(visible).toContain("você já guardou");
    expect(visible).toContain("Falta guardar");
  });

  it("has no button when the leftover is already saved", () => {
    const html = card({ savedCents: 182_960 });
    expect(text(html)).toContain("A sobra de outubro já está nas caixinhas.");
    expect(html).not.toContain("<button");
  });

  it("invites to create a caixinha when there is none", () => {
    const html = card({ boxes: [] });
    expect(text(html)).toContain(
      "Crie uma caixinha para separar o que sobrou.",
    );
    expect(html).toMatch(
      /href="\/contas\/nova\?tipo=caixinha"[^>]*>Criar caixinha/,
    );
    expect(html).not.toContain("<button");
  });

  it("opens the transfer sheet filled in, with no amount in the button", () => {
    const element = SaveLeftoverButton({
      spendableId: "acc-1",
      boxId: "box-1",
      amountCents: 132_960,
      description: "Sobra de outubro",
    });
    element.props.onClick();
    expect(openQuickAdd).toHaveBeenCalledWith("transfer", {
      accountId: "acc-1",
      toAccountId: "box-1",
      expression: "1329,60",
      description: "Sobra de outubro",
    });
    expect(element.props.children).toBe("Guardar a sobra");
  });
});
