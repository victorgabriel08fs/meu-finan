// The daily notices (doc 01 §9, step sendReminders; doc 02 §6.14): for each
// person with the notificacoes_push flag and a device, the events they left
// on that are due today, at most once a day each. The job has no session:
// each person gets a context of their own, and only their own devices.
//
// Order per notice: build it (null: nothing to say), claim it in the
// notifications table (the unique key turns away a second run), send it,
// and give the claim back when no device got it, so the next run retries.
// The report carries counts only: no ids, names or amounts.
import "server-only";
import { statementHref } from "@/components/transactions/statement-params";
import type { ReminderEvent } from "@/lib/notifications/events";
import {
  billsDueMessage,
  dailySummaryMessage,
  incomeCountdownMessage,
  type MessageOptions,
  monthlySummaryMessage,
  type ReminderMessage,
  weeklySummaryMessage,
} from "@/lib/notifications/messages";
import {
  enabledReminderEvents,
  type NotificationPreferences,
} from "@/lib/notifications/preferences";
import {
  isMonthlySummaryDay,
  isWeeklySummaryDay,
  NOTIFIED_BILLS_LOOKBACK_DAYS,
  selectBillReminders,
} from "@/lib/notifications/schedule";
import { getUserContext, type UserContext } from "@/server/domain/context";
import type { UpcomingItem } from "@/server/domain/dashboard";
import {
  claimNotification,
  recentBillKeys,
  releaseNotification,
  reminderDedupeKey,
  todaysReminderKeys,
} from "@/server/domain/notifications";
import {
  listReminderRecipients,
  loadBillCandidates,
  loadDailySummary,
  loadIncomeCountdown,
  loadMonthlySummary,
  loadWeeklySummary,
  periodMonthOf,
  type ReminderRecipient,
} from "@/server/domain/reminders";
import { loadFlagsForUsers } from "@/server/flags";
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
    income_countdown: { tag: "receita", ttlSeconds: 12 * HOUR_SECONDS },
    weekly_summary: { tag: "resumo-semana", ttlSeconds: 24 * HOUR_SECONDS },
    monthly_summary: { tag: "resumo-mes", ttlSeconds: 24 * HOUR_SECONDS },
  };

/** A notice ready to send: the texts, where a tap leads, the bills it names. */
export type Reminder = ReminderMessage & { url: string; itemKeys?: string[] };

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

async function billsReminder(
  ctx: UserContext,
  preferences: NotificationPreferences,
  options: MessageOptions,
  now: Date,
): Promise<Reminder | null> {
  const [items, notifiedKeys] = await Promise.all([
    loadBillCandidates(ctx),
    recentBillKeys(
      ctx.userId,
      new Date(now.getTime() - NOTIFIED_BILLS_LOOKBACK_DAYS * DAY_MS),
    ),
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

/** The notice of one event for today, or null when there is nothing to say. */
async function buildReminder(
  ctx: UserContext,
  event: ReminderEvent,
  preferences: NotificationPreferences,
  now: Date,
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
      return billsReminder(ctx, preferences, options, now);
    case "income_countdown": {
      const input = await loadIncomeCountdown(ctx);
      const message = input && incomeCountdownMessage(input, options);
      return message && { ...message, url: "/inicio" };
    }
    case "weekly_summary": {
      const input = await loadWeeklySummary(ctx);
      const message = weeklySummaryMessage(input, options);
      return (
        message && {
          ...message,
          url: `/relatorios/calendario?mes=${periodMonthOf(ctx, input.end)}`,
        }
      );
    }
    case "monthly_summary": {
      const message = monthlySummaryMessage(
        await loadMonthlySummary(ctx),
        options,
      );
      return message && { ...message, url: "/relatorios/visao-geral" };
    }
  }
}

/** job_runs details of the step: counts only. */
export type RemindersReport = {
  /** People with the flag, a device and at least one notice on. */
  recipients: number;
  processed: number;
  /** Left for the next run: the deadline came first. */
  notReached: number;
  sent: Record<ReminderEvent, number>;
  /** Already sent today (an earlier or a simultaneous run). */
  alreadySent: number;
  /** Nothing to say (no bills, no income ahead, an empty week…). */
  nothingToSend: number;
  /** No device got it; given back for the next run. */
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
      income_countdown: 0,
      weekly_summary: 0,
      monthly_summary: 0,
    },
    alreadySent: 0,
    nothingToSend: 0,
    undelivered: 0,
    devicesRemoved: 0,
    errors: 0,
  };
}

/** One event for one person: build, claim, send, give back if undelivered. */
async function sendOne(
  ctx: UserContext,
  event: ReminderEvent,
  preferences: NotificationPreferences,
  now: Date,
  report: RemindersReport,
): Promise<void> {
  const reminder = await buildReminder(ctx, event, preferences, now);
  if (!reminder) {
    report.nothingToSend += 1;
    return;
  }
  const id = await claimNotification(ctx.userId, {
    type: event,
    date: ctx.todayIso,
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
      { ttlSeconds },
    );
    report.devicesRemoved += outcome.removed;
    delivered = outcome.sent > 0;
  } finally {
    if (!delivered) await releaseNotification(id, ctx.userId);
  }
  if (delivered) report.sent[event] += 1;
  else report.undelivered += 1;
}

async function remindPerson(
  { userId, preferences }: ReminderRecipient,
  now: Date,
  report: RemindersReport,
): Promise<void> {
  try {
    // A new context per person: the per-request reads are keyed on it.
    const ctx = await getUserContext(userId, { now: now.getTime() });
    const events = enabledReminderEvents(preferences).filter((event) =>
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
        await sendOne(ctx, event, preferences, now, report);
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
  const recipients = candidates.filter(
    (candidate) =>
      flags.get(candidate.userId)?.notificacoes_push &&
      enabledReminderEvents(candidate.preferences).length > 0,
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
        .map((recipient) => remindPerson(recipient, now, report)),
    );
  }
  return report;
}
