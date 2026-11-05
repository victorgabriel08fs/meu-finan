import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { DaySpending } from "@/server/domain/reports";
import {
  calendarDayHref,
  SpendingCalendarBlock,
  SpendingCalendarInvite,
} from "./spending-calendar-block";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe("SpendingCalendarBlock", () => {
  const days: DaySpending[] = Array.from({ length: 31 }, (_, k) => ({
    date: `2026-10-${String(k + 1).padStart(2, "0")}`,
    paidCents: k < 14 ? (k + 1) * 1_000 : 0,
    paidCount: k < 14 ? 1 : 0,
    pendingCents: k === 19 ? 11_990 : 0,
    pendingCount: k === 19 ? 1 : 0,
  }));

  it("shows the month, its figures and the way to the report", () => {
    const html = renderToStaticMarkup(
      <SpendingCalendarBlock
        days={days}
        today="2026-10-14"
        monthTitle="outubro de 2026"
        reportHref="/relatorios/calendario"
        phase="current"
      />,
    );
    expect(html).toContain('aria-labelledby="inicio-calendario"');
    expect(html).toContain('id="inicio-calendario"');
    // The name in "Personalizar o Início" (doc 02 §10.4).
    expect(html).toContain(">Calendário de gastos</h2>");
    expect(html).toContain(
      "Despesas pagas por dia; no cartão, na data da compra",
    );
    expect(html).toContain('href="/relatorios/calendario"');
    expect(html).toContain("Ver relatório");
    expect(html).toContain(
      "Gastos por dia em outubro de 2026. Escolha um dia para ver as despesas no relatório.",
    );
    // Nothing chosen on the Início: a tap goes to the report.
    expect(html).not.toContain('aria-pressed="true"');
    for (const label of ["Gasto no mês", "Média por dia", "Dia mais caro"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("em 14 dias");
  });

  it("leaves the figures out for a month to come", () => {
    const html = renderToStaticMarkup(
      <SpendingCalendarBlock
        days={days}
        today="2026-09-14"
        monthTitle="outubro de 2026"
        reportHref="/relatorios/calendario?mes=2026-10"
        phase="future"
      />,
    );
    expect(html).not.toContain("Gasto no mês");
    expect(html).toContain('href="/relatorios/calendario?mes=2026-10"');
  });

  it("opens the report on the day chosen, in the same month", () => {
    expect(calendarDayHref("/relatorios/calendario", "2026-10-12")).toBe(
      "/relatorios/calendario?dia=2026-10-12",
    );
    expect(
      calendarDayHref("/relatorios/calendario?mes=2026-09", "2026-09-03"),
    ).toBe("/relatorios/calendario?mes=2026-09&dia=2026-09-03");
  });

  it("invites to add an expense in a month without any", () => {
    const html = renderToStaticMarkup(
      <SpendingCalendarInvite monthName="outubro" />,
    );
    expect(html).toContain("Nenhuma despesa em outubro");
    expect(html).toContain(
      "Quando houver, o calendário mostra os dias de mais gasto.",
    );
    expect(html).toContain("Adicionar despesa");
  });
});
