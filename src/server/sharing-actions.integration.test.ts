// The Server Actions of the shared finances (ADR-13) and their pushes against
// a real (in-memory) Postgres: the flag refused on the server, the two invite
// limits, and deliverPushes honoring each person's flag and "Mostrar valores
// nas notificações" (push service mocked).
import { and, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
const afterTasks = vi.hoisted(() => [] as Promise<unknown>[]);
vi.mock("next/server", () => ({
  after: (task: () => Promise<unknown>) => {
    afterTasks.push(task());
  },
}));
const signedIn = vi.hoisted(() => ({ id: "ana" }));
vi.mock("@/server/dal", () => ({
  requireUser: async () => ({
    id: signedIn.id,
    name: signedIn.id,
    email: `${signedIn.id}@exemplo.com`,
    role: "user",
  }),
  getAdmin: async () => null,
  getSession: async () => null,
}));
const pushService = vi.hoisted(() => ({
  sent: [] as {
    endpoint: string;
    body: { body: string; url: string; tag?: string };
  }[],
}));
vi.mock("web-push", () => ({
  WebPushError: class extends Error {},
  default: {
    sendNotification: async (target: { endpoint: string }, body: string) => {
      pushService.sent.push({
        endpoint: target.endpoint,
        body: JSON.parse(body),
      });
      return { statusCode: 201, body: "", headers: {} };
    },
  },
}));
process.env.DATABASE_URL = "pglite:memory";
process.env.OWNER_EMAIL = "ana@exemplo.com";
process.env.VAPID_PUBLIC_KEY =
  "BHo9sGkrAC15LBWdZf8DzB4o5Oce3K2Js_UnloBhFgaD_m5GWx-Z79ffAfiwzHG06Gyz2shMI9viJlceytrQniY";
process.env.VAPID_PRIVATE_KEY = "CirzHWrUhgY50jjnZNdG5uw85M89d44Z-b8WFvJzj2I";

type Modules = {
  db: typeof import("./db/client")["db"];
  schema: typeof import("./db/schema");
  actions: typeof import("./actions/sharing");
  notify: typeof import("./notify");
  push: typeof import("./domain/push");
  prefs: typeof import("./domain/preferences");
};
let m: Modules;

const KEYS = {
  p256dh:
    "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
  auth: "tBHItJI5svbpez7KI4CCXg",
};
const BRUNO_PHONE = "https://web.push.apple.com/bruno";

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = await import("./db/client");
  await migrate(client.db as never, { migrationsFolder: "drizzle" });
  const schema = await import("./db/schema");
  const { ensureOwnerDefaults } = await import("./db/seed-defaults");
  await client.db.insert(schema.user).values([
    { id: "ana", name: "Ana", email: "ana@exemplo.com", role: "admin" },
    { id: "bruno", name: "Bruno", email: "bruno@exemplo.com" },
  ]);
  for (const id of ["ana", "bruno"]) await ensureOwnerDefaults(id);
  m = {
    db: client.db,
    schema,
    actions: await import("./actions/sharing"),
    notify: await import("./notify"),
    push: await import("./domain/push"),
    prefs: await import("./domain/preferences"),
  };
}, 120_000);

async function setFlags(shared: boolean, push: boolean) {
  await m.db.delete(m.schema.featureFlagOverrides);
  await m.db.insert(m.schema.featureFlagOverrides).values(
    ["ana", "bruno"].flatMap((userId) => [
      { userId, key: "financas_compartilhadas", enabled: shared },
      { userId, key: "notificacoes_push", enabled: push },
    ]),
  );
}

beforeEach(async () => {
  await m.db.delete(m.schema.rateLimit);
  signedIn.id = "ana";
  pushService.sent = [];
  await setFlags(true, true);
});

const uuid = () => crypto.randomUUID();

const settled = {
  type: "share_settled" as const,
  groupId: "g",
  groupName: "Casa",
  actorName: "Ana",
  settlementId: "s",
  amountCents: 12_000,
  direction: "paid_you" as const,
  date: "2026-11-12",
};
const pendingFor = (userId: string, dedupeKey: string) => ({
  userId,
  dedupeKey,
  groupId: "g",
  url: "/compartilhado/g",
  payload: settled,
});

describe("flag and limits", () => {
  it("refuses on the server with the flag off, writing nothing", async () => {
    await setFlags(false, true);
    const result = await m.actions.createGroupAction({
      id: uuid(),
      name: "Casa",
      emails: [],
    });
    expect(result?.serverError).toBe("O compartilhamento não está disponível.");
    expect(await m.db.select().from(m.schema.shareGroups)).toHaveLength(0);
  });

  it("allows 3 invites to the same e-mail in 30 days, then asks to wait", async () => {
    const group = await m.actions.createGroupAction({
      id: uuid(),
      name: "Limites",
      emails: [],
    });
    expect(group?.data?.groupId).toBeDefined();
    // The same person invited to a new group each time.
    const invite = () =>
      m.actions.createGroupAction({
        id: uuid(),
        name: "Outro",
        emails: ["alguem@exemplo.com"],
      });
    for (let i = 0; i < 3; i++) {
      expect((await invite())?.serverError).toBeUndefined();
    }
    expect((await invite())?.serverError).toBe(
      "Você já convidou esse e-mail algumas vezes. Espere uns dias.",
    );
    // Never the e-mail in the key of the limit.
    const keys = (await m.db.select().from(m.schema.rateLimit)).map(
      (row) => row.key,
    );
    expect(keys.some((key) => key.includes("alguem"))).toBe(false);
  });

  it("stops at 20 invites a day, whatever the group says", async () => {
    const group = await m.actions.createGroupAction({
      id: uuid(),
      name: "Dia",
      emails: [],
    });
    const groupId = group?.data?.groupId ?? "";
    // The day counter is checked before the domain: a refused invite counts.
    for (let i = 0; i < 20; i++) {
      await m.actions.inviteToGroupAction({
        groupId,
        emails: [`pessoa${i}@exemplo.com`],
      });
    }
    const over = await m.actions.inviteToGroupAction({
      groupId,
      emails: ["pessoa99@exemplo.com"],
    });
    expect(over?.serverError).toBe(
      "Você já enviou muitos convites hoje. Tente de novo amanhã.",
    );
  });
});

