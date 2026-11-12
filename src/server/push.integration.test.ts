// Web Push against a real (in-memory) Postgres: subscriptions per device and
// person, a device changing hands, the number on the app icon, sending
// (with the push service mocked) and the notificacoes_push flag.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "user-agent": "iPhone Safari" }),
}));
// The signed-in person, normally from the session cookie.
const signedIn = vi.hoisted(() => ({ id: "bruno" }));
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
// The push service: records what would be sent, or answers with an error.
const pushService = vi.hoisted(() => ({
  sent: [] as { endpoint: string; body: unknown; options: unknown }[],
  failWith: new Map<string, number>(),
}));
vi.mock("web-push", () => {
  class WebPushError extends Error {
    constructor(
      message: string,
      readonly statusCode: number,
      readonly headers: Record<string, string>,
      readonly body: string,
      readonly endpoint: string,
    ) {
      super(message);
    }
  }
  return {
    WebPushError,
    default: {
      sendNotification: async (
        target: { endpoint: string },
        body: string,
        options: unknown,
      ) => {
        const status = pushService.failWith.get(target.endpoint);
        if (status) {
          throw new WebPushError("refused", status, {}, "", target.endpoint);
        }
        pushService.sent.push({
          endpoint: target.endpoint,
          body: JSON.parse(body),
          options,
        });
        return { statusCode: 201, body: "", headers: {} };
      },
    },
  };
});
process.env.DATABASE_URL = "pglite:memory";
process.env.OWNER_EMAIL = "ana@exemplo.com";
process.env.VAPID_PUBLIC_KEY =
  "BHo9sGkrAC15LBWdZf8DzB4o5Oce3K2Js_UnloBhFgaD_m5GWx-Z79ffAfiwzHG06Gyz2shMI9viJlceytrQniY";
process.env.VAPID_PRIVATE_KEY = "CirzHWrUhgY50jjnZNdG5uw85M89d44Z-b8WFvJzj2I";

type Modules = {
  db: typeof import("./db/client")["db"];
  schema: typeof import("./db/schema");
  domain: typeof import("./domain/push");
  push: typeof import("./push");
  actions: typeof import("./actions/push");
};
let m: Modules;

const KEYS = {
  p256dh:
    "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
  auth: "tBHItJI5svbpez7KI4CCXg",
};
const IPHONE = "https://web.push.apple.com/iphone";
const NOTEBOOK = "https://fcm.googleapis.com/fcm/send/notebook";
const device = (endpoint: string) => ({ endpoint, keys: KEYS });

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = await import("./db/client");
  await migrate(client.db as never, { migrationsFolder: "drizzle" });
  const schema = await import("./db/schema");
  await client.db.insert(schema.user).values([
    { id: "ana", name: "Ana", email: "ana@exemplo.com", role: "admin" },
    { id: "bruno", name: "Bruno", email: "bruno@exemplo.com", role: "user" },
  ]);
  m = {
    db: client.db,
    schema,
    domain: await import("./domain/push"),
    push: await import("./push"),
    actions: await import("./actions/push"),
  };
}, 120_000);

beforeEach(async () => {
  await m.db.delete(m.schema.pushSubscriptions);
  await m.db.delete(m.schema.notifications);
  await m.db.delete(m.schema.featureFlagOverrides);
  await m.db.delete(m.schema.rateLimit);
  pushService.sent = [];
  pushService.failWith.clear();
  signedIn.id = "bruno";
  // Off by default: on for both people here, unless a test turns it off.
  await m.db.insert(m.schema.featureFlagOverrides).values([
    { userId: "ana", key: "notificacoes_push", enabled: true },
    { userId: "bruno", key: "notificacoes_push", enabled: true },
  ]);
});

const unread = (userId: string, dedupeKey: string) =>
  m.db.insert(m.schema.notifications).values({
    userId,
    type: "daily_summary",
    dedupeKey,
    payload: {
      type: "daily_summary",
      date: "2026-11-09",
      title: "Resumo do dia",
      body: "Tudo certo.",
      url: "/inicio",
    },
  });

const unreadCount = async (userId: string) =>
  (await import("./domain/notifications")).countUnreadNotifications(
    userId,
    (await import("@/lib/notifications/kinds")).visibleNotificationTypes({}),
  );

