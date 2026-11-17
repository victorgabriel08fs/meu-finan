"use client";

import type { Ref } from "react";
import { FieldError } from "@/components/ui/field-error";

const LINK = "text-fg underline underline-offset-2 hover:text-primary";

type LegalConsentProps = {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  error?: string;
  ref?: Ref<HTMLInputElement>;
};

/**
 * "Li e aceito os Termos de uso e a Política de privacidade." (doc 02 §6.20):
 * the required checkbox of the first access, the invite and /aceitar-termos.
 * The links open in a new tab, so the form keeps what was typed; tapping one
 * opens it without ticking the box (links inside a label keep their own
 * click). The server checks the acceptance again; this only shapes the form.
 */
export function LegalConsent({
  id,
  checked,
  onCheckedChange,
  error,
  ref,
}: LegalConsentProps) {
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={id}
        className="flex min-h-11 cursor-pointer items-start gap-3 text-body text-fg"
      >
        <input
          ref={ref}
          id={id}
          name="acceptedLegal"
          type="checkbox"
          className="mt-0.5 size-5 shrink-0 accent-primary"
          checked={checked}
          onChange={(event) => onCheckedChange(event.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        <span>
          Li e aceito os{" "}
          <a
            href="/termos"
            target="_blank"
            rel="noopener noreferrer"
            className={LINK}
          >
            Termos de uso
            <span className="sr-only"> (abre em nova aba)</span>
          </a>{" "}
          e a{" "}
          <a
            href="/privacidade"
            target="_blank"
            rel="noopener noreferrer"
            className={LINK}
          >
            Política de privacidade
            <span className="sr-only"> (abre em nova aba)</span>
          </a>
          .
        </span>
      </label>
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}
