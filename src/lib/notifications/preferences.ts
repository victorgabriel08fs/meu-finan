// Which notices a person gets (Ajustes › Notificações › Avisos, doc 02
// §6.14). The account keeps them in user_settings.notification_prefs (null =
// never changed: the defaults). Pure; the Server Action validates with the
// strict schema, reading tolerates anything stored.
import { z } from "zod";
import { REMINDER_EVENTS, type ReminderEvent } from "./events";

/** "No dia", "1 dia antes", "3 dias antes". */
export const BILLS_LEAD_DAYS = [0, 1, 3] as const;
export type BillsLeadDays = (typeof BILLS_LEAD_DAYS)[number];

export type NotificationPreferences = {
  events: Record<ReminderEvent, boolean>;
  /** How many days before the due date "Contas a vencer" starts warning. */
  billsLeadDays: BillsLeadDays;
  /** Amounts on the lock screen; off, the texts carry no R$. */
  showAmounts: boolean;
};

/** Decided by the owner on 05/11/2026. */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  events: {
    daily_summary: false,
    bills_due: true,
    // On by default (owner, 12/11/2026); sent only with alerta_dia_nao_util.
    non_business_due: true,
    income_countdown: false,
    weekly_summary: true,
    monthly_summary: true,
  },
  billsLeadDays: 1,
  showAmounts: false,
};

const isLeadDays = (value: unknown): value is BillsLeadDays =>
  (BILLS_LEAD_DAYS as readonly unknown[]).includes(value);

/** The whole choice, as the Server Action receives it. */
export const notificationPreferencesSchema = z.strictObject({
  events: z.strictObject(
    Object.fromEntries(
      REMINDER_EVENTS.map((event) => [event, z.boolean()]),
    ) as Record<ReminderEvent, z.ZodBoolean>,
  ),
  billsLeadDays: z.custom<BillsLeadDays>(isLeadDays),
  showAmounts: z.boolean(),
});

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/**
 * What the account stored, field by field: each missing or invalid one
 * (and an event added after the person saved) takes the default; unknown
 * keys are ignored.
 */
export function resolveNotificationPreferences(
  stored: unknown,
): NotificationPreferences {
  const defaults = DEFAULT_NOTIFICATION_PREFERENCES;
  const saved = record(stored);
  const events = record(saved?.events);
  return {
    events: Object.fromEntries(
      REMINDER_EVENTS.map((event) => {
        const value = events?.[event];
        return [
          event,
          typeof value === "boolean" ? value : defaults.events[event],
        ];
      }),
    ) as Record<ReminderEvent, boolean>,
    billsLeadDays: isLeadDays(saved?.billsLeadDays)
      ? saved.billsLeadDays
      : defaults.billsLeadDays,
    showAmounts:
      typeof saved?.showAmounts === "boolean"
        ? saved.showAmounts
        : defaults.showAmounts,
  };
}

/** The events the person left on, in the order they are sent. */
export function enabledReminderEvents(
  preferences: NotificationPreferences,
): ReminderEvent[] {
  return REMINDER_EVENTS.filter((event) => preferences.events[event]);
}

/**
 * The events the person gets: those left on, without the ones whose flag is
 * off for them (`non_business_due` needs alerta_dia_nao_util). What the job
 * sends, the preview shows and the Rotina counts.
 */
export function availableReminderEvents(
  preferences: NotificationPreferences,
  flags: { nonBusinessDue: boolean },
): ReminderEvent[] {
  return enabledReminderEvents(preferences).filter(
    (event) => event !== "non_business_due" || flags.nonBusinessDue,
  );
}
