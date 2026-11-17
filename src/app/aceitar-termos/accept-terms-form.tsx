"use client";

import { EyeOff, Megaphone, Trash2 } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { type FormEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { LegalConsent } from "@/components/legal/legal-consent";
import { forgetDevice } from "@/components/push/device";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { authClient } from "@/lib/auth-client";
import { fullDateLabel } from "@/lib/format/date";
import { LEGAL_REQUIRED, LEGAL_VERSION } from "@/lib/legal/version";
import { acceptLegalAction } from "@/server/actions/legal";

const NETWORK_ERROR =
  "Não foi possível salvar agora. Tente de novo em instantes.";

const POINTS = [
  {
    icon: EyeOff,
    text: "Suas finanças ficam só na sua conta: nem quem administra vê os valores.",
  },
  { icon: Megaphone, text: "Nada de publicidade nem venda dos seus dados." },
  {
    icon: Trash2,
    text: "Você pode pedir uma cópia ou a exclusão dos seus dados quando quiser.",
  },
] as const;

/**
 * The body of /aceitar-termos (doc 02 §6.20): a three-point summary, the
 * required checkbox and "Aceitar e continuar". It sends the version of this
 * bundle: a screen from before a deploy that changed the text is refused.
 * "Sair" is a full page load, so nothing of this account stays in memory.
 */
export function AcceptTermsForm({ hasPrevious }: { hasPrevious: boolean }) {
  const [accepted, setAccepted] = useState(false);
  const [consentError, setConsentError] = useState<string>();
  const [networkError, setNetworkError] = useState<string>();
  const [leaving, setLeaving] = useState(false);
  const consentRef = useRef<HTMLInputElement>(null);
  const { execute, result, isPending, hasNavigated } = useAction(
    acceptLegalAction,
    {
      onExecute: () => setNetworkError(undefined),
      onError: ({ error }) => {
        if (error.thrownError) setNetworkError(NETWORK_ERROR);
      },
    },
  );
  const fieldError = accepted
    ? undefined
    : result.validationErrors?.fieldErrors?.accepted?.[0];

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accepted) {
      setConsentError(LEGAL_REQUIRED);
      consentRef.current?.focus();
      return;
    }
    execute({ accepted: true, version: LEGAL_VERSION });
  };

  const signOut = async () => {
    setLeaving(true);
    // This device stops receiving the notifications of the person leaving.
    await forgetDevice();
    try {
      const { error } = await authClient.signOut();
      if (!error) {
        window.location.replace("/entrar");
        return;
      }
    } catch {
      // Offline: the session is still here, like a refused sign-out.
    }
    toast.error("Não foi possível sair. Tente de novo.");
    setLeaving(false);
  };

  return (
    <form className="mt-3 flex flex-col gap-6" onSubmit={submit} noValidate>
      <p className="text-body text-fg-2">
        {hasPrevious
          ? `Os termos de uso e a política de privacidade mudaram em ${fullDateLabel(LEGAL_VERSION)}. Leia e aceite para continuar usando o app.`
          : "O Prumo agora tem termos de uso e uma política de privacidade. Leia e aceite para continuar usando o app."}
      </p>

      <ul className="flex flex-col gap-4 rounded-card bg-surface p-4">
        {POINTS.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-3 text-body text-fg">
            <Icon
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0 text-primary"
            />
            <span>{text}</span>
          </li>
        ))}
      </ul>

      <LegalConsent
        id="accept-terms-legal"
        ref={consentRef}
        checked={accepted}
        onCheckedChange={(checked) => {
          setAccepted(checked);
          if (checked) setConsentError(undefined);
        }}
        error={consentError ?? fieldError}
      />

      <div className="flex flex-col gap-3">
        <FieldError id="accept-terms-error">
          {result.serverError ?? networkError}
        </FieldError>
        <Button
          type="submit"
          size="lg"
          className="w-full"
          loading={isPending || hasNavigated}
          disabled={leaving}
        >
          Aceitar e continuar
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="lg"
          className="w-full"
          loading={leaving}
          disabled={isPending || hasNavigated}
          onClick={signOut}
        >
          Sair
        </Button>
      </div>

      <p className="text-caption text-fg-3">
        Se não quiser aceitar, saia e peça a exclusão dos seus dados pelo
        contato da política de privacidade.
      </p>
    </form>
  );
}
