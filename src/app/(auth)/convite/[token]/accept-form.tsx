"use client";

import { Check, Clock } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { type FormEvent, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { acceptAccessLinkAction } from "./actions";

const MIN_LENGTH = 12;

type AcceptFormProps = {
  token: string;
  purpose: "invite" | "reset";
  email: string;
  /** "ter, 20/out, 14:32", formatted on the server. */
  expiresLabel: string;
};

/**
 * Sets the password of an invite or a reset (doc 02 §6.1): the e-mail is
 * shown read-only (and offered to password managers), the 12-character rule
 * ticks when met, and a reset can also remove the passkeys.
 */
export function AcceptForm({
  token,
  purpose,
  email,
  expiresLabel,
}: AcceptFormProps) {
  const id = useId();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [removePasskeys, setRemovePasskeys] = useState(false);
  const { execute, result, isPending, hasNavigated } = useAction(
    acceptAccessLinkAction,
  );
  const errors = result.validationErrors?.fieldErrors ?? {};
  const longEnough = password.length >= MIN_LENGTH;
  const isReset = purpose === "reset";

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    execute({ token, password, confirm, removePasskeys });
  };

  return (
    <form className="mt-8 flex flex-col gap-5" onSubmit={submit} noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-email`}>E-mail</Label>
        <Input
          id={`${id}-email`}
          name="email"
          type="email"
          autoComplete="username"
          value={email}
          readOnly
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-password`}>
          {isReset ? "Nova senha" : "Senha"}
        </Label>
        <Input
          id={`${id}-password`}
          name="password"
          type="password"
          autoComplete="new-password"
          enterKeyHint="next"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={`${id}-password-hint ${id}-password-error`}
        />
        <p
          id={`${id}-password-hint`}
          className={cn(
            "flex items-center gap-1.5 text-caption transition-colors duration-150",
            longEnough ? "text-primary" : "text-fg-3",
          )}
        >
          <Check
            aria-hidden="true"
            className={cn(
              "size-4 shrink-0 transition-opacity duration-150",
              longEnough ? "opacity-100" : "opacity-30",
            )}
          />
          {MIN_LENGTH}+ caracteres
          <span className="sr-only">
            {longEnough ? ": atingido" : ": ainda não"}
          </span>
        </p>
        <FieldError id={`${id}-password-error`}>
          {errors.password?.[0]}
        </FieldError>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-confirm`}>
          {isReset ? "Confirme a nova senha" : "Confirme a senha"}
        </Label>
        <Input
          id={`${id}-confirm`}
          name="confirm"
          type="password"
          autoComplete="new-password"
          enterKeyHint="go"
          required
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          aria-invalid={errors.confirm ? true : undefined}
          aria-describedby={errors.confirm ? `${id}-confirm-error` : undefined}
        />
        <FieldError id={`${id}-confirm-error`}>
          {errors.confirm?.[0]}
        </FieldError>
      </div>

      {isReset ? (
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-body text-fg">
          <input
            type="checkbox"
            className="mt-0.5 size-5 shrink-0 accent-[var(--primary)]"
            checked={removePasskeys}
            onChange={(event) => setRemovePasskeys(event.target.checked)}
          />
          <span>
            Remover todas as passkeys
            <span className="block text-caption text-fg-3">
              Use se perdeu um aparelho. Depois cadastre uma passkey nova.
            </span>
          </span>
        </label>
      ) : null}

      <FieldError id={`${id}-error`}>{result.serverError}</FieldError>
      <Button
        type="submit"
        size="lg"
        className="w-full"
        loading={isPending || hasNavigated}
      >
        {isReset ? "Redefinir e entrar" : "Criar senha e entrar"}
      </Button>
      <p className="flex items-start gap-2 text-caption text-fg-3">
        <Clock aria-hidden="true" className="mt-px size-4 shrink-0" />
        <span>O link vale até {expiresLabel} e funciona uma única vez.</span>
      </p>
    </form>
  );
}
