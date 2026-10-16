import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "./button";

describe("cn with design tokens", () => {
  it("keeps a token color next to a token font size", () => {
    expect(cn("text-fg", "text-headline")).toBe("text-fg text-headline");
    expect(cn("text-fg", "text-headline", "text-fg-2")).toBe(
      "text-headline text-fg-2",
    );
  });

  it("resolves token radii, shadows and the page gutter", () => {
    expect(cn("rounded-control", "rounded-card")).toBe("rounded-card");
    expect(cn("shadow-card", "shadow-none")).toBe("shadow-none");
    expect(cn("px-4", "px-gutter")).toBe("px-gutter");
  });
});

describe("Button", () => {
  it("lets className override a variant color but keeps its size", () => {
    const classes = cn(
      buttonVariants({ variant: "ghost", size: "sm" }),
      "text-danger",
    );
    expect(classes).toContain("text-danger");
    expect(classes).toContain("text-callout");
    expect(classes).not.toContain("text-primary");
  });

  it("marks loading buttons busy and disabled, keeping the label", () => {
    const html = renderToStaticMarkup(<Button loading>Salvar</Button>);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('disabled=""');
    expect(html).toContain('type="button"');
    expect(html).toContain(">Salvar</span>");
  });

  it("renders its child with asChild", () => {
    const html = renderToStaticMarkup(
      <Button asChild variant="tonal">
        <a href="/planejar">Planejar</a>
      </Button>,
    );
    expect(html).toMatch(/^<a href="\/planejar"[^>]*bg-primary-soft/);
  });
});
