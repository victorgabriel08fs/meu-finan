import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AccountListItem } from "@/server/domain/accounts";
import type { TransactionListItem } from "@/server/domain/transactions";
import { AccountForm } from "./account-form";
import { AccountGroupList, NetWorthHero } from "./account-list";
import { AccountTransactions, groupByDay } from "./account-transactions";
import { CardVisual } from "./card-visual";
import { InvoiceEntries, type InvoiceEntryView } from "./invoice-entries";
import { InvoiceSummaryCard } from "./invoice-summary";
import { InvoiceTabs } from "./invoice-tabs";

// Server Actions and the app router are not available outside Next.
vi.mock("@/server/actions/planning", () => ({
  createAccountAction: vi.fn(),
  updateAccountAction: vi.fn(),
  archiveAccountAction: vi.fn(),
  adjustBalanceAction: vi.fn(),
  payInvoiceAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

/** Visible text: no tags, no sr-only spoken amounts, no privacy masks. */
const text = (html: string) =>
  html
    .replace(/<span class="sr-only">.*?<\/span>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/ /g, " ")
    .replace(/R\$\s?••••/g, "");

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

const card = account({
  id: "c1",
  name: "Cartão principal",
  type: "credit_card",
  color: "cat-7",
  icon: "credit-card",
  balanceCents: -138_042,
  pendingCents: -39_992,
  card: { limitCents: 550_000, closingDay: 17, dueDay: 25 },
});

describe("NetWorthHero and AccountGroupList", () => {
  it("sums the counted accounts with cards as debt", () => {
    const html = renderToStaticMarkup(
      <NetWorthHero
        accounts={[
          account({}),
          account({ id: "a2", type: "investment", balanceCents: 1_860_000 }),
          account({ id: "a3", balanceCents: 5_000, includeInNetWorth: false }),
          card,
        ]}
      />,
    );
    const visible = text(html);
    expect(visible).toContain("Patrimônio líquido");
    // 8.920,15 + 18.600,00 − 1.380,42
    expect(visible).toContain("R$26.139,73");
    expect(visible).toContain("Investimentos");
    expect(visible).toContain("Cartões de crédito");
  });

  it("shows the available limit of a card and links it to its invoice", () => {
    const html = renderToStaticMarkup(
      <AccountGroupList group="cards" accounts={[card]} />,
    );
    const visible = text(html);
    expect(visible).toContain("Disponível R$ 3.719,66 de R$ 5.500,00");
    expect(visible).toContain("em aberto");
    expect(html).toContain('href="/cartoes/c1"');
  });
});

describe("CardVisual", () => {
  it("shows the available limit, what is owed and the future installments", () => {
    const html = renderToStaticMarkup(
      <CardVisual
        name="Cartão principal"
        closingDay={17}
        dueDay={25}
        limitCents={550_000}
        usedCents={178_034}
        futureCents={39_992}
        availableCents={371_966}
      />,
    );
    const visible = text(html);
    expect(visible).toContain("Limite disponível");
    expect(visible).toContain("R$3.719,66");
    expect(visible).toContain("R$ 1.380,42em aberto");
    expect(visible).toContain("R$ 399,92em parcelas futuras");
    expect(html).toContain('aria-label="32% do limite em uso"');
    expect(visible).not.toContain("Limite excedido");
  });

  it("warns when the limit is exceeded", () => {
    const html = renderToStaticMarkup(
      <CardVisual
        name="Cartão"
        closingDay={3}
        dueDay={10}
        limitCents={100_000}
        usedCents={120_000}
        futureCents={0}
        availableCents={-20_000}
      />,
    );
    expect(text(html)).toContain("Limite excedido em R$ 200,00");
  });
});

describe("InvoiceTabs", () => {
  it("marks the selected month and shows future amounts", () => {
    const html = renderToStaticMarkup(
      <InvoiceTabs
        tabs={[
          {
            month: "2026-09",
            label: "set",
            href: "/cartoes/c1?fatura=2026-09",
            selected: false,
            status: "paid",
            future: false,
            totalCents: 90_000,
          },
          {
            month: "2026-10",
            label: "out",
            href: "/cartoes/c1",
            selected: true,
            status: "open",
            future: false,
            totalCents: 138_042,
          },
          {
            month: "2026-11",
            label: "nov",
            href: "/cartoes/c1?fatura=2026-11",
            selected: false,
            status: "open",
            future: true,
            totalCents: 9_998,
          },
        ]}
      />,
    );
    const visible = text(html);
    expect(visible).toContain("Paga");
    expect(visible).toContain("Aberta");
    expect(visible).toContain("R$ 99,98");
    expect(html).toContain('aria-current="page"');
  });
});

describe("InvoiceSummaryCard", () => {
  const invoice = {
    id: "inv-1",
    referenceMonth: "2026-10",
    closingDate: "2026-10-17",
    dueDate: "2026-10-25",
    totalCents: 138_042,
    paidCents: 0,
    outstandingCents: 138_042,
    status: "open" as const,
    purchases: 12,
  };

  it("shows status, timing, dates and the pay button", () => {
    const html = renderToStaticMarkup(
      <InvoiceSummaryCard
        invoice={invoice}
        today="2026-10-14"
        cardName="Cartão principal"
        split={{ cashCents: 128_044, installmentCents: 9_998 }}
        paymentAccounts={[
          {
            id: "a1",
            name: "Conta principal",
            icon: "landmark",
            color: "cat-1",
            balanceCents: 892_015,
          },
        ]}
      />,
    );
    const visible = text(html);
    expect(visible).toContain("Aberta");
    expect(visible).toContain("Fecha em 3 dias");
    expect(visible).toContain("Fecha 17/out · Vence 25/out");
    expect(visible).toContain("Compras à vista");
    expect(visible).toContain("Pagar fatura");
  });

  it("explains why there is nothing to pay", () => {
    const html = renderToStaticMarkup(
      <InvoiceSummaryCard
        invoice={{
          ...invoice,
          id: null,
          totalCents: 0,
          outstandingCents: 0,
        }}
        today="2026-10-14"
        cardName="Cartão principal"
        split={null}
        paymentAccounts={[]}
      />,
    );
    const visible = text(html);
    expect(visible).toContain("Nenhuma compra nesta fatura até agora.");
    expect(visible).not.toContain("Pagar fatura");
  });

  it("asks for an account when there is none to pay from", () => {
    const html = renderToStaticMarkup(
      <InvoiceSummaryCard
        invoice={invoice}
        today="2026-10-14"
        cardName="Cartão principal"
        split={null}
        paymentAccounts={[]}
      />,
    );
    expect(text(html)).toContain("Cadastrar conta");
  });
});

describe("InvoiceEntries", () => {
  const entry = (overrides: Partial<InvoiceEntryView>): InvoiceEntryView => ({
    id: "e1",
    description: "Tênis de corrida",
    amountCents: -9_998,
    occurredOn: "2026-10-03",
    status: "paid",
    kind: "expense",
    categoryName: "Compras",
    categoryIcon: "shopping-bag",
    categoryColor: "cat-7",
    installment: { number: 2, count: 6 },
    ...overrides,
  });

  it("shows installments, scheduled entries and collapses long lists", () => {
    const entries = [
      entry({}),
      entry({
        id: "e2",
        description: "Streaming",
        status: "pending",
        occurredOn: "2026-10-16",
        installment: null,
      }),
      ...Array.from({ length: 8 }, (_, index) =>
        entry({
          id: `x${index}`,
          description: `Compra ${index}`,
          installment: null,
        }),
      ),
    ];
    const html = renderToStaticMarkup(<InvoiceEntries entries={entries} />);
    const visible = text(html);
    expect(visible).toContain("2/6");
    expect(visible).toContain("Compras · 3/out");
    expect(visible).toContain("Compras · 16/out · Agendado");
    expect(visible).toContain("R$ 99,98");
    expect(visible).toContain("Ver mais 2 lançamentos");
  });
});

describe("AccountTransactions", () => {
  const txn = (
    overrides: Partial<TransactionListItem>,
  ): TransactionListItem => ({
    id: "t1",
    description: "Supermercado",
    amountCents: -6_450,
    kind: "expense",
    status: "paid",
    occurredOn: "2026-10-14",
    accountId: "a1",
    accountName: "Conta principal",
    accountType: "checking",
    categoryId: "c1",
    categoryName: "Mercado",
    categoryIcon: "shopping-cart",
    categoryColor: "cat-3",
    transferId: null,
    counterpartName: null,
    installment: null,
    recurring: false,
    recurrence: null,
    notes: null,
    ...overrides,
  });

  it("groups by day with the day's net and names the other side of transfers", () => {
    const items = [
      txn({}),
      txn({ id: "t2", amountCents: -2_290, description: "Uber" }),
      txn({
        id: "t3",
        kind: "transfer",
        amountCents: -50_000,
        description: "Reserva",
        occurredOn: "2026-10-13",
        counterpartName: "Reserva",
        categoryName: null,
      }),
    ];
    expect(groupByDay(items).map((day) => day.totalCents)).toEqual([
      -8_740, -50_000,
    ]);
    const html = renderToStaticMarkup(
      <AccountTransactions items={items} today="2026-10-14" />,
    );
    const visible = text(html);
    expect(visible).toContain("Hoje · qua, 14 out");
    expect(visible).toContain("Ontem · ter, 13 out");
    expect(visible).toContain("Para Reserva");
    expect(visible).toContain("−R$ 87,40");
  });
});

describe("AccountForm", () => {
  it("renders the checking-account form with the balance field", () => {
    const visible = text(
      renderToStaticMarkup(<AccountForm initialType="checking" />),
    );
    expect(visible).toContain("Saldo atual");
    expect(visible).toContain("Não precisa ser exato");
    expect(visible).toContain("Criar conta");
    expect(visible).not.toContain("Fechamento");
  });

  it("asks a card for the limit, the cycle and what is owed", () => {
    const visible = text(
      renderToStaticMarkup(<AccountForm initialType="credit_card" />),
    );
    expect(visible).toContain("Limite total");
    expect(visible).toContain("Fechamento");
    expect(visible).toContain("Vencimento");
    expect(visible).toContain("Fatura atual (valor devido hoje)");
    expect(visible).toContain("Criar cartão");
  });
});
