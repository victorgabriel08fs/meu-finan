// The notification center's data (doc 02 §6.15) against a real (in-memory)
// Postgres: list, count, read by ids and "until", dismiss and restore, the
// isolation between accounts, and the notice that gathers many events.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.DATABASE_URL = "pglite:memory";

type Modules = {
  db: typeof import("../db/client")["db"];
  schema: typeof import("../db/schema");
  domain: typeof import("./notifications");
};
let m: Modules;

const TYPES = ["daily_summary", "bills_due", "weekly_summary"] as const;

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = await import("../db/client");
  await migrate(client.db as never, { migrationsFolder: "drizzle" });
  const schema = await import("../db/schema");
  await client.db.insert(schema.user).values([
    { id: "ana", name: "Ana", email: "ana@exemplo.com", role: "admin" },
    { id: "bruno", name: "Bruno", email: "bruno@exemplo.com", role: "user" },
  ]);
  m = { db: client.db, schema, domain: await import("./notifications") };
}, 120_000);

beforeEach(async () => {
  await m.db.delete(m.schema.notifications);
});

let sequence = 0;
async function notice(
  userId: string,
  createdAt: string,
  type: (typeof TYPES)[number] = "daily_summary",
): Promise<string> {
  sequence += 1;
  const [row] = await m.db
    .insert(m.schema.notifications)
    .values({
      userId,
      type,
      dedupeKey: `k${sequence}`,
      payload: {
        type,
        date: "2026-11-09",
        title: `Aviso ${sequence}`,
        body: "Corpo",
        url: "/inicio",
      },
      createdAt: new Date(createdAt),
    })
    .returning({ id: m.schema.notifications.id });
  return row?.id ?? "";
}

describe("listing and counting", () => {
  it("lists the person's notices newest first, by page", async () => {
    await notice("ana", "2026-11-09T10:00:00.000Z");
    const newest = await notice("ana", "2026-11-11T10:00:00.000Z");
    await notice("ana", "2026-11-10T10:00:00.000Z");
    await notice("bruno", "2026-11-12T10:00:00.000Z");

    const first = await m.domain.listNotifications("ana", {
      types: TYPES,
      limit: 2,
    });
    expect(first.hasMore).toBe(true);
    expect(first.items.map((item) => item.id)[0]).toBe(newest);
    const cursor = first.items.at(-1)?.createdAt;
    const second = await m.domain.listNotifications("ana", {
      types: TYPES,
      limit: 2,
      before: cursor,
    });
    expect(second.items).toHaveLength(1);
    expect(second.hasMore).toBe(false);
  });

  it("leaves out dismissed notices and types the person cannot see", async () => {
    const keep = await notice("ana", "2026-11-10T10:00:00.000Z");
    const gone = await notice("ana", "2026-11-11T10:00:00.000Z");
    await notice("ana", "2026-11-12T10:00:00.000Z", "weekly_summary");
    await m.domain.dismissNotification("ana", gone);

    const list = await m.domain.listNotifications("ana", {
      types: ["daily_summary"],
    });
    expect(list.items.map((item) => item.id)).toEqual([keep]);
    expect(
      await m.domain.countUnreadNotifications("ana", ["daily_summary"]),
    ).toBe(1);
    expect(await m.domain.countUnreadNotifications("ana", [])).toBe(0);
  });
});

describe("reading", () => {
  it("marks only the given ids, and only the person's own", async () => {
    const mine = await notice("ana", "2026-11-10T10:00:00.000Z");
    const other = await notice("ana", "2026-11-11T10:00:00.000Z");
    const bruno = await notice("bruno", "2026-11-11T11:00:00.000Z");

    const result = await m.domain.markNotificationsRead(
      "ana",
      { ids: [mine, bruno] },
      TYPES,
    );
    expect(result).toEqual({ unread: 1 });
    expect(await m.domain.countUnreadNotifications("bruno", TYPES)).toBe(1);
    expect(
      (await m.domain.listNotifications("ana", { types: TYPES })).items.find(
        (item) => item.id === other,
      )?.readAt,
    ).toBeNull();
  });

  it("marks everything up to `until`, not what came after", async () => {
    await notice("ana", "2026-11-10T10:00:00.000Z");
    const newest = await notice("ana", "2026-11-11T10:00:00.123Z");
    await notice("ana", "2026-11-11T10:00:05.000Z");
    const listed = (await m.domain.listNotifications("ana", { types: TYPES }))
      .items;
    const until = listed.find((item) => item.id === newest)?.createdAt;
    expect(until).toBeDefined();

    const result = await m.domain.markNotificationsRead(
      "ana",
      { until: until as Date },
      TYPES,
    );
    expect(result).toEqual({ unread: 1 });
  });
});

describe("dismissing", () => {
  it("keeps the row, reads it, and restores it", async () => {
    const id = await notice("ana", "2026-11-10T10:00:00.000Z");
    expect(await m.domain.dismissNotification("ana", id)).toBe(true);
    const [row] = await m.db.select().from(m.schema.notifications);
    expect(row?.dismissedAt).not.toBeNull();
    expect(row?.readAt).not.toBeNull();
    expect(await m.domain.countUnreadNotifications("ana", TYPES)).toBe(0);

    expect(await m.domain.restoreNotification("ana", id)).toBe(true);
    const list = await m.domain.listNotifications("ana", { types: TYPES });
    expect(list.items.map((item) => item.id)).toEqual([id]);
  });

  it("does not touch another person's notice", async () => {
    const id = await notice("ana", "2026-11-10T10:00:00.000Z");
    expect(await m.domain.dismissNotification("bruno", id)).toBe(false);
    expect(await m.domain.restoreNotification("bruno", id)).toBe(false);
    expect(await m.domain.countUnreadNotifications("ana", TYPES)).toBe(1);
  });
});

describe("recording", () => {
  const payload = (n: number) =>
    ({
      type: "daily_summary",
      date: "2026-11-09",
      title: "Resumo",
      body: "Corpo",
      url: "/inicio",
      count: n,
    }) as never;

  it("records a notice once per dedupe key", async () => {
    const first = await m.domain.recordNotification(
      m.db,
      "ana",
      "daily_summary",
      "d:1",
      payload(1),
    );
    const again = await m.domain.recordNotification(
      m.db,
      "ana",
      "daily_summary",
      "d:1",
      payload(2),
    );
    expect([first, again]).toEqual([true, false]);
  });

  it("bumps one notice: sums the counts and brings it back unread", async () => {
    await m.domain.bumpNotification(
      m.db,
      "ana",
      "daily_summary",
      "d:2",
      payload(2),
      { sum: ["count"] },
    );
    const [row] = await m.db.select().from(m.schema.notifications);
    await m.domain.markNotificationsRead(
      "ana",
      { ids: [row?.id ?? ""] },
      TYPES,
    );
    await m.domain.dismissNotification("ana", row?.id ?? "");

    await Promise.all([
      m.domain.bumpNotification(
        m.db,
        "ana",
        "daily_summary",
        "d:2",
        payload(3),
        {
          sum: ["count"],
        },
      ),
      m.domain.bumpNotification(
        m.db,
        "ana",
        "daily_summary",
        "d:2",
        payload(4),
        {
          sum: ["count"],
        },
      ),
    ]);
    const [after] = await m.db.select().from(m.schema.notifications);
    expect((after?.payload as unknown as { count: number }).count).toBe(9);
    expect(after?.readAt).toBeNull();
    expect(after?.dismissedAt).toBeNull();
  });
});
