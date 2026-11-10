import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { addDays, iso, parse } from "@/lib/finance/dates";
import { NBSP } from "@/lib/format/money";
import type { SpendablePerDay } from "@/server/domain/dashboard";
import {
  SPENDABLE_DAYS,
  SpendablePerDayBlock,
  SpendablePerDayNoAccountsInvite,
} from "./spendable-per-day-block";

// Quanto dá para gastar por dia on the Início (doc 02 §6.3): today's amount,
// one line per day with a bar for the proportion, and the states around it.

const plain = (html: string) => html.replaceAll(NBSP, " ");

const TODAY = "2026-11-10";

function days(
  perDay: (k: number) => number,
  count = SPENDABLE_DAYS,
  capped = false,
): SpendablePerDay["rows"] {
  return Array.from({ length: count }, (_, k) => ({
    date: iso(addDays(parse(TODAY), k)),
    daysLeft: 21 - k,
    perDayCents: perDay(k),
    cappedByBudget: capped,
  }));
}

const base: SpendablePerDay = {
  hasAccounts: true,
  rows: days((k) => 10_000 + k * 500),
  shortfallCents: 0,
  balanceTodayCents: 150_000,
  until: "2026-11-30",
  hasBudget: false,
  budgetMonth: "2026-11",
};

const render = (spendable: SpendablePerDay, isCurrent = true) =>
  plain(
    renderToStaticMarkup(
      <SpendablePerDayBlock
        spendable={spendable}
        today={TODAY}
        isCurrent={isCurrent}
      />,
    ),
  );

describe("SpendablePerDayBlock", () => {
  it("shows today's amount, a line per day and the way to the flow", () => {
    const html = render(base);
    expect(html).toContain('<section aria-labelledby="inicio-gasto-por-dia"');
    expect(html).toContain('id="inicio-gasto-por-dia"');
    expect(html).toContain("Quanto dá para gastar por dia");
    expect(html).toContain("Contas do dia a dia, até 30/nov");
    expect(html).toContain('href="/relatorios/fluxo"');
    expect(html).toContain("Ver fluxo");
    expect(html).toContain("por dia");
    expect(html.match(/<li /g)).toHaveLength(14);
    expect(html).toContain("R$ 100,00");
    expect(html).toContain("R$ 165,00");
    expect(html).toContain("Saldo previsto dividido pelos dias que faltam.");
  });

  it("names the first days and then gives weekday and date", () => {
    const html = render(base);
    expect(html).toContain(">Hoje<");
    expect(html).toContain(">Amanhã<");
    expect(html).toContain(">sex, 13 nov<");
    expect(html).toContain(">sáb, 14 nov<");
  });

  it("draws the bars in proportion to the largest day, out of the reader's way", () => {
    const html = render(base);
    expect(html.match(/aria-hidden="true" class="h-1\.5 /g)).toHaveLength(14);
    expect(html).toContain("width:100%");
    // 100,00 of 165,00.
    expect(html).toContain("width:61%");
  });

  it("keeps the amounts whole and masked in privacy mode", () => {
    const html = render(base);
    expect(html).toContain("data-privacy-value");
    expect(html).toContain("data-privacy-mask");
  });

  it("clamps the day label and stacks the row when the text is large", () => {
    const html = render(base);
    expect(html).toContain("truncate @max-tight:wrap-anywhere");
    expect(html).toContain("@max-[14rem]:grid-cols-1");
  });

  it("says where it starts in another month", () => {
    const html = render(base, false);
    expect(html).toContain("A partir de hoje, até 30/nov");
    expect(html).not.toContain("Contas do dia a dia");
  });

  it("lists fewer days at the end of the month", () => {
    const html = render({
      ...base,
      rows: days((k) => 4_000 - k * 1_000, 3),
    });
    expect(html.match(/<li /g)).toHaveLength(3);
  });

  it("flags the days the budget limits, in the note and for screen readers", () => {
    const html = render({
      ...base,
      hasBudget: true,
      rows: days(() => 3_000, 14, true),
    });
    expect(html).toContain("Limitado pelo orçamento de novembro.");
    // The note says it for every line: the reader does not hear it 14 times.
    expect(html).not.toContain("limitado pelo orçamento");
    expect(render(base)).not.toContain("imitado pelo orçamento");
  });

  it("tells the reader which days the budget limits when it limits only some", () => {
    const html = render({
      ...base,
      hasBudget: true,
      rows: days((k) => 3_000 + k * 100).map((row, k) => ({
        ...row,
        cappedByBudget: k < 3,
      })),
    });
    expect(html.match(/, limitado pelo orçamento/g)).toHaveLength(3);
    expect(html).toContain("Alguns dias limitados pelo orçamento de novembro.");
  });

  it("hides the list on the last day of the month, the figure says it all", () => {
    const html = render({
      ...base,
      until: "2026-11-10",
      rows: days(() => 4_000, 1),
    });
    expect(html).not.toContain("<ul");
    expect(html).toContain("40 reais");
    expect(html).toContain("por dia");
  });

  it("draws no bar when every day is zero, with the shortfall in a sentence", () => {
    const html = render({
      ...base,
      rows: days(() => 0),
      shortfallCents: 45_000,
    });
    expect(html).toContain("Não sobra para gastar até 30/nov");
    expect(html).toContain("Faltam");
    expect(html).toContain("R$ 450,00");
    expect(html).toContain("para as contas agendadas.");
    expect(html).not.toContain("<li ");
    expect(html).toContain("Ver fluxo");
  });

  it("explains a zero without shortfall: no balance, or the budget used up", () => {
    const none = render({ ...base, rows: days(() => 0) });
    expect(none).toContain("O saldo previsto chega a zero antes de 30/nov.");
    expect(none).not.toContain("Sem saldo");
    const broke = render({
      ...base,
      balanceTodayCents: 0,
      rows: days(() => 0),
    });
    expect(broke).toContain("Sem saldo nas contas para gastar até 30/nov.");
    const budget = render({
      ...base,
      hasBudget: true,
      rows: days(() => 0, 14, true),
    });
    expect(budget).toContain("Não sobra para gastar até 30/nov");
    expect(budget).toContain("O orçamento de novembro não deixa mais");
    expect(budget).not.toContain("Sem saldo");
    expect(budget).not.toContain("chega a zero");
  });
});

describe("SpendablePerDayNoAccountsInvite", () => {
  it("invites to the accounts, saying cards and caixinhas do not count", () => {
    const html = renderToStaticMarkup(<SpendablePerDayNoAccountsInvite />);
    expect(html).toContain("Nenhuma conta para o dia a dia");
    expect(html).toContain("sem cartões e caixinhas");
    expect(html).toContain('href="/contas"');
    expect(html).toContain("Ver contas");
  });
});
