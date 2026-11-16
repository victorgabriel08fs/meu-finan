import { ImageResponse } from "next/og";
import {
  BRAND_STROKE,
  BRAND_STROKE_SMALL,
  BRAND_SYMBOL,
  BRAND_WEIGHT_STROKE,
} from "./brand-mark";

/** Brand emerald (= light --primary). */
export const BRAND_GREEN = "#0A7F58";

/**
 * - `rounded`: rounded square on transparency (favicon, manifest "any").
 * - `full`: full-bleed square, for platforms that apply their own mask (iOS).
 * - `maskable`: full bleed with the symbol inside the 80% safe circle.
 */
export type AppIconVariant = "rounded" | "full" | "maskable";

/** Side of the 64 box relative to the icon (full/maskable = icone-app.svg). */
const SYMBOL_SCALE: Record<AppIconVariant, number> = {
  rounded: 0.78,
  full: 0.7,
  maskable: 0.7,
};

/** The Prumo symbol in white, for next/og (strokes and a filled diamond). */
export function SymbolSvg({
  size,
  strokeWidth,
}: {
  size: number;
  strokeWidth: number;
}) {
  const { stem, ring, weight, viewBox } = BRAND_SYMBOL;
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox={viewBox}
      stroke="#FFFFFF"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={stem} fill="none" strokeWidth={strokeWidth} />
      <circle
        cx={ring.cx}
        cy={ring.cy}
        r={ring.r}
        fill="none"
        strokeWidth={strokeWidth}
      />
      <path d={weight} fill="#FFFFFF" strokeWidth={BRAND_WEIGHT_STROKE} />
    </svg>
  );
}

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
  const symbol = Math.round(size * SYMBOL_SCALE[variant]);
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
      <SymbolSvg
        size={symbol}
        strokeWidth={size <= 48 ? BRAND_STROKE_SMALL : BRAND_STROKE}
      />
    </div>,
    {
      width: size,
      height: size,
      // The /icons/* URLs carry no hash: let a redesign reach installed apps.
      headers: { "Cache-Control": "public, max-age=604800" },
    },
  );
}

/**
 * Monochrome icon (Android themed icons, notification badge): flat white
 * symbol on transparency, heavier stroke, no mid-tones. Server only.
 */
export function monochromeIconResponse(size: number) {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <SymbolSvg
        size={Math.round(size * 0.7)}
        strokeWidth={BRAND_STROKE_SMALL}
      />
    </div>,
    {
      width: size,
      height: size,
      headers: { "Cache-Control": "public, max-age=604800" },
    },
  );
}