describe("deliverPushes", () => {
  it("pushes an invite to the invitee's device, opening the notice", async () => {
    await m.db.delete(m.schema.notifications);
    await m.push.savePushSubscription(
      "bruno",
      { endpoint: BRUNO_PHONE, keys: KEYS },
      null,
    );
    const created = await m.actions.createGroupAction({
      id: uuid(),
      name: "Casa",
      emails: ["bruno@exemplo.com"],
    });
    expect(created?.serverError).toBeUndefined();
    await Promise.all(afterTasks);
    expect(pushService.sent).toHaveLength(1);
    expect(pushService.sent[0]?.endpoint).toBe(BRUNO_PHONE);
    const [notice] = await m.db
      .select()
      .from(m.schema.notifications)
      .where(eq(m.schema.notifications.userId, "bruno"));
    expect(pushService.sent[0]?.body.url).toContain(`aviso=${notice?.id}`);
  });

  it("sends nothing to a person without the flag", async () => {
    await m.push.savePushSubscription(
      "bruno",
      { endpoint: BRUNO_PHONE, keys: KEYS },
      null,
    );
    await setFlags(false, true);
    await m.notify.deliverPushes([pendingFor("bruno", "x")]);
    expect(pushService.sent).toHaveLength(0);
  });

  it("sends nothing to a blocked account", async () => {
    await m.push.savePushSubscription(
      "bruno",
      { endpoint: BRUNO_PHONE, keys: KEYS },
      null,
    );
    await m.db
      .update(m.schema.user)
      .set({ banned: true })
      .where(eq(m.schema.user.id, "bruno"));
    await m.notify.deliverPushes([pendingFor("bruno", "x")]);
    await m.db
      .update(m.schema.user)
      .set({ banned: false })
      .where(eq(m.schema.user.id, "bruno"));
    expect(pushService.sent).toHaveLength(0);
  });

  it("keeps amounts off the lock screen unless the person chose to show them", async () => {
    await m.push.savePushSubscription(
      "bruno",
      { endpoint: BRUNO_PHONE, keys: KEYS },
      null,
    );
    const prefs = await m.prefs.getNotificationPreferences("bruno");
    const bodyWith = async (showAmounts: boolean) => {
      await m.prefs.setNotificationPreferences("bruno", {
        ...prefs,
        showAmounts,
      });
      pushService.sent = [];
      await m.notify.deliverPushes([pendingFor("bruno", "settled-1")]);
      return pushService.sent[0]?.body.body ?? "";
    };
    expect(await bodyWith(false)).not.toContain("120,00");
    expect(await bodyWith(true)).toContain("120,00");
  });
});

describe("shared boxes", () => {
  async function groupWithBruno() {
    const created = await m.actions.createGroupAction({
      id: uuid(),
      name: "Casa",
      emails: ["bruno@exemplo.com"],
    });
    const groupId = created?.data?.groupId ?? "";
    const [invite] = await m.db
      .select({ id: m.schema.shareMembers.id })
      .from(m.schema.shareMembers)
      .where(
        and(
          eq(m.schema.shareMembers.userId, "bruno"),
          eq(m.schema.shareMembers.groupId, groupId),
        ),
      );
    signedIn.id = "bruno";
    await m.actions.respondToInviteAction({
      memberId: invite?.id ?? "",
      answer: "accept",
    });
    signedIn.id = "ana";
    return groupId;
  }

  it("refuses the box actions with the flag off", async () => {
    const groupId = await groupWithBruno();
    await setFlags(false, true);
    const result = await m.actions.createBoxAction({
      id: uuid(),
      groupId,
      name: "Viagem",
      icon: "plane",
      color: "cat-3",
      targetCents: null,
      targetDate: null,
      expectedRate: null,
    });
    expect(result?.serverError).toBe("O compartilhamento não está disponível.");
    expect(await m.db.select().from(m.schema.sharedBoxes)).toHaveLength(0);
  });

  it("pushes an entry to the other member with the box's tag, opening the box", async () => {
    const groupId = await groupWithBruno();
    const boxId = uuid();
    await m.actions.createBoxAction({
      id: boxId,
      groupId,
      name: "Viagem",
      icon: "plane",
      color: "cat-3",
      targetCents: 100_000,
      targetDate: null,
      expectedRate: null,
    });
    await m.push.savePushSubscription(
      "bruno",
      { endpoint: BRUNO_PHONE, keys: KEYS },
      null,
    );
    await Promise.all(afterTasks.splice(0));
    pushService.sent = [];
    const saved = await m.actions.contributeAction({
      id: uuid(),
      boxId,
      amountCents: 50_000,
      occurredOn: new Date().toISOString().slice(0, 10),
    });
    expect(saved?.serverError).toBeUndefined();
    await Promise.all(afterTasks.splice(0));
    expect(pushService.sent).toHaveLength(1);
    expect(pushService.sent[0]?.body.tag).toBe(`caixinha-${boxId}`);
    expect(pushService.sent[0]?.body.url).toContain(
      `/compartilhado/${groupId}/caixinhas/${boxId}`,
    );
    expect(pushService.sent[0]?.body.body).toMatch(
      /^Ana guardou .+ na caixinha Viagem\.$/,
    );
  });
});
