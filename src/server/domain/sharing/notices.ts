// What a group records in its members' bells (doc 02 §6.15), inside the
// transaction that makes the change, and the pushes to send once it commits
// (src/server/notify.ts). Writing a notice for another member is part of the
// group's own write; nobody's private finances are touched.
import type { Executor } from "@/server/db/client";
import type {
  NotificationPayload,
  ShareNotificationType,
} from "@/server/db/schema";
import { bumpNotification, recordNotification } from "../notifications";

export type SharePayload = Extract<
  NotificationPayload,
  { type: ShareNotificationType }
>;

/** A push to send after the commit, for a notice already in the bell. */
export type PendingPush = {
  userId: string;
  /** The notice's dedupe key: the push opens it with `?aviso={id}`. */
  dedupeKey: string;
  payload: SharePayload;
  /** Where the push opens. */
  url: string;
  groupId: string;
  /** Pushes with the same tag replace each other; the group's by default. */
  tag?: string;
};

export const groupHref = (groupId: string) => `/compartilhado/${groupId}`;
export const boxHref = (groupId: string, boxId: string) =>
  `/compartilhado/${groupId}/caixinhas/${boxId}`;

/**
 * Records (or brings back to the top, unread) a notice of the group, and
 * returns its push when it should have one. `sum`: the numeric fields that
 * add up when the same notice comes again (shared_activity).
 */
export async function notifyMember(
  executor: Executor,
  target: { userId: string },
  dedupeKey: string,
  payload: SharePayload,
  {
    push,
    url,
    once = false,
    sum,
    tag,
  }: {
    push: boolean;
    url: string;
    once?: boolean;
    sum?: readonly string[];
    tag?: string;
  },
): Promise<PendingPush | null> {
  if (once) {
    const created = await recordNotification(
      executor,
      target.userId,
      payload.type,
      dedupeKey,
      payload,
    );
    if (!created) return null;
  } else {
    await bumpNotification(
      executor,
      target.userId,
      payload.type,
      dedupeKey,
      payload,
      { sum },
    );
  }
  return push
    ? {
        userId: target.userId,
        dedupeKey,
        payload,
        url,
        groupId: payload.groupId,
        ...(tag ? { tag } : {}),
      }
    : null;
}
