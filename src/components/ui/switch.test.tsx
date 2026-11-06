import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Switch } from "./switch";

describe("Switch", () => {
  it("is a switch named by its visible label", () => {
    const html = renderToStaticMarkup(
      <Switch
        checked={false}
        onCheckedChange={() => {}}
        labelledBy="a-label"
        describedBy="a-hint"
      />,
    );
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain('aria-labelledby="a-label"');
    expect(html).toContain('aria-describedby="a-hint"');
    expect(html).not.toContain("aria-label=");
  });

  it("falls back to an accessible name and passes other attributes on", () => {
    const html = renderToStaticMarkup(
      <Switch
        checked
        onCheckedChange={() => {}}
        label="Parcelar"
        id="x"
        disabled
      />,
    );
    expect(html).toContain('aria-label="Parcelar"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('id="x"');
    expect(html).toContain("disabled");
  });

  it("draws the off track in --switch-off and the on track in --primary", () => {
    const off = renderToStaticMarkup(
      <Switch checked={false} onCheckedChange={() => {}} label="A" />,
    );
    const on = renderToStaticMarkup(
      <Switch checked onCheckedChange={() => {}} label="A" />,
    );
    expect(off).toContain("bg-switch-off");
    expect(off).not.toContain("bg-surface-3");
    expect(on).toContain("bg-primary");
    expect(on).toContain("translate-x-");
  });

  it("keeps a 44px target whatever the size of the track", () => {
    const html = renderToStaticMarkup(
      <Switch checked onCheckedChange={() => {}} label="A" />,
    );
    expect(html).toContain("min-h-11");
    expect(html).toContain("min-w-");
  });
});
