import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BalanceHero } from "./balance-hero";

const forecast = {
  balanceCents: 100_000,
  pendingIncomeCents: 0,
  pendingExpenseCents: 0,
  invoicesDueCents: 0,
  forecastCents: 100_000,
};

function chip(monthChangeCents: number) {
  const html = renderToStaticMarkup(
    <BalanceHero
      balanceCents={100_000}
      monthChangeCents={monthChangeCents}
      monthName="outubro"
      forecast={forecast}
      untilLabel="31/out"
    />,
  );
  const start = html.search(/<span class="inline-flex min-h-7\.5/);
  return html.slice(start, html.indexOf('<div aria-hidden="true"', start));
}

describe("BalanceHero month change chip", () => {
  it.each([
    ["up", 12_345],
    ["down", -12_345],
  ])("keeps icon, value and month together when %s", (_name, cents) => {
    const html = chip(cents);
    // The text flows in one span (it wraps only when it must), no flex-wrap.
    expect(html).not.toContain("flex-wrap");
    expect(html).toContain("items-start");
    expect(html).toContain('<span class="min-w-0">');
    expect(html).toContain("em outubro");
    const text = html.indexOf('<span class="min-w-0">');
    expect(html.indexOf("<svg")).toBeLessThan(text);
    expect(html.indexOf("em outubro")).toBeGreaterThan(text);
  });

  it("says there is no change when zero", () => {
    const html = chip(0);
    expect(html).toContain("Sem variação em outubro");
    expect(html).not.toContain("flex-wrap");
  });
});
