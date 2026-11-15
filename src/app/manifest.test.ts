import { describe, expect, it } from "vitest";
import manifest from "./manifest";

describe("manifest", () => {
  const data = manifest();

  it("chama o app de Prumo", () => {
    expect(data.name).toBe("Prumo");
    expect(data.short_name).toBe("Prumo");
  });

  it("mantém id e start_url: quem instalou continua com o mesmo app", () => {
    expect(data.id).toBe("/");
    expect(data.start_url).toBe("/inicio");
  });

  it("lista o ícone monocromático ao lado dos demais", () => {
    const purposes = (data.icons ?? []).map((icon) => icon.purpose);
    expect(purposes).toEqual(
      expect.arrayContaining(["any", "maskable", "monochrome"]),
    );
    const mono = data.icons?.find((icon) => icon.purpose === "monochrome");
    expect(mono?.src).toBe("/icons/monochrome-512.png");
  });
});
