"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

/**
 * Someone is already signed in on this device (often the administrator
 * testing the link). Using the link would replace that session, so it asks to
 * sign out first instead of doing it silently.
 */
export function SignedInNotice({ email }: { email: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const signOut = async () => {
    setPending(true);
    try {
      await authClient.signOut();
      router.refresh();
    } finally {
      setPending(false);
    }
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
