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
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins/admin";
import { defaultAc } from "better-auth/plugins/admin/access";
import { count } from "drizzle-orm";
import { ADMIN_ROLE } from "@/lib/admin/roles";
import { stampPasskeySession } from "@/lib/admin/second-factor";
import { DEACTIVATED_MESSAGE } from "@/lib/admin/status";
import { LEGAL_REQUIRED, LEGAL_VERSION } from "@/lib/legal/version";
import { classifyAuthOutcome } from "@/lib/observability/auth-events";
import {
  guardPasskeyManagement,
  revokeReplacedSession,
} from "@/server/auth-second-factor";
import { db } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { authOrigins, readServerEnv } from "@/server/env";
import { hashForLog, logEvent, requestMeta } from "@/server/observability/log";
import { isOwnerEmail, secretMatches } from "@/server/security/guards";
import { rejectLeakedPassword } from "@/server/security/leaked-passwords";
import {
  countEmailSignIn,
  settleEmailSignIn,
} from "@/server/security/login-attempts";

/** Header the setup Server Action uses to hand the setup token to sign-up. */
export const SETUP_TOKEN_HEADER = "x-meu-finan-setup-token";

/**
 * Header the setup Server Action uses to say which version of the terms and
 * privacy policy the person accepted (the checkbox, checked on the server).
 */
export const LEGAL_VERSION_HEADER = "x-meu-finan-legal-version";

const DAY = 60 * 60 * 24;
const BUILD_ONLY_SECRET = "build-only-secret-never-used-to-sign-real-sessions";

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

function refuseSignUp(reason: string, headers: Headers | undefined): void {
  try {
    logEvent(
      "auth.sign_up_refused",
      { reason, ...requestMeta(headers) },
      "warn",
    );
  } catch {
    // Logging never changes the answer.
  }
}

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

const { origin, rpId, passkeyOrigins, trustedOrigins } = authOrigins();

// A production runtime without BETTER_AUTH_URL falls back to the Vercel domain
// or localhost: say so once, in the logs. Never throw: the build has no env.
if (
  process.env.NODE_ENV === "production" &&
  process.env.NEXT_PHASE !== "phase-production-build" &&
  !process.env.BETTER_AUTH_URL?.trim()
) {
  console.warn(
    `[auth] BETTER_AUTH_URL não definida: usando ${origin}. Logins de outro domínio serão recusados (INVALID_ORIGIN).`,
  );
}

export const auth = betterAuth({
  appName: "Prumo",
  baseURL: origin,
  trustedOrigins,
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
  // Nobody changes session fields through the API: passkeyVerifiedAt is set
  // only by the passkey sign-in (databaseHooks below).
  disabledPaths: [...ADMIN_HTTP_PATHS, "/update-session"],
  user: {
    // The accepted version of the terms (src/lib/legal/version.ts), read by
    // the DAL's gate. `input: false`: /update-user never writes them; only the
    // sign-up hook, the invite and /aceitar-termos do.
    additionalFields: {
      legalVersion: { type: "string", required: false, input: false },
      legalAcceptedAt: { type: "date", required: false, input: false },
    },
  },
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
    // Set when the session is opened with a passkey: Administração needs it.
    additionalFields: {
      passkeyVerifiedAt: { type: "date", required: false, input: false },
    },
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
    // Better Auth's haveIBeenPwned plugin is not used (fails closed, covers
    // only its own endpoints): see leaked-passwords.ts.
    before: createAuthMiddleware(async (ctx) => {
      await guardPasskeyManagement(ctx);
      if (ctx.path === "/sign-in/email") {
        return countEmailSignIn(ctx.body?.email);
      }
      if (ctx.path === "/change-password") {
        return rejectLeakedPassword(ctx.body?.newPassword);
      }
      if (ctx.path !== "/sign-up/email") return;
      const provided = ctx.headers?.get(SETUP_TOKEN_HEADER);
      if (!secretMatches(provided, readServerEnv("SETUP_TOKEN"))) {
        refuseSignUp("bad_token", ctx.headers);
        throw signUpClosed();
      }
      const [row] = await db.select({ total: count() }).from(schema.user);
      if ((row?.total ?? 0) > 0) {
        refuseSignUp("already_done", ctx.headers);
        throw signUpClosed();
      }
      // The first account accepts the terms like everyone else (layer 2
      // records it).
      if (ctx.headers?.get(LEGAL_VERSION_HEADER) !== LEGAL_VERSION) {
        refuseSignUp("legal_missing", ctx.headers);
        throw new APIError("FORBIDDEN", { message: LEGAL_REQUIRED });
      }
      // Last: whoever lacks the token never reaches the leak service.
      await rejectLeakedPassword(ctx.body?.password);
    }),
    // A successful password sign-in resets the per-e-mail counter. Access log:
    // sign-ins, failures and password changes, with no e-mail in the clear.
    // The after hook also runs when the endpoint threw, with the error in
    // `returned`.
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-in/email") {
        await settleEmailSignIn(ctx.body?.email, ctx.context.returned);
      }
      await revokeReplacedSession(ctx);
      try {
        const returned: unknown = ctx.context.returned;
        const outcome = classifyAuthOutcome({
          path: ctx.path,
          sessionUserId: ctx.context.newSession?.user.id ?? null,
          error: isAPIError(returned)
            ? {
                status: returned.statusCode,
                code:
                  typeof returned.body?.code === "string"
                    ? returned.body.code
                    : undefined,
              }
            : null,
        });
        if (!outcome) return;
        const failed = outcome.event.endsWith("_failed");
        const email =
          ctx.path === "/sign-in/email" &&
          failed &&
          typeof ctx.body?.email === "string"
            ? ctx.body.email
            : undefined;
        logEvent(
          outcome.event,
          {
            method: outcome.method,
            userId: outcome.userId,
            status: outcome.status,
            code: outcome.code,
            emailHash: email
              ? hashForLog(email.trim().toLowerCase())
              : undefined,
            ...requestMeta(ctx.headers ?? ctx.request?.headers),
          },
          failed ? "warn" : "info",
        );
      } catch (error) {
        // Logging never takes the sign-in down.
        console.error(
          "[auth-log]",
          error instanceof Error ? error.name : "unexpected",
        );
      }
    }),
  },
  databaseHooks: {
    session: {
      create: {
        // Stamps the session born from a passkey sign-in (doc 01 §11.9). No
        // queries: it may run inside a transaction.
        before: async (_session, context) => stampPasskeySession(context?.path),
      },
    },
    user: {
      create: {
        // Layer 2, for every path that could create a user through Better
        // Auth (only sign-up is enabled): it must be the owner's e-mail, and
        // that first account is the administrator. With layer 1 this means
        // OWNER_EMAIL only ever applies to the first account. No queries
        // here: this runs inside the sign-up transaction. Runs after the admin
        // plugin's hook, so the role set here wins over its default. Layer 1
        // already required the accepted terms, so the account records them.
        before: async (user) => {
          if (!isOwnerEmail(user.email, readServerEnv("OWNER_EMAIL"))) {
            refuseSignUp("not_owner_email", undefined);
            throw signUpClosed();
          }
          return {
            data: {
              role: ADMIN_ROLE,
              legalVersion: LEGAL_VERSION,
              legalAcceptedAt: new Date(),
            },
          };
        },
      },
    },
  },
  plugins: [
    passkey({
      rpID: rpId,
      rpName: "Prumo",
      origin: passkeyOrigins,
    }),
    adminPlugin,
    // Must stay last: sets cookies from Server Actions.
    nextCookies(),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
