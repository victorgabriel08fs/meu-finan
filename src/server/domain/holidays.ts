// Business days and holidays (doc 03, "Dias úteis e feriados"). The calendar
// the app uses is the one it computes (src/lib/finance/business-days.ts)
// united with the national holidays BrasilAPI lists, cached by year in the
// `holidays` table by the daily job. Global data: no user id, nobody's
// finances. Reads happen per request (React `cache`), always after the
// session check and inside <Suspense>; nothing here runs while prerendering.
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { cache } from "react";
import {
  calendarYearsFor,
  DEFAULT_TIME_ZONE,
  type Holiday,
  type HolidayCalendar,
  holidayCalendar,
  localDateIn,
  type NonBusinessDue,
  nonBusinessDue,
} from "@/lib/finance";
import { db, type Executor } from "@/server/db/client";
import { holidays } from "@/server/db/schema";
import {
  diffHolidays,
  type FetchedHoliday,
  fetchHolidays,
} from "@/server/jobs/brasilapi-holidays";
import {
  describeError,
  type JsonObject,
  type StepResult,
} from "@/server/jobs/runner";

/** National holidays; states and cities would add "BR-SP", "BR-SP-<IBGE>". */
export const HOLIDAYS_SCOPE = "BR";

/** A year's BrasilAPI rows are fetched again once the oldest is this old. */
export const HOLIDAYS_REFRESH_DAYS = 30;

/** Revalidated when a sync changes the stored holidays (doc 01 §8). */
export const HOLIDAYS_CACHE_TAG = "holidays";

const DAY_MS = 86_400_000;

const yearRange = (years: readonly number[]) => ({
  from: `${Math.min(...years)}-01-01`,
  to: `${Math.max(...years)}-12-31`,
});

const brasilApiRows = (from: string, to: string) =>
  and(
    eq(holidays.scope, HOLIDAYS_SCOPE),
    eq(holidays.source, "brasilapi"),
    gte(holidays.date, from),
    lte(holidays.date, to),
  );

/**
 * Which of `years` must be fetched: those with no BrasilAPI rows, or whose
 * oldest row was fetched more than HOLIDAYS_REFRESH_DAYS ago.
 */
export async function holidayYearsToRefresh(
  years: readonly number[],
  now: Date,
  executor: Executor = db,
): Promise<number[]> {
  if (years.length === 0) return [];
  const { from, to } = yearRange(years);
  const rows = await executor
    .select({
      year: sql<number>`extract(year from ${holidays.date})::int`.mapWith(
        Number,
      ),
      oldest: sql<Date>`min(${holidays.fetchedAt})`.mapWith(holidays.fetchedAt),
    })
    .from(holidays)
    .where(brasilApiRows(from, to))
    .groupBy(sql`1`);
  const oldestByYear = new Map(rows.map((row) => [row.year, row.oldest]));
  const staleBefore = now.getTime() - HOLIDAYS_REFRESH_DAYS * DAY_MS;
  return years.filter((year) => {
    const oldest = oldestByYear.get(year);
    return !oldest || new Date(oldest).getTime() < staleBefore;
  });
}

/**
 * Replaces the stored BrasilAPI holidays of `year` with `list` (inserts,
 * renames, deletes) and marks every row of the year as fetched `now`, in one
 * transaction. Returns how many rows changed.
 */
export function syncHolidayYear(
  year: number,
  list: readonly FetchedHoliday[],
  now: Date,
): Promise<number> {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ date: holidays.date, name: holidays.name })
      .from(holidays)
      .where(brasilApiRows(from, to));
    const { inserts, renames, deletes } = diffHolidays(existing, list);

    if (inserts.length > 0) {
      await tx
        .insert(holidays)
        .values(
          inserts.map(({ date, name }) => ({
            scope: HOLIDAYS_SCOPE,
            date,
            name,
            source: "brasilapi" as const,
            fetchedAt: now,
          })),
        )
        .onConflictDoUpdate({
          target: [holidays.scope, holidays.date],
          set: {
            name: sql`excluded.${sql.identifier(holidays.name.name)}`,
            source: sql`excluded.${sql.identifier(holidays.source.name)}`,
            fetchedAt: now,
          },
        });
    }
    for (const { date, name } of renames) {
      await tx
        .update(holidays)
        .set({ name, fetchedAt: now })
        .where(
          and(eq(holidays.scope, HOLIDAYS_SCOPE), eq(holidays.date, date)),
        );
    }
    if (deletes.length > 0) {
      await tx
        .delete(holidays)
        .where(
          and(
            eq(holidays.scope, HOLIDAYS_SCOPE),
            inArray(holidays.date, deletes),
          ),
        );
    }
    await tx
      .update(holidays)
      .set({ fetchedAt: now })
      .where(brasilApiRows(from, to));
    return inserts.length + renames.length + deletes.length;
  });
}

