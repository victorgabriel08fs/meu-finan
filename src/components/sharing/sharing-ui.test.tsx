import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BalanceText } from "./balance-text";
import {
  basisPointsFromPercent,
  calculatorExpression,
  defaultInputs,
  initialDraft,
  percentFromBasisPoints,
  previewSplit,
  quickAddPreset,
  type SplitDraft,
  type SplitMember,
} from "./model";
import { SplitEditor } from "./split-editor";

const ana: SplitMember = { id: "a", name: "Ana", isMe: true };
const bruno: SplitMember = { id: "b", name: "Bruno", isMe: false };
const members = [ana, bruno];

const html = (draft: SplitDraft, totalCents: number | null) =>
  renderToStaticMarkup(
    <SplitEditor
      members={members}
      totalCents={totalCents}
      draft={draft}
      onDraftChange={() => {}}
      paidBy={{ value: "a", onChange: () => {} }}
    />,
  );

describe("the split editor", () => {
  it("offers the four ways and who paid", () => {
    const markup = html(initialDraft(members, null, 10_000), 10_000);
    for (const label of ["Iguais", "Valores", "Percentual", "Cotas"]) {
      expect(markup).toContain(label);
    }
    expect(markup).toContain("Quem pagou");
  });

  it("says why an amounts split does not close, with aria-live", () => {
    const draft: SplitDraft = {
      method: "amounts",
      inputs: { a: 3_000, b: 4_000 },
    };
    const markup = html(draft, 10_000);
    expect(markup).toContain("Faltam R$ 30,00 para fechar o total.");
    expect(markup).toContain("aria-live");
    const over = html(
      { method: "amounts", inputs: { a: 9_000, b: 4_000 } },
      10_000,
    );
    expect(over).toContain("Passou R$ 30,00 do total.");
  });

  it("says when the percentages do not sum 100%", () => {
    const markup = html(
      { method: "percent", inputs: { a: 5_000, b: 4_000 } },
      10_000,
    );
    expect(markup).toContain("Os percentuais somam 90%");
  });

  it("names each person's field for a screen reader", () => {
    const amounts = html({ method: "amounts", inputs: { a: 0, b: 0 } }, 100);
    expect(amounts).toContain("Parte de Você");
    const shares = html({ method: "shares", inputs: { a: 2, b: 1 } }, 300);
    expect(shares).toContain("Mais uma cota para Bruno");
    expect(shares).toContain("2 cotas para Você");
    expect(shares).toContain("1 cota para Bruno");
  });

  it("notes who keeps the odd cent of an equal split", () => {
    const markup = html(initialDraft(members, null, 10_001), 10_001);
    expect(markup).toContain("1 centavo fica com você.");
  });
});

describe("the editor's model", () => {
  it("starts every method with everyone in, equal parts", () => {
    expect(defaultInputs("equal", members, 100)).toEqual({ a: 1, b: 1 });
    expect(defaultInputs("percent", members, 100)).toEqual({
      a: 5_000,
      b: 5_000,
    });
    expect(defaultInputs("amounts", members, 10_001)).toEqual({
      a: 5_001,
      b: 5_000,
    });
    expect(defaultInputs("shares", [], null)).toEqual({});
  });

  it("falls back to the method's defaults when the saved split misses a member", () => {
    const draft = initialDraft(
      members,
      { method: "percent", inputs: { a: 6_000 } },
      null,
    );
    expect(draft).toEqual({
      method: "percent",
      inputs: { a: 5_000, b: 5_000 },
    });
    expect(
      initialDraft(members, { method: "shares", inputs: { a: 2, b: 1 } }, null)
        .inputs,
    ).toEqual({ a: 2, b: 1 });
    // A saved split by amounts is never reused: it fits one total only.
    expect(
      initialDraft(members, { method: "amounts", inputs: { a: 1, b: 2 } }, 100)
        .method,
    ).toBe("equal");
  });

  it("previews as the server will, and not without a total", () => {
    expect(previewSplit(null, initialDraft(members, null, null), members)).toBe(
      null,
    );
    const result = previewSplit(
      10_001,
      initialDraft(members, null, null),
      members,
    );
    expect(result?.ok && result.shares.map((s) => s.shareCents)).toEqual([
      5_001, 5_000,
    ]);
  });

  it("converts percent and basis points both ways", () => {
    expect(percentFromBasisPoints(3_333)).toBe(33.33);
    expect(basisPointsFromPercent(33.33)).toBe(3_333);
  });

  it("writes the amount as the keypad expects it", () => {
    expect(calculatorExpression(12_000)).toBe("120");
    expect(calculatorExpression(3_505)).toBe("35,05");
    expect(
      quickAddPreset({
        amountCents: 3_550,
        description: "Acerto · Casa",
        date: "2026-11-12",
      }),
    ).toEqual({
      expression: "35,50",
      description: "Acerto · Casa",
      date: "2026-11-12",
    });
  });
});

describe("the balance sentence", () => {
  const text = (transfers: { name: string; amountCents: number }[]) =>
    renderToStaticMarkup(<BalanceText transfers={transfers} />)
      .replaceAll(/<[^>]+>/g, "")
      .replaceAll(" ", " ");

  it("says who owes whom, or that everything is settled", () => {
    expect(text([{ name: "Bruno", amountCents: 12_000 }])).toContain(
      "Bruno te deve R$ 120,00",
    );
    const owing = text([{ name: "Bruno", amountCents: -8_000 }]);
    expect(owing).toContain("Você deve R$ 80,00");
    expect(owing).toContain("para Bruno");
    expect(text([])).toContain("Tudo acertado");
  });

  it("puts the amount in the income or the expense tone", () => {
    const owed = renderToStaticMarkup(
      <BalanceText transfers={[{ name: "Bruno", amountCents: 100 }]} />,
    );
    expect(owed).toContain("text-income");
    const owing = renderToStaticMarkup(
      <BalanceText transfers={[{ name: "Bruno", amountCents: -100 }]} />,
    );
    expect(owing).toContain("text-expense");
  });
});
