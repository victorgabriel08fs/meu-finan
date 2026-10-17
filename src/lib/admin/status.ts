// Status of an account in Administração › Usuários (doc 02 §6.16), pure.

export type AccountStatus =
  | "active"
  | "invite_pending"
  | "invite_expired"
  | "deactivated";

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  active: "Ativo",
  invite_pending: "Convite pendente",
  invite_expired: "Convite expirado",
  deactivated: "Desativado",
};

/** Shown to a deactivated account that signs in with the right credentials. */
export const DEACTIVATED_MESSAGE =
  "Este acesso está desativado. Fale com quem administra o app.";

export type AccountStatusInput = {
  banned: boolean;
  /** Has a password or a passkey: the person already set up their access. */
  hasAccess: boolean;
  /** Expiry of the open invite (not used, not revoked), if there is one. */
  inviteExpiresAt: Date | null;
};

/**
 * Desativado wins over everything. Someone who never set a password or a
 * passkey is still an invite: pending while the open invite is valid, expired
 * otherwise (it ran out, or an administrator invalidated it).
 */
export function accountStatus(
  input: AccountStatusInput,
  now: Date,
): AccountStatus {
  if (input.banned) return "deactivated";
  if (input.hasAccess) return "active";
  if (input.inviteExpiresAt && input.inviteExpiresAt > now) {
    return "invite_pending";
  }
  return "invite_expired";
}

/** An access link (invite or reset) as /convite sees it. */
export type AccessLinkState = "valid" | "expired" | "used" | "revoked";

export function accessLinkState(
  link: { usedAt: Date | null; revokedAt: Date | null; expiresAt: Date },
  now: Date,
): AccessLinkState {
  if (link.usedAt) return "used";
  if (link.revokedAt) return "revoked";
  if (link.expiresAt <= now) return "expired";
  return "valid";
}
