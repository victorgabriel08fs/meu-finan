import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatementSummaryCard } from "./statement-summary";

const summary = {
  incomeCents: 500_000,
  expenseCents: 200_000,
  pendingIncomeCents: 120_000,
  pendingExpenseCents: 45_000,
  transferCents: 0,
};

describe("StatementSummaryCard", () => {
  it("closes the first scheduled item with the separator, never opens the second", () => {
    const html = renderToStaticMarkup(
      <StatementSummaryCard
        summary={summary}
        monthName="outubro"
        mode="flow"
      />,
    );
    // "a receber" + no-break space + "·", then "a pagar" starts clean.
    expect(html).toContain(
      '<span aria-hidden="true"> ·</span></span><span><span data-slot="money"',
    );
    expect(html).not.toContain("· ");
  });

  it("has no separator with only one scheduled item", () => {
    const html = renderToStaticMarkup(
      <StatementSummaryCard
        summary={{ ...summary, pendingExpenseCents: 0 }}
        monthName="outubro"
        mode="flow"
      />,
    );
    expect(html).toContain("a receber");
    expect(html).not.toContain("·");
  });
});
