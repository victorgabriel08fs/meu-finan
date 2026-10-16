import { cn } from "@/lib/utils";

/**
 * App mark for the UI: white rising line on an emerald rounded square — the
 * same drawing as the app icons (app-icon.tsx). Decorative: the app name is
 * always written next to it.
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
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-[62%]"
      >
        <path d={BRAND_GLYPH_LINE} />
        <path d={BRAND_GLYPH_ARROW} />
      </svg>
    </span>
  );
}

/** Rising line and arrow head on a 24×24 grid (shared with the app icons). */
export const BRAND_GLYPH_LINE = "M2.5 17 9 10.5l4 4L21.5 6";
export const BRAND_GLYPH_ARROW = "M15.5 6h6v6";
