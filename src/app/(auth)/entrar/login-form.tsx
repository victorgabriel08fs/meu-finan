"use client";

import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { GoogleMark } from "@/components/auth/google-mark";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SOCIAL_SIGN_IN_OFF,
  SOCIAL_SIGN_IN_OFF_MESSAGE,
} from "@/lib/auth/social";
import { authClient } from "@/lib/auth-client";
import {
  isPasskeyCancel,
  loginErrorMessage,
  SIGN_IN_UNAVAILABLE,
} from "./login-errors";

type Pending = "passkey" | "google" | "password" | null;

export function LoginForm({
  redirectTo,
  notice,
  google = false,
  initialError = null,
}: {
  redirectTo: string;
  notice?: string;
  /** Shows "Continuar com o Google" (env and flag checked on the server). */
  google?: boolean;
  /** The `?error=` Google's return brought, already worded. */
  initialError?: string | null;
}) {
  const errorId = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  // Google's errors stand apart from the form: they are not about the e-mail
  // or the password fields.
  const [socialError, setSocialError] = useState<string | null>(initialError);
  const done = useRef(false);

  // Signed in: a full page load, not a client navigation. The router keeps
  // recently visited pages mounted (hidden), so only a new page guarantees
  // that nothing a previous account left in memory (this form's fields,
  // stores, pages) reaches this one. redirectTo is a same-origin path
  // (safeRedirectPath).
  const finish = () => {
    if (done.current) return;
    done.current = true;
    window.location.replace(redirectTo);
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
    setSocialError(null);
    setPending("passkey");
    try {
      const result = await authClient.signIn.passkey();
      if (result?.error) {
        const { status, name } = result.error as {
          status?: number;
          name?: string;
        };
        const code = "code" in result.error ? result.error.code : undefined;
        if (isPasskeyCancel({ name, code })) return;
        // A passkey failure is never "wrong password".
        setError(
          status === 429 || code === "BANNED_USER"
            ? loginErrorMessage({ status, code })
            : SIGN_IN_UNAVAILABLE,
        );
        return;
      }
      finish();
    } catch (thrown) {
      if (!isPasskeyCancel(thrown as { name?: string })) {
        setError(SIGN_IN_UNAVAILABLE);
      }
    } finally {
      // Once signed in, the spinner stays until the page unloads.
      if (!done.current) setPending(null);
    }
  };

  // Better Auth answers with Google's URL and leaves with window.location: a
  // full page load, like every sign-in. The way back is a full load too.
  const signInWithGoogle = async () => {
    setError(null);
    setSocialError(null);
    setPending("google");
    let leaving = false;
    try {
      const { error: startError } = await authClient.signIn.social({
        provider: "google",
        callbackURL: redirectTo,
        errorCallbackURL: `/entrar?voltar=${encodeURIComponent(redirectTo)}`,
      });
      if (startError) {
        setSocialError(
          startError.status === 429
            ? loginErrorMessage({ status: 429 })
            : startError.code === SOCIAL_SIGN_IN_OFF
              ? SOCIAL_SIGN_IN_OFF_MESSAGE
              : SIGN_IN_UNAVAILABLE,
        );
        return;
      }
      leaving = true;
    } catch {
      setSocialError(SIGN_IN_UNAVAILABLE);
    } finally {
      // On the way to Google, the spinner stays until the page unloads.
      if (!leaving) setPending(null);
    }
  };

  const signInWithPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSocialError(null);
    setPending("password");
    try {
      const { error: signInError } = await authClient.signIn.email({
        email: email.trim(),
        password,
      });
      if (signInError) {
        setError(loginErrorMessage(signInError));
        return;
      }
      finish();
    } catch {
      setError(SIGN_IN_UNAVAILABLE);
    } finally {
      if (!done.current) setPending(null);
    }
  };

  return (
    <div className="mt-8 flex flex-col gap-6">
      {notice ? (
        <output
          aria-live="polite"
          className="rounded-control bg-primary-soft px-4 py-3 text-callout text-on-primary-soft"
        >
          {notice}
        </output>
      ) : null}

      <FieldError id={`${errorId}-social`}>{socialError}</FieldError>

      <div className="flex flex-col gap-3">
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

        {google ? (
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="w-full"
            loading={pending === "google"}
            disabled={pending !== null}
            onClick={signInWithGoogle}
          >
            <GoogleMark />
            Continuar com o Google
          </Button>
        ) : null}
      </div>

      <div className="flex items-center gap-3 text-caption text-fg-3">
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
