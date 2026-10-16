import type { JobStep } from "../runner";

/**
 * Steps of the daily job whose features ship in later phases (docs/01 §9, §16).
 * They are part of the run so its report always lists the full sequence, and
 * they say why they did nothing instead of pretending to succeed.
 */
function laterPhase(name: string, reason: string): JobStep {
  return { name, run: () => Promise.resolve({ status: "skipped", reason }) };
}

export const rollInvoices = laterPhase(
  "rollInvoices",
  "Faturas de cartão de crédito chegam na fase F2.",
);

export const snapshotBalances = laterPhase(
  "snapshotBalances",
  "O histórico de saldos (patrimônio) chega na fase F3.",
);

export const sendReminders = laterPhase(
  "sendReminders",
  "Lembretes por push e e-mail chegam na fase F3.",
);
