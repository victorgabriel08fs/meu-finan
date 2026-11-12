// The daily notices (doc 01 §9, step sendReminders; doc 02 §6.14): for each
// person with the notificacoes_push flag and a device (or the bell, the
// central_notificacoes flag, which keeps the notice without one), the events
// they left on that are due today, at most once a day each ("Vencimento em dia não
// útil" also needs the person's alerta_dia_nao_util flag). The job has no session:
// each person gets a context of their own, and only their own devices.
//
// Order per notice: build it (null: nothing to say), claim it in the
// notifications table (the unique key turns away a second run), send it,
// and give the claim back when no device got it and the bell did not keep
// it, so the next run retries.
// The report carries counts only: no ids, names or amounts.
import "server-only";
import { periodViewHref } from "@/components/reports/views";
import { statementHref } from "@/components/transactions/statement-params";
import { addDays, dayOfWeek } from "@/lib/finance";
import type { ReminderEvent } from "@/lib/notifications/events";
import {
  billsDueMessage,
  dailySummaryMessage,
  incomeCountdownMessage,
  type MessageOptions,
  monthlySummaryMessage,
  nonBusinessDueMessage,
  type ReminderMessage,
  weeklySummaryMessage,
} from "@/lib/notifications/messages";
import {
  availableReminderEvents,
  type NotificationPreferences,
} from "@/lib/notifications/preferences";
import {
  isMonthlySummaryDay,
  isWeeklySummaryDay,
  NOTIFIED_BILLS_LOOKBACK_DAYS,
  previousWeek,
  selectBillReminders,
  selectNonBusinessDueReminders,
} from "@/lib/notifications/schedule";
import { getUserContext, type UserContext } from "@/server/domain/context";
import type { UpcomingItem } from "@/server/domain/dashboard";
import {
  claimNotification,
  noticeItemKeys,
  recentBillKeys,
  releaseNotification,
  reminderDedupeKey,
  todaysReminderKeys,
} from "@/server/domain/notifications";
import { getNotificationPreferences } from "@/server/domain/preferences";
import {
  isReminderRecipient,
  listReminderRecipients,
  loadBillCandidates,
  loadDailySummary,
  loadIncomeCountdown,
  loadMonthlySummary,
  loadWeeklySummary,
  periodMonthOf,
  type ReminderRecipient,
} from "@/server/domain/reminders";
import { getFlags, loadFlagsForUsers } from "@/server/flags";
import { describeError } from "@/server/jobs/runner";
import { sendPush } from "@/server/push";

/** The step stops starting people this long after the job started. */
export const REMINDERS_DEADLINE_MS = 200_000;

/** People reminded at the same time. */
const BATCH_SIZE = 4;

const HOUR_SECONDS = 60 * 60;
const DAY_MS = 86_400_000;

/** Notices with the same tag replace each other on the device. */
const PUSH_OPTIONS: Record<ReminderEvent, { tag: string; ttlSeconds: number }> =
  {
    daily_summary: { tag: "resumo-dia", ttlSeconds: 12 * HOUR_SECONDS },
    bills_due: { tag: "contas", ttlSeconds: 24 * HOUR_SECONDS },
    non_business_due: { tag: "dia-nao-util", ttlSeconds: 24 * HOUR_SECONDS },
    income_countdown: { tag: "receita", ttlSeconds: 12 * HOUR_SECONDS },
    weekly_summary: { tag: "resumo-semana", ttlSeconds: 24 * HOUR_SECONDS },
    monthly_summary: { tag: "resumo-mes", ttlSeconds: 24 * HOUR_SECONDS },
  };

/** A notice ready to send: the texts, where a tap leads, the bills it names. */
export type Reminder = ReminderMessage & { url: string; itemKeys?: string[] };

/** The person's flags that shape the notices. */
type ReminderFlags = {
  nonBusinessDue: boolean;
  /** central_notificacoes: the notice is kept in the bell too. */
  bell: boolean;
};

/** The weekly summary only on Mondays, the monthly one on the first day. */
function isDueToday(event: ReminderEvent, ctx: UserContext): boolean {
  if (event === "weekly_summary") return isWeeklySummaryDay(ctx.today);
  if (event === "monthly_summary") {
    return isMonthlySummaryDay(ctx.today, ctx.monthStartDay);
  }
  return true;
}

