import type { BadgeTone } from "@/components/ui/badge";
import type { UserRole } from "@/lib/admin/roles";
import { ACCOUNT_STATUS_LABELS, type AccountStatus } from "@/lib/admin/status";

/** Status badge of an account (doc 02 §6.16): color always with the word. */
export const STATUS_BADGES: Record<
  AccountStatus,
  { label: string; tone: BadgeTone }
> = {
  active: { label: ACCOUNT_STATUS_LABELS.active, tone: "primary" },
  invite_pending: {
    label: ACCOUNT_STATUS_LABELS.invite_pending,
    tone: "transfer",
  },
  invite_expired: {
    label: ACCOUNT_STATUS_LABELS.invite_expired,
    tone: "warning",
  },
  deactivated: { label: ACCOUNT_STATUS_LABELS.deactivated, tone: "neutral" },
};

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrador",
  user: "Usuário",
};

/** "AS" for "Ana Souza", "B" for "Bruno"; "?" when there is no name. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? (parts.at(-1)?.charAt(0) ?? "") : "";
  return `${first}${last}`.toUpperCase() || "?";
}

/** "1 conta", "4 contas". */
export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}
