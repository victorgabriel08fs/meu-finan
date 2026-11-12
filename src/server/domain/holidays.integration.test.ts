// The holiday cache against a real (in-memory) Postgres: the daily sync
// stores BrasilAPI's list, skips fresh years and keeps the rows of a broken
// payload; reads unite the stored rows with the computed calendar. No
// network: every fetch is a fixture.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const cache = vi.hoisted(() => ({ revalidateTag: vi.fn() }));
vi.mock("next/cache", () => cache);

process.env.DATABASE_URL = "pglite:memory";

type Modules = {
  db: typeof import("../db/client")["db"];
  schema: typeof import("../db/schema");
  holidays: typeof import("./holidays");
  finance: typeof import("@/lib/finance");
};
let m: Modules;

/** BrasilAPI's answer for `year`: the computed holidays, in its format. */
const brasilApiYear = (
  year: number,
  extra: { date: string; name: string }[] = [],
) => [
  ...m.finance
    .nationalHolidays(year)
    .filter((holiday) => holiday.kind === "holiday")
    .map(({ date, name }) => ({ date, name, type: "national" })),
  ...extra.map((holiday) => ({ ...holiday, type: "national" })),
];

const fetchFor = (answer: (year: number) => unknown, status = 200) =>
  vi.fn(async (url: string | URL | Request) => {
    const year = Number(String(url).split("/").at(-1));
    return new Response(JSON.stringify(answer(year)), {
      status,
      headers: { "content-type": "application/json" },
    });
  });

// 12/11/2026, 09:00 in São Paulo: syncs 2026 and 2027.
const NOW = new Date("2026-11-12T12:00:00Z");

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = await import("../db/client");
  await migrate(client.db as never, { migrationsFolder: "drizzle" });
  m = {
    db: client.db,
    schema: await import("../db/schema"),
    holidays: await import("./holidays"),
    finance: await import("@/lib/finance"),
  };
}, 120_000);

beforeEach(async () => {
  await m.db.delete(m.schema.holidays);
  cache.revalidateTag.mockClear();
});

describe("syncHolidays", () => {
  it("stores both years, then skips them while fresh", async () => {
    const fetchImpl = fetchFor((year) => brasilApiYear(year));
    const first = await m.holidays.syncHolidays({ now: NOW, fetchImpl });
    expect(first.status).toBe("ok");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(cache.revalidateTag).toHaveBeenCalledWith("holidays", "max");
    const rows = await m.db.select().from(m.schema.holidays);
    expect(rows.length).toBe(26);

    const again = vi.fn();
    const second = await m.holidays.syncHolidays({
      now: new Date(NOW.getTime() + 86_400_000),
      fetchImpl: again,
    });
    expect(second).toEqual({
      status: "ok",
      details: {
        years: [
          { year: 2026, status: "fresh" },
          { year: 2027, status: "fresh" },
        ],
      },
    });
    expect(again).not.toHaveBeenCalled();
  });

  it("fetches a year again after 30 days and applies renames and removals", async () => {
    await m.holidays.syncHolidays({
      now: NOW,
      fetchImpl: fetchFor((year) =>
        brasilApiYear(year, [{ date: `${year}-07-09`, name: "Novo" }]),
      ),
    });
    const later = new Date(NOW.getTime() + 31 * 86_400_000);
    const result = await m.holidays.syncHolidays({
      now: later,
      fetchImpl: fetchFor((year) =>
        brasilApiYear(year).map((holiday) =>
          holiday.date.endsWith("-12-25")
            ? { ...holiday, name: "Natal do Senhor" }
            : holiday,
        ),
      ),
    });
    expect(result.status).toBe("ok");
    const names = new Map(
      (await m.db.select().from(m.schema.holidays)).map((row) => [
        row.date,
        row.name,
      ]),
    );
    expect(names.has("2026-07-09")).toBe(false);
    expect(names.get("2026-12-25")).toBe("Natal do Senhor");
  });

  it("keeps the stored rows when a payload is broken, and fails when every year does", async () => {
    await m.holidays.syncHolidays({
      now: NOW,
      fetchImpl: fetchFor((year) => brasilApiYear(year)),
    });
    const later = new Date(NOW.getTime() + 31 * 86_400_000);
    await expect(
      m.holidays.syncHolidays({
        now: later,
        fetchImpl: fetchFor(() => [{ date: "2026-01-01", name: "x" }]),
      }),
    ).rejects.toThrow(/Every holiday year failed/);
    expect((await m.db.select().from(m.schema.holidays)).length).toBe(26);

    const partial = await m.holidays.syncHolidays({
      now: later,
      fetchImpl: fetchFor((year) => (year === 2027 ? [] : brasilApiYear(year))),
    });
    expect(partial.status).toBe("partial");
  });
});

describe("businessCalendar", () => {
  it("adds the dates only BrasilAPI lists; the computed name wins", async () => {
    await m.holidays.syncHolidays({
      now: NOW,
      fetchImpl: fetchFor((year) =>
        brasilApiYear(year, [{ date: `${year}-07-09`, name: "Novo" }]).map(
          (holiday) =>
            holiday.date.endsWith("-11-15")
              ? { ...holiday, name: "Outro nome" }
              : holiday,
        ),
      ),
    });
    const calendar = await m.holidays.businessCalendar(["2026-07-09"]);
    expect(calendar.get("2026-07-09")?.name).toBe("Novo");
    expect(calendar.get("2026-11-15")?.name).toBe("Proclamação da República");
    // Neighbouring years come from the computed calendar.
    expect(calendar.get("2025-12-25")?.name).toBe("Natal");

    const due = await m.holidays.nonBusinessDueFor([
      "2026-07-09",
      "2026-07-10",
    ]);
    expect([...due.keys()]).toEqual(["2026-07-09"]);
  });
});

describe("pendingNonBusinessDue (fixed today)", () => {
  // Saturday 14/11/2026: Sunday 15 is a holiday too, Monday 16 the next business day.
  const dates = ["2026-11-14", "2026-11-12"];

  it("keeps a non-business due date before and on the day, and through the grace days", async () => {
    for (const today of [
      "2026-11-11",
      "2026-11-14",
      "2026-11-15",
      "2026-11-16",
    ]) {
      const map = await m.holidays.pendingNonBusinessDue(dates, today);
      expect([...map.keys()], today).toEqual(["2026-11-14"]);
    }
  });

  it("drops it once the next business day has passed", async () => {
    const map = await m.holidays.pendingNonBusinessDue(dates, "2026-11-17");
    expect(map.size).toBe(0);
  });
});

describe("syncHolidays step", () => {
  it("runs the sync with the job's start time and abort signal, without the network", async () => {
    const { syncHolidays } = await import("../jobs/steps/sync-holidays");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (url) => {
        const year = Number(String(url).split("/").at(-1));
        return new Response(JSON.stringify(brasilApiYear(year)), {
          status: 200,
        });
      });
    try {
      const result = await syncHolidays.run({
        signal: new AbortController().signal,
        startedAt: NOW,
      } as never);
      expect(syncHolidays.name).toBe("syncHolidays");
      expect(result.status).toBe("ok");
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(
        fetchSpy.mock.calls.every(([url]) =>
          String(url).startsWith("https://brasilapi.com.br/api/feriados/v1/"),
        ),
      ).toBe(true);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
