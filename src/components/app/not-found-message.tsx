import { Compass } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type NotFoundMessageProps = {
  /** The way out: the login on the public pages, Início everywhere else. */
  href: string;
  label: string;
};

/**
 * Body of the 404 page (doc 02 §8), shared by the not-found file of each part
 * of the app; the layout around it supplies the <main>, the gutters and, where
 * there is no navigation, the brand. It never says which case it was: an
 * address that does not exist, an area the account cannot see (Administração
 * for a regular account, a feature behind a flag that is off) or an invalid
 * invite link all look the same.
 */
export function NotFoundMessage({ href, label }: NotFoundMessageProps) {
  return (
    <div className="flex flex-col">
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
        <Link href={href}>{label}</Link>
      </Button>
    </div>
  );
}
