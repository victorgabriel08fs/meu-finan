import { Suspense } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { prerender } from "react-dom/static";
import { describe, expect, it } from "vitest";
import type { Flags } from "@/lib/flags/registry";
import { FlagsProvider, useFlag } from "./flags-provider";

function ImportEntry() {
  return useFlag("importar_extrato") ? <a href="/importar">Importar</a> : null;
}

async function prerenderToString(node: React.ReactNode): Promise<string> {
  const { prelude } = await prerender(node);
  return new Response(prelude).text();
}

describe("useFlag", () => {
  it("falls back to the registry default outside a provider", () => {
    expect(renderToStaticMarkup(<ImportEntry />)).toContain("Importar");
  });

  it("reads flags a Server Component already has", () => {
    const off: Flags = { importar_extrato: false };
    expect(
      renderToStaticMarkup(
        <FlagsProvider flags={off}>
          <ImportEntry />
        </FlagsProvider>,
      ),
    ).toBe("");
  });

  it("waits for flags streamed as a promise", async () => {
    const flags = Promise.resolve<Flags>({ importar_extrato: false });
    const html = await prerenderToString(
      <FlagsProvider flags={flags}>
        <Suspense fallback={<p>carregando</p>}>
          <ImportEntry />
          <span>pronto</span>
        </Suspense>
      </FlagsProvider>,
    );
    expect(html).toContain("pronto");
    expect(html).not.toContain("Importar");
    expect(html).not.toContain("carregando");
  });
});
