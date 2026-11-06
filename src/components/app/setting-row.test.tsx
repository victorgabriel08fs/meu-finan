import { Bell } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SettingRow, SettingRowButton } from "./setting-row";

describe("SettingRow", () => {
  it("names the label and the description with the ids the controls point at", () => {
    const html = renderToStaticMarkup(
      <SettingRow
        id="row"
        icon={Bell}
        label="Receber notificações"
        description="Avisos no aparelho."
        control={<button type="button">c</button>}
      />,
    );
    expect(html).toContain('id="row-label"');
    expect(html).toContain('id="row-hint"');
    expect(html).toContain("Receber notificações");
    expect(html).toContain("Avisos no aparelho.");
  });

  it("lets the control drop below the text instead of squeezing it", () => {
    const html = renderToStaticMarkup(
      <SettingRow id="row" label="A" control={<span>c</span>} />,
    );
    expect(html).toContain("flex-wrap");
    expect(html).toContain("flex-[1_1_11rem]");
    expect(html).toMatch(/class="ml-auto shrink-0"><span>c<\/span>/);
  });

  it("omits the description and the icon when there are none", () => {
    const html = renderToStaticMarkup(<SettingRow id="row" label="A" />);
    expect(html).not.toContain("row-hint");
    expect(html).not.toContain("rounded-chip");
  });

  it("is a button when the whole line is an action", () => {
    const html = renderToStaticMarkup(
      <SettingRowButton id="r" label="Rever dicas" disabled />,
    );
    expect(html).toMatch(/^<button type="button"/);
    expect(html).toContain("disabled");
    expect(html).toContain("border-t");
  });
});
