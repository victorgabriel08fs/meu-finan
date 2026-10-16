import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MonthSwitcher, shiftMonth } from "./month-switcher";

describe("shiftMonth", () => {
  it("moves across year boundaries", () => {
    expect(shiftMonth("2026-10", 1)).toBe("2026-11");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-10", -22)).toBe("2024-12");
    expect(shiftMonth("2026-10", 0)).toBe("2026-10");
  });
});

describe("MonthSwitcher", () => {
  const hrefFor = (month: string) => `/extrato?mes=${month}`;

  it("links to the neighbouring months with spoken labels", () => {
    const html = renderToStaticMarkup(
      <MonthSwitcher
        month="2026-10"
        currentMonth="2026-10"
        hrefFor={hrefFor}
      />,
    );
    expect(html).toContain("outubro de 2026");
    expect(html).toContain('aria-label="Mês anterior: setembro de 2026"');
    expect(html).toContain('href="/extrato?mes=2026-09"');
    expect(html).toContain('aria-label="Próximo mês: novembro de 2026"');
    expect(html).not.toContain("Voltar para hoje");
  });

  it("offers a way back to the current month", () => {
    const html = renderToStaticMarkup(
      <MonthSwitcher
        month="2026-07"
        currentMonth="2026-10"
        hrefFor={hrefFor}
      />,
    );
    expect(html).toMatch(/href="\/extrato\?mes=2026-10"[^>]*>Voltar para hoje/);
  });
});
