import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getFlags: vi.fn(),
  count: vi.fn(),
  list: vi.fn(),
  pending: vi.fn(),
  states: vi.fn(),
}));

vi.mock("@/server/dal", () => ({ getSession: mocks.getSession }));
vi.mock("@/server/flags", () => ({ getFlags: mocks.getFlags }));
vi.mock("@/server/domain/notifications", () => ({
  countUnreadNotifications: mocks.count,
  listNotifications: mocks.list,
  pendingTransactionIds: mocks.pending,
}));

vi.mock("@/server/domain/sharing/groups", () => ({
  noticeStates: mocks.states,
}));

const { GET } = await import("./route");

const request = (query = "") =>
  ({
    nextUrl: new URL(`http://localhost/api/notificacoes${query}`),
  }) as unknown as NextRequest;

const BILL = "11111111-1111-4111-8111-111111111111";
const row = (id: string, itemKeys: string[]) => ({
  id,
  type: "bills_due",
  readAt: null,
  createdAt: new Date("2026-11-12T09:00:00.000Z"),
  payload: {
    type: "bills_due",
    date: "2026-11-12",
    title: "Condomínio vence amanhã",
    body: "Sai da Conta Principal.",
    url: "/extrato",
    itemKeys,
    amounts: false,
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "ana" } });
  mocks.getFlags.mockResolvedValue({ central_notificacoes: true });
  mocks.count.mockResolvedValue(1);
  mocks.pending.mockResolvedValue(new Set([BILL]));
  mocks.states.mockResolvedValue({
    activeGroups: new Set(),
    openInvites: new Set(),
  });
  mocks.list.mockResolvedValue({
    items: [row("n1", [`t:${BILL}:2026-11-13`])],
    hasMore: false,
  });
});

describe("GET /api/notificacoes", () => {
  it("answers 401 without a session and reads nothing", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("answers 404 with the flag off", async () => {
    mocks.getFlags.mockResolvedValue({ central_notificacoes: false });
    expect((await GET(request())).status).toBe(404);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("lists the signed-in person's notices, rendered, never cached", async () => {
    const response = await GET(request());
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const body = await response.json();
    expect(mocks.list.mock.calls[0]?.[0]).toBe("ana");
    expect(body.unread).toBe(1);
    expect(body.items[0]).toMatchObject({
      id: "n1",
      read: false,
      icon: "receipt",
      hasAmounts: false,
      href: "/extrato",
      transactionId: BILL,
      actions: [
        { id: "open", label: "Ver contas" },
        { id: "mark_paid", label: "Marcar como pago" },
      ],
    });
  });

  it("offers Marcar como pago only for one pending bill", async () => {
    mocks.pending.mockResolvedValue(new Set());
    mocks.list.mockResolvedValue({
      items: [
        row("n1", [`t:${BILL}:2026-11-13`]),
        row("n2", ["t:a:x", "t:b:y"]),
      ],
      hasMore: false,
    });
    const body = await (await GET(request())).json();
    for (const item of body.items) {
      expect(item.actions.map((action: { id: string }) => action.id)).toEqual([
        "open",
      ]);
    }
  });

  it("answers only the count with ?limite=0", async () => {
    const body = await (await GET(request("?limite=0"))).json();
    expect(body).toEqual({ unread: 1, items: [], next: null });
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("rejects a bad cursor or limit", async () => {
    expect((await GET(request("?antes=ontem"))).status).toBe(400);
    expect((await GET(request("?limite=999"))).status).toBe(400);
  });
});

const shareRow = (id: string, payload: Record<string, unknown>) => ({
  id,
  type: payload.type,
  readAt: null,
  createdAt: new Date("2026-11-12T09:00:00.000Z"),
  payload,
});
const INVITE = {
  type: "share_invite",
  groupId: "g1",
  memberId: "m1",
  groupName: "Casa",
  inviterName: "Ana",
  inviterEmail: "ana@exemplo.com",
};

describe("GET /api/notificacoes, group notices", () => {
  it("offers Aceitar and Recusar only while the invite is open", async () => {
    mocks.list.mockResolvedValue({
      items: [shareRow("n1", INVITE)],
      hasMore: false,
    });
    mocks.states.mockResolvedValue({
      activeGroups: new Set(),
      openInvites: new Set(["m1"]),
    });
    const open = await (await GET(request())).json();
    expect(open.items[0].inviteId).toBe("m1");
    expect(open.items[0].actions.map((a: { id: string }) => a.id)).toEqual([
      "accept_share",
      "decline_share",
    ]);
    // Answered, expired or taken back: the notice stays, without its actions.
    mocks.states.mockResolvedValue({
      activeGroups: new Set(),
      openInvites: new Set(),
    });
    const closed = await (await GET(request())).json();
    expect(closed.items[0].actions).toEqual([]);
    expect(closed.items[0].inviteId).toBeUndefined();
    expect(mocks.states.mock.calls[1]?.[0]).toBe("ana");
    expect(mocks.states.mock.calls[1]?.[2]).toEqual(["m1"]);
  });

  it("sends the notice of a group the person left to /compartilhado, without actions", async () => {
    mocks.list.mockResolvedValue({
      items: [
        shareRow("n1", {
          type: "share_joined",
          groupId: "g1",
          groupName: "Casa",
          memberName: "Bruno",
        }),
      ],
      hasMore: false,
    });
    const body = await (await GET(request())).json();
    expect(body.items[0].href).toBe("/compartilhado");
    expect(body.items[0].actions).toEqual([]);
  });

  it("keeps the group link and the settlement action while the person is in the group", async () => {
    mocks.list.mockResolvedValue({
      items: [
        shareRow("n1", {
          type: "share_settled",
          groupId: "g1",
          groupName: "Casa",
          actorName: "Bruno",
          settlementId: "s1",
          amountCents: 12_000,
          direction: "paid_you",
          date: "2026-11-12",
        }),
      ],
      hasMore: false,
    });
    mocks.states.mockResolvedValue({
      activeGroups: new Set(["g1"]),
      openInvites: new Set(),
    });
    const body = await (await GET(request())).json();
    expect(body.items[0].href).toBe("/compartilhado/g1");
    expect(body.items[0].settlement).toEqual({
      groupName: "Casa",
      amountCents: 12_000,
      received: true,
      date: "2026-11-12",
    });
    expect(
      body.items[0].actions.map((action: { id: string }) => action.id),
    ).toContain("record_settlement");
  });
});
