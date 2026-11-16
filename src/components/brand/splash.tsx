import { ImageResponse } from "next/og";
import { THEME_COLORS } from "@/lib/theme";
import { BRAND_GREEN, SymbolSvg } from "./app-icon";
import { BRAND_STROKE } from "./brand-mark";
import {
  WORDMARK_LETTERS,
  WORDMARK_STEM,
  WORDMARK_VIEWBOX,
  WORDMARK_WEIGHT,
} from "./wordmark";

/** Dark tokens (doc 02 §3.1): --text and --primary. */
const TEXT_DARK = "#F2F4F7";
const PRIMARY_DARK = "#3DDC97";

/** The "prumo" wordmark for next/og, in the dark theme's colors. */
export function WordmarkSvg({ height }: { height: number }) {
  const width = Math.round((height * 301) / 88);
  return (
    <svg
      aria-hidden="true"
      width={width}
      height={height}
      viewBox={WORDMARK_VIEWBOX}
    >
      <g
        fill="none"
        stroke={TEXT_DARK}
        strokeWidth={8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={WORDMARK_LETTERS} />
        <path d={WORDMARK_STEM} />
      </g>
      <path
        d={WORDMARK_WEIGHT}
        fill={PRIMARY_DARK}
        stroke={PRIMARY_DARK}
        strokeWidth={3}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** iOS startup image: dark canvas, app icon and wordmark. Server only. */
export function splashResponse(pxW: number, pxH: number) {
  const icon = Math.round(pxW * 0.24);
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: THEME_COLORS.dark,
        paddingBottom: Math.round(pxH * 0.08),
      }}
    >
      <div
        style={{
          width: icon,
          height: icon,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: BRAND_GREEN,
          borderRadius: Math.round(icon * 0.225),
        }}
      >
        <SymbolSvg size={Math.round(icon * 0.7)} strokeWidth={BRAND_STROKE} />
      </div>
      <div style={{ display: "flex", marginTop: Math.round(icon * 0.28) }}>
        <WordmarkSvg height={Math.round(icon * 0.3)} />
      </div>
    </div>,
    {
      width: pxW,
      height: pxH,
      headers: { "Cache-Control": "public, max-age=604800" },
    },
  );
}
