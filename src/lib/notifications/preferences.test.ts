import { describe, expect, it } from "vitest";
import { NOTIFICATION_TYPES } from "@/server/db/schema/enums";
import { REMINDER_EVENTS } from "./events";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  enabledReminderEvents,
  notificationPreferencesSchema,
  resolveNotificationPreferences,
} from "./preferences";

const ALL_ON = {
  events: {
    daily_summary: true,
    bills_due: true,
    income_countdown: true,
    weekly_summary: true,
    monthly_summary: true,
  },
  billsLeadDays: 3,
  showAmounts: true,
} as const;

describe("notification preferences", () => {
  it("every event is a notification type", () => {
    for (const event of REMINDER_EVENTS) {
      expect(NOTIFICATION_TYPES).toContain(event);
    }
  });

  it("defaults: bills, weekly and monthly on, a day ahead, no amounts", () => {
    for (const stored of [null, undefined, "x", 3, []]) {
      expect(resolveNotificationPreferences(stored)).toEqual(
        DEFAULT_NOTIFICATION_PREFERENCES,
      );
    }
    expect(enabledReminderEvents(DEFAULT_NOTIFICATION_PREFERENCES)).toEqual([
      "bills_due",
      "weekly_summary",
      "monthly_summary",
    ]);
    expect(DEFAULT_NOTIFICATION_PREFERENCES.billsLeadDays).toBe(1);
    expect(DEFAULT_NOTIFICATION_PREFERENCES.showAmounts).toBe(false);
  });

  it("keeps what was saved", () => {
    expect(resolveNotificationPreferences(ALL_ON)).toEqual(ALL_ON);
  });

  it("fills a partial or invalid choice field by field", () => {
    expect(
      resolveNotificationPreferences({
        events: { daily_summary: true, bills_due: "sim" },
        billsLeadDays: 2,
        showAmounts: true,
      }),
    ).toEqual({
      events: {
        ...DEFAULT_NOTIFICATION_PREFERENCES.events,
        daily_summary: true,
      },
      billsLeadDays: 1,
      showAmounts: true,
    });
    expect(
      resolveNotificationPreferences({ events: [true], billsLeadDays: 0 }),
    ).toEqual({ ...DEFAULT_NOTIFICATION_PREFERENCES, billsLeadDays: 0 });
  });

  it("ignores unknown keys", () => {
    expect(
      resolveNotificationPreferences({
        events: { budget_80: true, weekly_summary: false },
        quietHours: "22-7",
      }),
    ).toEqual({
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      events: {
        ...DEFAULT_NOTIFICATION_PREFERENCES.events,
        weekly_summary: false,
      },
    });
  });

  it("the action's schema takes only the whole, valid choice", () => {
    expect(notificationPreferencesSchema.safeParse(ALL_ON).success).toBe(true);
    expect(
      notificationPreferencesSchema.safeParse(DEFAULT_NOTIFICATION_PREFERENCES)
        .success,
    ).toBe(true);
    const invalid = [
      { ...ALL_ON, billsLeadDays: 2 },
      { ...ALL_ON, billsLeadDays: "1" },
      { ...ALL_ON, showAmounts: "true" },
      { ...ALL_ON, extra: 1 },
      { ...ALL_ON, events: { ...ALL_ON.events, budget_80: true } },
      { ...ALL_ON, events: { daily_summary: true } },
      { events: ALL_ON.events, billsLeadDays: 1 },
    ];
    for (const value of invalid) {
      expect(notificationPreferencesSchema.safeParse(value).success).toBe(
        false,
      );
    }
  });
});
