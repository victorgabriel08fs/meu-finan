import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  parseSplashName,
  SPLASH_SIZES,
  splashMedia,
  splashName,
  splashPath,
  splashPixels,
} from "./splash";

describe("splash do iOS", () => {
  it("calcula os pixels como tamanho CSS vezes a densidade", () => {
    for (const size of SPLASH_SIZES) {
      expect(splashPixels(size)).toEqual({
        pxW: size.w * size.dpr,
        pxH: size.h * size.dpr,
      });
    }
    expect(splashPixels({ w: 390, h: 844, dpr: 3, devices: "" })).toEqual({
      pxW: 1170,
      pxH: 2532,
    });
  });

  it("não repete tamanho nem mídia e tem 10 aparelhos", () => {
    expect(SPLASH_SIZES).toHaveLength(10);
    const paths = SPLASH_SIZES.map(splashPath);
    expect(new Set(paths).size).toBe(paths.length);
    const medias = SPLASH_SIZES.map(splashMedia);
    expect(new Set(medias).size).toBe(medias.length);
  });

  it("escreve a mídia no formato exato, só em retrato", () => {
    expect(splashMedia({ w: 390, h: 844, dpr: 3, devices: "" })).toBe(
      "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
    );
    for (const size of SPLASH_SIZES) {
      expect(splashMedia(size)).toContain("orientation: portrait");
    }
  });

  it("monta o caminho público", () => {
    expect(splashPath({ w: 390, h: 844, dpr: 3, devices: "" })).toBe(
      "/splash/dark-1170x2532.png",
    );
  });

  it("só aceita nomes da lista", () => {
    expect(parseSplashName("dark-1170x2532.png")).toEqual({
      pxW: 1170,
      pxH: 2532,
    });
    for (const bad of [
      "../x",
      "../dark-1170x2532.png",
      "dark-1x1.png",
      "light-1170x2532.png",
      "dark-1170x2532",
      "dark-1170x2532.png/",
      "",
    ]) {
      expect(parseSplashName(bad)).toBeNull();
    }
  });

  it("ida e volta: caminho -> nome -> pixels", () => {
    fc.assert(
      fc.property(fc.constantFrom(...SPLASH_SIZES), (size) => {
        const px = splashPixels(size);
        expect(splashPath(size)).toBe(`/splash/${splashName(px.pxW, px.pxH)}`);
        expect(parseSplashName(splashName(px.pxW, px.pxH))).toEqual(px);
      }),
    );
  });

  it("nenhum nome fora da lista passa", () => {
    fc.assert(
      fc.property(fc.string(), (name) => {
        const parsed = parseSplashName(name);
        if (parsed) expect(name).toBe(splashName(parsed.pxW, parsed.pxH));
      }),
    );
  });
});
