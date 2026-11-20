import { afterEach, describe, expect, it, vi } from "vitest";
import { splashResponse } from "@/components/brand/splash";
import { metadata } from "./layout";
import OpengraphImage, { alt, contentType, size } from "./opengraph-image";
import { metadata as homeMetadata } from "./page";
import * as twitter from "./twitter-image";

vi.mock("server-only", () => ({}));
vi.mock("next/font/google", () => ({
  Manrope: () => ({ variable: "", className: "" }),
}));

afterEach(() => vi.unstubAllEnvs());

async function pngHead(response: Response) {
  const bytes = new Uint8Array(await response.arrayBuffer());
  return Buffer.from(bytes.slice(0, 4)).toString("hex");
}

describe("imagens de pré-visualização", () => {
  it("a imagem Open Graph é um PNG 1200x630", async () => {
    expect(size).toEqual({ width: 1200, height: 630 });
    expect(contentType).toBe("image/png");
    const response = OpengraphImage();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(await pngHead(response)).toBe("89504e47");
  });

  it("a imagem do Twitter repete tamanho, tipo e texto alternativo", () => {
    expect(twitter.size).toEqual(size);
    expect(twitter.contentType).toBe(contentType);
    expect(twitter.alt).toBe(alt);
  });

  it("o splash é um PNG com cache de 7 dias", async () => {
    const response = splashResponse(750, 1334);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toContain("max-age=604800");
    expect(await pngHead(response)).toBe("89504e47");
  });
});

describe("metadados", () => {
  it("metadataBase é uma URL absoluta", () => {
    expect(metadata.metadataBase).toBeInstanceOf(URL);
    expect(String(metadata.metadataBase)).toMatch(/^https?:\/\//);
  });

  it("o splash vai como startupImage e a página segue noindex", () => {
    const startup = metadata.appleWebApp;
    expect(startup).toBeTruthy();
    if (startup && typeof startup === "object") {
      expect(startup.startupImage).toHaveLength(11);
    }
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("a homepage repete título e descrição no Open Graph", () => {
    expect(homeMetadata.openGraph?.title).toBe(
      "Prumo · Seu dinheiro no prumo.",
    );
    expect(metadata.openGraph).toMatchObject({
      siteName: "Prumo",
      locale: "pt_BR",
    });
  });
});
