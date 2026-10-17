import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand/brand-mark";

/** Public auth pages: a centred column, mobile first (doc 02 §6.1). */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center bg-bg px-4 pt-[max(2.5rem,env(safe-area-inset-top))] pb-10 sm:justify-center">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex items-center gap-3">
          {/* The brand's emerald in both themes, like the app icon. */}
          <BrandMark />
          <span className="font-bold text-[17px] text-fg">Meu Finan</span>
        </div>
        {children}
      </div>
    </main>
  );
}