/** Only one card's invoices: that card; otherwise the pending entries. */
function billsUrl(ctx: UserContext, items: readonly UpcomingItem[]): string {
  const cards = new Set(
    items.map((item) => (item.type === "invoice" ? item.accountId : null)),
  );
  const [card] = cards;
  if (cards.size === 1 && card) return `/cartoes/${card}`;
  const first = items[0]?.dueOn ?? ctx.todayIso;
  return statementHref(
    {
      month: periodMonthOf(ctx, first),
      accountId: null,
      categoryId: null,
      kind: null,
      status: "pending",
      q: "",
    },
    periodMonthOf(ctx, ctx.todayIso),
  );
}

const lookbackStart = (now: Date) =>
  new Date(now.getTime() - NOTIFIED_BILLS_LOOKBACK_DAYS * DAY_MS);

async function billsReminder(
  ctx: UserContext,
  preferences: NotificationPreferences,
  options: MessageOptions,
  now: Date,
  preview: boolean,
  flags: ReminderFlags,
): Promise<Reminder | null> {
  const [items, notifiedKeys] = await Promise.all([
    loadBillCandidates(ctx, { nonBusiness: flags.nonBusinessDue }),
    // The preview shows every bill in the window, announced or not.
    preview
      ? new Set<string>()
      : recentBillKeys(ctx.userId, lookbackStart(now)),
  ]);
  const selected = selectBillReminders(items, {
    todayIso: ctx.todayIso,
    leadDays: preferences.billsLeadDays,
    notifiedKeys,
  });
  const message = billsDueMessage(
    selected.map(({ item, days, overdue }) => ({
      type: item.type,
      title: item.title,
      amountCents: item.amountCents,
      accountName: item.accountName,
      dueOn: item.dueOn,
      days,
      overdue,
      nonBusinessDue: item.nonBusinessDue,
    })),
    options,
  );
  if (!message) return null;
  return {
    ...message,
    url: billsUrl(
      ctx,
      selected.map(({ item }) => item),
    ),
    itemKeys: selected.map(({ key }) => key),
  };
}

/**
 * Vencimento em dia não útil, on the last business day before. Runs after
 * the day's Contas a vencer (REMINDER_EVENTS order) and leaves out the bills
 * it already named, so a bill gets one push a day.
 */
async function nonBusinessReminder(
  ctx: UserContext,
  options: MessageOptions,
  now: Date,
  preview: boolean,
): Promise<Reminder | null> {
  const none = new Set<string>();
  const [items, notifiedKeys, coveredToday] = await Promise.all([
    loadBillCandidates(ctx, { nonBusiness: true }),
    preview
      ? none
      : recentBillKeys(ctx.userId, lookbackStart(now), "non_business_due"),
    preview ? none : noticeItemKeys(ctx.userId, "bills_due", ctx.todayIso),
  ]);
  const selected = selectNonBusinessDueReminders(items, {
    todayIso: ctx.todayIso,
    notifiedKeys,
    coveredToday,
    preview,
  });
  const message = nonBusinessDueMessage(
    selected.map(({ item, days }) => ({
      type: item.type,
      title: item.title,
      amountCents: item.amountCents,
      accountName: item.accountName,
      dueOn: item.dueOn,
      days,
      overdue: false,
      nonBusinessDue: item.nonBusinessDue,
    })),
    options,
  );
  if (!message) return null;
  return {
    ...message,
    url: billsUrl(
      ctx,
      selected.map(({ item }) => item),
    ),
    itemKeys: selected.map(({ key }) => key),
  };
}

/** Days ahead the preview looks for an income. */
const PREVIEW_INCOME_HORIZON_DAYS = 60;

/** Monday to Sunday of the week before this one (any weekday). */
function lastFullWeek(ctx: UserContext): { start: string; end: string } {
  const monday = addDays(ctx.today, -((dayOfWeek(ctx.today) + 6) % 7));
  return previousWeek(monday);
}

/**
 * The notice of one event for today, or null when there is nothing to say.
 * The preview ignores the bills already announced, takes the last full
 * week and looks further ahead for an income.
 */
