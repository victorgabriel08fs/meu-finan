import "server-only";
import { vapidKeys } from "@/server/push";
import {
  REMINDERS_DEADLINE_MS,
  type RemindersReport,
  sendDailyReminders,
} from "@/server/reminders";
import type { JobStep } from "../runner";

const count = (value: number, one: string, many: string) =>
  `${value} ${value === 1 ? one : many}`;

/** What went wrong, in numbers only (the report never names anyone). */
function problems(report: RemindersReport): string[] {
  const list: string[] = [];
  if (report.notReached > 0) {
    list.push(
      `${count(report.notReached, "person", "people")} not reached before the deadline`,
    );
  }
  if (report.undelivered > 0) {
    list.push(
      `${count(report.undelivered, "notice", "notices")} not delivered to any device`,
    );
  }
  if (report.errors > 0) list.push(count(report.errors, "error", "errors"));
  return list;
}

/**
 * The daily notices (doc 01 §9): Resumo do dia, Contas a vencer, Próxima
 * receita, Resumo semanal and Resumo mensal, once a day each. A second run
 * the same day sends only what the first one left.
 */
export const sendReminders: JobStep = {
  name: "sendReminders",
  async run({ signal, startedAt }) {
    if (!vapidKeys()) {
      return { status: "skipped", reason: "Chaves VAPID não configuradas." };
    }
    const report = await sendDailyReminders({
      now: startedAt,
      signal,
      deadline: startedAt.getTime() + REMINDERS_DEADLINE_MS,
    });
    const found = problems(report);
    return found.length === 0
      ? { status: "ok", details: report }
      : { status: "partial", error: found.join("; "), details: report };
  },
};