describe("subscriptions", () => {
  it("keeps one row per device and lists only the person's own", async () => {
    await m.domain.savePushSubscription("bruno", device(IPHONE), "iPhone");
    await m.domain.savePushSubscription("bruno", device(IPHONE), "iPhone");
    await m.domain.savePushSubscription("bruno", device(NOTEBOOK), null);
    await m.domain.savePushSubscription(
      "ana",
      device("https://web.push.apple.com/ana"),
      null,
    );
    expect(await m.domain.countPushDevices("bruno")).toBe(2);
    expect(
      (await m.domain.listPushTargets("bruno")).map((t) => t.endpoint).sort(),
    ).toEqual([NOTEBOOK, IPHONE]);
    expect(
      await m.domain.listPushTargets("bruno", { endpoint: IPHONE }),
    ).toHaveLength(1);
  });

  it("turns off only the person's own device", async () => {
    await m.domain.savePushSubscription("ana", device(IPHONE), null);
    await m.domain.removePushSubscription("bruno", IPHONE);
    expect(await m.domain.countPushDevices("ana")).toBe(1);
    await m.domain.removePushSubscription("ana", IPHONE);
    expect(await m.domain.countPushDevices("ana")).toBe(0);
  });

  it("moves a device to whoever turns notifications on there", async () => {
    await m.domain.savePushSubscription("ana", device(IPHONE), null);
    await m.domain.savePushSubscription("bruno", device(IPHONE), null);
    expect(await m.domain.countPushDevices("ana")).toBe(0);
    expect(await m.domain.countPushDevices("bruno")).toBe(1);
  });

  it("stops the previous person's notifications on a device someone else signed in to", async () => {
    await m.domain.savePushSubscription("ana", device(IPHONE), null);
    expect(await m.domain.devicePushState("ana", IPHONE)).toBe("on");
    expect(await m.domain.devicePushState("bruno", IPHONE)).toBe("off");
    expect(await m.domain.countPushDevices("ana")).toBe(0);
    expect(await m.domain.devicePushState("bruno", NOTEBOOK)).toBe("off");
  });

  it("counts the person's unread notices for the app icon", async () => {
    await unread("bruno", "a");
    await unread("bruno", "b");
    await unread("ana", "a");
    expect(await unreadCount("bruno")).toBe(2);
  });
});

describe("sendPush", () => {
  it("sends to every device with the unread count as the icon number", async () => {
    await m.domain.savePushSubscription("bruno", device(IPHONE), null);
    await m.domain.savePushSubscription("bruno", device(NOTEBOOK), null);
    await unread("bruno", "a");
    const outcome = await m.push.sendPush("bruno", {
      title: "Meu Finan",
      body: "Aluguel vence amanhã",
      url: "/extrato",
    });
    expect(outcome).toEqual({ sent: 2, removed: 0, failed: 0 });
    expect(pushService.sent[0]?.body).toEqual({
      title: "Meu Finan",
      body: "Aluguel vence amanhã",
      url: "/extrato",
      badge: 1,
    });
    expect(pushService.sent[0]?.options).toMatchObject({
      contentEncoding: "aes128gcm",
      vapidDetails: {
        subject: "mailto:ana@exemplo.com",
        publicKey: process.env.VAPID_PUBLIC_KEY,
      },
    });
  });

  it("never sends a link to another site", async () => {
    await m.domain.savePushSubscription("bruno", device(IPHONE), null);
    await m.push.sendPush("bruno", {
      title: "Meu Finan",
      body: "Oi",
      url: "//evil.example",
    });
    expect(pushService.sent[0]?.body).toMatchObject({ url: "/inicio" });
  });

  it("forgets devices the push service says are gone", async () => {
    await m.domain.savePushSubscription("bruno", device(IPHONE), null);
    await m.domain.savePushSubscription("bruno", device(NOTEBOOK), null);
    pushService.failWith.set(IPHONE, 410);
    pushService.failWith.set(NOTEBOOK, 500);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const outcome = await m.push.sendPush("bruno", {
      title: "Meu Finan",
      body: "Oi",
      url: "/inicio",
    });
    expect(outcome).toEqual({ sent: 0, removed: 1, failed: 1 });
    expect(
      (await m.domain.listPushTargets("bruno")).map((t) => t.endpoint),
    ).toEqual([NOTEBOOK]);
  });

  it("sends nothing while the flag is off for the person", async () => {
    await m.domain.savePushSubscription("bruno", device(IPHONE), null);
    await m.db.update(m.schema.featureFlagOverrides).set({ enabled: false });
    const outcome = await m.push.sendPush("bruno", {
      title: "Meu Finan",
      body: "Oi",
      url: "/inicio",
    });
    expect(outcome.sent).toBe(0);
    expect(pushService.sent).toEqual([]);
  });
});

