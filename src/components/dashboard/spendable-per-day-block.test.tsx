import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
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

// Server Actions are not available outside Next ("Escolher contas").
vi.mock("@/server/actions/preferences", () => ({
  saveDailySpendAccountsAction: vi.fn(),
}));

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
    byAccount: [],
  }));
}

const base: SpendablePerDay = {
  hasAccounts: true,
  rows: days((k) => 10_000 + k * 500),
  shortfallCents: 0,
  balanceTodayCents: 150_000,
  until: "2026-11-30",
  accounts: [],
  unassignedCards: [],
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

describe("SpendablePerDayBlock by account", () => {
  const accounts: SpendablePerDay["accounts"] = [
    {
      id: "checking",
      name: "Conta principal",
      color: "cat-1",
      icon: "landmark",
      type: "checking",
      shown: true,
    },
    {
      id: "reserve",
      name: "Reserva",
      color: "cat-3",
      icon: "trending-up",
      type: "investment",
      shown: true,
    },
    {
      id: "wallet",
      name: "Carteira",
      color: "cat-4",
      icon: "wallet",
      type: "cash",
      shown: false,
    },
  ];
  const withLines: SpendablePerDay = {
    ...base,
    rows: base.rows.map((row) => ({
      ...row,
      perDayCents: 8_500,
      byAccount: [
        { accountId: "checking", perDayCents: 5_000 },
        { accountId: "reserve", perDayCents: 0 },
      ],
    })),
    accounts,
  };

  it("gives each day a line per shown account, under the total", () => {
    const html = render(withLines);
    expect(html.match(/>Conta principal</g)).toHaveLength(14);
    expect(html.match(/>Reserva</g)).toHaveLength(14);
    expect(html).not.toContain(">Carteira<");
    expect(html).toContain("R$ 50,00");
    expect(html.match(/>Não sobra</g)).toHaveLength(14);
    // Wider cards with lines, the divider in a token.
    expect(html).toContain("w-34");
    expect(html).toContain(">Total<");
    expect(html).not.toContain("w-25");
    expect(html).toContain("border-t border-border");
    // The account's color as a dot, hidden from screen readers.
    expect(html).toMatch(
      /aria-hidden="true" class="mt-1.25 size-2 shrink-0 rounded-full bg-cat-1-fg"/,
    );
  });

  it("reads each card as one sentence", () => {
    const html = render(withLines);
    expect(html).toContain('<span class="sr-only">:</span>');
    expect(html.match(/<span class="sr-only"> por dia;<\/span>/g)).toHaveLength(
      14,
    );
    expect(html).not.toContain('<span class="sr-only"> por dia</span>');
    expect(html.match(/<span class="sr-only">;<\/span>/g)).toHaveLength(28);
  });

  it("explains the lines and offers to choose the accounts", () => {
    const html = render(withLines);
    expect(html).toContain(
      "Em cada conta, o saldo e o agendado dela, com as faturas que ela paga.",
    );
    expect(html).toContain("Escolher contas");
    expect(html).toContain('aria-haspopup="dialog"');
  });

  it("keeps the button with every line hidden, but not the lines' note", () => {
    const html = render({
      ...withLines,
      rows: base.rows,
      accounts: accounts.map((account) => ({ ...account, shown: false })),
    });
    expect(html).toContain("Escolher contas");
    expect(html).toContain("w-25");
    expect(html).not.toContain("Em cada conta");
    expect(html).toContain('<span class="sr-only"> por dia</span>');
  });

  it("has no lines nor button with a single account", () => {
    const html = render(base);
    expect(html).not.toContain("Escolher contas");
    expect(html).not.toContain("Em cada conta");
  });

  it("drops the lines and the button when nothing is left in the total", () => {
    const html = render({
      ...withLines,
      rows: withLines.rows.map((row) => ({ ...row, perDayCents: 0 })),
    });
    expect(html).toContain("Não sobra para gastar até 30/nov");
    expect(html).not.toContain("Conta principal");
    expect(html).not.toContain("Escolher contas");
  });

  it("says when a card's invoice counts only in the total", () => {
    const one = render({
      ...withLines,
      unassignedCards: [{ id: "card-1", name: "Cartão Principal" }],
    });
    expect(one).toContain("A fatura do Cartão Principal entra só no total.");
    expect(one).toContain('href="/cartoes/card-1"');
    expect(one).toContain("Escolher a conta que paga");
    const two = render({
      ...withLines,
      unassignedCards: [
        { id: "card-1", name: "Cartão Principal" },
        { id: "card-2", name: "Outro" },
      ],
    });
    expect(two).toContain("As faturas de 2 cartões entram só no total.");
    expect(two).toContain('href="/contas"');
    expect(two).toContain("Ver contas");
    // Without lines the note has nothing to qualify.
    expect(
      render({
        ...base,
        unassignedCards: [{ id: "card-1", name: "Cartão Principal" }],
      }),
    ).not.toContain("entra só no total");
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
