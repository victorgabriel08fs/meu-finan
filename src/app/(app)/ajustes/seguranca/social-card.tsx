"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { GoogleMark } from "@/components/auth/google-mark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field-error";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  PASSKEY_CONFIRMATION_REQUIRED,
  SOCIAL_CONFIRMATION_MESSAGE,
} from "@/lib/admin/second-factor";
import {
  SOCIAL_SIGN_IN_OFF,
  SOCIAL_SIGN_IN_OFF_MESSAGE,
} from "@/lib/auth/social";
import { authClient } from "@/lib/auth-client";

export type SocialLink = {
  /** The `account` row's id (what /unlink-account takes). */
  id: string;
  /** ISO timestamp. */
  createdAt: string;
};

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
});

type AuthError = { status?: number; code?: string } | null | undefined;

function socialErrorMessage(error: AuthError, fallback: string): string {
  if (!error) return fallback;
  // An administrator who signed in with a password (doc 01 §11.9).
  if (error.code === PASSKEY_CONFIRMATION_REQUIRED) {
    return SOCIAL_CONFIRMATION_MESSAGE;
  }
  if (error.code === SOCIAL_SIGN_IN_OFF) return SOCIAL_SIGN_IN_OFF_MESSAGE;
  if (error.code === "SESSION_NOT_FRESH" || error.status === 403) {
    return "Por segurança, saia e entre de novo para fazer isso.";
  }
  if (error.status === 429) return "Muitas tentativas. Espere alguns minutos.";
  return fallback;
}

export type SocialCardProps = {
  email: string;
  /** The flag is on for this person; unlinking works either way. */
  canLink: boolean;
  linked: SocialLink | null;
  /** Just came back from a successful link. */
  notice: boolean;
  /** The `?error=` of a failed link, already worded. */
  error: string | null;
};

/**
 * "Conta Google" in Ajustes › Segurança (ADR-15): link the Google account
 * with the same e-mail, or unlink it. Linking leaves for Google with a full
 * page load and comes back with `?vinculado=google` or `?error=`.
 */
export function SocialCard({
  email,
  canLink,
  linked,
  notice,
  error: initialError,
}: SocialCardProps) {
  const router = useRouter();
  const errorId = useId();
  const [busy, setBusy] = useState<"link" | "unlink" | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(initialError);
  const [showNotice] = useState(notice);

  // The notice and the error were read: clean the address so a reload or a
  // shared link does not show them again.
  useEffect(() => {
    if (notice || initialError) {
      router.replace("/ajustes/seguranca", { scroll: false });
    }
  }, [notice, initialError, router]);

  const link = async () => {
    setError(null);
    setBusy("link");
    let leaving = false;
    try {
      const result = await authClient.linkSocial({
        provider: "google",
        callbackURL: "/ajustes/seguranca?vinculado=google",
        errorCallbackURL: "/ajustes/seguranca",
      });
      if (result.error) {
        setError(
          socialErrorMessage(
            result.error,
            "Não foi possível vincular agora. Tente de novo.",
          ),
        );
        return;
      }
      leaving = true;
    } catch {
      setError("Não foi possível vincular agora. Tente de novo.");
    } finally {
      // On the way to Google, the spinner stays until the page unloads.
      if (!leaving) setBusy(null);
    }
  };

  const unlink = async () => {
    if (!linked) return;
    setBusy("unlink");
    try {
      const result = await authClient.unlinkAccount({ accountId: linked.id });
      if (result.error) {
        toast.error(
          socialErrorMessage(
            result.error,
            "Não foi possível desvincular agora. Tente de novo.",
          ),
        );
        return;
      }
      setOpen(false);
      toast.success("Conta Google desvinculada.");
      router.refresh();
    } catch {
      toast.error("Não foi possível desvincular agora. Tente de novo.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card data-tip="conta-google">
      <CardHeader>
        <CardTitle>Conta Google</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {showNotice && linked ? (
          <output
            aria-live="polite"
            className="rounded-control bg-primary-soft px-4 py-3 text-callout text-on-primary-soft"
          >
            Conta Google vinculada. Da próxima vez, toque em Continuar com o
            Google na tela de entrada.
          </output>
        ) : null}
        {linked ? (
          <>
            <div className="flex min-h-14 items-center gap-3">
              <GoogleMark className="shrink-0" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold text-[15px] text-fg">
                  Google
                </span>
                <span className="text-[13px] text-fg-3">
                  Vinculada em {dateFormat.format(new Date(linked.createdAt))}
                </span>
              </div>
            </div>
            <p className="text-[14px] text-fg-2 leading-5">
              Você continua entrando com passkey ou senha.
            </p>
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="secondary"
                  size="lg"
                  className="w-full"
                  disabled={busy !== null}
                >
                  Desvincular
                </Button>
              </SheetTrigger>
              <SheetContent
                title="Desvincular a conta Google?"
                description="Você continua entrando com passkey ou senha. Dá para vincular de novo quando quiser."
                footer={
                  <>
                    <Button
                      variant="destructive"
                      size="lg"
                      className="w-full"
                      loading={busy === "unlink"}
                      onClick={unlink}
                    >
                      Desvincular
                    </Button>
                    <SheetClose asChild>
                      <Button variant="secondary" size="lg" className="w-full">
                        Cancelar
                      </Button>
                    </SheetClose>
                  </>
                }
              />
            </Sheet>
          </>
        ) : (
          <>
            <p
              className="text-[14px] text-fg-2 leading-5"
              id={`${errorId}-help`}
            >
              Entre com um toque usando sua conta Google. Ela precisa ter o
              mesmo e-mail desta conta: <span className="text-fg">{email}</span>
              .
            </p>
            <FieldError id={errorId}>{error}</FieldError>
            {canLink ? (
              <Button
                variant="secondary"
                size="lg"
                className="w-full"
                loading={busy === "link"}
                disabled={busy !== null}
                onClick={link}
                aria-describedby={
                  error ? `${errorId}-help ${errorId}` : `${errorId}-help`
                }
              >
                <GoogleMark />
                Vincular conta Google
              </Button>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
