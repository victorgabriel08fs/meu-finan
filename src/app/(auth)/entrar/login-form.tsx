"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEACTIVATED_MESSAGE } from "@/lib/admin/status";
import { authClient } from "@/lib/auth-client";

type Pending = "passkey" | "password" | null;

function messageFor(
  error: { status?: number; code?: string } | null | undefined,
) {
  if (!error) return null;
  if (error.status === 429) {
    return "Muitas tentativas. Espere um minuto e tente de novo.";
  }
  // Only reached with the right password or passkey: it reveals nothing.
  if (error.code === "BANNED_USER") return DEACTIVATED_MESSAGE;
  return "E-mail ou senha incorretos.";
}

export function LoginForm({
  redirectTo,
  notice,
}: {
  redirectTo: string;
  notice?: string;
}) {
  const router = useRouter();
  const errorId = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  const done = useRef(false);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    router.replace(redirectTo);
    router.refresh();
  };

  // Conditional UI: the browser offers saved passkeys as soon as the e-mail
  // field gets focus (doc 01 §11.2). Silently skipped where unsupported.
  // biome-ignore lint/correctness/useExhaustiveDependencies: start once on mount
  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      if (
        typeof window === "undefined" ||
        !window.PublicKeyCredential?.isConditionalMediationAvailable ||
        !(await window.PublicKeyCredential.isConditionalMediationAvailable())
      ) {
        return;
      }
      const result = await authClient.signIn.passkey({ autoFill: true });
      if (!cancelled && result && !result.error) finish();
    };
    start().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const signInWithPasskey = async () => {
    setError(null);
    setPending("passkey");
    try {
      const result = await authClient.signIn.passkey();
      if (result?.error) {
        const { status } = result.error;
        const code = "code" in result.error ? result.error.code : undefined;
        setError(
          status === 429 || code === "BANNED_USER"
            ? messageFor({ status, code })
            : "Não foi possível entrar com a passkey. Tente de novo ou use a senha.",
        );
        return;
      }
      finish();
    } finally {
      setPending(null);
    }
  };

  const signInWithPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setPending("password");
    try {
      const { error: signInError } = await authClient.signIn.email({
        email: email.trim(),
        password,
      });
      if (signInError) {
        setError(messageFor(signInError));
        return;
      }
      finish();
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="mt-8 flex flex-col gap-6">
      {notice ? (
        <output
          aria-live="polite"
          className="rounded-control bg-primary-soft px-4 py-3 text-[14px] text-on-primary-soft leading-5"
        >
          {notice}
        </output>
      ) : null}

      <Button
        type="button"
        size="lg"
        className="w-full"
        loading={pending === "passkey"}
        disabled={pending !== null}
        onClick={signInWithPasskey}
      >
        <svg
          aria-hidden="true"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z" />
          <circle cx="16.5" cy="7.5" r=".5" fill="currentColor" />
        </svg>
        Entrar com passkey
      </Button>

      <div className="flex items-center gap-3 text-[13px] text-fg-3">
        <span className="h-px flex-1 bg-border" />
        ou com e-mail e senha
        <span className="h-px flex-1 bg-border" />
      </div>

      <form
        className="flex flex-col gap-4"
        onSubmit={signInWithPassword}
        aria-describedby={error ? errorId : undefined}
        noValidate
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username webauthn"
            enterKeyHint="next"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={error ? true : undefined}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Senha</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            enterKeyHint="go"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={error ? true : undefined}
          />
        </div>
        <FieldError id={errorId}>{error}</FieldError>
        <Button
          type="submit"
          variant="secondary"
          size="lg"
          className="w-full"
          loading={pending === "password"}
          disabled={pending !== null || !email || !password}
        >
          Entrar com senha
        </Button>
      </form>
    </div>
  );
}
