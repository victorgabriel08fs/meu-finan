import type { ReactNode } from "react";

/** Public auth pages: a centred column, mobile first (doc 02 §6.1). */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center bg-bg px-4 pt-[max(2.5rem,env(safe-area-inset-top))] pb-10 sm:justify-center">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-10 items-center justify-center rounded-[12px] bg-primary text-on-primary"
          >
            <svg
              aria-hidden="true"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 7 13.5 15.5 8.5 10.5 2 17" />
              <path d="M16 7h6v6" />
            </svg>
          </span>
          <span className="font-bold text-[17px] text-fg">Meu Finan</span>
        </div>
        {children}
      </div>
    </main>
  );
}
