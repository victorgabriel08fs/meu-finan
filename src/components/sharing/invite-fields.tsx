"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Shown under every invite field: the same for any e-mail (ADR-13). */
export const NEUTRAL_INVITE_NOTE =
  "Se houver alguém com esse e-mail no Meu Finan, a pessoa recebe o convite.";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmail(value: string): boolean {
  return EMAIL.test(value.trim());
}

/**
 * Checks the typed e-mails: the filled ones, which fields are wrong (their
 * positions) and the message that says which ("Confira o 2º e-mail.").
 */
export function checkEmails(raw: readonly string[]): {
  list: string[];
  invalid: number[];
  message?: string;
} {
  const list = raw.map((email) => email.trim()).filter(Boolean);
  const invalid = raw.flatMap((email, index) =>
    email.trim() && !isEmail(email) ? [index] : [],
  );
  const first = invalid[0];
  const message =
    first === undefined
      ? undefined
      : invalid.length > 1
        ? "Confira os e-mails marcados."
        : raw.length === 1
          ? "Confira o e-mail."
          : `Confira o ${first + 1}º e-mail.`;
  return { list, invalid, message };
}

/**
 * E-mail fields of an invite: one to start, "Adicionar outro e-mail" up to
 * `max`, and the neutral note under them.
 */
export function InviteFields({
  id,
  emails,
  onChange,
  max,
  error,
  invalid,
  label = "E-mail de quem vai dividir",
}: {
  id: string;
  emails: string[];
  onChange: (emails: string[]) => void;
  max: number;
  error?: string;
  /** Positions of the wrong fields; without it an error marks them all. */
  invalid?: readonly number[];
  label?: string;
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 text-callout font-semibold text-fg">
        {label}
      </legend>
      {emails.map((email, index) => {
        const marked = error
          ? invalid
            ? invalid.includes(index)
            : true
          : false;
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: the fields are positional
          <div key={index} className="flex items-center gap-1">
            <Label htmlFor={`${id}-email-${index}`} className="sr-only">
              {`E-mail ${index + 1}`}
            </Label>
            <Input
              id={`${id}-email-${index}`}
              type="email"
              inputMode="email"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="nome@exemplo.com"
              value={email}
              onChange={(event) =>
                onChange(
                  emails.map((item, at) =>
                    at === index ? event.target.value : item,
                  ),
                )
              }
              aria-invalid={marked ? true : undefined}
              aria-describedby={`${id}-note${marked ? ` ${id}-error` : ""}`}
            />
            {emails.length > 1 ? (
              <IconButton
                label={`Tirar o e-mail ${index + 1}`}
                onClick={() => onChange(emails.filter((_, at) => at !== index))}
              >
                <X />
              </IconButton>
            ) : null}
          </div>
        );
      })}
      <p id={`${id}-note`} className="text-caption text-fg-3">
        {NEUTRAL_INVITE_NOTE}
      </p>
      <FieldError id={`${id}-error`}>{error}</FieldError>
      {emails.length < max ? (
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => onChange([...emails, ""])}
        >
          <Plus aria-hidden="true" />
          Adicionar outro e-mail
        </Button>
      ) : null}
    </fieldset>
  );
}
