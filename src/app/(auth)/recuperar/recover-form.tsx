"use client";

import { useAction } from "next-safe-action/hooks";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { recoverAccess } from "./actions";

export function RecoverForm() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [removePasskeys, setRemovePasskeys] = useState(false);
  const { execute, result, isPending } = useAction(recoverAccess);
  const errors = result.validationErrors?.fieldErrors ?? {};

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    execute({ token, password, confirm, removePasskeys });
  };

  return (
    <form className="mt-8 flex flex-col gap-5" onSubmit={submit} noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="token">Código de recuperação</Label>
        <Input
          id="token"
          type="password"
          autoComplete="off"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          aria-invalid={errors.token ? true : undefined}
          aria-describedby={errors.token ? "token-error" : undefined}
        />
        <FieldError id="token-error">{errors.token?.[0]}</FieldError>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Nova senha</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={errors.password ? true : undefined}
          aria-describedby="password-hint password-error"
        />
        <p id="password-hint" className="text-[13px] text-fg-3 leading-[18px]">
          Pelo menos 12 caracteres.
        </p>
        <FieldError id="password-error">{errors.password?.[0]}</FieldError>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm">Confirme a nova senha</Label>
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          aria-invalid={errors.confirm ? true : undefined}
          aria-describedby={errors.confirm ? "confirm-error" : undefined}
        />
        <FieldError id="confirm-error">{errors.confirm?.[0]}</FieldError>
      </div>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 text-[15px] text-fg leading-[22px]">
        <input
          type="checkbox"
          className="mt-0.5 size-5 accent-[var(--primary)]"
          checked={removePasskeys}
          onChange={(event) => setRemovePasskeys(event.target.checked)}
        />
        <span>
          Remover todas as passkeys
          <span className="block text-[13px] text-fg-3 leading-[18px]">
            Use se perdeu o aparelho. Depois cadastre uma passkey nova.
          </span>
        </span>
      </label>
      <FieldError id="recover-error">{result.serverError}</FieldError>
      <Button type="submit" size="lg" className="w-full" loading={isPending}>
        Redefinir acesso
      </Button>
    </form>
  );
}
