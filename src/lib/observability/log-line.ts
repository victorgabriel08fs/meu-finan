import { REMOVED, SENSITIVE_KEY, scrubText } from "./scrub";

export type LogFields = Record<
  string,
  string | number | boolean | null | undefined
>;

/** One JSON line for the function logs: no `undefined`, sensitive keys masked, strings scrubbed. */
export function formatLogLine(
  level: "info" | "warn" | "error",
  event: string,
  fields: LogFields,
  now: Date = new Date(),
): string {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (SENSITIVE_KEY.test(key) && !/hash$/i.test(key)) out[key] = REMOVED;
    else out[key] = typeof value === "string" ? scrubText(value) : value;
  }
  return JSON.stringify({ ts: now.toISOString(), level, event, ...out });
}
