// Sentences of Administração › Atividade (doc 02 §6.16), pure: an audit entry
// becomes "Ana desativou Bruno Lima" plus an optional detail line. The person
// looking at the list reads their own actions as "Você".
import { FLAGS, isFlagKey } from "@/lib/flags/registry";

export type ActivityEntry = {
  action: string;
  actorId: string | null;
  actorName: string;
  targetUserId: string | null;
  targetName: string | null;
  targetEmail: string | null;
  metadata: {
    role?: "admin" | "user";
    purpose?: "invite" | "reset";
    removedPasskeys?: boolean;
    sessions?: number;
    flag?: string;
    value?: boolean | null;
  };
};

export type ActivityKind =
  | "setup"
  | "invite"
  | "link"
  | "link_revoked"
  | "accepted"
  | "ban"
  | "unban"
  | "sessions"
  | "role"
  | "delete"
  | "flag"
  | "other";

export type ActivityLine = {
  kind: ActivityKind;
  title: string;
  detail?: string;
};

const ROLE_LABELS = { admin: "administrador", user: "usuário" } as const;

function sessionsLabel(count: number): string {
  return count === 1 ? "1 sessão encerrada" : `${count} sessões encerradas`;
}

function flagLabel(key: string | undefined): string {
  if (!key) return "uma flag";
  return isFlagKey(key) ? FLAGS[key].label : key;
}

export function describeActivity(
  entry: ActivityEntry,
  viewerId: string | null,
): ActivityLine {
  const actor =
    entry.actorId && entry.actorId === viewerId ? "Você" : entry.actorName;
  const target = entry.targetName ?? entry.targetEmail ?? "uma conta";
  const meta = entry.metadata;

  switch (entry.action) {
    case "setup.completed":
      return {
        kind: "setup",
        title: `${actor} configurou o app`,
        detail: "Primeiro acesso, como administrador",
      };
    case "user.created":
      return {
        kind: "invite",
        title: `${actor} convidou ${target}`,
        detail: [
          entry.targetEmail,
          meta.role && `papel: ${ROLE_LABELS[meta.role]}`,
        ]
          .filter(Boolean)
          .join(" · "),
      };
    case "access_link.created":
      return {
        kind: "link",
        title:
          meta.purpose === "reset"
            ? `${actor} gerou um link de redefinição para ${target}`
            : `${actor} gerou um novo convite para ${target}`,
        detail: "O link anterior deixou de funcionar",
      };
    case "access_link.revoked":
      return {
        kind: "link_revoked",
        title: `${actor} invalidou o link de ${target}`,
      };
    case "access_link.accepted":
      if (meta.purpose === "reset") {
        return {
          kind: "accepted",
          title: `${target} redefiniu o acesso`,
          detail: meta.removedPasskeys
            ? "Senha nova, sessões encerradas e passkeys removidas"
            : "Senha nova e sessões encerradas",
        };
      }
      return { kind: "accepted", title: `${target} aceitou o convite` };
    case "access.recovered":
      return {
        kind: "accepted",
        title: `${target} recuperou o acesso com o código de emergência`,
        detail: meta.removedPasskeys
          ? "Senha nova, sessões encerradas e passkeys removidas"
          : "Senha nova e sessões encerradas",
      };
    case "user.banned":
      return {
        kind: "ban",
        title: `${actor} desativou ${target}`,
        detail: meta.sessions ? sessionsLabel(meta.sessions) : undefined,
      };
    case "user.unbanned":
      return { kind: "unban", title: `${actor} reativou ${target}` };
    case "user.sessions_revoked":
      return {
        kind: "sessions",
        title: `${actor} encerrou as sessões de ${target}`,
        detail: sessionsLabel(meta.sessions ?? 0),
      };
    case "user.role_changed":
      return {
        kind: "role",
        title:
          meta.role === "admin"
            ? `${actor} deu acesso de administrador a ${target}`
            : `${actor} tirou o acesso de administrador de ${target}`,
      };
    case "user.deleted":
      return {
        kind: "delete",
        title: `${actor} excluiu a conta de ${target}`,
        detail: entry.targetEmail
          ? `${entry.targetEmail} · com todas as finanças`
          : "Com todas as finanças",
      };
    case "flag.global_set":
    case "flag.user_set": {
      const name = flagLabel(meta.flag);
      const who =
        entry.action === "flag.user_set" ? ` para ${target}` : " para todos";
      const title =
        meta.value === true
          ? `${actor} ligou ${name}${who}`
          : meta.value === false
            ? `${actor} desligou ${name}${who}`
            : entry.action === "flag.user_set"
              ? `${actor} tirou a exceção de ${name} para ${target}`
              : `${actor} voltou ${name} ao padrão`;
      return { kind: "flag", title };
    }
    default:
      return { kind: "other", title: `${actor} fez uma alteração` };
  }
}