async function buildReminder(
  ctx: UserContext,
  event: ReminderEvent,
  preferences: NotificationPreferences,
  now: Date,
  flags: ReminderFlags,
  preview = false,
): Promise<Reminder | null> {
  const options = {
    showAmounts: preferences.showAmounts,
    todayIso: ctx.todayIso,
  };
  switch (event) {
    case "daily_summary": {
      const message = dailySummaryMessage(await loadDailySummary(ctx), options);
      return message && { ...message, url: "/inicio" };
    }
    case "bills_due":
      return billsReminder(ctx, preferences, options, now, preview, flags);
    case "non_business_due":
      return flags.nonBusinessDue
        ? nonBusinessReminder(ctx, options, now, preview)
        : null;
    case "income_countdown": {
      const input = await loadIncomeCountdown(
        ctx,
        preview ? PREVIEW_INCOME_HORIZON_DAYS : undefined,
      );
      const message = input && incomeCountdownMessage(input, options);
      return message && { ...message, url: "/inicio" };
    }
    case "weekly_summary": {
      const input = await loadWeeklySummary(
        ctx,
        preview ? lastFullWeek(ctx) : undefined,
      );
      const message = weeklySummaryMessage(input, options);
      return (
        message && {
          ...message,
          url: `/relatorios/calendario?mes=${periodMonthOf(ctx, input.end)}`,
        }
      );
    }
    case "monthly_summary": {
      const summary = await loadMonthlySummary(ctx);
      const message = monthlySummaryMessage(summary, options);
      // The report opens on the month that closed, not on today's.
      return (
        message && {
          ...message,
          url: periodViewHref(
            "/relatorios/visao-geral",
            1,
            summary.month,
            periodMonthOf(ctx, ctx.todayIso),
          ),
        }
      );
    }
  }
}

/** job_runs details of the step: counts only. */
export type RemindersReport = {
  /** People with the flag and at least one notice on, a device or the bell. */
  recipients: number;
  processed: number;
  /** Left for the next run: the deadline came first. */
  notReached: number;
  sent: Record<ReminderEvent, number>;
  /** Already sent today (an earlier or a simultaneous run). */
  alreadySent: number;
  /** Nothing to say (no bills, no income ahead, an empty week…). */
  nothingToSend: number;
  /** Kept only in the bell: no device got it (or there is none). */
  bellOnly: number;
  /** No device got it and the bell did not keep it; given back for the next run. */
  undelivered: number;
  /** Devices the push service said were gone (forgotten). */
  devicesRemoved: number;
  errors: number;
};

function emptyReport(): RemindersReport {
  return {
    recipients: 0,
    processed: 0,
    notReached: 0,
    sent: {
      daily_summary: 0,
      bills_due: 0,
      non_business_due: 0,
      income_countdown: 0,
      weekly_summary: 0,
      monthly_summary: 0,
    },
    alreadySent: 0,
    nothingToSend: 0,
    bellOnly: 0,
    undelivered: 0,
    devicesRemoved: 0,
    errors: 0,
  };
}

/**
 * One event for one person: build, claim (the row is also the bell's notice),
 * send, give back if no device got it and the bell is off.
 */
async function sendOne(
  ctx: UserContext,
  event: ReminderEvent,
  preferences: NotificationPreferences,
  now: Date,
  flags: ReminderFlags,
  report: RemindersReport,
): Promise<void> {
  const reminder = await buildReminder(ctx, event, preferences, now, flags);
  if (!reminder) {
    report.nothingToSend += 1;
    return;
  }
  const id = await claimNotification(ctx.userId, {
    type: event,
    date: ctx.todayIso,
    amounts: preferences.showAmounts,
    ...reminder,
  });
  if (!id) {
    report.alreadySent += 1;
    return;
  }
  let delivered = false;
  try {
    const { tag, ttlSeconds } = PUSH_OPTIONS[event];
    const outcome = await sendPush(
      ctx.userId,
      { title: reminder.title, body: reminder.body, url: reminder.url, tag },
      { ttlSeconds, noticeId: flags.bell ? id : undefined },
    );
    report.devicesRemoved += outcome.removed;
    delivered = outcome.sent > 0;
  } finally {
    if (!delivered && !flags.bell) await releaseNotification(id, ctx.userId);
  }
  if (delivered) report.sent[event] += 1;
  else if (flags.bell) report.bellOnly += 1;
  else report.undelivered += 1;
}

