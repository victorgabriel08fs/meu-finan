// Second factor of Administração inside Better Auth (doc 01 §11.9): stamps the
// sessions opened with a passkey, keeps an administrator who signed in with a
// password from adding or removing passkeys before confirming with one, and
// ends the password session a confirmation replaces. Wired in
// src/server/auth.ts; the pure rules live in src/lib/admin/second-factor.ts.
import "server-only";
import { APIError, getSessionFromCtx } from "better-auth/api";
import { hasAdminRole } from "@/lib/admin/roles";
import {
  canManagePasskeys,
  PASSKEY_CONFIRMATION_MESSAGE,
  PASSKEY_CONFIRMATION_REQUIRED,
  PASSKEY_MANAGEMENT_PATHS,
  PASSKEY_SIGN_IN_PATH,
} from "@/lib/admin/second-factor";
import { countUserPasskeys } from "@/server/domain/passkeys";

type AuthContext = Parameters<typeof getSessionFromCtx>[0];

/**
 * Hook `before`: refuses to add or remove a passkey for an administrator whose
 * session was not opened with a passkey while they already have one. Runs
 * before the endpoint, outside any transaction, so the global client is safe.
 */
export async function guardPasskeyManagement(ctx: AuthContext): Promise<void> {
  if (!PASSKEY_MANAGEMENT_PATHS.includes(ctx.path)) return;
  const current = await getSessionFromCtx(ctx, { disableRefresh: true });
  // Signed out: the endpoint itself answers 401.
  if (!current || !hasAdminRole(current.user.role)) return;
  const passkeyVerifiedAt = current.session.passkeyVerifiedAt as
    | Date
    | null
    | undefined;
  if (passkeyVerifiedAt) return;
  const passkeyCount = await countUserPasskeys(current.user.id);
  if (!canManagePasskeys({ isAdmin: true, passkeyVerifiedAt, passkeyCount })) {
    throw APIError.from("FORBIDDEN", {
      code: PASSKEY_CONFIRMATION_REQUIRED,
      message: PASSKEY_CONFIRMATION_MESSAGE,
    });
  }
}

/**
 * Hook `after`: a passkey sign-in always creates a new session, so confirming
 * on a device that had a password session would leave that one behind in
 * Sessões ativas. Deletes the session of the request's old cookie when it is
 * the same person's. Never throws: the sign-in already succeeded.
 */
export async function revokeReplacedSession(ctx: AuthContext): Promise<void> {
  if (ctx.path !== PASSKEY_SIGN_IN_PATH) return;
  const created = ctx.context.newSession;
  if (!created) return;
  try {
    const oldToken = await ctx.getSignedCookie(
      ctx.context.authCookies.sessionToken.name,
      ctx.context.secret,
    );
    if (!oldToken || oldToken === created.session.token) return;
    const old = await ctx.context.internalAdapter.findSession(oldToken);
    if (old?.session.userId !== created.session.userId) return;
    await ctx.context.internalAdapter.deleteSession(oldToken);
  } catch (error) {
    ctx.context.logger.error(
      "[auth] could not end the replaced session",
      error instanceof Error ? error.message : error,
    );
  }
}
