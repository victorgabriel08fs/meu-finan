import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TagPicker } from "./tag-picker";

// Server Actions are not available outside Next.
vi.mock("@/server/actions/tags", () => ({
  createTagAction: vi.fn(async () => ({ data: undefined })),
}));

const tag = (n: number, patch: { archived?: boolean } = {}) => ({
  id: `t${n}`,
  name: `etiqueta${String(n).padStart(2, "0")}`,
  ...patch,
});

const render = (
  tags: Parameters<typeof TagPicker>[0]["tags"],
  selected: string[] = [],
) =>
  renderToStaticMarkup(
    <TagPicker tags={tags} selected={selected} onChange={vi.fn()} />,
  );

describe("TagPicker", () => {
  it("explains the feature when there are no tags", () => {
    const html = render([]);
    expect(html).toContain("Etiquetas");
    expect(html).toContain("Junte lançamentos de categorias diferentes");
    expect(html).toContain("Buscar ou criar etiqueta");
  });

  it("shows the tags as toggles with their state", () => {
    const html = render([tag(1), tag(2)], ["t2"]);
    expect(html).toContain("etiqueta01");
    expect(html).toContain("etiqueta02");
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(1);
    expect(html).not.toContain("Junte lançamentos");
  });

  it("keeps the order of the names, not of the selection", () => {
    const html = render([tag(3), tag(1), tag(2)], ["t3"]);
    expect(html.indexOf("etiqueta01")).toBeLessThan(html.indexOf("etiqueta02"));
    expect(html.indexOf("etiqueta02")).toBeLessThan(html.indexOf("etiqueta03"));
  });

  it("labels an archived tag the entry still has, and hides the others", () => {
    const html = render(
      [tag(1), tag(2, { archived: true }), tag(3, { archived: true })],
      ["t2"],
    );
    expect(html).toContain("etiqueta02 (arquivada)");
    expect(html).not.toContain("etiqueta03");
  });

  it("disables the unselected chips at ten and says why", () => {
    const tags = Array.from({ length: 12 }, (_, i) => tag(i + 1));
    const selected = tags.slice(0, 10).map((item) => item.id);
    const html = render(tags, selected);
    expect(html).toContain("Até 10 etiquetas por lançamento.");
    expect(html.match(/disabled=""/g)?.length).toBe(2);
    const under = render(tags, selected.slice(0, 9));
    expect(under).not.toContain("Até 10 etiquetas por lançamento.");
    expect(under).not.toContain('disabled=""');
  });
});
