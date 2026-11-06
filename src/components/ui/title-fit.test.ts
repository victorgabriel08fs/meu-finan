import { describe, expect, it } from "vitest";
import { titleFit } from "./title-fit";

describe("titleFit", () => {
  it("sizes by the longest word, not the whole title", () => {
    const { style } = titleFit("Preferências e notificações", "title-1");
    expect(style).toMatchObject({
      "--title-size": "var(--text-title-1)",
      "--title-em": (12 * 0.62).toFixed(2),
    });
  });

  it("copes with an empty title", () => {
    expect(titleFit("", "title-2").style).toMatchObject({
      "--title-em": "0.62",
    });
  });
});
