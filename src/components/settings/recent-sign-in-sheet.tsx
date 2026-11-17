"use client";

import { LogIn } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { signOutTo } from "@/components/auth/sign-out";
import { Button } from "@/components/ui/button";
import { SheetContent } from "@/components/ui/sheet";
import { RECENT_SIGN_IN_MINUTES } from "@/lib/security/recent-sign-in";

/** Back to Ajustes after signing in again. */
const SIGN_IN_AGAIN_PATH = "/entrar?voltar=%2Fajustes";

/**
 * "Entre de novo para continuar": exporting or deleting all the data needs a
 * sign-in made in the last few minutes (src/lib/security/recent-sign-in.ts).
 * Signing out and in again, instead of asking for the password here, keeps
 * a passkey of another account on the same device from switching people.
 */
export function RecentSignInContent({
  swap = false,
  onCancel,
}: {
  swap?: boolean;
  onCancel: () => void;
}) {
  const [pending, setPending] = useState(false);

  async function signInAgain() {
    setPending(true);
    if (await signOutTo(SIGN_IN_AGAIN_PATH)) return;
    toast.error("Não foi possível sair. Tente de novo.");
    setPending(false);
  }

  return (
    <SheetContent
      swap={swap}
      title="Entre de novo para continuar"
      description={`Por segurança, exportar ou excluir os seus dados pede um login feito há menos de ${RECENT_SIGN_IN_MINUTES} minutos.`}
      footer={
        <>
          <Button
            size="lg"
            className="w-full"
            loading={pending}
            onClick={signInAgain}
          >
            <LogIn aria-hidden="true" />
            Sair e entrar de novo
          </Button>
          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            onClick={onCancel}
          >
            Cancelar
          </Button>
        </>
      }
    />
  );
}
