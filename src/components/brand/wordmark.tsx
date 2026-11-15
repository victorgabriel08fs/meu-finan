import { cn } from "@/lib/utils";

/** Wordmark "prumo" on a 301×88 grid, split so the homepage can animate the p's stem and weight. */
export const WORDMARK_VIEWBOX = "0 0 301 88";
/** The letters, without the p's stem. */
export const WORDMARK_LETTERS =
  "M16 32a18 18 0 1 0 36 0a18 18 0 1 0 -36 0M70 14V50M70 32A18 18 0 0 1 100.73 19.27M114.72792206135786 14V32A18 18 0 0 0 150.72792206135784 32M150.72792206135784 14V50M168.72792206135784 14V50M168.72792206135784 29.5A15.5 15.5 0 0 1 199.72792206135784 29.5V50M199.72792206135784 29.5A15.5 15.5 0 0 1 230.72792206135784 29.5V50M248.72792206135784 32a18 18 0 1 0 36 0a18 18 0 1 0 -36 0";
/** The p's stem. */
export const WORDMARK_STEM = "M16 14V62";
/** The diamond weight under the stem. */
export const WORDMARK_WEIGHT = "M16 58l8.5 9.5l-8.5 12.5l-8.5 -12.5Z";

/**
 * "prumo" wordmark: letters in the text color (`text-fg` by inheritance),
 * diamond in the primary token. Minimum height 20 px. With `label` it is an
 * image named "Prumo"; without, decorative. The p's stem and weight carry
 * `data-wordmark-stem` / `data-wordmark-weight` for the homepage's motion.
 */
export function Wordmark({
  className,
  label,
}: {
  className?: string;
  label?: string;
}) {
  const shapes = (
    <>
      <g
        fill="none"
        className="stroke-current"
        strokeWidth={8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={WORDMARK_LETTERS} />
        <path d={WORDMARK_STEM} data-wordmark-stem="" />
      </g>
      <path
        d={WORDMARK_WEIGHT}
        data-wordmark-weight=""
        className="fill-primary stroke-primary"
        strokeWidth={3}
        strokeLinejoin="round"
      />
    </>
  );
  const classes = cn("text-fg", className);
  if (!label) {
    return (
      <svg aria-hidden="true" viewBox={WORDMARK_VIEWBOX} className={classes}>
        {shapes}
      </svg>
    );
  }
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={WORDMARK_VIEWBOX}
      className={classes}
    >
      {shapes}
    </svg>
  );
}
