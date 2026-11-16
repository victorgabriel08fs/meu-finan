import { ImageResponse } from "next/og";
import { BRAND_GREEN } from "@/components/brand/app-icon";
import { WordmarkSvg } from "@/components/brand/splash";
import { THEME_COLORS } from "@/lib/theme";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Prumo: seu dinheiro no prumo.";

/** Link preview (Open Graph and Twitter). Dark, no data: prerendered. */
export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        background: THEME_COLORS.dark,
        padding: 80,
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 16,
          background: BRAND_GREEN,
        }}
      />
      <WordmarkSvg height={170} />
      <div
        style={{
          display: "flex",
          marginTop: 56,
          fontSize: 64,
          fontWeight: 700,
          color: "#F2F4F7",
        }}
      >
        Seu dinheiro no prumo.
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 16,
          fontSize: 36,
          color: "#B4BCC8",
        }}
      >
        Controle financeiro pessoal.
      </div>
    </div>,
    size,
  );
}
