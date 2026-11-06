import type { CSSProperties } from "react";

/** Average width of a bold character, in em (a little generous: capitals, accents). */
const CHAR_EM = 0.62;

/**
 * Props that make a title shrink (down to 60%) when its longest word is wider
 * than the nearest `@container`, instead of breaking mid-word: the font size
 * is the variant's unless 100cqi / (longest word in em) is smaller. With
 * `title-fit` (globals.css). A title that fits keeps its normal size.
 */
export function titleFit(
  text: string,
  size: "title-1" | "title-2",
): { className: string; style: CSSProperties } {
  const longest = Math.max(
    1,
    ...text.split(/\s+/).map((word) => [...word].length),
  );
  return {
    className: "title-fit",
    style: {
      "--title-size": `var(--text-${size})`,
      "--title-em": (longest * CHAR_EM).toFixed(2),
    } as CSSProperties,
  };
}
