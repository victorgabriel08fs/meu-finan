"use client";

import { useAction } from "next-safe-action/hooks";
import { type FormEvent, useRef, useState } from "react";
import { LegalConsent } from "@/components/legal/legal-consent";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LEGAL_REQUIRED, LEGAL_VERSION } from "@/lib/legal/version";
import { setupOwner } from "./actions";

type Field = "token" | "name" | "email" | "password" | "confirm";

const FIELDS: {
  name: Field;
  label: string;
  type: string;
  autoComplete: string;
  hint?: string;
}[] = [
  {
    name: "token",
    label: "Código de configuração",
    type: "password",
    autoComplete: "off",
    hint: "O valor de SETUP_TOKEN definido na Vercel.",
  },
  { name: "name", label: "Seu nome", type: "text", autoComplete: "name" },
  { name: "email", label: "E-mail", type: "email", autoComplete: "email" },
  {
    name: "password",
    label: "Senha",
    type: "password",
    autoComplete: "new-password",
    hint: "Pelo menos 12 caracteres, sem senhas que já vazaram. Depois você cadastra uma passkey.",
  },
  {
    name: "confirm",
    label: "Confirme a senha",
    type: "password",
    autoComplete: "new-password",
  },
];

export function SetupForm() {
  const [values, setValues] = useState<Record<Field, string>>({
    token: "",
    name: "",
    email: "",
    password: "",
    confirm: "",
  });
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [legalError, setLegalError] = useState<string>();
  const consentRef = useRef<HTMLInputElement>(null);
  const { execute, result, isPending } = useAction(setupOwner);
  const fieldErrors = result.validationErrors?.fieldErrors ?? {};

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!acceptedLegal) {
      setLegalError(LEGAL_REQUIRED);
      consentRef.current?.focus();
      return;
    }
    // The server checks the acceptance again (and Better Auth's hooks too).
    execute({ ...values, acceptedLegal: true, legalVersion: LEGAL_VERSION });
  };

  return (
    <form className="mt-8 flex flex-col gap-5" onSubmit={submit} noValidate>
      {FIELDS.map((field) => {
        const error = fieldErrors[field.name]?.[0];
        const errorId = `${field.name}-error`;
        const hintId = `${field.name}-hint`;
        return (
          <div key={field.name} className="flex flex-col gap-2">
            <Label htmlFor={field.name}>{field.label}</Label>
            <Input
              id={field.name}
              name={field.name}
              type={field.type}
              autoComplete={field.autoComplete}
              required
              value={values[field.name]}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  [field.name]: event.target.value,
                }))
              }
              aria-invalid={error ? true : undefined}
              aria-describedby={
                [error ? errorId : null, field.hint ? hintId : null]
                  .filter(Boolean)
                  .join(" ") || undefined
              }
            />
            {field.hint ? (
              <p id={hintId} className="text-[13px] text-fg-3 leading-[18px]">
                {field.hint}
              </p>
            ) : null}
            <FieldError id={errorId}>{error}</FieldError>
          </div>
        );
      })}
      <LegalConsent
        id="setup-legal"
        ref={consentRef}
        checked={acceptedLegal}
        onCheckedChange={(checked) => {
          setAcceptedLegal(checked);
          if (checked) setLegalError(undefined);
        }}
        error={
          legalError ??
          (acceptedLegal ? undefined : fieldErrors.acceptedLegal?.[0])
        }
      />
      <FieldError id="setup-error">{result.serverError}</FieldError>
      <Button type="submit" size="lg" className="w-full" loading={isPending}>
        Criar acesso
      </Button>
    </form>
  );
}
