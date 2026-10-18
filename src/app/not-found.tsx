import type { Metadata } from "next";
import { NotFoundMessage } from "@/components/app/not-found-message";
import { BrandMark } from "@/components/brand/brand-mark";

export const metadata: Metadata = { title: "Página não encontrada" };

/**
 * 404 in pt-BR (doc 02 §8) for addresses that match no route, including
 * /primeiro-acesso and /recuperar while their token is unset (src/proxy.ts
 * rewrites them here, with a 404 status). Only the root layout is around it,
 * so it brings its own <main> and the brand, like the (auth) layout. A
 * notFound() inside the app shell or the public pages renders the not-found
 * of that route group instead.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center px-4 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:justify-center">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex items-center gap-3">
          <BrandMark />
          <span className="font-bold text-[17px] text-fg">Meu Finan</span>
        </div>
        <NotFoundMessage href="/inicio" label="Ir para o Início" />
      </div>
    </main>
  );
}
