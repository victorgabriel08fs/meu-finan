// Second factor of Administração (doc 01 §11.9), pure. An administrator opens
// /admin and runs admin actions only with a session that was opened (or
// confirmed again) with a passkey: knowing the password is not enough.

/**
 * What an administrator's session still needs: nothing ("ok"), a first
 * passkey ("register") or a confirmation with a passkey they have ("confirm").
 */
export type AdminSecondFactor = "ok" | "register" | "confirm";

export function adminSecondFactor(input: {
  passkeyVerifiedAt: Date | null | undefined;
  passkeyCount: number;
}): AdminSecondFactor {
  if (input.passkeyVerifiedAt) return "ok";
  return input.passkeyCount === 0 ? "register" : "confirm";
}

/**
 * Whether the session may add or remove passkeys. An administrator who signed
 * in with a password and already has a passkey must confirm with it first:
 * otherwise whoever has the password registers their own passkey, or deletes
 * the owner's and starts over. The first passkey needs no confirmation.
 */
export function canManagePasskeys(input: {
  isAdmin: boolean;
  passkeyVerifiedAt: Date | null | undefined;
  passkeyCount: number;
}): boolean {
  return (
    !input.isAdmin || !!input.passkeyVerifiedAt || input.passkeyCount === 0
  );
}

/** The Better Auth endpoint that opens a session with a passkey. */
export const PASSKEY_SIGN_IN_PATH = "/passkey/verify-authentication";

/** Better Auth endpoints that add or remove a passkey. */
export const PASSKEY_MANAGEMENT_PATHS: readonly string[] = [
  "/passkey/generate-register-options",
  "/passkey/verify-registration",
  "/passkey/delete-passkey",
];

/**
 * Extra data for a session being created: stamped with the time when it is
 * born from a passkey sign-in, untouched otherwise (password sign-in,
 * sign-up, registering a passkey).
 */
export function stampPasskeySession(
  path: string | undefined,
  now: Date = new Date(),
): { data: { passkeyVerifiedAt: Date } } | undefined {
  return path === PASSKEY_SIGN_IN_PATH
    ? { data: { passkeyVerifiedAt: now } }
    : undefined;
}

export const ADMIN_SECTION_PATHS = [
  "/admin/usuarios",
  "/admin/flags",
  "/admin/atividade",
  "/admin/rotina",
] as const;
export type AdminSectionPath = (typeof ADMIN_SECTION_PATHS)[number];

/** Where to go after confirming: only a section of Administração. */
export function parseAdminReturnPath(value: unknown): AdminSectionPath {
  return (
    ADMIN_SECTION_PATHS.find((path) => path === value) ?? ADMIN_SECTION_PATHS[0]
  );
}

/** The confirmation screen, returning to `returnTo` once confirmed. */
export function adminGatePath(returnTo: AdminSectionPath): string {
  return `/ajustes/seguranca/admin?voltar=${encodeURIComponent(returnTo)}`;
}

export const PASSKEY_CONFIRMATION_REQUIRED = "PASSKEY_CONFIRMATION_REQUIRED";
export const PASSKEY_CONFIRMATION_MESSAGE =
  "Confirme com uma passkey que você já tem antes de mexer nas passkeys.";

/**
 * Better Auth endpoints that link or unlink a social account: for an
 * administrator they need the same confirmation as managing passkeys, or
 * whoever has the password links their own Google and signs in with it.
 */
export const SOCIAL_MANAGEMENT_PATHS: readonly string[] = [
  "/link-social",
  "/unlink-account",
];

export const SOCIAL_CONFIRMATION_MESSAGE =
  "Confirme com uma passkey que você já tem antes de vincular ou desvincular o Google.";
