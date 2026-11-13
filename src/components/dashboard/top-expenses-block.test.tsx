import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { TopExpense } from "@/server/domain/dashboard";
import { TopExpensesBlock, TopExpensesInvite } from "./top-expenses-block";

// Server Actions are not importable outside Next (the quick add button).
vi.mock("@/server/actions/transactions", () => ({ setPaidAction: vi.fn() }));
vi.mock("@/server/actions/preferences", () => ({ setThemeAction: vi.fn() }));

const item = (overrides: Partial<TopExpense> = {}): TopExpense => ({
  id: "t1",
  description: "Aluguel",
  amountCents: -210_000,
  occurredOn: "2026-11-12",
  accountId: "a1",
  accountName: "Conta Principal",
  categoryName: "Moradia",
  categoryIcon: "house",
  categoryColor: "cat-1",
  installment: null,
  recurring: false,
  ...overrides,
});

const render = (items: TopExpense[]) =>
  renderToStaticMarkup(
    <TopExpensesBlock
      items={items}
      today="2026-11-13"
      extractHref="/extrato?tipo=despesa"
      hrefFor={(it) => `/extrato/${it.id}`}
    />,
  );

const plain = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/ /g, " ");

describe("TopExpensesBlock", () => {
  it("names the region, says the window and links to the expenses", () => {
    const html = render([item()]);
    expect(html).toContain('aria-labelledby="inicio-maior-gasto"');
    expect(html).toContain('id="inicio-maior-gasto"');
    expect(plain(html)).toContain("Maior gasto da semana");
    expect(plain(html)).toContain("Pagas nos últimos 7 dias");
    expect(html).toContain('href="/extrato?tipo=despesa"');
    expect(plain(html)).toContain("Ver no Extrato");
  });

  it("lists one to three rows, each a link of its own", () => {
    for (const count of [1, 2, 3]) {
      const items = Array.from({ length: count }, (_, k) =>
        item({ id: `t${k}`, description: `Gasto ${k}` }),
      );
      const html = render(items);
      expect(html.match(/<li/g)).toHaveLength(count);
      for (const it of items)
        expect(html).toContain(`href="/extrato/${it.id}"`);
    }
  });

  it("shows category and day, 'Sem categoria' and the installment", () => {
    const html = render([
      item({ id: "a", occurredOn: "2026-11-13" }),
      item({
        id: "b",
        categoryName: null,
        categoryIcon: null,
        categoryColor: null,
        installment: { number: 2, count: 5 },
      }),
    ]);
    const text = plain(html);
    expect(text).toContain("Moradia · Hoje");
    expect(text).toContain("Sem categoria · Ontem");
    expect(html).toMatch(/parcela 2 de 5/);
  });

  it("goes through Money, so the discreet mode masks the amounts", () => {
    const html = render([item()]);
    expect(html).toContain("data-privacy-value");
    expect(html).toMatch(/aria-hidden/);
  });
});

describe("TopExpensesInvite", () => {
  it("invites to add an expense", () => {
    const text = plain(renderToStaticMarkup(<TopExpensesInvite />));
    expect(text).toContain("Nenhum gasto nos últimos 7 dias");
    expect(text).toContain(
      "Quando você lançar uma despesa, as maiores aparecem aqui.",
    );
    expect(text).toContain("Adicionar gasto");
  });
});
