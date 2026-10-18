import type { Metadata } from "next";
import { NotFoundMessage } from "@/components/app/not-found-message";

export const metadata: Metadata = { title: "Página não encontrada" };

/**
 * 404 inside the app shell: Administração for a regular account, or a feature
 * behind a flag that is off. The shell's <main> has the side gutters, and no
 * screen of the shell repeats the brand (the sidebar shows it on desktop), so
 * this is only the message. The shell adds no top padding (each screen's
 * header clears the status bar itself), hence the safe-area inset here.
 */
export default function AppNotFound() {
  return (
    <div className="flex min-h-[70dvh] flex-col items-center pt-[max(2.5rem,env(safe-area-inset-top))] sm:justify-center">
      <div className="w-full max-w-[400px]">
        <NotFoundMessage href="/inicio" label="Ir para o Início" />
      </div>
    </div>
  );
}
