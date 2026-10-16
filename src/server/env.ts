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
