// What an administrator may do to an account (doc 01 §11.9), pure: the domain
// reads the accounts inside the transaction that makes the change (with the
// rows locked) and asks here. Messages are pt-BR, safe to show.
import type { UserRole } from "./roles";

export type AccountAction =
  | "ban"
  | "unban"
  | "promote"
  | "demote"
  | "delete"
  | "revoke_sessions"
  | "create_link"
  | "revoke_link";

export type GuardAccount = { id: string; role: UserRole; banned: boolean };

export type GuardInput = {
  actorId: string;
  target: GuardAccount;
  /** Administrators that are not deactivated, read with the target. */
  activeAdminIds: readonly string[];
};

export const LAST_ADMIN_MESSAGE =
  "É preciso manter pelo menos um administrador ativo.";

const SELF_MESSAGES: Partial<Record<AccountAction, string>> = {
  ban: "Você não pode desativar a própria conta.",
  demote: "Você não pode remover a si mesmo dos administradores.",
  delete: "Você não pode excluir a própria conta.",
  revoke_sessions: "Para encerrar as suas sessões, use Ajustes › Segurança.",
  create_link: "Para trocar a sua senha, use Ajustes › Segurança.",
  revoke_link: "Para trocar a sua senha, use Ajustes › Segurança.",
};

/** Actions that would leave the app without an active administrator. */
const REMOVES_AN_ADMIN: readonly AccountAction[] = ["ban", "demote", "delete"];

/**
 * Why the action is not allowed, or null when it is. Nobody deactivates,
 * demotes or deletes themself, and the last active administrator stays
 * (with the self rule this only matters for two administrators acting on
 * each other at the same time, which the row lock serialises).
 */
export function accountActionBlocker(
  action: AccountAction,
  { actorId, target, activeAdminIds }: GuardInput,
): string | null {
  if (target.id === actorId) {
    const message = SELF_MESSAGES[action];
    if (message) return message;
  }

  switch (action) {
    case "ban":
      if (target.banned) return "Esta conta já está desativada.";
      break;
    case "unban":
      if (!target.banned) return "Esta conta já está ativa.";
      break;
    case "promote":
      if (target.role === "admin") return "Esta conta já é administradora.";
      if (target.banned) return "Reative a conta antes de mudar o papel.";
      break;
    case "demote":
      if (target.role !== "admin") return "Esta conta não é administradora.";
      break;
    case "create_link":
      if (target.banned) return "Reative a conta antes de gerar um link.";
      break;
    default:
      break;
  }

  if (
    REMOVES_AN_ADMIN.includes(action) &&
    target.role === "admin" &&
    !target.banned &&
    !activeAdminIds.some((id) => id !== target.id)
  ) {
    return LAST_ADMIN_MESSAGE;
  }
  return null;
}