type YearOutcome =
  | { year: number; status: "fresh" }
  | {
      year: number;
      status: "updated";
      holidays: number;
      changed: number;
      rejected: number;
    }
  | { year: number; status: "error"; error: string };

/**
 * The daily job's holiday sync: this year and the next (São Paulo date of
 * `now`), each fetched only when due (see holidayYearsToRefresh). A year that
 * fails keeps its stored rows. Some years failing is `partial`; every year
 * that needed a fetch failing throws.
 */
export async function syncHolidays(options: {
  now: Date;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<StepResult> {
  const { now, signal, fetchImpl } = options;
  const { year } = localDateIn(now, DEFAULT_TIME_ZONE);
  const years = [year, year + 1];
  const due = new Set(await holidayYearsToRefresh(years, now));

  const fetched = await Promise.all(
    years.map(async (y) => {
      if (!due.has(y)) return { year: y, ok: true as const, result: null };
      try {
        const result = await fetchHolidays(y, { signal, fetchImpl });
        return { year: y, ok: true as const, result };
      } catch (error) {
        return { year: y, ok: false as const, error: describeError(error) };
      }
    }),
  );

  const outcomes: YearOutcome[] = [];
  let changed = 0;
  // One year at a time: PGlite has a single connection.
  for (const item of fetched) {
    if (!item.ok) {
      outcomes.push({ year: item.year, status: "error", error: item.error });
      continue;
    }
    if (item.result === null) {
      outcomes.push({ year: item.year, status: "fresh" });
      continue;
    }
    try {
      const n = await syncHolidayYear(item.year, item.result.holidays, now);
      changed += n;
      outcomes.push({
        year: item.year,
        status: "updated",
        holidays: item.result.holidays.length,
        changed: n,
        rejected: item.result.rejected,
      });
    } catch (error) {
      outcomes.push({
        year: item.year,
        status: "error",
        error: describeError(error),
      });
    }
  }

  if (changed > 0) revalidateTag(HOLIDAYS_CACHE_TAG, "max");

  const failures = outcomes.flatMap((o) =>
    o.status === "error" ? [`${o.year} (BrasilAPI): ${o.error}`] : [],
  );
  if (due.size > 0 && failures.length === due.size) {
    throw new Error(`Every holiday year failed. ${failures.join(" | ")}`);
  }
  const details: JsonObject = { years: outcomes };
  if (failures.length > 0) {
    return { status: "partial", error: failures.join(" | "), details };
  }
  return { status: "ok", details };
}

/** Stored holidays of the comma-separated `yearsKey` (one query per request). */
const storedHolidays = cache(async (yearsKey: string): Promise<Holiday[]> => {
  const years = yearsKey.split(",").map(Number);
  const wanted = new Set(years);
  const { from, to } = yearRange(years);
  const rows = await db
    .select({ date: holidays.date, name: holidays.name })
    .from(holidays)
    .where(
      and(
        eq(holidays.scope, HOLIDAYS_SCOPE),
        gte(holidays.date, from),
        lte(holidays.date, to),
      ),
    );
  return rows
    .filter((row) => wanted.has(Number(row.date.slice(0, 4))))
    .map((row) => ({ ...row, kind: "holiday" as const }));
});

/** The calendar that answers for `dates` (`YYYY-MM-DD`): stored ∪ computed. */
export async function businessCalendar(
  dates: readonly string[],
): Promise<HolidayCalendar> {
  const years = calendarYearsFor(dates);
  if (years.length === 0) return holidayCalendar([]);
  return holidayCalendar(years, await storedHolidays(years.join(",")));
}

/** The non-business ones among `dates`, keyed by date. */
export async function nonBusinessDueFor(
  dates: readonly string[],
): Promise<Map<string, NonBusinessDue>> {
  const unique = [...new Set(dates)];
  const result = new Map<string, NonBusinessDue>();
  if (unique.length === 0) return result;
  const calendar = await businessCalendar(unique);
  for (const date of unique) {
    const found = nonBusinessDue(date, calendar);
    if (found) result.set(date, found);
  }
  return result;
}

/**
 * The non-business ones among the due dates of pending bills that still
 * matter on `today`: due today or ahead, or in the grace days up to the next
 * business day. What the Início, the Extrato and the card show.
 */
export async function pendingNonBusinessDue(
  dates: readonly string[],
  today: string,
): Promise<Map<string, NonBusinessDue>> {
  const all = await nonBusinessDueFor(dates);
  for (const [date, nb] of all) {
    if (today > nb.nextBusinessDay) all.delete(date);
  }
  return all;
}
