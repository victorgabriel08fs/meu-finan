// Administração › Rotina diária (doc 02 §6.17), pure: a row of job_runs
// becomes the words the screen shows (origin, status, steps in pt-BR), and
// the list of runs becomes "is the cron alive?".
import { deadlineLabel } from "@/lib/format/datetime";

export type RunTrigger = "cron" | "manual" | "admin";

export type StepInput = {
  name: string;
  status: "ok" | "partial" | "failed" | "skipped";
  durationMs: number;
  details?: { [key: string]: unknown };
  reason?: string;
  error?: string;
};

export type RunInput = {
  /** job_runs.status. */
  status: "running" | "ok" | "partial" | "failed";
  /** ISO timestamps. */
  startedAt: string;
  finishedAt: string | null;
  report: {
    durationMs: number;
    steps: StepInput[];
    trigger?: RunTrigger;
    rejected?: "unauthorized";
  } | null;
};

export const STEP_LABELS: Record<string, string> = {
  materializeRecurrences: "Lançamentos recorrentes",
  rollInvoices: "Faturas",
  syncMarketRates: "Índices do Banco Central",
  syncHolidays: "Feriados (BrasilAPI)",
  snapshotBalances: "Saldos de fim de mês",
  sendReminders: "Avisos por push",
  purgeDeleted: "Limpeza de excluídos",
};

export const TRIGGER_LABELS: Record<RunTrigger, string> = {
  cron: "Automática (Vercel)",
  manual: "Manual (curl)",
  admin: "Botão Rodar agora",
};

export const UNKNOWN_ORIGIN = "Origem não registrada";

/** A run still "running" after this long died without recording its end. */
export const INTERRUPTED_AFTER_MS = 6 * 60_000;

/** The cron is late once its last run is this old (daily, plus a margin). */
export const STALE_AFTER_MS = 26 * 3_600_000;

export type Tone = "neutral" | "primary" | "warning" | "danger";

export type RunStatusKey =
  | "ok"
  | "partial"
  | "failed"
  | "running"
  | "interrupted"
  | "rejected";

export const RUN_STATUS: Record<RunStatusKey, { label: string; tone: Tone }> = {
  ok: { label: "Ok", tone: "primary" },
  partial: { label: "Parcial", tone: "warning" },
  failed: { label: "Falhou", tone: "danger" },
  running: { label: "Em andamento", tone: "neutral" },
  interrupted: { label: "Interrompida", tone: "danger" },
  rejected: { label: "Recusada (segredo)", tone: "danger" },
};

export const STEP_STATUS: Record<
  StepInput["status"],
  { label: string; tone: Tone }
> = {
  ok: { label: "Ok", tone: "primary" },
  partial: { label: "Parcial", tone: "warning" },
  failed: { label: "Falhou", tone: "danger" },
  skipped: { label: "Pulado", tone: "neutral" },
};

/** "12 s", "1 min 4 s", "2 min". */
export function durationLabel(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total} s`;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds} s`;
}

const count = (value: number, one: string, many: string) =>
  `${value} ${value === 1 ? one : many}`;

type Loose = { [key: string]: unknown };

function asRecord(value: unknown): Loose | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Loose)
    : undefined;
}

