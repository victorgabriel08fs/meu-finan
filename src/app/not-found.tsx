import { Compass } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/brand/brand-mark";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Página não encontrada" };

/**
 * 404 in pt-BR (doc 02 §8): unmatched URLs, notFound() and the areas a person
 * cannot see (Administração for a regular account, a feature behind a flag
 * that is off, an invalid invite link). It never says which one it was. Shows
 * on its own or inside the app shell, so it is not a <main> of its own.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[80dvh] flex-col items-center px-4 pt-[max(2.5rem,env(safe-area-inset-top))] pb-10 sm:justify-center">
      <div className="flex w-full max-w-[400px] flex-col">
        <div className="mb-10 flex items-center gap-3">
          <BrandMark />
          <span className="font-bold text-[17px] text-fg">Meu Finan</span>
        </div>
        <span
          aria-hidden="true"
          className="flex size-14 items-center justify-center rounded-full bg-surface-2 text-fg-2 [&_svg]:size-7"
        >
          <Compass strokeWidth={1.75} />
        </span>
        <h1 className="mt-5 text-title-1 text-fg">Página não encontrada</h1>
        <p className="mt-2 text-body text-fg-2">
          O endereço pode estar incompleto, ou esta página não está disponível
          para a sua conta.
        </p>
        <Button asChild size="lg" className="mt-8 w-full">
          <Link href="/inicio">Ir para o Início</Link>
        </Button>
      </div>
    </div>
  );
}
