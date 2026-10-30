import "server-only";
import { z } from "zod";

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

const randomSecret = z.string().min(32, {
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

/** Like {@link readServerEnv}, but an unset variable is also an error. */
export function requireServerEnv(key: ServerEnvKey): string {
  const value = readServerEnv(key);
  if (value === undefined) throw new EnvError(key, "is not set");
  return value;
}

/**
 * The app's public origin (BETTER_AUTH_URL), e.g. "https://app.exemplo.com":
 * links sent to people (invites) must point at the domain the passkeys use.
 */
export function appOrigin(): string {
  return new URL(readServerEnv("BETTER_AUTH_URL") ?? "http://localhost:3000")
    .origin;
}
