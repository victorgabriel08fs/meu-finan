"use client";

import { useAction } from "next-safe-action/hooks";
import { type FormEvent, useId, useState } from "react";
import { NETWORK_ERROR } from "@/components/transactions/action-result";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SheetContent } from "@/components/ui/sheet";
import type { UserRole } from "@/lib/admin/roles";
import { createUserAction } from "@/server/actions/admin";
import { type IssuedLink, LinkSheetContent } from "./link-sheet";

const ROLE_HINTS: Record<UserRole, string> = {
  user: "Usa o app com as próprias finanças.",
  admin:
    "Também convida pessoas e gerencia acessos e flags. Não vê as finanças de ninguém.",
};

/**
 * "Convidar pessoa" (doc 02 §6.17): name, e-mail and role; the account is
 * created without a password and the sheet turns into the invite link.
 */
export function InviteSheetContent({ onDone }: { onDone: () => void }) {
  const id = useId();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("user");
  const [created, setCreated] = useState<{
    link: IssuedLink;
    name: string;
  } | null>(null);
  const [formError, setFormError] = useState<string>();
  const { execute, result, isPending } = useAction(createUserAction, {
    onExecute: () => setFormError(undefined),
    onSuccess: ({ data }) => {
      if (data) {
        setCreated({
          name: data.user.name,
          link: {
            purpose: data.purpose,
            url: data.url,
            expiresAt: data.expiresAt,
          },
        });
      }
    },
    onError: ({ error }) => {
      const fields = error.validationErrors?.fieldErrors ?? {};
      setFormError(
        error.serverError ??
          fields.role?.[0] ??
          (Object.keys(fields).length ? undefined : NETWORK_ERROR),
      );
    },
  });
  const fieldErrors = result.validationErrors?.fieldErrors ?? {};

  if (created) {
    return (
      <LinkSheetContent
        link={created.link}
        name={created.name}
        onDone={onDone}
      />
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    execute({ name, email, role });
  }

  return (
    <SheetContent
      title="Convidar pessoa"
      description="A pessoa recebe um link para criar a própria senha. As finanças de cada pessoa ficam separadas."
      footer={
        <Button
          type="submit"
          form={`${id}-form`}
          size="lg"
          className="w-full"
          loading={isPending}
        >
          Criar convite
        </Button>
      }
    >
      <form
        id={`${id}-form`}
        onSubmit={submit}
        noValidate
        className="flex flex-col gap-5 pb-2"
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-name`}>Nome</Label>
          <Input
            id={`${id}-name`}
            value={name}
            maxLength={60}
            autoComplete="off"
            autoCapitalize="words"
            enterKeyHint="next"
            placeholder="Bruno Lima"
            onChange={(event) => setName(event.target.value)}
            aria-invalid={fieldErrors.name ? true : undefined}
            aria-describedby={fieldErrors.name ? `${id}-name-error` : undefined}
          />
          <FieldError id={`${id}-name-error`}>
            {fieldErrors.name?.[0]}
          </FieldError>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-email`}>E-mail</Label>
          <Input
            id={`${id}-email`}
            type="email"
            inputMode="email"
            value={email}
            maxLength={254}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="done"
            placeholder="bruno@exemplo.com"
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={fieldErrors.email ? true : undefined}
            aria-describedby={`${id}-email-hint${fieldErrors.email ? ` ${id}-email-error` : ""}`}
          />
          <p id={`${id}-email-hint`} className="text-caption text-fg-3">
            É com ele que a pessoa vai entrar.
          </p>
          <FieldError id={`${id}-email-error`}>
            {fieldErrors.email?.[0]}
          </FieldError>
        </div>
        <div className="flex flex-col gap-2">
          <span
            id={`${id}-role`}
            className="text-callout font-semibold text-fg"
          >
            Papel
          </span>
          <SegmentedControl
            ariaLabel="Papel"
            options={[
              { value: "user", label: "Usuário" },
              { value: "admin", label: "Administrador" },
            ]}
            value={role}
            onValueChange={(value) => setRole(value as UserRole)}
          />
          <p className="text-caption text-fg-3">{ROLE_HINTS[role]}</p>
        </div>
        <FieldError id={`${id}-error`}>{formError}</FieldError>
      </form>
    </SheetContent>
  );
}
