import { setTimeout as delay } from "node:timers/promises";

/**
 * Client for the BrasilAPI national holidays endpoint (docs/01 §10).
 *
 * The API answers `[{ "date": "2026-11-20", "name": "Consciência Negra",
 * "type": "national" }, …]` for years 1900–2199 (404 with `{ message }`
 * outside them). Only the year goes in the URL. The app always unites these
 * rows with the calendar it computes (src/lib/finance/business-days.ts), so
 * the API only adds dates, such as a new holiday created by law.
 */

const BRASILAPI_BASE_URL = "https://brasilapi.com.br/api/feriados/v1";
const USER_AGENT = "meu-finan-cron/1.0";

/** A year lists at least the 9 fixed national holidays; fewer means a broken payload. */
export const MIN_HOLIDAYS_PER_YEAR = 9;

/** Longest name kept (holidays.name has the same CHECK). */
export const MAX_HOLIDAY_NAME = 80;

export function holidaysUrl(year: number): string {
  return `${BRASILAPI_BASE_URL}/${year}`;
}

export interface FetchedHoliday {
  /** ISO date, yyyy-MM-dd. */
  date: string;
  name: string;
}

export interface HolidaysParseResult {
  /** Valid holidays, one per date, by date. */
  holidays: FetchedHoliday[];
  /** Entries dropped because the date, the name or the type was not valid. */
  rejected: number;
}

export class HolidaysApiError extends Error {
  readonly retryable: boolean;

  constructor(
    message: string,
    options: { retryable: boolean; cause?: unknown },
  ) {
    super(message, { cause: options.cause });
    this.name = "HolidaysApiError";
    this.retryable = options.retryable;
  }
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isRealDateIn(value: string, year: number): boolean {
  const match = ISO_DATE.exec(value);
  if (!match || Number(match[1]) !== year) return false;
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Validates a BrasilAPI payload for `year`. An entry is valid with a real
 * date inside the year, a name of 1 to 80 characters (trimmed) and `type`
 * absent or "national"; the others are counted and skipped. A payload that is
 * not an array, or has fewer than 9 valid entries, is an error, so a broken
 * answer never deletes stored holidays. Repeated dates keep the first entry.
 */
export function parseHolidaysPayload(
  payload: unknown,
  year: number,
): HolidaysParseResult {
  if (!Array.isArray(payload)) {
    throw new HolidaysApiError(
      "Unexpected BrasilAPI payload: expected a JSON array",
      { retryable: false },
    );
  }

  const byDate = new Map<string, string>();
  let rejected = 0;
  for (const entry of payload) {
    const date =
      isRecord(entry) && typeof entry.date === "string" ? entry.date : null;
    const name =
      isRecord(entry) && typeof entry.name === "string"
        ? entry.name.trim()
        : "";
    const type = isRecord(entry) ? entry.type : undefined;
    const valid =
      date !== null &&
      isRealDateIn(date, year) &&
      name.length >= 1 &&
      name.length <= MAX_HOLIDAY_NAME &&
      (type === undefined || type === "national");
    if (!valid) {
      rejected += 1;
      continue;
    }
    if (!byDate.has(date)) byDate.set(date, name);
  }

  if (byDate.size < MIN_HOLIDAYS_PER_YEAR) {
    throw new HolidaysApiError(
      `BrasilAPI listed ${byDate.size} valid holidays for ${year} (at least ${MIN_HOLIDAYS_PER_YEAR} expected)`,
      { retryable: false },
    );
  }

  const holidays = [...byDate]
    .map(([date, name]) => ({ date, name }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { holidays, rejected };
}

export interface HolidaysDiff {
  inserts: FetchedHoliday[];
  /** Same date, new name. */
  renames: FetchedHoliday[];
  /** Dates no longer listed. */
  deletes: string[];
}

/** What turns the stored rows of a year into `incoming`. */
export function diffHolidays(
  existing: readonly FetchedHoliday[],
  incoming: readonly FetchedHoliday[],
): HolidaysDiff {
  const stored = new Map(existing.map((h) => [h.date, h.name]));
  const next = new Map(incoming.map((h) => [h.date, h.name]));
  const inserts: FetchedHoliday[] = [];
  const renames: FetchedHoliday[] = [];
  for (const [date, name] of next) {
    const current = stored.get(date);
    if (current === undefined) inserts.push({ date, name });
    else if (current !== name) renames.push({ date, name });
  }
  const deletes = [...stored.keys()].filter((date) => !next.has(date)).sort();
  return { inserts, renames, deletes };
}

export interface FetchHolidaysOptions {
  /** Aborts the whole fetch, retries included (the job's time budget). */
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  /** Timeout of each attempt. */
  timeoutMs?: number;
  /** Extra attempts after the first one, for network errors, timeouts, 429 and 5xx. */
  retries?: number;
  /** Backoff before retry n is `retryDelayMs * 2^(n-1)`. */
  retryDelayMs?: number;
}

/** Fetches and validates the national holidays of `year`. */
export async function fetchHolidays(
  year: number,
  options: FetchHolidaysOptions = {},
): Promise<HolidaysParseResult> {
  const {
    signal,
    fetchImpl = fetch,
    timeoutMs = 5_000,
    retries = 1,
    retryDelayMs = 750,
  } = options;
  const url = holidaysUrl(year);

  for (let attempt = 0; ; attempt += 1) {
    signal?.throwIfAborted();
    try {
      return await fetchOnce(url, year, fetchImpl, timeoutMs, signal);
    } catch (error) {
      if (attempt >= retries || signal?.aborted || !isRetryable(error))
        throw error;
      await delay(retryDelayMs * 2 ** attempt, undefined, { signal });
    }
  }
}

async function fetchOnce(
  url: string,
  year: number,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<HolidaysParseResult> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const response = await fetchImpl(url, {
    headers: { accept: "application/json", "user-agent": USER_AGENT },
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });

  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new HolidaysApiError(`BrasilAPI answered HTTP ${response.status}`, {
      retryable: response.status === 429 || response.status >= 500,
    });
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (cause) {
    // Maintenance pages come back as HTML with status 200.
    throw new HolidaysApiError(
      "BrasilAPI answered with a body that is not JSON",
      {
        retryable: true,
        cause,
      },
    );
  }
  return parseHolidaysPayload(payload, year);
}

function isRetryable(error: unknown): boolean {
  if (error instanceof HolidaysApiError) return error.retryable;
  // fetch() reports network failures as TypeError and attempt timeouts as TimeoutError.
  return (
    error instanceof TypeError ||
    (error instanceof Error && error.name === "TimeoutError")
  );
}
