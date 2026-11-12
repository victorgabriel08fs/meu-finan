// The texts of what a group tells its members (doc 02 §6.15, §10.3), for the
// bell and for push. Pure. Without `showAmounts` no amount reaches the lock
// screen; the bell always gets them (and hides them in the privacy mode).
import { formatBRL } from "@/lib/format/money";
import type { NotificationPayload } from "@/server/db/schema/types";

export type ShareMessage = { title: string; body: string };

type SharePayload = Extract<
  NotificationPayload,
  {
    type:
      | "share_invite"
      | "share_joined"
      | "share_declined"
      | "share_left"
      | "share_removed"
      | "shared_activity"
      | "share_settled";
  }
>;

const SHARE_TYPES = new Set<string>([
  "share_invite",
  "share_joined",
  "share_declined",
  "share_left",
  "share_removed",
  "shared_activity",
  "share_settled",
]);

export function isSharePayload(
  payload: NotificationPayload,
): payload is SharePayload {
  return SHARE_TYPES.has(payload.type);
}

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

/** "mudou 1 despesa e tirou 2", or null when nothing changed or left. */
function changesPhrase(changed: number, removed: number): string | null {
  const parts = [
    changed > 0 ? `mudou ${plural(changed, "despesa", "despesas")}` : null,
    removed > 0 ? `tirou ${removed}` : null,
  ].filter((part): part is string => part !== null);
  if (parts.length === 0) return null;
  // "tirou 1" alone reads better with its noun.
  if (changed === 0) return `tirou ${plural(removed, "despesa", "despesas")}`;
  return parts.join(" e ");
}

function activityBody(
  payload: Extract<SharePayload, { type: "shared_activity" }>,
  showAmounts: boolean,
): string {
  const { actorName, added, addedCents, myShareCents, changed, removed } =
    payload;
  const changes = changesPhrase(changed, removed);
  if (added === 0) {
    return changes
      ? `${actorName} ${changes}.`
      : `${actorName} mudou as despesas.`;
  }
  let addedText: string;
  if (added === 1 && payload.description && !changes) {
    addedText = showAmounts
      ? `${actorName} adicionou ${payload.description} (${formatBRL(addedCents)}).`
      : `${actorName} adicionou ${payload.description}.`;
  } else {
    const count = plural(added, "despesa", "despesas");
    addedText = showAmounts
      ? `${actorName} adicionou ${count} (${formatBRL(addedCents)}).`
      : `${actorName} adicionou ${count}.`;
  }
  const share =
    showAmounts && myShareCents > 0
      ? ` Sua parte: ${formatBRL(myShareCents)}.`
      : "";
  const rest = changes ? ` Também ${changes}.` : "";
  return `${addedText}${share}${rest}`;
}

/** Title and body of a group's notice; `showAmounts` false leaves money out. */
export function shareMessage(
  payload: SharePayload,
  showAmounts: boolean,
): ShareMessage {
  switch (payload.type) {
    case "share_invite":
      return {
        title: "Convite para dividir",
        body: `${payload.inviterName} (${payload.inviterEmail}) convidou você para o grupo ${payload.groupName}.`,
      };
    case "share_joined":
      return {
        title: payload.groupName,
        body: `${payload.memberName} entrou no grupo ${payload.groupName}.`,
      };
    case "share_declined":
      return {
        title: payload.groupName,
        body: `${payload.memberName} recusou o convite para ${payload.groupName}.`,
      };
    case "share_left":
      return {
        title: payload.groupName,
        body: `${payload.memberName} saiu do grupo ${payload.groupName}.`,
      };
    case "share_removed":
      return {
        title: payload.groupName,
        body: `${payload.actorName} tirou você do grupo ${payload.groupName}.`,
      };
    case "shared_activity":
      return {
        title: payload.groupName,
        body: activityBody(payload, showAmounts),
      };
    case "share_settled": {
      const amount = showAmounts ? ` de ${formatBRL(payload.amountCents)}` : "";
      return {
        title: payload.groupName,
        body: `${payload.actorName} marcou um acerto${amount} com você em ${payload.groupName}.`,
      };
    }
  }
}

/** Whether the body of `shareMessage(payload, true)` carries money. */
export function shareMessageHasAmounts(payload: SharePayload): boolean {
  if (payload.type === "share_settled") return true;
  if (payload.type !== "shared_activity") return false;
  return payload.added > 0;
}
