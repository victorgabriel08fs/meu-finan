import type { NextRequest } from "next/server";
import {
  type NoticeItem,
  type NoticesResponse,
  payloadHasAmounts,
  renderNotice,
  visibleNotificationTypes,
} from "@/lib/notifications/kinds";
import { getSession } from "@/server/dal";
import {
  countUnreadNotifications,
  listNotifications,
  pendingTransactionIds,
} from "@/server/domain/notifications";
import { noticeStates } from "@/server/domain/sharing/groups";
import { getFlags } from "@/server/flags";

const NO_STORE = { "Cache-Control": "private, no-store" };
const MAX_LIMIT = 50;

function failure(status: number, code: string, message: string): Response {
  return Response.json(
    { ok: false, error: { code, message } },
    { status, headers: NO_STORE },
  );
}

/** The one bill a "Contas a vencer" notice names (\`t:{id}:{dueOn}\`), if only one. */
function singleBillId(itemKeys: readonly string[] | undefined): string | null {
  if (itemKeys?.length !== 1) return null;
  const [kind, id] = itemKeys[0]?.split(":") ?? [];
  return kind === "t" && id ? id : null;
}

/**
 * The notification center's list (doc 02 §6.15): the signed-in person's
 * notices, newest first, rendered by their kind. \`?antes=\` is the cursor (the
 * \`next\` of the previous page), \`?limite=0\` answers only the unread count.
 * The session is checked here (the proxy only redirects optimistically), the
 * user always comes from it, and with central_notificacoes off the route
 * does not exist (404).
 */
export async function GET(request: NextRequest): Promise<Response> {
  const session = await getSession();
  if (!session) return failure(401, "UNAUTHORIZED", "Sessão expirada.");
  const userId = session.user.id;
  const flags = await getFlags(userId);
  if (!flags.central_notificacoes) {
    return failure(404, "NOT_FOUND", "Não encontrado.");
  }

  const params = request.nextUrl.searchParams;
  const limitParam = params.get("limite");
  const limit = limitParam === null ? undefined : Number(limitParam);
  if (
    limit !== undefined &&
    (!Number.isInteger(limit) || limit < 0 || limit > MAX_LIMIT)
  ) {
    return failure(400, "BAD_REQUEST", "Limite inválido.");
  }
  const beforeParam = params.get("antes");
  const before = beforeParam ? new Date(beforeParam) : undefined;
  if (before && Number.isNaN(before.getTime())) {
    return failure(400, "BAD_REQUEST", "Cursor inválido.");
  }

  try {
    const types = visibleNotificationTypes(flags);
    const unread = await countUnreadNotifications(userId, types);
    if (limit === 0) {
      return Response.json(
        { unread, items: [], next: null },
        { headers: NO_STORE },
      );
    }
    const { items: rows, hasMore } = await listNotifications(userId, {
      types,
      limit,
      before,
    });
    // "Marcar como pago" only while the bill is still pending.
    const billIds = rows.flatMap((row) =>
      row.payload.type === "bills_due"
        ? [singleBillId(row.payload.itemKeys)].filter((id) => id !== null)
        : [],
    );
    // A group's notice acts only while the person is still in the group, and
    // an invite only while it can be answered (ADR-13).
    const groupIds = new Set<string>();
    const inviteIds: string[] = [];
    for (const row of rows) {
      if (!row.type.startsWith("share") || !("groupId" in row.payload))
        continue;
      groupIds.add(row.payload.groupId);
      if (row.payload.type === "share_invite")
        inviteIds.push(row.payload.memberId);
    }
    const [pending, sharing] = await Promise.all([
      pendingTransactionIds(userId, billIds),
      noticeStates(userId, [...groupIds], inviteIds),
    ]);

    const items = rows.flatMap((row): NoticeItem[] => {
      const rendered = renderNotice(row.payload, { discreet: false });
      if (!rendered) return [];
      const payload = row.payload;
      let shareExtras: Partial<NoticeItem> = {};
      if (payload.type === "share_invite") {
        const open = sharing.openInvites.has(payload.memberId);
        rendered.actions = open ? rendered.actions : [];
        if (open) shareExtras = { inviteId: payload.memberId };
      } else if ("groupId" in payload && row.type.startsWith("share")) {
        if (!sharing.activeGroups.has(payload.groupId)) {
          rendered.href = "/compartilhado";
          rendered.actions = [];
        } else if (payload.type === "share_settled") {
          shareExtras = {
            settlement: {
              groupName: payload.groupName,
              amountCents: payload.amountCents,
              received: payload.direction === "paid_you",
              date: payload.date,
            },
          };
        }
      }
      const billId =
        row.payload.type === "bills_due"
          ? singleBillId(row.payload.itemKeys)
          : null;
      const payable = billId !== null && pending.has(billId);
      return [
        {
          id: row.id,
          type: row.type,
          icon: rendered.icon,
          tone: rendered.tone,
          createdAt: row.createdAt.toISOString(),
          read: row.readAt !== null,
          title: rendered.title,
          body: rendered.body,
          hasAmounts: payloadHasAmounts(row.payload),
          href: rendered.href,
          actions: payable
            ? [
                ...rendered.actions,
                { id: "mark_paid", label: "Marcar como pago" },
              ]
            : rendered.actions,
          ...(payable ? { transactionId: billId } : {}),
          ...shareExtras,
        },
      ];
    });
    const last = rows.at(-1);
    const body: NoticesResponse = {
      unread,
      items,
      next: hasMore && last ? last.createdAt.toISOString() : null,
    };
    return Response.json(body, { headers: NO_STORE });
  } catch (error) {
    console.error("[notificacoes] could not list", error);
    return failure(500, "INTERNAL", "Não deu para carregar as notificações.");
  }
}
