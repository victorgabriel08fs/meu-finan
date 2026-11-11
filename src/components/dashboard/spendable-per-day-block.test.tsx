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

// Quanto dá para gastar por dia on the Início (doc 02 §6.3): a strip of day
// cards, today first, and the states around it.

const plain = (html: string) => html.replaceAll(NBSP, " ");

const TODAY = "2026-11-10";

function days(
  perDay: (k: number) => number,
  count = SPENDABLE_DAYS,
): SpendablePerDay["rows"] {
  return Array.from({ length: count }, (_, k) => ({
    date: iso(addDays(parse(TODAY), k)),
    daysLeft: 21 - k,
    perDayCents: perDay(k),
  }));
}

const base: SpendablePerDay = {
  hasAccounts: true,
  rows: days((k) => 10_000 + k * 500),
  shortfallCents: 0,
  balanceTodayCents: 150_000,
  until: "2026-11-30",
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
  it("shows a card per day and the way to the flow", () => {
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
    expect(html).toContain(
      "Pelo saldo e pelo agendado, sem o orçamento, dividido pelos dias que faltam.",
    );
    expect(html).toContain('aria-label="Quanto dá para gastar em cada dia"');
    expect(html).toContain('aria-current="date"');
  });

  it("names the first days and then the weekday, the date on its own line", () => {
    const html = render(base);
    expect(html).toContain(">Hoje<");
    expect(html).toContain(">Amanhã<");
    expect(html).toContain(">sex<");
    expect(html).toContain(">13 nov<");
    expect(html).toContain(">sáb<");
  });

  it("keeps the amounts whole and masked in privacy mode", () => {
    const html = render(base);
    expect(html).toContain("data-privacy-value");
    expect(html).toContain("data-privacy-mask");
  });

  it("gives the strip a name and the keyboard, and each card its words", () => {
    const html = render(base);
    expect(html).toMatch(
      /<section aria-label="Quanto dá para gastar em cada dia"[^>]*tabindex="0"/,
    );
    expect(html.match(/<span class="sr-only"> por dia<\/span>/g)).toHaveLength(
      14,
    );
    // Only today carries the mark, and it comes first.
    expect(html.match(/aria-current="date"/g)).toHaveLength(1);
    expect(html.indexOf("aria-current")).toBeLessThan(html.indexOf(">Amanhã<"));
  });

  it("clamps the day label", () => {
    expect(render(base)).toContain("truncate @max-tight:wrap-anywhere");
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

  it("shows a single card on the last day of the month", () => {
    const html = render({
      ...base,
      until: "2026-11-10",
      rows: days(() => 4_000, 1),
    });
    expect(html.match(/<li /g)).toHaveLength(1);
    expect(html).toContain(">Hoje<");
    expect(html).toContain("40 reais");
    expect(html).toContain("por dia");
  });

  it("says it leaves the budget out, and never limits by it", () => {
    expect(render(base)).toContain("sem o orçamento");
    expect(render(base).toLowerCase()).not.toContain("limitado");
    expect(
      render({ ...base, rows: days(() => 0) }).toLowerCase(),
    ).not.toContain("orçamento");
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

  it("explains a zero without shortfall: no balance", () => {
    const none = render({ ...base, rows: days(() => 0) });
    expect(none).toContain("O saldo previsto chega a zero antes de 30/nov.");
    expect(none).not.toContain("Sem saldo");
    const broke = render({
      ...base,
      balanceTodayCents: 0,
      rows: days(() => 0),
    });
    expect(broke).toContain("Sem saldo nas contas para gastar até 30/nov.");
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
