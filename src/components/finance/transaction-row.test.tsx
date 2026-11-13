import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { holidayCalendar, nonBusinessDue } from "@/lib/finance";
import { TransactionRow, type TransactionRowData } from "./transaction-row";

const calendar = holidayCalendar([2026]);
const saturday = nonBusinessDue("2026-11-14", calendar);

const txn = (
  overrides: Partial<TransactionRowData> = {},
): TransactionRowData => ({
  id: "t1",
  kind: "expense",
  description: "Condomínio",
  amountCents: -68_000,
  occurredOn: "2026-11-14",
  status: "pending",
  categoryName: "Moradia",
  categoryIcon: "house",
  categoryColor: "cat-1",
  accountName: "Conta Principal",
  ...overrides,
});

const render = (data: TransactionRowData, today = "2026-11-12") =>
  renderToStaticMarkup(
    <TransactionRow txn={data} today={today} href="/extrato/t1" />,
  );

const plainText = (html: string) =>
  html.replace(/<[^>]+>/g, "").replace(/ /g, " ");

describe("TransactionRow: bill due on a non-business day", () => {
  it("adds the line, in both placements, and the spoken form to the accessible name", () => {
    const html = render(txn({ nonBusinessDue: saturday }));
    expect(html.match(/data-slot="non-business-hint"/g)).toHaveLength(2);
    expect(plainText(html)).toContain("Dia não útil · passa para seg, 16 nov");
    expect(html).toMatch(
      /aria-label="[^"]*vence em dia não útil, passa para segunda, 16 de novembro/,
    );
  });

  it("has no line without the annotation (flag off)", () => {
    const html = render(txn());
    expect(html).not.toContain("non-business-hint");
    expect(html).not.toContain("dia não útil");
  });

  it("ignores the annotation on a paid entry, an income and a transfer", () => {
    for (const data of [
      txn({ nonBusinessDue: saturday, status: "paid" }),
      txn({ nonBusinessDue: saturday, kind: "income" }),
      txn({ nonBusinessDue: saturday, kind: "transfer" }),
    ]) {
      expect(render(data)).not.toContain("non-business-hint");
    }
  });
});

describe("TransactionRow: grace after a non-business due date (D2)", () => {
  it("reads 'Prazo até …' in amber on Sunday and Monday, never 'Venceu'", () => {
    const sunday = render(txn({ nonBusinessDue: saturday }), "2026-11-15");
    expect(plainText(sunday)).toContain("Prazo até amanhã");
    expect(plainText(sunday)).not.toContain("Venceu");
    expect(sunday).toContain("warning");
    const monday = render(txn({ nonBusinessDue: saturday }), "2026-11-16");
    expect(plainText(monday)).toContain("Prazo até hoje");
  });

  it("goes back to 'Venceu há 3 dias' in red the day after the grace", () => {
    const tuesday = render(txn({ nonBusinessDue: saturday }), "2026-11-17");
    expect(plainText(tuesday)).toContain("Venceu há 3 dias");
    expect(tuesday).not.toContain("Prazo até");
  });

  it("without the annotation the Sunday is overdue", () => {
    expect(plainText(render(txn(), "2026-11-15"))).toContain("Venceu ontem");
  });
});

describe("TransactionRow: accessible name and the day", () => {
  const label = (html: string) => /aria-label="([^"]*)"/.exec(html)?.[1] ?? "";
  const paid = (extra: Partial<TransactionRowData> = {}) =>
    txn({ status: "paid", occurredOn: "2026-11-12", ...extra });

  it("says the day once when the caller's subtitle already carries it", () => {
    const name = label(
      render(paid({ subtitle: "Mercado · Hoje" }), "2026-11-12"),
    );
    expect(name.match(/hoje/gi)).toHaveLength(1);
  });

  it("adds the day when the subtitle does not carry it", () => {
    const name = label(render(paid(), "2026-11-12"));
    expect(name.toLowerCase()).toContain("hoje");
  });
});
