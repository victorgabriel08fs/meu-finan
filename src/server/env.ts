import "server-only";
import { z } from "zod";
import { isValidSentryDsn } from "@/lib/observability/dsn";
import { resolveAuthOrigins, toOrigin } from "@/server/auth-origins";

/**
 * Server-side environment variables, validated with Zod when read.
 *
 * Validation is lazy and per variable, so `next build`, `tsc` and Vitest run
 * without secrets and only the code path that needs a value fails. Error
 * messages name the variable but never echo its value. Every variable is
 * documented in .env.example.
 */

const postgresUrl = z.url({
  protocol: /^postgres(ql)?$/,
  error: "expected a postgres:// or postgresql:// connection string",
});

const hostname = z
  .string()
  .regex(
    /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i,
    {
      error: "expected a bare hostname, without scheme, port or path",
    },
  );

export const MIN_SECRET_LENGTH = 32;

const randomSecret = z.string().min(MIN_SECRET_LENGTH, {
  error: "expected at least 32 characters (see .env.example to generate one)",
});

const serverEnvSchemas = {
  DATABASE_URL: postgresUrl,
  DATABASE_URL_UNPOOLED: postgresUrl,
  BETTER_AUTH_SECRET: randomSecret,
  BETTER_AUTH_URL: z.url({
    protocol: /^https?$/,
    error: "expected an http:// or https:// URL",
  }),
  // Passkeys are bound to this domain; default is BETTER_AUTH_URL's hostname.
  PASSKEY_RP_ID: hostname,
  // Extra origins allowed to call /api/auth/*, comma-separated, no wildcard.
  BETTER_AUTH_TRUSTED_ORIGINS: z.string().refine(
    (list) =>
      list
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .every((item) => toOrigin(item) !== undefined),
    { error: "expected http(s) URLs separated by commas, without wildcards" },
  ),
  // Set by Vercel itself (a bare hostname and the deployment kind).
  VERCEL_PROJECT_PRODUCTION_URL: hostname,
  VERCEL_ENV: z.enum(["production", "preview", "development"]),
  OWNER_EMAIL: z.email({ error: "expected an e-mail address" }).toLowerCase(),
  SETUP_TOKEN: randomSecret,
  RECOVERY_TOKEN: randomSecret,
  CRON_SECRET: randomSecret,
  // Web Push (VAPID): an uncompressed P-256 public key (65 bytes) and its
  // private key (32 bytes), base64url, as `web-push generate-vapid-keys`
  // prints them. The public one also goes to the browser, through the page.
  VAPID_PUBLIC_KEY: z.string().regex(/^[A-Za-z0-9_-]{87}$/, {
    error: "expected the public key printed by web-push generate-vapid-keys",
  }),
  VAPID_PRIVATE_KEY: z.string().regex(/^[A-Za-z0-9_-]{43}$/, {
    error: "expected the private key printed by web-push generate-vapid-keys",
  }),
  // Optional: without it Sentry stays off. The browser uses NEXT_PUBLIC_SENTRY_DSN
  // (same value, read by instrumentation.ts and next.config.ts with the same parser).
  SENTRY_DSN: z.string().refine(isValidSentryDsn, {
    error: "expected a Sentry DSN (https://<key>@<host>/<project id>)",
  }),
} as const;

export type ServerEnvKey = keyof typeof serverEnvSchemas;

export class EnvError extends Error {
  readonly key: ServerEnvKey;

  constructor(key: ServerEnvKey, problem: string) {
    super(`Environment variable ${key} ${problem}. See .env.example.`);
    this.name = "EnvError";
    this.key = key;
  }
}

/**
 * Returns the validated value, or `undefined` when the variable is unset or
 * blank. Throws {@link EnvError} when it is set but invalid.
 */
export function readServerEnv(key: ServerEnvKey): string | undefined {
  const raw = process.env[key]?.trim();
  if (!raw) return undefined;

  const parsed = serverEnvSchemas[key].safeParse(raw);
  if (!parsed.success) {
    // Only the messages: Zod issues also carry the raw input, which may be a secret.
    const reasons = parsed.error.issues.map((issue) => issue.message);
    throw new EnvError(key, `is invalid: ${reasons.join("; ")}`);
  }
  return parsed.data;
}

export type SafeEnv =
  | { status: "ok"; value: string }
  | { status: "unset" }
  | { status: "invalid"; problem: string };

/**
 * Like {@link readServerEnv}, but never throws: a bad value is reported as
 * `invalid` with the error message (never the value), so callers can fail
 * closed or fall back instead of breaking the whole page.
 */
export function readServerEnvSafe(key: ServerEnvKey): SafeEnv {
  try {
    const value = readServerEnv(key);
    return value === undefined ? { status: "unset" } : { status: "ok", value };
  } catch (error) {
    if (error instanceof EnvError) {
      return { status: "invalid", problem: error.message };
    }
    throw error;
  }
}

/** Like {@link readServerEnv}, but an unset variable is also an error. */
export function requireServerEnv(key: ServerEnvKey): string {
  const value = readServerEnv(key);
  if (value === undefined) throw new EnvError(key, "is not set");
  return value;
}

/**
 * Origins and passkey rpID from the environment. A bad optional value falls
 * back to the default (with a warning) instead of taking the login down.
 */
export function authOrigins() {
  const optional = (key: ServerEnvKey) => {
    const result = readServerEnvSafe(key);
    if (result.status === "invalid") {
      console.warn(`[auth] ${result.problem} Usando o padrão.`);
    }
    return result.status === "ok" ? result.value : undefined;
  };
  return resolveAuthOrigins({
    baseUrl: optional("BETTER_AUTH_URL"),
    vercelProductionUrl:
      optional("VERCEL_ENV") === "production"
        ? optional("VERCEL_PROJECT_PRODUCTION_URL")
        : undefined,
    rpId: optional("PASSKEY_RP_ID"),
    trusted: optional("BETTER_AUTH_TRUSTED_ORIGINS"),
  });
}

/**
 * The app's public origin, the same one Better Auth uses: links sent to
 * people (invites, push) must point at the domain the passkeys use.
 */
export function appOrigin(): string {
  return authOrigins().origin;
}
