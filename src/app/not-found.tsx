import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/brand/brand-mark";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Página não encontrada" };

/**
 * 404 of the whole app (doc 02 §8), on the app's tokens, so it follows the
 * chosen theme: the framework's page follows only the system scheme (white
 * or black) and speaks English. Gives no reason on purpose — closed pages
 * such as /primeiro-acesso land here too (doc 01 §11).
 */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-bg px-6 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))] text-center">
      <BrandMark className="size-12" />
      <p className="mt-8 text-overline text-fg-3 uppercase">Erro 404</p>
      <h1 className="mt-2 text-title-1 text-balance text-fg">
        Página não encontrada
      </h1>
      <p className="mt-3 max-w-sm text-body text-pretty text-fg-2">
        O endereço pode estar incompleto ou a página não existe mais.
      </p>
      <Link
        href="/inicio"
        className={cn(buttonVariants({ size: "lg" }), "mt-8 min-w-56")}
      >
        Ir para o Início
      </Link>
    </main>
  );
}
