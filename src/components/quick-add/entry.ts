import {
  addDays,
  type CardCycle,
  invoiceFor,
  iso,
  isoMonth,
  localDateIn,
  parse,
  splitInstallments,
} from "@/lib/finance";
import { monthLabel } from "@/lib/format/date";
import { formatBRL } from "@/lib/format/money";
import type { EntryKind, QuickAddDraft } from "@/stores/quick-add";
import { type CalcError, evaluate, validateAmount } from "./calculator";

/**
 * Pure rules of the "Nova transação" form (doc 02 §6.5): dates and status,
 * the card invoice hint, the installment preview, validation and the payload
 * of `createEntryAction`.
 */

export const MIN_INSTALLMENTS = 2;
export const MAX_INSTALLMENTS = 72;

/** Today and yesterday (`YYYY-MM-DD`) in the user's time zone at `now`. */
export function localDays(now: number, timeZone: string) {
  const today = localDateIn(now, timeZone);
  return { today: iso(today), yesterday: iso(addDays(today, -1)) };
}

/** Paid unless chosen otherwise, scheduled when dated after today. */
export function effectivePaid(
  paid: boolean | null,
  date: string,
  today: string,
): boolean {
  return paid ?? date <= today;
}

/** "Pago", "Agendado" (future, not paid) or "Pendente". */
export function statusLabel(
  paid: boolean,
  date: string,
  today: string,
): "Pago" | "Agendado" | "Pendente" {
  if (paid) return "Pago";
  return date > today ? "Agendado" : "Pendente";
}

/**
 * "Entra na fatura de novembro" for a card purchase on `date`; the year is
 * added when the invoice falls in another year ("…de janeiro de 2027").
 */
export function invoiceHint(date: string, cycle: CardCycle): string | null {
  try {
    const { referenceMonth } = invoiceFor(parse(date), cycle);
    const label = monthLabel(isoMonth(referenceMonth));
    const sameYear = referenceMonth.year === parse(date).year;
    return `Entra na fatura de ${sameYear ? label.replace(/ de \d+$/, "") : label}`;
  } catch {
    return null;
  }
}

/** "6x de R$ 99,98" plus "1ª parcela R$ 100,00" when the split leaves cents over. */
export function installmentPreview(
  totalCents: number,
  count: number,
): { each: string; first: string | null } | null {
  if (!Number.isSafeInteger(totalCents) || totalCents < count || count < 2) {
    return null;
  }
  const [first = 0, rest = 0] = splitInstallments(totalCents, count);
  return {
    each: `${count}x de ${formatBRL(rest)}`,
    first: first === rest ? null : `1ª parcela ${formatBRL(first)}`,
  };
}

const KIND_NOUN: Record<EntryKind, string> = {
  expense: "Despesa",
  income: "Receita",
  transfer: "Transferência",
};

/** "Despesa de R$ 64,50 salva", "Transferência de R$ 100,00 feita"… */
export function savedMessage(
  kind: EntryKind,
  amountCents: number,
  options: { installments?: number; scheduled?: boolean } = {},
): string {
  const base = `${KIND_NOUN[kind]} de ${formatBRL(amountCents)}`;
  if (options.scheduled) return `${base} agendada`;
  if (kind === "transfer") return `${base} feita`;
  if (options.installments && options.installments > 1) {
    return `${base} salva em ${options.installments}x`;
  }
  return `${base} salva`;
}

export const SAVE_LABEL: Record<EntryKind, string> = {
  expense: "Salvar despesa",
  income: "Salvar receita",
  transfer: "Transferir",
};

export type EntryPayload =
  | {
      kind: "expense" | "income";
      id: string;
      amountCents: number;
      accountId: string;
      categoryId: string | null;
      description?: string;
      notes: string | null;
      occurredOn: string;
      paid?: boolean;
      installments: number | null;
      recurrence: {
        freq: "weekly" | "monthly" | "yearly";
        endOn: string | null;
      } | null;
    }
  | {
      kind: "transfer";
      id: string;
      amountCents: number;
      fromAccountId: string;
      toAccountId: string;
      description?: string;
      occurredOn: string;
      paid?: boolean;
    };

export type EntryField = "amount" | "account" | "toAccount" | "options";

export type BuildResult =
  | { ok: true; payload: EntryPayload; amountCents: number; scheduled: boolean }
  | { ok: false; field: EntryField; message: string };

type BuildContext = {
  today: string;
  /** Account used when the draft has none (the last one used). */
  defaultAccountId: string | null;
  /** Idempotency key for this attempt. */
  requestId: string;
};

/** Messages of the amount errors (doc 02 §5.5). */
export const AMOUNT_MESSAGES: Record<CalcError, string> = {
  "not-positive": "O valor precisa ser maior que zero",
  "too-large": "Valor alto demais",
};

/** Validates the draft and builds the `createEntryAction` input. */
export function buildEntry(
  draft: QuickAddDraft,
  context: BuildContext,
): BuildResult {
  const amountCents = evaluate(draft.expression);
  if (amountCents === null) {
    return { ok: false, field: "amount", message: "Digite um valor" };
  }
  const amountError = validateAmount(amountCents);
  if (amountError) {
    return {
      ok: false,
      field: "amount",
      message: AMOUNT_MESSAGES[amountError],
    };
  }

  const occurredOn = draft.date ?? context.today;
  const paid = draft.paid ?? undefined;
  const scheduled = !effectivePaid(draft.paid, occurredOn, context.today);
  const description = draft.description.trim() || undefined;
  const fromAccountId = draft.accountId ?? context.defaultAccountId;

  if (draft.kind === "transfer") {
    if (!fromAccountId) {
      return {
        ok: false,
        field: "account",
        message: "Escolha a conta de origem",
      };
    }
    if (!draft.toAccountId) {
      return {
        ok: false,
        field: "toAccount",
        message: "Escolha a conta de destino",
      };
    }
    if (draft.toAccountId === fromAccountId) {
      return {
        ok: false,
        field: "toAccount",
        message: "Escolha contas diferentes para a transferência",
      };
    }
    return {
      ok: true,
      amountCents,
      scheduled,
      payload: {
        kind: "transfer",
        id: context.requestId,
        amountCents,
        fromAccountId,
        toAccountId: draft.toAccountId,
        description,
        occurredOn,
        paid,
      },
    };
  }

  if (!fromAccountId) {
    return { ok: false, field: "account", message: "Escolha uma conta" };
  }

  const installments =
    draft.kind === "expense" && draft.installments >= MIN_INSTALLMENTS
      ? Math.min(draft.installments, MAX_INSTALLMENTS)
      : null;
  if (installments !== null && amountCents < installments) {
    return {
      ok: false,
      field: "options",
      message: `O valor é baixo demais para parcelar em ${installments}x`,
    };
  }

  const recurrence =
    installments === null && draft.repeat !== "never"
      ? { freq: draft.repeat, endOn: draft.repeatEndOn }
      : null;
  if (recurrence?.endOn && recurrence.endOn < occurredOn) {
    return {
      ok: false,
      field: "options",
      message: "O fim da repetição precisa ser depois da data do lançamento",
    };
  }

  return {
    ok: true,
    amountCents,
    scheduled,
    payload: {
      kind: draft.kind,
      id: context.requestId,
      amountCents,
      accountId: fromAccountId,
      categoryId:
        (draft.kind === "expense"
          ? draft.expenseCategoryId
          : draft.incomeCategoryId) ?? null,
      description,
      notes: draft.notes.trim() || null,
      occurredOn,
      paid,
      installments,
      recurrence,
    },
  };
}
