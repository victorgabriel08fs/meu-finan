import "server-only";
import { syncHolidays as syncHolidayCalendar } from "@/server/domain/holidays";
import type { JobStep } from "../runner";

export { HOLIDAYS_CACHE_TAG } from "@/server/domain/holidays";

/**
 * National holidays of this year and the next from BrasilAPI into `holidays`,
 * each year at most once every 30 days (docs/01 §9). The computed calendar
 * always applies, so a day without the API changes nothing on screen.
 */
export const syncHolidays: JobStep = {
  name: "syncHolidays",
  run: ({ signal, startedAt }) =>
    syncHolidayCalendar({ now: startedAt, signal }),
};
