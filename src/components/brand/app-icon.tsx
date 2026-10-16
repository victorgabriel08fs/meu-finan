import { ImageResponse } from "next/og";
import { BRAND_GLYPH_ARROW, BRAND_GLYPH_LINE } from "./brand-mark";

/** Brand emerald (= light --primary). */
const BRAND_GREEN = "#0A7F58";

/**
 * - `rounded`: rounded square on transparency (favicon, manifest "any").
 * - `full`: full-bleed square, for platforms that apply their own mask (iOS).
 * - `maskable`: full bleed with the glyph inside the 80% safe circle.
 */
export type AppIconVariant = "rounded" | "full" | "maskable";

const GLYPH_SCALE: Record<AppIconVariant, number> = {
  rounded: 0.64,
  full: 0.58,
  maskable: 0.5,
};

/** Lucide paths (24×24) of the manifest shortcuts (doc 02 §12.1). */
export const SHORTCUT_GLYPHS = {
  // arrow-up-right: money going out.
  despesa: ["M7 7h10v10", "M7 17 17 7"],
  // arrow-down-left: money coming in.
  receita: ["M17 7 7 17", "M17 17H7V7"],
  // list
  extrato: [
    "M3 12h.01",
    "M3 18h.01",
    "M3 6h.01",
    "M8 12h13",
    "M8 18h13",
    "M8 6h13",
  ],
} as const;

/**
 * 96px icon of a home-screen shortcut ("Nova despesa", "Extrato"): the
 * brand's rounded square with the action's glyph. Server only.
 */
export function shortcutIconResponse(paths: readonly string[]) {
  const size = 96;
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BRAND_GREEN,
        borderRadius: Math.round(size * 0.225),
      }}
    >
      <svg
        aria-hidden="true"
        width={56}
        height={56}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {paths.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    </div>,
    {
      width: size,
      height: size,
      headers: { "Cache-Control": "public, max-age=604800" },
    },
  );
}

/**
 * PNG app icon drawn with next/og (no fonts, no network). Used by
 * src/app/icon.tsx, src/app/apple-icon.tsx and the /icons/* routes that the
 * web manifest points to. Server only.
 */
export function appIconResponse(size: number, variant: AppIconVariant) {
  const glyph = Math.round(size * GLYPH_SCALE[variant]);
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BRAND_GREEN,
        borderRadius: variant === "rounded" ? Math.round(size * 0.225) : 0,
      }}
    >
      <svg
        aria-hidden="true"
        width={glyph}
        height={glyph}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={size <= 48 ? 2.8 : 2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={BRAND_GLYPH_LINE} />
        <path d={BRAND_GLYPH_ARROW} />
      </svg>
    </div>,
    {
      width: size,
      height: size,
      // The /icons/* URLs carry no hash: let a redesign reach installed apps.
      headers: { "Cache-Control": "public, max-age=604800" },
    },
  );
}
