import { setTimeout as delay } from "node:timers/promises";

/**
 * Client for the Banco Central do Brasil SGS time-series API (docs/01 §10).
 *
 * The API answers `[{ "data": "13/10/2026", "valor": "14.90" }, …]`: dates in
 * dd/MM/yyyy and decimals as strings with a dot. Values stay strings end to
 * end so they reach the numeric(12,8) column without a float round-trip.
 */

export type SgsRateIndex = "cdi" | "selic" | "ipca";

export interface SgsSeries {
  index: SgsRateIndex;
  code: number;
  /** How many of the latest observations to request (the API caps `ultimos` at 20). */
  lastN: number;
}

/** Series kept in market_rates (docs/03 §2.3). */
export const SGS_SERIES: readonly SgsSeries[] = [
  // CDI annualised, base 252 (% a.a.), daily.
  { index: "cdi", code: 4389, lastN: 20 },
  // Selic target set by Copom (% a.a.), daily.
  { index: "selic", code: 432, lastN: 20 },
  // IPCA (% in the month), monthly: 20 months cover the 12-month accumulation.
  { index: "ipca", code: 433, lastN: 20 },
];

const SGS_BASE_URL = "https://api.bcb.gov.br/dados/serie";
const USER_AGENT = "meu-finan-cron/1.0";

export function sgsLatestUrl(code: number, lastN: number): string {
  return `${SGS_BASE_URL}/bcdata.sgs.${code}/dados/ultimos/${lastN}?formato=json`;
}

export interface SgsPoint {
  /** ISO date, yyyy-MM-dd. */
  refDate: string;
  /** Decimal string with a dot, e.g. "14.90" or "-0.02". */
  value: string;
}

export interface SgsParseResult {
  /** Valid observations, one per date, oldest first. */
  points: SgsPoint[];
  /** Entries dropped because the date or the value was malformed. */
  rejected: number;
}

export class SgsError extends Error {
  readonly retryable: boolean;

  constructor(
    message: string,
    options: { retryable: boolean; cause?: unknown },
  ) {
    super(message, { cause: options.cause });
    this.name = "SgsError";
    this.retryable = options.retryable;
  }
}

const SGS_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/** "13/10/2026" → "2026-10-13"; `null` for anything that is not a real calendar date. */
export function parseSgsDate(input: string): string | null {
  const match = SGS_DATE.exec(input.trim());
  if (!match) return null;

  const [, dd = "", mm = "", yyyy = ""] = match;
  const day = Number(dd);
  const month = Number(mm);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(Number(yyyy), month)
  ) {
    return null;
  }
  return `${yyyy}-${mm}-${dd}`;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

// At most 4 integer digits: numeric(12,8) holds |value| < 10^4.
const SGS_DECIMAL = /^(-?)(\d{1,4})(?:[.,](\d{1,12}))?$/;

/** "14.90" → "14.90", "0,56" → "0.56"; `null` for blanks, exponents or out-of-range values. */
export function parseSgsValue(input: unknown): string | null {
  let text: string;
  if (typeof input === "string") text = input.trim();
  else if (typeof input === "number" && Number.isFinite(input))
    text = String(input);
  else return null;

  const match = SGS_DECIMAL.exec(text);
  if (!match) return null;

  const [, sign = "", integer = "", fraction] = match;
  return fraction === undefined
    ? `${sign}${integer}`
    : `${sign}${integer}.${fraction}`;
}

/**
 * Validates an SGS JSON payload. Malformed entries are counted and skipped;
 * a payload that is not an array, or has entries but none valid, is an error.
 * Duplicate dates keep the last value, so one upsert never touches a row twice.
 */
export function parseSgsPayload(payload: unknown): SgsParseResult {
  if (!Array.isArray(payload)) {
    throw new SgsError("Unexpected SGS payload: expected a JSON array", {
      retryable: false,
    });
  }

  const byDate = new Map<string, string>();
  let rejected = 0;
  for (const entry of payload) {
    const refDate =
      isRecord(entry) && typeof entry.data === "string"
        ? parseSgsDate(entry.data)
        : null;
    const value = isRecord(entry) ? parseSgsValue(entry.valor) : null;
    if (refDate === null || value === null) {
      rejected += 1;
      continue;
    }
    byDate.set(refDate, value);
  }

  if (payload.length > 0 && byDate.size === 0) {
    throw new SgsError(
      `SGS payload had ${payload.length} entries and none were valid`,
      {
        retryable: false,
      },
    );
  }

  const points = [...byDate]
    .map(([refDate, value]) => ({ refDate, value }))
    .sort((a, b) => a.refDate.localeCompare(b.refDate));
  return { points, rejected };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export interface FetchSgsOptions {
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

/** Fetches and validates the latest `lastN` observations of an SGS series. */
export async function fetchSgsSeries(
  code: number,
  lastN: number,
  options: FetchSgsOptions = {},
): Promise<SgsParseResult> {
  const {
    signal,
    fetchImpl = fetch,
    timeoutMs = 10_000,
    retries = 2,
    retryDelayMs = 750,
  } = options;
  const url = sgsLatestUrl(code, lastN);

  for (let attempt = 0; ; attempt += 1) {
    signal?.throwIfAborted();
    try {
      return await fetchOnce(url, fetchImpl, timeoutMs, signal);
    } catch (error) {
      if (attempt >= retries || signal?.aborted || !isRetryable(error))
        throw error;
      await delay(retryDelayMs * 2 ** attempt, undefined, { signal });
    }
  }
}

async function fetchOnce(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<SgsParseResult> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const response = await fetchImpl(url, {
    headers: { accept: "application/json", "user-agent": USER_AGENT },
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });

  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new SgsError(`SGS answered HTTP ${response.status}`, {
      retryable: response.status === 429 || response.status >= 500,
    });
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (cause) {
    // Maintenance pages come back as HTML with status 200.
    throw new SgsError("SGS answered with a body that is not JSON", {
      retryable: true,
      cause,
    });
  }
  return parseSgsPayload(payload);
}

function isRetryable(error: unknown): boolean {
  if (error instanceof SgsError) return error.retryable;
  // fetch() reports network failures as TypeError and attempt timeouts as TimeoutError.
  return (
    error instanceof TypeError ||
    (error instanceof Error && error.name === "TimeoutError")
  );
}
