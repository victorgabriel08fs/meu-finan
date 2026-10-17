// Better Auth (doc 01 §11). There is no public sign-up: the only way to create
// an account through Better Auth is the one-time setup at /primeiro-acesso,
// which creates the first account (an administrator), and the two layers below
// enforce it even if someone calls the auth API directly. Every other account
// is created by an administrator in the panel (src/server/domain/users.ts),
// outside Better Auth, and gets an invite link instead of a password.
import "server-only";
import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins/admin";
import { defaultAc } from "better-auth/plugins/admin/access";
import { count } from "drizzle-orm";
import { ADMIN_ROLE } from "@/lib/admin/roles";
import { DEACTIVATED_MESSAGE } from "@/lib/admin/status";
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
    message: "Cadastro desativado: contas novas só por convite.",
  });

/**
 * Better Auth's admin plugin supplies the role and ban columns, the default
 * role of new accounts and, above all, refuses to create a session for a
 * deactivated account (password and passkey sign-in alike). An administrator
 * manages accounts, never another person's money: the roles below leave out
 * impersonation and setting someone's password or e-mail.
 */
const adminPlugin = admin({
  roles: {
    admin: defaultAc.newRole({
      user: ["create", "list", "set-role", "ban", "delete", "get"],
      session: ["list", "revoke", "delete"],
    }),
    user: defaultAc.newRole({ user: [], session: [] }),
  },
  defaultRole: "user",
  adminRoles: [ADMIN_ROLE],
  bannedUserMessage: DEACTIVATED_MESSAGE,
});

/**
 * The plugin's own HTTP endpoints (/api/auth/admin/*) stay off: the panel's
 * Server Actions are the only door, because they check the guards (nobody
 * demotes, deactivates or deletes themself or the last administrator) and
 * write the audit trail in the same transaction as the change.
 */
const ADMIN_HTTP_PATHS = Object.values(adminPlugin.endpoints).map(
  (endpoint) => endpoint.path,
);

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
  disabledPaths: ADMIN_HTTP_PATHS,
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
    // No cookie cache: every request checks the session row (and the role and
    // ban on the user row), so revoking a session, deactivating an account or
    // removing an administrator takes effect on the next request.
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
        // Layer 2, for every path that could create a user through Better
        // Auth (only sign-up is enabled): it must be the owner's e-mail, and
        // that first account is the administrator. With layer 1 this means
        // OWNER_EMAIL only ever applies to the first account. No queries
        // here: this runs inside the sign-up transaction. Runs after the admin
        // plugin's hook, so the role set here wins over its default.
        before: async (user) => {
          if (!isOwnerEmail(user.email, readServerEnv("OWNER_EMAIL"))) {
            throw signUpClosed();
          }
          return { data: { role: ADMIN_ROLE } };
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
    adminPlugin,
    // Must stay last: sets cookies from Server Actions.
    nextCookies(),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
