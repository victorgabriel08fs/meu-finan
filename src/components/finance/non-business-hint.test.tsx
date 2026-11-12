import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { holidayCalendar, nonBusinessDue } from "@/lib/finance";
import { NonBusinessHint } from "./non-business-hint";

const calendar = holidayCalendar([2026]);
const saturday = nonBusinessDue("2026-11-14", calendar);
if (!saturday) throw new Error("14/11/2026 is a Saturday");

const plainText = (html: string) =>
  html.replace(/<[^>]+>/g, "").replace(/ /g, " ");

describe("NonBusinessHint, row", () => {
  it("is one line of real text with a decorative icon", () => {
    const html = renderToStaticMarkup(<NonBusinessHint nb={saturday} />);
    expect(plainText(html)).toBe("Dia não útil · passa para seg, 16 nov");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('data-slot="non-business-hint"');
    expect(html).toContain("text-fg-3");
    expect(html).not.toMatch(/R\$|••••/);
  });

  it("the column placement shows normally and hides when the row is narrow, clamped to 2 lines", () => {
    const html = renderToStaticMarkup(<NonBusinessHint nb={saturday} />);
    expect(html).toContain("@max-tight:hidden");
    expect(html).toContain("line-clamp-2");
  });

  it("the below placement shows only in a narrow row, over the full width", () => {
    const html = renderToStaticMarkup(
      <NonBusinessHint nb={saturday} placement="below" />,
    );
    expect(html).toContain("hidden");
    expect(html).toContain("basis-full");
    expect(html).toContain("@max-tight:flex");
    expect(html).not.toContain("line-clamp-2");
    expect(plainText(html)).toBe("Dia não útil · passa para seg, 16 nov");
  });

  it("uses no status color: information, not an alert", () => {
    const html = renderToStaticMarkup(<NonBusinessHint nb={saturday} />);
    expect(html).not.toMatch(/warning|danger|text-primary/);
  });
});

describe("NonBusinessHint, detail", () => {
  it("spells out the sentence in a note box, with the pay-until date", () => {
    const html = renderToStaticMarkup(
      <NonBusinessHint
        nb={saturday}
        variant="detail"
        dueOn="2026-11-14"
        today="2026-11-11"
      />,
    );
    expect(plainText(html)).toBe(
      "Vence num sábado, dia não útil. O pagamento costuma passar para o próximo dia útil, segunda, 16 de novembro. Se preferir não esperar, pague até sexta, 13 de novembro.",
    );
    expect(html).toContain("rounded-control");
    expect(html).toContain("text-fg-2");
    expect(html).toContain('aria-hidden="true"');
  });

  it("says 'pague hoje' on the last business day", () => {
    const html = renderToStaticMarkup(
      <NonBusinessHint
        nb={saturday}
        variant="detail"
        dueOn="2026-11-14"
        today="2026-11-13"
      />,
    );
    expect(plainText(html)).toMatch(/pague hoje\.$/);
  });
});
