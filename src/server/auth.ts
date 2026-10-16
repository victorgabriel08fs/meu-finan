// Better Auth for a single owner (doc 01 §11). There is no public sign-up: the
// only way to create the user is the one-time setup at /primeiro-acesso, and the
// two layers below enforce it even if someone calls the auth API directly.
import "server-only";
import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { count } from "drizzle-orm";
import { db } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { readServerEnv } from "@/server/env";
import { isOwnerEmail, secretMatches } from "@/server/security/guards";

/** Header the setup Server Action uses to hand the setup token to sign-up. */
export const SETUP_TOKEN_HEADER = "x-meu-finan-setup-token";

const DAY = 60 * 60 * 24;
const BUILD_ONLY_SECRET = "build-only-secret-never-used-to-sign-real-sessions";

function appUrl(): URL {
  return new URL(readServerEnv("BETTER_AUTH_URL") ?? "http://localhost:3000");
}

/**
 * The secret signs session cookies. `next build` evaluates this module without
 * real secrets (CI), so a placeholder is accepted only during the build phase;
 * at runtime a missing secret makes Better Auth refuse to start in production.
 */
function authSecret(): string | undefined {
  const secret = readServerEnv("BETTER_AUTH_SECRET");
  if (secret) return secret;
  return process.env.NEXT_PHASE === "phase-production-build"
    ? BUILD_ONLY_SECRET
    : undefined;
}

const signUpClosed = () =>
  new APIError("FORBIDDEN", {
    message: "Cadastro desativado: este app tem um único dono.",
  });

const url = appUrl();

export const auth = betterAuth({
  appName: "Meu Finan",
  baseURL: url.origin,
  secret: authSecret(),
  database: drizzleAdapter(db, {
    provider: "pg",
    transaction: true,
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      passkey: schema.passkey,
      rateLimit: schema.rateLimit,
    },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    autoSignIn: true,
  },
  session: {
    expiresIn: 30 * DAY,
    updateAge: DAY,
    // Operations such as changing the password need a sign-in from the last day.
    freshAge: DAY,
    // No cookie cache: every request checks the session row, so revoking a
    // session takes effect immediately (one indexed query for a single user).
    cookieCache: { enabled: false },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 600, max: 5 },
      "/change-password": { window: 600, max: 5 },
      "/passkey/verify-authentication": { window: 60, max: 10 },
      "/passkey/generate-authenticate-options": { window: 60, max: 20 },
      "/passkey/verify-registration": { window: 600, max: 10 },
    },
  },
  hooks: {
    // Layer 1: sign-up only through the setup flow, which forwards the token,
    // and only while no user exists. Runs before the endpoint opens its
    // transaction, so the global client is safe to use here.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return;
      const provided = ctx.headers?.get(SETUP_TOKEN_HEADER);
      if (!secretMatches(provided, readServerEnv("SETUP_TOKEN"))) {
        throw signUpClosed();
      }
      const [row] = await db.select({ total: count() }).from(schema.user);
      if ((row?.total ?? 0) > 0) throw signUpClosed();
    }),
  },
  databaseHooks: {
    user: {
      create: {
        // Layer 2, for every path that could create a user: it must be the
        // owner's e-mail. With user.email unique, that also means at most one
        // user ever. No queries here: this runs inside the sign-up transaction.
        before: async (user) => {
          if (!isOwnerEmail(user.email, readServerEnv("OWNER_EMAIL"))) {
            throw signUpClosed();
          }
        },
      },
    },
  },
  plugins: [
    passkey({
      rpID: url.hostname,
      rpName: "Meu Finan",
      origin: url.origin,
    }),
    // Must stay last: sets cookies from Server Actions.
    nextCookies(),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
