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
