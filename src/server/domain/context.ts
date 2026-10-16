// Per-request user context: preferences, "today" in the user's time zone and
// the financial period (doc 03 §10.2). Domain functions receive it explicitly.
import { eq } from "drizzle-orm";
import { cache } from "react";
import {
  iso,
  type LocalDate,
  localDateIn,
  type Period,
  parseMonth,
  periodContaining,
  periodForMonth,
} from "@/lib/finance";
import { db, type Executor } from "@/server/db/client";
import { userSettings } from "@/server/db/schema";

export const DEFAULT_TIME_ZONE = "America/Sao_Paulo";

export type UserContext = {
  userId: string;
  timeZone: string;
  monthStartDay: number;
  today: LocalDate;
  todayIso: string;
};

type ContextOptions = { executor?: Executor; now?: number };

/**
 * The user's context. Without options the result is memoised for the
 * request, so the layout and the page share one settings query.
 */
export function getUserContext(
  userId: string,
  options: ContextOptions = {},
): Promise<UserContext> {
  return options.executor || options.now !== undefined
    ? loadUserContext(userId, options)
    : requestUserContext(userId);
}

const requestUserContext = cache((userId: string) => loadUserContext(userId));

async function loadUserContext(
  userId: string,
  options: ContextOptions = {},
): Promise<UserContext> {
  const [settings] = await (options.executor ?? db)
    .select({
      timezone: userSettings.timezone,
      monthStartDay: userSettings.monthStartDay,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  const timeZone = settings?.timezone ?? DEFAULT_TIME_ZONE;
  const today = localDateIn(options.now ?? Date.now(), timeZone);
  return {
    userId,
    timeZone,
    monthStartDay: settings?.monthStartDay ?? 1,
    today,
    todayIso: iso(today),
  };
}

export type PeriodRange = {
  /** Month that names the period, YYYY-MM. */
  month: string;
  start: string;
  end: string;
  isCurrent: boolean;
  period: Period;
};

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The period named by ?mes=YYYY-MM, or the one containing today. */
export function resolvePeriod(
  ctx: UserContext,
  month?: string | null,
): PeriodRange {
  const current = periodContaining(ctx.today, ctx.monthStartDay);
  let period = current;
  if (month && MONTH_PATTERN.test(month)) {
    period = periodForMonth(parseMonth(month), ctx.monthStartDay);
  }
  return toRange(period, current);
}

export function toRange(period: Period, current: Period): PeriodRange {
  const label = `${period.label.year}-${String(period.label.month).padStart(2, "0")}`;
  return {
    month: label,
    start: iso(period.start),
    end: iso(period.end),
    isCurrent: iso(period.start) === iso(current.start),
    period,
  };
}
