import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { brlParts, NBSP } from "@/lib/format/money";
import { Money, spokenAmount } from "./money";

const visible = (html: string) =>
  /<span aria-hidden="true">(.*?)<\/span><span class="sr-only">/.exec(
    html,
  )?.[1];

describe("Money", () => {
  it("signs list amounts by tone: income +, expense −, transfer unsigned", () => {
    expect(visible(renderToStaticMarkup(<Money cents={780000} />))).toBe(
      `+R$${NBSP}7.800,00`,
    );
    expect(visible(renderToStaticMarkup(<Money cents={-6450} />))).toBe(
      `−R$${NBSP}64,50`,
    );
    expect(
      visible(renderToStaticMarkup(<Money cents={-50000} tone="transfer" />)),
    ).toBe(`R$${NBSP}500,00`);
  });

  it("colors by tone and uses tabular figures in list variants", () => {
    const income = renderToStaticMarkup(<Money cents={100} />);
    expect(income).toContain("text-income");
    expect(income).toContain("tabular-nums");
    const expense = renderToStaticMarkup(
      <Money cents={-100} variant="caption" />,
    );
    expect(expense).toContain("text-fg");
    expect(expense).toContain("text-caption");
  });

  it("splits currency and cents in the display variant", () => {
    const html = renderToStaticMarkup(
      <Money cents={2767015} variant="display" tone="neutral" />,
    );
    expect(html).toContain("text-display");
    expect(html).not.toContain("tabular-nums");
    expect(html).toMatch(/text-\[0\.5em\][^>]*>R\$<\/span>27\.670<span/);
    expect(html).toMatch(/text-\[0\.55em\][^>]*>,15<\/span>/);
  });

  it("renders the privacy mask with an accessible name", () => {
    const html = renderToStaticMarkup(<Money cents={-6450} />);
    expect(html).toContain('data-privacy-value=""');
    expect(html).toContain(
      'data-privacy-mask="" role="img" aria-label="valor oculto"',
    );
    expect(html).toContain(`R$${NBSP}••••`);
  });

  it("lets className override the tone color", () => {
    const html = renderToStaticMarkup(
      <Money cents={500} className="text-fg-2" />,
    );
    expect(html).toContain("text-fg-2");
    expect(html).not.toContain("text-income");
  });
});

describe("spokenAmount", () => {
  const say = (cents: number, sign: "auto" | "always" | "never" = "auto") =>
    spokenAmount(cents, brlParts(cents, { sign }));

  it("reads reais and centavos in Portuguese", () => {
    expect(say(-6450)).toBe("menos 64 reais e 50 centavos");
    expect(say(780000, "always")).toBe("mais 7.800 reais");
    expect(say(100)).toBe("1 real");
    expect(say(101)).toBe("1 real e 1 centavo");
    expect(say(50)).toBe("50 centavos");
    expect(say(0)).toBe("0 reais");
  });
});
