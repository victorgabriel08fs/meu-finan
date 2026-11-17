// Per-person limits on the costly actions (docs/04-seguranca.md, M-4): a fixed
// window per user id taken from the session, on top of `throttle`.
import { type ThrottleResult, type ThrottleRule, throttle } from "./throttle";

export const USAGE_LIMITS = {
  importAnalyze: { prefix: "import-analyze", windowSeconds: 600, max: 20 },
  importConfirm: { prefix: "import-confirm", windowSeconds: 600, max: 10 },
  entryText: { prefix: "entry-text", windowSeconds: 60, max: 30 },
  exportCsv: { prefix: "export-csv", windowSeconds: 600, max: 10 },
} as const satisfies Record<string, ThrottleRule & { prefix: string }>;

export type UsageLimit = keyof typeof USAGE_LIMITS;

/** Counts one use of `name` by `userId`; not ok once the window's max is passed. */
export function limitUsage(
  name: UsageLimit,
  userId: string,
): Promise<ThrottleResult> {
  const { prefix, ...rule } = USAGE_LIMITS[name];
  return throttle(`${prefix}:${userId}`, rule);
}
