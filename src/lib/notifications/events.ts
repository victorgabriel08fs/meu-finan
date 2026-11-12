// The notices the daily job sends (doc 01 §9, doc 02 §6.14), one push per
// event per person per day. Each is a `notifications.type` too (the list in
// src/server/db/schema/enums.ts repeats them: the schema imports nothing
// from here). The order is the order of sending: "non_business_due" comes
// after "bills_due", so it can leave out the bills the latter already named.

export const REMINDER_EVENTS = [
  "daily_summary",
  "bills_due",
  "non_business_due",
  "income_countdown",
  "weekly_summary",
  "monthly_summary",
] as const;

export type ReminderEvent = (typeof REMINDER_EVENTS)[number];

export function isReminderEvent(value: unknown): value is ReminderEvent {
  return (
    typeof value === "string" &&
    (REMINDER_EVENTS as readonly string[]).includes(value)
  );
}
