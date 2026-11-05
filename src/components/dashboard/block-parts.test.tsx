import { CalendarDays } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BlockInvite } from "./block-invite";
import { BlockLink } from "./block-link";

describe("BlockInvite", () => {
  it("shows the icon, the title, one line and the next step", () => {
    const html = renderToStaticMarkup(
      <BlockInvite
        icon={<CalendarDays />}
        title="Nenhuma despesa em outubro"
        description="Quando houver, o calendário mostra os dias de mais gasto."
        action={<button type="button">Adicionar despesa</button>}
      />,
    );
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("[&amp;_svg]:size-5");
    expect(html).toContain("lucide-calendar-days");
    expect(html).toContain(
      '<h2 class="text-headline text-fg">Nenhuma despesa em outubro</h2>',
    );
    expect(html).toContain(
      "Quando houver, o calendário mostra os dias de mais gasto.",
    );
    expect(html).toContain(">Adicionar despesa</button>");
    // Wraps the action under the text when the block is narrow.
    expect(html).toContain("flex flex-wrap items-center gap-3");
    expect(html).toContain("basis-48");
  });

  it("works without an action", () => {
    const html = renderToStaticMarkup(
      <BlockInvite
        icon={<CalendarDays />}
        title="Título"
        description="Linha"
      />,
    );
    expect(html).not.toContain("<button");
    expect(html).toContain("Título");
  });
});

describe("BlockLink", () => {
  it("is a 44px ghost link pulled into the card's padding", () => {
    const html = renderToStaticMarkup(
      <BlockLink href="/relatorios/fluxo?mes=2026-09">Ver relatório</BlockLink>,
    );
    expect(html).toContain('href="/relatorios/fluxo?mes=2026-09"');
    expect(html).toContain(">Ver relatório</a>");
    expect(html).toContain("h-11");
    expect(html).toContain("-my-1.5 -mr-2");
    expect(html).toContain("text-primary");
  });
});
