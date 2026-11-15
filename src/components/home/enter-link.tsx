import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The page's only action: a link to /entrar styled as the primary button (48 px target). */
export function EnterLink({ className }: { className?: string }) {
  return (
    <Link
      href="/entrar"
      className={cn(
        buttonVariants({ size: "lg" }),
        "min-w-[160px] max-w-full",
        className,
      )}
    >
      Entrar
    </Link>
  );
}