async function remindPerson(
  { userId, preferences }: ReminderRecipient,
  flags: ReminderFlags,
  now: Date,
  report: RemindersReport,
): Promise<void> {
  try {
    // A new context per person: the per-request reads are keyed on it.
    const ctx = await getUserContext(userId, { now: now.getTime() });
    const events = availableReminderEvents(preferences, flags).filter((event) =>
      isDueToday(event, ctx),
    );
    if (events.length === 0) return;
    const done = await todaysReminderKeys(userId, ctx.todayIso);
    for (const event of events) {
      if (done.has(reminderDedupeKey(event, ctx.todayIso))) {
        report.alreadySent += 1;
        continue;
      }
      try {
        await sendOne(ctx, event, preferences, now, flags, report);
      } catch (error) {
        report.errors += 1;
        console.error(
          `[reminders] ${event} failed for a person:`,
          describeError(error),
        );
      }
    }
  } catch (error) {
    report.errors += 1;
    console.error(
      "[reminders] could not remind a person:",
      describeError(error),
    );
  } finally {
    report.processed += 1;
  }
}

export type SendRemindersOptions = {
  /** The job's start: every person's "today" comes from it. */
  now: Date;
  signal?: AbortSignal;
  /** Epoch ms after which no one else is started. */
  deadline: number;
};

/**
 * Sends today's notices to everyone they are due to. Safe to run again the
 * same day: it sends only what is missing.
 */
export async function sendDailyReminders({
  now,
  signal,
  deadline,
}: SendRemindersOptions): Promise<RemindersReport> {
  const report = emptyReport();
  const candidates = await listReminderRecipients();
  const flags = await loadFlagsForUsers(
    candidates.map((candidate) => candidate.userId),
  );
  const reminderFlags = (userId: string): ReminderFlags => ({
    nonBusinessDue: flags.get(userId)?.alerta_dia_nao_util ?? false,
    bell: flags.get(userId)?.central_notificacoes ?? false,
  });
  const recipients = candidates.filter((candidate) =>
    isReminderRecipient(candidate, flags.get(candidate.userId)),
  );
  report.recipients = recipients.length;

  for (let start = 0; start < recipients.length; start += BATCH_SIZE) {
    if (signal?.aborted || Date.now() >= deadline) {
      report.notReached = recipients.length - start;
      break;
    }
    await Promise.all(
      recipients
        .slice(start, start + BATCH_SIZE)
        .map((recipient) =>
          remindPerson(recipient, reminderFlags(recipient.userId), now, report),
        ),
    );
  }
  return report;
}

export type PreviewOutcome = {
  /** Notices with something to say among the ones left on. */
  built: number;
  /** Of those, how many the device accepted. */
  sent: number;
  /** The device was gone (and is now forgotten). */
  removed: boolean;
};

/**
 * "Enviar prévia dos avisos" (administrators): every notice the person left
 * on, with today's data, whatever the day (see buildReminder), sent only to
 * this device of theirs. Nothing is recorded, so the day's real notices
 * still go out.
 */
export async function previewReminders(
  userId: string,
  endpoint: string,
  now: Date = new Date(),
): Promise<PreviewOutcome> {
  const [ctx, preferences, userFlags] = await Promise.all([
    getUserContext(userId, { now: now.getTime() }),
    getNotificationPreferences(userId),
    getFlags(userId),
  ]);
  const flags = {
    nonBusinessDue: userFlags.alerta_dia_nao_util,
    bell: userFlags.central_notificacoes,
  };
  const outcome: PreviewOutcome = { built: 0, sent: 0, removed: false };
  for (const event of availableReminderEvents(preferences, flags)) {
    const reminder = await buildReminder(
      ctx,
      event,
      preferences,
      now,
      flags,
      true,
    );
    if (!reminder) continue;
    outcome.built += 1;
    if (outcome.removed) continue;
    const pushed = await sendPush(
      userId,
      {
        title: reminder.title,
        body: reminder.body,
        url: reminder.url,
        tag: `previa-${event}`,
      },
      { endpoint, ttlSeconds: 60 },
    );
    outcome.sent += pushed.sent;
    outcome.removed = pushed.removed > 0;
  }
  return outcome;
}
