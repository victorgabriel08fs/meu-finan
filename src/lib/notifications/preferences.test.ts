import { describe, expect, it } from "vitest";
import { NOTIFICATION_TYPES } from "@/server/db/schema/enums";
import { REMINDER_EVENTS } from "./events";
import {
  availableReminderEvents,
  DEFAULT_NOTIFICATION_PREFERENCES,
  enabledReminderEvents,
  notificationPreferencesSchema,
  resolveNotificationPreferences,
} from "./preferences";

const ALL_ON = {
  events: {
    daily_summary: true,
    bills_due: true,
    non_business_due: true,
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
      "non_business_due",
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

describe("non_business_due preference", () => {
  it("is on by default, also for preferences saved before it existed", () => {
    expect(DEFAULT_NOTIFICATION_PREFERENCES.events.non_business_due).toBe(true);
    const { non_business_due: _omitted, ...before } = ALL_ON.events;
    const resolved = resolveNotificationPreferences({
      ...ALL_ON,
      events: { ...before, bills_due: false },
    });
    expect(resolved.events.non_business_due).toBe(true);
    expect(resolved.events.bills_due).toBe(false);
  });

  it("keeps an off choice", () => {
    const resolved = resolveNotificationPreferences({
      ...ALL_ON,
      events: { ...ALL_ON.events, non_business_due: false },
    });
    expect(resolved.events.non_business_due).toBe(false);
  });

  it("availableReminderEvents drops it without the flag, and only it", () => {
    expect(availableReminderEvents(ALL_ON, { nonBusinessDue: false })).toEqual(
      REMINDER_EVENTS.filter((event) => event !== "non_business_due"),
    );
    expect(availableReminderEvents(ALL_ON, { nonBusinessDue: true })).toEqual([
      ...REMINDER_EVENTS,
    ]);
    expect(
      availableReminderEvents(
        { ...ALL_ON, events: { ...ALL_ON.events, non_business_due: false } },
        { nonBusinessDue: true },
      ),
    ).not.toContain("non_business_due");
  });

  it("is sent right after bills_due, so it can leave out what that one named", () => {
    expect(REMINDER_EVENTS.indexOf("non_business_due")).toBe(
      REMINDER_EVENTS.indexOf("bills_due") + 1,
    );
  });
});
