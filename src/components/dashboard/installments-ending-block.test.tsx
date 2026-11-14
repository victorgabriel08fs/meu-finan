import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { EndingInstallment } from "@/lib/home/installments-ending";
import {
  InstallmentsEndingBlock,
  InstallmentsEndingInvite,
} from "./installments-ending-block";

// Server Actions are not importable outside Next (the quick add button).
vi.mock("@/server/actions/transactions", () => ({ setPaidAction: vi.fn() }));
vi.mock("@/server/actions/preferences", () => ({ setThemeAction: vi.fn() }));

const item = (
  overrides: Partial<EndingInstallment> = {},
): EndingInstallment => ({
  planId: "p1",
  description: "Tênis",
  accountId: "a1",
  accountName: "Conta",
  remainingCents: 40_000,
  remainingCount: 4,
  nextNumber: 3,
  count: 6,
  nextOn: "2026-11-03",
  nextAmountCents: 10_000,
  endsOn: "2027-03-03",
  ...overrides,
});

const render = (
  items: EndingInstallment[],
  totalPlans = items.length,
  monthlyCents = 45_000,
) =>
  renderToStaticMarkup(
    <InstallmentsEndingBlock
      summary={{ items, totalPlans, monthlyCents }}
      hrefFor={(it) => `/extrato?q=${it.planId}`}
    />,
  );

const plain = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;| /g, " ")
    .replace(/\s+/g, " ");

describe("InstallmentsEndingBlock", () => {
  it("names the region and says what leaves the budget each month", () => {
    const html = render([item()]);
    expect(html).toContain('aria-labelledby="inicio-parcelas-a-terminar"');
    expect(html).toContain('id="inicio-parcelas-a-terminar"');
    const text = plain(html);
    expect(text).toContain("Parcelas a terminar");
    expect(text).toMatch(/Saem .*450,00.* por mês/);
  });

  it("shows the installment, what is left and the month it ends", () => {
    const text = plain(render([item()]));
    expect(text).toContain("parcela 3 de 6");
    expect(text).toContain("faltam 4");
    expect(text).toContain("acaba em março de 2027");
    expect(text).toContain("falta pagar");
  });

  it("calls the last installment by name, in the row and in the link", () => {
    const html = render([
      item({ remainingCount: 1, remainingCents: 10_000, nextNumber: 6 }),
    ]);
    expect(plain(html)).toContain("última parcela · março de 2027");
    expect(plain(html)).not.toContain("faltam 1");
    expect(html).toContain("falta 1 parcela, a última, em março de 2027");
  });

  it("gives each row a link of its own with a full accessible name", () => {
    const items = [item(), item({ planId: "p2", description: "Sofá" })];
    const html = render(items);
    expect(html.match(/<li/g)).toHaveLength(2);
    for (const it of items)
      expect(html).toContain(`href="/extrato?q=${it.planId}"`);
    expect(html).toMatch(
      /aria-label="Tênis, parcela 3 de 6, faltam 4 parcelas, acaba em março de 2027, restam [^"]+; abrir no Extrato"/,
    );
  });

  it("says how many purchases are left out, in singular and plural", () => {
    expect(plain(render([item()], 1))).not.toContain("e mais");
    expect(plain(render([item()], 2))).toContain("e mais 1 compra parcelada");
    expect(plain(render([item()], 5))).toContain("e mais 4 compras parceladas");
  });

  it("goes through Money, so the discreet mode masks the amounts", () => {
    const html = render([item()]);
    expect(html).toContain("data-privacy-value");
    expect(html).toMatch(/aria-hidden/);
  });
});

describe("InstallmentsEndingInvite", () => {
  it("invites to add an expense", () => {
    const text = plain(renderToStaticMarkup(<InstallmentsEndingInvite />));
    expect(text).toContain("Nenhuma parcela em aberto");
    expect(text).toContain(
      "Quando você parcelar uma compra, o que falta pagar aparece aqui.",
    );
    expect(text).toContain("Adicionar gasto");
  });
});