describe("actions", () => {
  it("subscribes the signed-in person's device", async () => {
    const result = await m.actions.subscribePushAction({
      subscription: device(IPHONE),
    });
    expect(result.serverError).toBeUndefined();
    const [row] = await m.db.select().from(m.schema.pushSubscriptions);
    expect(row).toMatchObject({ userId: "bruno", userAgent: "iPhone Safari" });
  });

  it("refuses an endpoint outside the push services", async () => {
    const result = await m.actions.subscribePushAction({
      subscription: device("https://169.254.169.254/latest"),
    });
    expect(result.validationErrors).toBeDefined();
    expect(await m.domain.countPushDevices("bruno")).toBe(0);
  });

  it("refuses to subscribe with the flag off, but still turns off", async () => {
    await m.domain.savePushSubscription("bruno", device(IPHONE), null);
    await m.db.update(m.schema.featureFlagOverrides).set({ enabled: false });
    const refused = await m.actions.subscribePushAction({
      subscription: device(NOTEBOOK),
    });
    expect(refused.serverError).toBe("As notificações não estão disponíveis.");
    await m.actions.unsubscribePushAction({ endpoint: IPHONE });
    expect(await m.domain.countPushDevices("bruno")).toBe(0);
  });

  it("syncs the device and shows the icon number only on the person's own", async () => {
    await m.domain.savePushSubscription("ana", device(IPHONE), null);
    await unread("bruno", "a");
    const taken = await m.actions.syncPushDeviceAction({ endpoint: IPHONE });
    expect(taken.data).toEqual({ on: false, badge: 0 });
    expect(await m.domain.countPushDevices("ana")).toBe(0);

    await m.domain.savePushSubscription("bruno", device(IPHONE), null);
    const own = await m.actions.syncPushDeviceAction({ endpoint: IPHONE });
    expect(own.data).toEqual({ on: true, badge: 0 });
  });

  it("opening the app marks the person's notices as read", async () => {
    await m.domain.savePushSubscription("bruno", device(IPHONE), null);
    await unread("bruno", "a");
    await unread("bruno", "b");
    await unread("ana", "a");
    const synced = await m.actions.syncPushDeviceAction({ endpoint: IPHONE });
    expect(synced.data).toEqual({ on: true, badge: 0 });
    expect(await unreadCount("bruno")).toBe(0);
    expect(await unreadCount("ana")).toBe(1);
  });

  it("with the bell on, opening the app leaves the notices unread", async () => {
    await m.db.insert(m.schema.featureFlagOverrides).values({
      userId: "bruno",
      key: "central_notificacoes",
      enabled: true,
    });
    await m.domain.savePushSubscription("bruno", device(IPHONE), null);
    await unread("bruno", "a");
    await unread("bruno", "b");
    const synced = await m.actions.syncPushDeviceAction({ endpoint: IPHONE });
    expect(synced.data).toEqual({ on: true, badge: 2 });
    expect(await unreadCount("bruno")).toBe(2);
  });

  it("sends a test to this device with one more than the unread count", async () => {
    await m.domain.savePushSubscription("bruno", device(IPHONE), null);
    await m.domain.savePushSubscription("bruno", device(NOTEBOOK), null);
    const result = await m.actions.sendTestPushAction({ endpoint: IPHONE });
    expect(result.serverError).toBeUndefined();
    expect(pushService.sent).toHaveLength(1);
    expect(pushService.sent[0]).toMatchObject({
      endpoint: IPHONE,
      body: { badge: 1, url: "/ajustes/notificacoes", tag: "teste" },
    });
  });

  it("cannot send a test to someone else's device", async () => {
    await m.domain.savePushSubscription("ana", device(IPHONE), null);
    const result = await m.actions.sendTestPushAction({ endpoint: IPHONE });
    expect(result.serverError).toBe(
      "Não conseguimos enviar. Tente de novo em instantes.",
    );
    expect(pushService.sent).toEqual([]);
  });
});

describe("purgeDeleted", () => {
  it("deletes the notices read more than 90 days ago, and only those", async () => {
    const { purgeDeleted } = await import("./jobs/steps/purge-deleted");
    const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);
    await unread("bruno", "lido-ha-91-dias");
    await unread("bruno", "lido-ha-89-dias");
    await unread("bruno", "nunca-lido");
    await unread("ana", "lido-ha-120-dias");
    const { eq } = await import("drizzle-orm");
    const readAt = (dedupeKey: string, at: Date) =>
      m.db
        .update(m.schema.notifications)
        .set({ readAt: at, createdAt: daysAgo(200) })
        .where(eq(m.schema.notifications.dedupeKey, dedupeKey));
    await readAt("lido-ha-91-dias", daysAgo(91));
    await readAt("lido-ha-89-dias", daysAgo(89));
    await readAt("lido-ha-120-dias", daysAgo(120));
    await m.db
      .update(m.schema.notifications)
      .set({ createdAt: daysAgo(200) })
      .where(eq(m.schema.notifications.dedupeKey, "nunca-lido"));

    const result = await purgeDeleted.run({
      signal: new AbortController().signal,
      startedAt: new Date(),
    });
    expect(result).toMatchObject({
      status: "ok",
      details: { purgedNotifications: 2, notificationRetentionDays: 90 },
    });
    const left = await m.db
      .select({ dedupeKey: m.schema.notifications.dedupeKey })
      .from(m.schema.notifications);
    expect(left.map((row) => row.dedupeKey).sort()).toEqual([
      "lido-ha-89-dias",
      "nunca-lido",
    ]);
  });
});
