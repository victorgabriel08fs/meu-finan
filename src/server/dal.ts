// Data Access Layer: the real authorization check (doc 01 §11.5). Every page,
// Server Action and Route Handler that touches user data goes through here;
// src/proxy.ts only redirects optimistically.
//
// Reads request headers, so call it only inside <Suspense> (Cache Components),
// or at the top of a blocking page (`export const instant = false`).
import "server-only";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { hasAdminRole, toUserRole, type UserRole } from "@/lib/admin/roles";
import {
  type AdminSecondFactor,
  type AdminSectionPath,
  adminGatePath,
  adminSecondFactor,
} from "@/lib/admin/second-factor";
import { needsLegalAcceptance } from "@/lib/legal/version";
import { auth } from "@/server/auth";
import { countUserPasskeys } from "@/server/domain/passkeys";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  /** Version of the terms and privacy policy accepted, or null. */
  legalVersion: string | null;
};

/**
 * The current session, or null when signed out. Deduplicated per request.
 * There is no cookie cache, so the user row (role, ban) is read fresh on every
 * request. Deactivating an account ends its sessions, but a sign-in racing the
 * deactivation could leave one behind: a deactivated user counts as signed out.
 */
export const getSession = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || session.user.banned) return null;
  return session;
});

type SessionUser = NonNullable<Awaited<ReturnType<typeof getSession>>>["user"];

function toCurrentUser(user: SessionUser): CurrentUser {
  const { id, name, email, role, legalVersion } = user;
  return {
    id,
    name,
    email,
    role: toUserRole(role),
    legalVersion: legalVersion ?? null,
  };
}

/**
 * The signed-in user, whether or not they accepted the current terms;
 * redirects to /entrar when there is no valid session. Only /aceitar-termos
 * and its action use it: everything else goes through {@link requireUser}.
 */
export async function requireSignedIn(): Promise<CurrentUser> {
  const session = await getSession();
  if (!session) redirect("/entrar");
  return toCurrentUser(session.user);
}

/**
 * The signed-in user; redirects to /entrar when there is no valid session,
 * and to /aceitar-termos when they have not accepted the current version of
 * the terms and privacy policy (doc 01 §11.8).
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await requireSignedIn();
  if (needsLegalAcceptance(user.legalVersion)) redirect("/aceitar-termos");
  return user;
}

/**
 * The signed-in administrator and what their session still needs to open
 * Administração (doc 01 §11.9), or null for anyone else (an administrator who
 * has not accepted the current terms included). For navigation and the
 * confirmation screen only: it never authorizes anything.
 */
export const getAdminAccess = cache(
  async (): Promise<{
    user: CurrentUser;
    secondFactor: AdminSecondFactor;
  } | null> => {
    const session = await getSession();
    if (!session || !hasAdminRole(session.user.role)) return null;
    const user = toCurrentUser(session.user);
    if (needsLegalAcceptance(user.legalVersion)) return null;
    const { passkeyVerifiedAt } = session.session;
    // The passkeys are counted only when the session is not confirmed.
    const passkeyCount = passkeyVerifiedAt
      ? 0
      : await countUserPasskeys(session.user.id);
    return {
      user,
      secondFactor: adminSecondFactor({ passkeyVerifiedAt, passkeyCount }),
    };
  },
);

/**
 * The signed-in administrator whose session was opened (or confirmed) with a
 * passkey, or null for anyone else, including an administrator who signed in
 * with a password. `adminAction` relies on it.
 */
export async function getAdmin(): Promise<CurrentUser | null> {
  const access = await getAdminAccess();
  return access?.secondFactor === "ok" ? access.user : null;
}

/**
 * For the pages of Administração: signed out goes to /entrar, anyone who is
 * not an administrator gets the 404 page (notFound), and an administrator
 * whose session was not confirmed with a passkey goes to the confirmation
 * screen, which returns to `returnTo`; all before any data is read. Like
 * requireUser, call it inside <Suspense>; once the response is streaming, the
 * status stays 200 while the 404 page replaces the content.
 */
export async function requireAdmin(
  returnTo: AdminSectionPath,
): Promise<CurrentUser> {
  await requireUser();
  const access = await getAdminAccess();
  if (!access) notFound();
  if (access.secondFactor !== "ok") redirect(adminGatePath(returnTo));
  return access.user;
}
