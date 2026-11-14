import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Subscription } from "@/lib/home/subscriptions";
import type { MonthlySubscriptions } from "@/server/domain/subscriptions";
import {
  moreText,
  nextDebitText,
  rowLabel,
  SubscriptionsBlock,
  SubscriptionsInvite,
} from "./subscriptions-block";

// Server Actions are not importable outside Next (the quick add button).
vi.mock("@/server/actions/transactions", () => ({ setPaidAction: vi.fn() }));
vi.mock("@/server/actions/preferences", () => ({ setThemeAction: vi.fn() }));

const TODAY = "2026-11-14";

const item = (over: Partial<Subscription> = {}): Subscription => ({
  recurrenceId: "r1",
  description: "Streaming",
  accountId: "a1",
  accountName: "Conta Principal",
  amountCents: 4_990,
  nextOn: "2026-11-20",
  previousCents: 4_490,
  previousOn: "2026-10-10",
  increaseCents: 0,
  ...over,
});

const summary = (
  items: Subscription[],
  over: Partial<MonthlySubscriptions> = {},
): MonthlySubscriptions => ({
  items,
  totalCount: items.length,
  monthlyCents: items.reduce((sum, s) => sum + s.amountCents, 0),
  increasedCount: items.filter((s) => s.increaseCents > 0).length,
  hiddenIncreasedCount: 0,
  ...over,
});

const render = (s: MonthlySubscriptions) =>
  renderToStaticMarkup(
    <SubscriptionsBlock
      summary={s}
      today={TODAY}
      hrefFor={(it) => `/extrato?conta=${it.accountId}&q=${it.description}`}
    />,
  );

const plain = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("SubscriptionsBlock", () => {
  it("names the region and says what they add up to", () => {
    const html = render(summary([item(), item({ recurrenceId: "r2" })]));
    expect(html).toContain('aria-labelledby="inicio-assinaturas"');
    expect(html).toContain('id="inicio-assinaturas"');
    const text = plain(html);
    expect(text).toContain("Assinaturas do mês");
    expect(text).toContain("Somam R$ 99,80");
    expect(text).toContain("por mês");
  });

  it("lists a row per subscription, each a link of its own, with account and next debit", () => {
    const html = render(
      summary([
        item({
          recurrenceId: "r1",
          description: "Streaming",
          nextOn: "2026-11-25",
        }),
        item({
          recurrenceId: "r2",
          description: "Academia",
          nextOn: "2026-11-15",
        }),
      ]),
    );
    expect(html.match(/<li/g)).toHaveLength(2);
    expect(html).toContain('href="/extrato?conta=a1&amp;q=Streaming"');
    expect(html).toContain('href="/extrato?conta=a1&amp;q=Academia"');
    const text = plain(html);
    expect(text).toContain("Conta Principal · próximo débito em 25/nov");
    expect(text).toContain("Conta Principal · próximo débito amanhã");
  });

  it("shows the 'subiu' badge only with an increase, icon hidden from readers", () => {
    const plainRow = render(summary([item()]));
    expect(plain(plainRow)).not.toContain("subiu");
    const up = render(summary([item({ increaseCents: 500 })]));
    expect(plain(up)).toMatch(/subiu R\$\s*5,00/);
    expect(up).toMatch(/<svg[^>]*aria-hidden="true"/);
  });

  it("closes with 'e mais N', singular and plural, counting the raised ones", () => {
    const one = summary([item()], { totalCount: 2 });
    expect(plain(render(one))).toContain("e mais 1 assinatura");
    expect(plain(render(one))).not.toContain("assinaturas,");
    const many = summary([item()], { totalCount: 4 });
    expect(plain(render(many))).toContain("e mais 3 assinaturas");
    expect(plain(render(summary([item()])))).not.toContain("e mais");
    expect(
      moreText(summary([item()], { totalCount: 3, hiddenIncreasedCount: 1 })),
    ).toBe("e mais 2 assinaturas, 1 subiu");
    expect(
      moreText(summary([item()], { totalCount: 4, hiddenIncreasedCount: 2 })),
    ).toBe("e mais 3 assinaturas, 2 subiram");
  });

  it("goes through Money, so the discreet mode masks the amounts and the badge", () => {
    const html = render(summary([item({ increaseCents: 500 })]));
    expect(html).toContain("data-privacy-value");
    expect(html).toMatch(/aria-hidden/);
    // Legend, row amount and badge: three masked values.
    expect(html.match(/data-privacy-value/g)?.length).toBeGreaterThanOrEqual(3);
  });
});

describe("nextDebitText", () => {
  it("says hoje, amanhã, em N dias and the short date", () => {
    expect(nextDebitText("2026-11-14", TODAY)).toBe("hoje");
    expect(nextDebitText("2026-11-15", TODAY)).toBe("amanhã");
    expect(nextDebitText("2026-11-16", TODAY)).toBe("em 2 dias");
    expect(nextDebitText("2026-11-20", TODAY)).toBe("em 6 dias");
    expect(nextDebitText("2026-11-21", TODAY)).toBe("em 21/nov");
  });

  it("adds the year when it is another one", () => {
    expect(nextDebitText("2027-01-05", TODAY)).toBe("em 5/jan/27");
  });
});

describe("rowLabel", () => {
  it("says amount, next debit and account, then where it opens", () => {
    const label = rowLabel(item({ nextOn: "2026-11-30" }), TODAY);
    expect(label).toContain("Streaming");
    expect(label).toMatch(/R\$\s*49,90|49 reais e 90 centavos/);
    expect(label).toContain("por mês");
    expect(label).toContain("próximo débito em 30 de novembro de 2026");
    expect(label).toContain("Conta Principal");
    expect(label).toMatch(/; abrir no Extrato$/);
    expect(label).not.toContain("subiu");
  });

  it("says hoje and amanhã, and the increase since the month", () => {
    expect(rowLabel(item({ nextOn: TODAY }), TODAY)).toContain(
      "próximo débito hoje",
    );
    expect(rowLabel(item({ nextOn: "2026-11-15" }), TODAY)).toContain(
      "próximo débito amanhã",
    );
    const up = rowLabel(item({ increaseCents: 500 }), TODAY);
    expect(up).toContain("subiu");
    expect(up).toContain("desde outubro");
  });
});

describe("SubscriptionsInvite", () => {
  it("invites to add a monthly expense", () => {
    const text = plain(renderToStaticMarkup(<SubscriptionsInvite />));
    expect(text).toContain("Nenhuma assinatura por aqui");
    expect(text).toContain(
      "Lance uma despesa com Repetir “Todo mês” e ela aparece aqui, com o próximo débito.",
    );
    expect(text).toContain("Adicionar gasto");
  });
});
