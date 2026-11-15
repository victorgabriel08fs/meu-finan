import { cn } from "@/lib/utils";

/**
 * Prumo symbol ("p" as a plumb line) on a 64 grid, shared by the UI mark, the
 * wordmark's companions and the app icons (app-icon.tsx): a stem and a ring
 * drawn as strokes (fill none) and a diamond weight (fill + stroke 2.5).
 */
export const BRAND_SYMBOL = {
  viewBox: "0 0 64 64",
  stem: "M21.5 9V42",
  ring: { cx: 34, cy: 23.5, r: 13.5 },
  weight: "M21.5 38.5L29 47L21.5 58L14 47Z",
} as const;

/** Stroke width from 48 px up. */
export const BRAND_STROKE = 7;
/** Stroke width up to 48 px and for the monochrome version. */
export const BRAND_STROKE_SMALL = 8.5;
/** Stroke of the diamond weight. */
export const BRAND_WEIGHT_STROKE = 2.5;

function SymbolPaths({ strokeWidth }: { strokeWidth: number }) {
  const { stem, ring, weight } = BRAND_SYMBOL;
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <path d={stem} fill="none" strokeWidth={strokeWidth} />
      <circle
        cx={ring.cx}
        cy={ring.cy}
        r={ring.r}
        fill="none"
        strokeWidth={strokeWidth}
      />
      <path
        d={weight}
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={BRAND_WEIGHT_STROKE}
      />
    </g>
  );
}

/**
 * App mark for the UI: white Prumo symbol on an emerald rounded square, the
 * same drawing as the app icons. Decorative: the app name is always written
 * next to it.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-[28%] bg-[#0a7f58] text-white",
        className,
      )}
    >
      <svg
        aria-hidden="true"
        viewBox={BRAND_SYMBOL.viewBox}
        stroke="currentColor"
        className="size-[70%]"
      >
        <SymbolPaths strokeWidth={BRAND_STROKE_SMALL} />
      </svg>
    </span>
  );
}

/** Just the symbol in `currentColor` (pair with `text-primary`). Decorative. */
export function BrandSymbol({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox={BRAND_SYMBOL.viewBox}
      stroke="currentColor"
      className={className}
    >
      <SymbolPaths strokeWidth={BRAND_STROKE} />
    </svg>
  );
}
