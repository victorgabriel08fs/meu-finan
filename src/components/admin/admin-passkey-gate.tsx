"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { isPasskeyCancel } from "@/app/(auth)/entrar/login-errors";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PASSKEY_CONFIRMATION_MESSAGE,
  PASSKEY_CONFIRMATION_REQUIRED,
} from "@/lib/admin/second-factor";
import { authClient } from "@/lib/auth-client";

type AuthError = {
  status?: number;
  code?: string;
  name?: string;
} | null;

/**
 * "Confirmar com passkey": signs in again with a passkey, which stamps the new
 * session (doc 01 §11.9). Ends with a full page load, like every sign-in (one
 * device, several accounts): to `returnTo`, or the same page without it. A
 * passkey of another account on this device lands that person on /inicio.
 */
export function PasskeyConfirmButton({
  userId,
  returnTo,
  className,
}: {
  userId: string;
  returnTo?: string;
  className?: string;
}) {
  const [pending, setPending] = useState(false);

  const confirm = async () => {
    setPending(true);
    let error: AuthError = null;
    try {
      const result = await authClient.signIn.passkey();
      if (result?.data) {
        if (result.data.user.id !== userId) window.location.replace("/inicio");
        else if (returnTo) window.location.replace(returnTo);
        else window.location.reload();
        // The spinner stays until the page unloads.
        return;
      }
      error = (result?.error as AuthError) ?? {};
    } catch (thrown) {
      error = { name: (thrown as { name?: string })?.name };
    }
    setPending(false);
    if (isPasskeyCancel({ name: error?.name, code: error?.code })) {
      toast("Confirmação cancelada.");
    } else if (error?.status === 429) {
      toast.error("Muitas tentativas. Espere alguns minutos.");
    } else {
      toast.error("Não foi possível confirmar com a passkey. Tente de novo.");
    }
  };

  return (
    <Button size="lg" className={className} loading={pending} onClick={confirm}>
      Confirmar com passkey
    </Button>
  );
}

/**
 * The confirmation screen of Administração (doc 02 §6.17): an administrator
 * whose session was not opened with a passkey registers a first one
 * ("register") or confirms with one they have ("confirm").
 */
export function AdminPasskeyGate({
  state,
  userId,
  returnTo,
}: {
  state: "register" | "confirm";
  userId: string;
  returnTo: string;
}) {
  return state === "register" ? (
    <RegisterCard />
  ) : (
    <Card>
      <CardHeader>
        <CardTitle>Confirme que é você</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-[15px] text-fg-2 leading-[22px]">
          Você entrou com senha. Para abrir a Administração, confirme com a
          passkey deste aparelho ou de outro em que você já cadastrou uma.
        </p>
        <PasskeyConfirmButton
          userId={userId}
          returnTo={returnTo}
          className="w-full"
        />
        <p className="text-[13px] text-fg-3 leading-[18px]">
          Perdeu o aparelho com a passkey? Peça a outro administrador um link de
          redefinição com “Remover todas as passkeys”. Se a conta é a do dono do
          app, use a recuperação de emergência.
        </p>
      </CardContent>
    </Card>
  );
}

function RegisterCard() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const register = async () => {
    setPending(true);
    try {
      const result = await authClient.passkey.addPasskey({
        name: "Meu aparelho",
      });
      if (result?.error) {
        toast.error(registerErrorMessage(result.error as AuthError));
        return;
      }
      toast.success("Passkey cadastrada.");
      // Now the screen asks to confirm with it.
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cadastre uma passkey</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-[15px] text-fg-2 leading-[22px]">
          A Administração pede uma passkey além da senha. Assim, quem descobrir
          sua senha não consegue mexer nos acessos e convites de ninguém.
        </p>
        <Button
          size="lg"
          className="w-full"
          loading={pending}
          onClick={register}
        >
          Cadastrar passkey neste aparelho
        </Button>
        <Button asChild variant="ghost" size="lg" className="w-full">
          <Link href="/ajustes/seguranca">Gerenciar passkeys em Segurança</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function registerErrorMessage(error: AuthError): string {
  if (error?.code === PASSKEY_CONFIRMATION_REQUIRED) {
    return PASSKEY_CONFIRMATION_MESSAGE;
  }
  if (error?.code === "SESSION_NOT_FRESH" || error?.status === 403) {
    return "Por segurança, saia e entre de novo para fazer isso.";
  }
  if (error?.status === 429) return "Muitas tentativas. Espere alguns minutos.";
  if (isPasskeyCancel({ name: error?.name, code: error?.code })) {
    return "Cadastro cancelado.";
  }
  return "Não foi possível cadastrar a passkey. Tente de novo.";
}
