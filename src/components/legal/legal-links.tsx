import Link from "next/link";
import { cn } from "@/lib/utils";

const LINK =
  "inline-flex min-h-6 items-center text-fg underline underline-offset-2 hover:text-primary";

/**
 * "Termos de uso · Política de privacidade" (doc 02 §6.20): at the foot of the
 * homepage, the sign-in screens and Ajustes › Sobre. `newTab` (the consent
 * checkbox) keeps a half-filled form in place.
 */
export function LegalLinks({
  className,
  newTab = false,
}: {
  className?: string;
  newTab?: boolean;
}) {
  const target = newTab
    ? { target: "_blank", rel: "noopener noreferrer" }
    : undefined;
  const newTabNote = newTab ? (
    <span className="sr-only"> (abre em nova aba)</span>
  ) : null;
  return (
    <nav
      aria-label="Documentos"
      className={cn("text-caption text-fg-2", className)}
    >
      <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <li>
          <Link href="/termos" className={LINK} {...target}>
            Termos de uso
            {newTabNote}
          </Link>
        </li>
        <li aria-hidden="true" className="text-fg-3">
          ·
        </li>
        <li>
          <Link href="/privacidade" className={LINK} {...target}>
            Política de privacidade
            {newTabNote}
          </Link>
        </li>
      </ul>
    </nav>
  );
}
