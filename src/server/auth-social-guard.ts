// Guards of sign-in and linking with Google (doc 01 §11.2, ADR-15), wired in
// the `before` hook of src/server/auth.ts. They run before the endpoint,
// outside any transaction, so the global client is safe here.
import "server-only";
import { APIError, getSessionFromCtx } from "better-auth/api";
import { hasAdminRole } from "@/lib/admin/roles";
import {
  canManagePasskeys,
  PASSKEY_CONFIRMATION_REQUIRED,
  SOCIAL_CONFIRMATION_MESSAGE,
  SOCIAL_MANAGEMENT_PATHS,
} from "@/lib/admin/second-factor";
import {
  CREDENTIAL_REQUIRED,
  CREDENTIAL_REQUIRED_MESSAGE,
  GOOGLE_FLAG,
  ID_TOKEN_REFUSED,
  SOCIAL_SIGN_IN_OFF,
  SOCIAL_SIGN_IN_OFF_MESSAGE,
} from "@/lib/auth/social";
import { countUserPasskeys } from "@/server/domain/passkeys";
import { linkedProviderOf } from "@/server/domain/social-links";
import { isFlagEnabled, isFlagEnabledForEveryone } from "@/server/flags";

type AuthContext = Parameters<typeof getSessionFromCtx>[0];

const signInOff = () =>
  APIError.from("FORBIDDEN", {
    code: SOCIAL_SIGN_IN_OFF,
    message: SOCIAL_SIGN_IN_OFF_MESSAGE,
  });

/**
 * Only the redirect flow: an ID token from the browser would skip the
 * signed state and the callback (`disableIdTokenSignIn` already refuses it).
 */
function refuseIdToken(ctx: AuthContext): void {
  if (ctx.body?.idToken) {
    throw APIError.from("BAD_REQUEST", {
      code: ID_TOKEN_REFUSED,
      message: "Entre pelo botão do Google.",
    });
  }
}

export async function guardSocialAuth(ctx: AuthContext): Promise<void> {
  if (ctx.path === "/sign-in/social") {
    refuseIdToken(ctx);
    // Nobody is signed in yet: the button follows the global value.
    if (!(await isFlagEnabledForEveryone(GOOGLE_FLAG))) throw signInOff();
    return;
  }
  if (!SOCIAL_MANAGEMENT_PATHS.includes(ctx.path)) return;
  const current = await getSessionFromCtx(ctx, { disableRefresh: true });
  // Signed out: the endpoint itself answers 401.
  if (!current) return;
  // /unlink-account takes the id of an `account` row: never the password's.
  if (
    ctx.path === "/unlink-account" &&
    typeof ctx.body?.accountId === "string" &&
    (await linkedProviderOf(current.user.id, ctx.body.accountId)) ===
      "credential"
  ) {
    throw APIError.from("BAD_REQUEST", {
      code: CREDENTIAL_REQUIRED,
      message: CREDENTIAL_REQUIRED_MESSAGE,
    });
  }
  if (ctx.path === "/link-social") {
    refuseIdToken(ctx);
    // /unlink-account checks this itself (freshSessionMiddleware).
    const freshAge = ctx.context.sessionConfig.freshAge * 1000;
    const createdAt = new Date(current.session.createdAt).getTime();
    if (freshAge > 0 && Date.now() - createdAt >= freshAge) {
      throw APIError.from("FORBIDDEN", {
        code: "SESSION_NOT_FRESH",
        message: "Session is not fresh",
      });
    }
    // Linking follows the person's own value; unlinking always works.
    if (!(await isFlagEnabled(GOOGLE_FLAG, current.user.id))) {
      throw signInOff();
    }
  }
  if (!hasAdminRole(current.user.role)) return;
  const passkeyVerifiedAt = current.session.passkeyVerifiedAt as
    | Date
    | null
    | undefined;
  if (passkeyVerifiedAt) return;
  const passkeyCount = await countUserPasskeys(current.user.id);
  if (!canManagePasskeys({ isAdmin: true, passkeyVerifiedAt, passkeyCount })) {
    throw APIError.from("FORBIDDEN", {
      code: PASSKEY_CONFIRMATION_REQUIRED,
      message: SOCIAL_CONFIRMATION_MESSAGE,
    });
  }
}
