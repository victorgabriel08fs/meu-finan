"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

/**
 * Someone is already signed in on this device (often the administrator
 * testing the link). Using the link would replace that session, so it asks to
 * sign out first instead of doing it silently.
 */
export function SignedInNotice({ email }: { email: string }) {
  const [pending, setPending] = useState(false);

  const signOut = async () => {
    setPending(true);
    try {
      const { error } = await authClient.signOut();
      if (!error) {
        // A full page load: the link opens again with nothing that account
        // left in memory (forms, stores, pages the router keeps mounted).
        window.location.reload();
        return;
      }
    } catch {
      // Offline: the session is still here, like a refused sign-out.
    }
    toast.error("Não foi possível sair. Tente de novo.");
    setPending(false);
  };

  return (
    <div className="mt-8 flex flex-col gap-3">
      <p className="rounded-control bg-surface-2 px-4 py-3 text-callout text-fg-2">
        Este aparelho está conectado à conta{" "}
        <span className="font-semibold break-all text-fg">{email}</span>. Para
        usar este link, saia dela primeiro.
      </p>
      <Button size="lg" className="w-full" loading={pending} onClick={signOut}>
        Sair e continuar
      </Button>
      <Button asChild variant="secondary" size="lg" className="w-full">
        <Link href="/inicio">Voltar para o app</Link>
      </Button>
    </div>
  );
}
