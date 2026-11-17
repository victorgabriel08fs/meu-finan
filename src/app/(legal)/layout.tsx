import Link from "next/link";
import type { ReactNode } from "react";
import { AuthorCredit } from "@/components/brand/author-credit";
import { BrandMark } from "@/components/brand/brand-mark";
import { LegalLinks } from "@/components/legal/legal-links";

/**
 * /termos and /privacidade (doc 02 §6.20): public and static, open with or
 * without a session (the proxy does not run here). No cookies, no session, no
 * database: prerendered at build time.
 */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center bg-bg px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <div className="flex w-full max-w-[680px] flex-1 flex-col gap-8">
        <header>
          {/* With a session cookie, the proxy sends "/" on to /inicio. */}
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-3 rounded-control"
          >
            <BrandMark />
            <span className="font-bold text-[17px] text-fg">Prumo</span>
          </Link>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <AuthorCredit />
          <LegalLinks />
        </footer>
      </div>
    </div>
  );
}