function numberOf(source: Loose | undefined, key: string): number {
  const value = source?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

const SENT_LABELS: [key: string, one: string, many: string][] = [
  ["daily_summary", "Resumo do dia enviado", "Resumos do dia enviados"],
  ["bills_due", "Contas a vencer enviadas", "Contas a vencer enviadas"],
  [
    "non_business_due",
    "Aviso de dia não útil enviado",
    "Avisos de dia não útil enviados",
  ],
  ["income_countdown", "Próxima receita enviada", "Próximas receitas enviadas"],
  ["weekly_summary", "Resumo semanal enviado", "Resumos semanais enviados"],
  ["monthly_summary", "Resumo mensal enviado", "Resumos mensais enviados"],
];

/** What the notices step did, from its numbers; nothing for malformed details. */
export function describeReminders(details: unknown): string[] {
  const source = asRecord(details);
  if (!source) return [];
  const lines: string[] = [];
  const recipients = numberOf(source, "recipients");
  lines.push(
    recipients === 0
      ? "Ninguém tinha aviso ligado."
      : `${count(recipients, "pessoa", "pessoas")} com avisos ligados`,
  );

  const sent = asRecord(source.sent);
  let total = 0;
  const sentLines: string[] = [];
  for (const [key, one, many] of SENT_LABELS) {
    const n = numberOf(sent, key);
    total += n;
    if (n > 0) sentLines.push(`${n} ${n === 1 ? one : many}`);
  }
  if (total === 0) lines.push("Nenhum aviso enviado nesta execução.");
  else lines.push(...sentLines);

  const already = numberOf(source, "alreadySent");
  if (already > 0) {
    lines.push(
      `${count(already, "aviso", "avisos")} já ${already === 1 ? "tinha" : "tinham"} saído hoje`,
    );
  }
  const nothing = numberOf(source, "nothingToSend");
  if (nothing > 0) lines.push(`${nothing} sem nada a dizer hoje`);
  const bellOnly = numberOf(source, "bellOnly");
  if (bellOnly > 0) lines.push(`${bellOnly} só no sino`);
  const undelivered = numberOf(source, "undelivered");
  if (undelivered > 0) {
    lines.push(
      undelivered === 1
        ? "1 não entregue em nenhum aparelho (fica para a próxima execução)"
        : `${undelivered} não entregues em nenhum aparelho (ficam para a próxima execução)`,
    );
  }
  const removed = numberOf(source, "devicesRemoved");
  if (removed > 0) {
    lines.push(
      `${count(removed, "aparelho removido", "aparelhos removidos")} (o serviço de push disse que não existe mais)`,
    );
  }
  const notReached = numberOf(source, "notReached");
  if (notReached > 0) {
    lines.push(
      `${count(notReached, "pessoa ficou", "pessoas ficaram")} para a próxima execução (acabou o prazo)`,
    );
  }
  const errors = numberOf(source, "errors");
  if (errors > 0) lines.push(count(errors, "erro", "erros"));
  return lines;
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

const kept = (days: number) =>
  days > 0 ? ` (guardados por ${plural(days, "dia", "dias")})` : "";

const joinYears = (years: number[]) =>
  years.length <= 1
    ? years.join("")
    : `${years.slice(0, -1).join(", ")} e ${years.at(-1)}`;

/** "Feriados de 2026 e 2027 em dia", "Feriados de 2027 atualizados (13)", "Feriados de 2027: não deu para buscar". */
function describeHolidayYears(years: unknown[]): string[] {
  const fresh: number[] = [];
  const notes: string[] = [];
  for (const item of years) {
    const entry = asRecord(item);
    const year = entry?.year;
    if (typeof year !== "number") continue;
    if (entry?.status === "fresh") fresh.push(year);
    else if (entry?.status === "updated") {
      notes.push(
        `Feriados de ${year} atualizados (${numberOf(entry, "holidays")})`,
      );
    } else if (entry?.status === "error") {
      notes.push(`Feriados de ${year}: não deu para buscar`);
    }
  }
  if (fresh.length > 0) notes.unshift(`Feriados de ${joinYears(fresh)} em dia`);
  return notes;
}

/** The numbers of the other steps in words; what is not known is left out. */
function describeCounters(name: string, details: unknown): string[] {
  const source = asRecord(details);
  if (!source) return [];
  const has = (key: string) => typeof source[key] === "number";
  const notes: string[] = [];
  if (name === "materializeRecurrences" && has("created")) {
    const n = numberOf(source, "created");
    notes.push(
      n === 0
        ? "Nenhum lançamento recorrente criado"
        : plural(
            n,
            "lançamento recorrente criado",
            "lançamentos recorrentes criados",
          ),
    );
  }
  if (name === "syncMarketRates" && has("changedRows")) {
    const n = numberOf(source, "changedRows");
    notes.push(
      n === 0
        ? "Nenhum índice mudou"
        : plural(n, "índice atualizado", "índices atualizados"),
    );
  }
  if (name === "syncHolidays" && Array.isArray(source.years)) {
    notes.push(...describeHolidayYears(source.years));
  }
  if (name === "purgeDeleted") {
    if (has("purgedTransactions")) {
      const n = numberOf(source, "purgedTransactions");
      const days = kept(numberOf(source, "retentionDays"));
      notes.push(
        n === 0
          ? `Nenhum lançamento excluído apagado${days}`
          : `${plural(n, "lançamento excluído apagado", "lançamentos excluídos apagados")}${days}`,
      );
    }
    if (has("purgedNotifications")) {
      const n = numberOf(source, "purgedNotifications");
      const days = kept(numberOf(source, "notificationRetentionDays"));
      notes.push(
        n === 0
          ? `Nenhum aviso lido apagado${days}`
          : `${plural(n, "aviso lido apagado", "avisos lidos apagados")}${days}`,
      );
    }
  }
  return notes;
}

export type StepLine = {
  name: string;
  label: string;
  status: StepInput["status"];
  statusLabel: string;
  tone: Tone;
  durationLabel: string;
  /** Plain pt-BR lines: why it was skipped, or what it did. */
  notes: string[];
  /** The error as it came (technical, shown apart). */
  error?: string;
};

export function describeStep(step: StepInput): StepLine {
  const notes: string[] = [];
  if (step.status === "skipped" && step.reason) notes.push(step.reason);
  if (step.name === "sendReminders") {
    notes.push(...describeReminders(step.details));
  } else {
    notes.push(...describeCounters(step.name, step.details));
  }
  return {
    name: step.name,
    label: STEP_LABELS[step.name] ?? step.name,
    status: step.status,
    statusLabel: STEP_STATUS[step.status].label,
    tone: STEP_STATUS[step.status].tone,
    durationLabel: durationLabel(step.durationMs),
    notes,
    error: step.error,
  };
}

export type RunLine = {
  status: RunStatusKey;
  statusLabel: string;
  tone: Tone;
  origin: string;
  /** "sáb, 08/nov, 06:12". */
  when: string;
  /** Null while it runs (or died), and for a refused call. */
  durationLabel: string | null;
  steps: StepLine[];
};

export function runStatusOf(
  run: RunInput,
  now: Date | string | number,
): RunStatusKey {
  if (run.report?.rejected) return "rejected";
  if (run.status === "running") {
    const age = new Date(now).getTime() - new Date(run.startedAt).getTime();
    return age > INTERRUPTED_AFTER_MS ? "interrupted" : "running";
  }
  return run.status;
}

export function describeRun(
  run: RunInput,
  now: Date | string | number,
): RunLine {
  const status = runStatusOf(run, now);
  const trigger = run.report?.trigger;
  const finished = status !== "running" && status !== "interrupted";
  return {
    status,
    statusLabel: RUN_STATUS[status].label,
    tone: RUN_STATUS[status].tone,
    origin: trigger ? TRIGGER_LABELS[trigger] : UNKNOWN_ORIGIN,
    when: deadlineLabel(run.startedAt, now),
    durationLabel:
      finished && run.report && status !== "rejected"
        ? durationLabel(run.report.durationMs)
        : null,
    steps: (run.report?.steps ?? []).map(describeStep),
  };
}

export type CronHealth =
  | { state: "ok"; at: string }
  | { state: "stale"; at: string }
  | { state: "failed"; at: string }
  | { state: "rejected"; at: string }
  | { state: "never" };

/**
 * Is the cron alive? Looks at the newest automatic run: `trigger: "cron"`, or
 * no trigger at all (rows from before the origin was kept). Runs by hand and
 * by the button say nothing about the cron. `runs` come in any order.
 */
export function cronHealth(
  runs: readonly RunInput[],
  now: Date | string | number,
): CronHealth {
  let latest: RunInput | undefined;
  for (const run of runs) {
    const trigger = run.report?.trigger;
    if (trigger !== undefined && trigger !== "cron") continue;
    if (!latest || run.startedAt > latest.startedAt) latest = run;
  }
  if (!latest) return { state: "never" };
  if (latest.report?.rejected) {
    return { state: "rejected", at: latest.startedAt };
  }
  const age = new Date(now).getTime() - new Date(latest.startedAt).getTime();
  if (age >= STALE_AFTER_MS) return { state: "stale", at: latest.startedAt };
  const status = runStatusOf(latest, now);
  const failed = status === "failed" || status === "interrupted";
  return { state: failed ? "failed" : "ok", at: latest.startedAt };
}
