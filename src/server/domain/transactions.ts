// Ledger entries (doc 01 §6.1): signed amounts per account, transfers as two
// legs, installments and recurrences materialised as rows, card purchases
// attached to their invoice.
import {
  and,
  between,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  ne,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import {
  addDays,
  addMonths,
  type CardCycle,
  compare,
  installmentSchedule,
  invoiceFor,
  invoiceForReferenceMonth,
  iso,
  type LocalDate,
  maxDate,
  occurrencesBetween,
  parse,
} from "@/lib/finance";
import { db, type Executor } from "@/server/db/client";
import {
  categories,
  finAccounts,
  installmentPlans,
  type RecurrenceFreq,
  recurrences,
  type TxnKind,
  type TxnStatus,
  transactions,
} from "@/server/db/schema";
import { requireAccount } from "./accounts";
import { ensureInvoice } from "./cards";
import { requireCategory } from "./categories";
import type { UserContext } from "./context";
import { DomainError, notFound } from "./errors";

/** Days of recurring entries created ahead of time (the cron extends it). */
export const RECURRENCE_HORIZON_DAYS = 60;
export const MAX_INSTALLMENTS = 72;

export type RecurrenceInput = {
  freq: "weekly" | "monthly" | "yearly";
  interval?: number;
  endOn?: string | null;
};

export type TransactionInput = {
  /** Client-generated UUID: resubmitting the same id creates nothing new. */
  id?: string;
  kind: "expense" | "income";
  /** Magnitude in cents (> 0); the sign comes from `kind`. */
  amountCents: number;
  accountId: string;
  categoryId: string | null;
  description?: string;
  notes?: string | null;
  occurredOn: string;
  /** Defaults to paid when dated today or earlier. */
  paid?: boolean;
  installments?: number | null;
  recurrence?: RecurrenceInput | null;
};

const statusFor = (
  date: LocalDate,
  today: LocalDate,
  explicit?: boolean,
): TxnStatus => ((explicit ?? compare(date, today) <= 0) ? "paid" : "pending");

function assertAmount(amountCents: number) {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new DomainError("O valor precisa ser maior que zero.");
  }
}

/**
 * Idempotent replay: when the client resubmits an id that already exists,
 * returns every row created with it (all installments or occurrences), so
 * "Desfazer" still discards the whole entry. Null when the id is new.
 */
async function idsCreatedWith(
  tx: Executor,
  ctx: UserContext,
  id: string,
): Promise<string[] | null> {
  const [existing] = await tx
    .select({
      id: transactions.id,
      planId: transactions.installmentPlanId,
      recurrenceId: transactions.recurrenceId,
    })
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, ctx.userId)))
    .limit(1);
  if (!existing) return null;
  const sibling = existing.planId
    ? eq(transactions.installmentPlanId, existing.planId)
    : existing.recurrenceId
      ? eq(transactions.recurrenceId, existing.recurrenceId)
      : null;
  if (!sibling) return [existing.id];
  const rows = await tx
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.userId, ctx.userId), sibling));
  return rows.map((row) => row.id);
}

export async function createTransaction(
  ctx: UserContext,
  input: TransactionInput,
): Promise<{ ids: string[] }> {
  assertAmount(input.amountCents);
  const date = parse(input.occurredOn);
  const installments = input.installments ?? 1;
  if (installments < 1 || installments > MAX_INSTALLMENTS) {
    throw new DomainError(`Parcele em até ${MAX_INSTALLMENTS} vezes.`);
  }
  if (installments > 1 && input.recurrence) {
    throw new DomainError("Escolha parcelar ou repetir, não os dois.");
  }

  return db.transaction(async (tx) => {
    if (input.id) {
      const replay = await idsCreatedWith(tx, ctx, input.id);
      if (replay) return { ids: replay };
    }

    const account = await requireAccount(tx, ctx.userId, input.accountId);
    const category = input.categoryId
      ? await requireCategory(tx, ctx.userId, input.categoryId, input.kind)
      : null;
    const description =
      input.description?.trim() ||
      category?.name ||
      (input.kind === "expense" ? "Despesa" : "Receita");
    const signed =
      input.kind === "expense" ? -input.amountCents : input.amountCents;
    const base = {
      userId: ctx.userId,
      accountId: account.id,
      categoryId: category?.id ?? null,
      kind: input.kind as TxnKind,
      description,
      notes: input.notes?.trim() || null,
    };
    const invoiceForDate = async (d: LocalDate) =>
      account.cycle
        ? ensureInvoice(
            tx,
            ctx.userId,
            account.id,
            invoiceFor(d, account.cycle),
          )
        : null;
    const rows: (typeof transactions.$inferInsert)[] = [];

    if (installments > 1) {
      if (input.kind !== "expense") {
        throw new DomainError("Só despesas podem ser parceladas.");
      }
      const planId = uuidv7();
      await tx.insert(installmentPlans).values({
        id: planId,
        userId: ctx.userId,
        accountId: account.id,
        description,
        totalCents: input.amountCents,
        count: installments,
        firstDate: input.occurredOn,
      });
      const schedule = installmentSchedule(
        date,
        signed,
        installments,
        account.cycle ?? undefined,
      );
      for (const item of schedule) {
        const status =
          item.number === 1
            ? statusFor(item.occurredOn, ctx.today, input.paid)
            : statusFor(item.occurredOn, ctx.today);
        rows.push({
          ...base,
          id: item.number === 1 ? (input.id ?? uuidv7()) : uuidv7(),
          amountCents: item.amountCents,
          occurredOn: iso(item.occurredOn),
          status,
          paidAt: status === "paid" ? new Date() : null,
          installmentPlanId: planId,
          installmentNumber: item.number,
          invoiceId:
            account.cycle && item.invoiceMonth
              ? await ensureInvoice(
                  tx,
                  ctx.userId,
                  account.id,
                  invoiceForReferenceMonth(item.invoiceMonth, account.cycle),
                )
              : null,
        });
      }
    } else if (input.recurrence) {
      const recurrence = input.recurrence;
      const interval = recurrence.interval ?? 1;
      const end = recurrence.endOn ? parse(recurrence.endOn) : undefined;
      if (end && compare(end, date) < 0) {
        throw new DomainError(
          "O fim da repetição precisa ser depois do início.",
        );
      }
      const rule = {
        freq: recurrence.freq,
        interval,
        start: date,
        end,
        byMonthDay: recurrence.freq === "weekly" ? undefined : date.day,
      };
      const horizon = maxDate(
        addDays(ctx.today, RECURRENCE_HORIZON_DAYS),
        date,
      );
      const dates = occurrencesBetween(rule, date, horizon);
      const recurrenceId = uuidv7();
      await tx.insert(recurrences).values({
        id: recurrenceId,
        userId: ctx.userId,
        accountId: account.id,
        categoryId: category?.id ?? null,
        kind: input.kind,
        amountCents: signed,
        description,
        freq: recurrence.freq,
        interval,
        byMonthDay: rule.byMonthDay ?? null,
        startOn: input.occurredOn,
        endOn: recurrence.endOn ?? null,
        generatedUntil: iso(horizon),
      });
      for (const [index, occurrence] of dates.entries()) {
        const status =
          index === 0
            ? statusFor(occurrence, ctx.today, input.paid)
            : statusFor(occurrence, ctx.today);
        rows.push({
          ...base,
          id: index === 0 ? (input.id ?? uuidv7()) : uuidv7(),
          amountCents: signed,
          occurredOn: iso(occurrence),
          status,
          paidAt: status === "paid" ? new Date() : null,
          recurrenceId,
          invoiceId: await invoiceForDate(occurrence),
        });
      }
    } else {
      const status = statusFor(date, ctx.today, input.paid);
      rows.push({
        ...base,
        id: input.id ?? uuidv7(),
        amountCents: signed,
        occurredOn: input.occurredOn,
        status,
        paidAt: status === "paid" ? new Date() : null,
        invoiceId: await invoiceForDate(date),
      });
    }

    await tx.insert(transactions).values(rows);
    return { ids: rows.map((row) => row.id as string) };
  });
}

/**
 * The invoice a payment made on `date` settles: the closed invoice still
 * waiting for its due date, otherwise the open one.
 */
export function invoiceDueNext(date: LocalDate, cycle: CardCycle) {
  const next = invoiceFor(date, cycle);
  const previous = invoiceForReferenceMonth(
    addMonths(next.referenceMonth, -1),
    cycle,
  );
  return compare(previous.dueDate, date) >= 0 ? previous : next;
}

export type TransferInput = {
  id?: string;
  fromAccountId: string;
  toAccountId: string;
  amountCents: number;
  occurredOn: string;
  description?: string;
  paid?: boolean;
};

export async function createTransfer(
  ctx: UserContext,
  input: TransferInput,
): Promise<{ transferId: string }> {
  assertAmount(input.amountCents);
  if (input.fromAccountId === input.toAccountId) {
    throw new DomainError("Escolha contas diferentes para a transferência.");
  }
  const date = parse(input.occurredOn);
  return db.transaction(async (tx) => {
    if (input.id) {
      // Idempotent replay of the same client id: the transfer already exists.
      const [existing] = await tx
        .select({ transferId: transactions.transferId })
        .from(transactions)
        .where(
          and(
            eq(transactions.id, input.id),
            eq(transactions.userId, ctx.userId),
          ),
        )
        .limit(1);
      if (existing?.transferId) return { transferId: existing.transferId };
      if (existing) throw new DomainError("Este lançamento já existe.");
    }
    const from = await requireAccount(tx, ctx.userId, input.fromAccountId);
    const to = await requireAccount(tx, ctx.userId, input.toAccountId);
    const status = statusFor(date, ctx.today, input.paid);
    const paidAt = status === "paid" ? new Date() : null;
    const transferId = uuidv7();
    // Into a card: the payment counts for the invoice that is due next.
    const invoiceId = to.cycle
      ? await ensureInvoice(
          tx,
          ctx.userId,
          to.id,
          invoiceDueNext(date, to.cycle),
        )
      : null;
    await tx.insert(transactions).values([
      {
        id: input.id ?? uuidv7(),
        userId: ctx.userId,
        accountId: from.id,
        kind: "transfer",
        status,
        amountCents: -input.amountCents,
        description: input.description?.trim() || `Para ${to.name}`,
        occurredOn: input.occurredOn,
        paidAt,
        transferId,
      },
      {
        id: uuidv7(),
        userId: ctx.userId,
        accountId: to.id,
        kind: "transfer",
        status,
        amountCents: input.amountCents,
        description: input.description?.trim() || `De ${from.name}`,
        occurredOn: input.occurredOn,
        paidAt,
        transferId,
        invoiceId,
      },
    ]);
    return { transferId };
  });
}

export type TransactionFilters = {
  start: string;
  end: string;
  accountId?: string;
  categoryId?: string;
  kind?: TxnKind;
  status?: TxnStatus;
  q?: string;
  limit?: number;
};

export type TransactionListItem = {
  id: string;
  description: string;
  amountCents: number;
  kind: TxnKind;
  status: TxnStatus;
  occurredOn: string;
  accountId: string;
  accountName: string;
  accountType: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  transferId: string | null;
  counterpartName: string | null;
  /** `totalCents` is the whole purchase (positive). */
  installment: { number: number; count: number; totalCents: number } | null;
  recurring: boolean;
  recurrence: RecurrenceRule | null;
  notes: string | null;
};

export type RecurrenceRule = {
  freq: RecurrenceFreq;
  interval: number;
  /** 31 means the last day of the month. */
  byMonthDay: number | null;
  endOn: string | null;
};

const counterpart = alias(transactions, "counterpart");
const counterpartAccount = alias(finAccounts, "counterpart_account");

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Accent- and case-insensitive substring match, plus trigram similarity for typos. */
export function descriptionMatches(q: string): SQL {
  const needle = `%${escapeLike(q.trim().toLowerCase())}%`;
  return sql`(f_unaccent(lower(${transactions.description})) like f_unaccent(${needle})
    or f_unaccent(lower(${transactions.description})) % f_unaccent(${q.trim().toLowerCase()}))`;
}

export async function listTransactions(
  ctx: UserContext,
  filters: TransactionFilters,
): Promise<{ items: TransactionListItem[]; hasMore: boolean }> {
  const limit = filters.limit ?? 400;
  const conditions: (SQL | undefined)[] = [
    eq(transactions.userId, ctx.userId),
    isNull(transactions.deletedAt),
    between(transactions.occurredOn, filters.start, filters.end),
    filters.accountId
      ? eq(transactions.accountId, filters.accountId)
      : undefined,
    // Without an account filter a transfer shows once, as its outgoing leg.
    filters.accountId
      ? undefined
      : or(ne(transactions.kind, "transfer"), lt(transactions.amountCents, 0)),
    filters.categoryId
      ? eq(transactions.categoryId, filters.categoryId)
      : undefined,
    filters.kind ? eq(transactions.kind, filters.kind) : undefined,
    filters.status ? eq(transactions.status, filters.status) : undefined,
    filters.q?.trim() ? descriptionMatches(filters.q) : undefined,
  ];

  const rows = await db
    .select({
      id: transactions.id,
      description: transactions.description,
      amountCents: transactions.amountCents,
      kind: transactions.kind,
      status: transactions.status,
      occurredOn: transactions.occurredOn,
      accountId: transactions.accountId,
      accountName: finAccounts.name,
      accountType: finAccounts.type,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      categoryColor: categories.color,
      transferId: transactions.transferId,
      counterpartName: counterpartAccount.name,
      installmentNumber: transactions.installmentNumber,
      installmentCount: installmentPlans.count,
      installmentTotalCents: installmentPlans.totalCents,
      recurrenceId: transactions.recurrenceId,
      recurrenceFreq: recurrences.freq,
      recurrenceInterval: recurrences.interval,
      recurrenceByMonthDay: recurrences.byMonthDay,
      recurrenceEndOn: recurrences.endOn,
      notes: transactions.notes,
    })
    .from(transactions)
    .innerJoin(finAccounts, eq(finAccounts.id, transactions.accountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .leftJoin(
      installmentPlans,
      eq(installmentPlans.id, transactions.installmentPlanId),
    )
    .leftJoin(recurrences, eq(recurrences.id, transactions.recurrenceId))
    .leftJoin(
      counterpart,
      and(
        eq(counterpart.transferId, transactions.transferId),
        ne(counterpart.id, transactions.id),
      ),
    )
    .leftJoin(
      counterpartAccount,
      eq(counterpartAccount.id, counterpart.accountId),
    )
    .where(and(...conditions))
    .orderBy(desc(transactions.occurredOn), desc(transactions.createdAt))
    .limit(limit + 1);

  return {
    items: rows.slice(0, limit).map((row) => ({
      id: row.id,
      description: row.description,
      amountCents: row.amountCents,
      kind: row.kind,
      status: row.status,
      occurredOn: row.occurredOn,
      accountId: row.accountId,
      accountName: row.accountName,
      accountType: row.accountType,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      categoryIcon: row.categoryIcon,
      categoryColor: row.categoryColor,
      transferId: row.transferId,
      counterpartName: row.counterpartName,
      installment:
        row.installmentNumber !== null &&
        row.installmentCount !== null &&
        row.installmentTotalCents !== null
          ? {
              number: row.installmentNumber,
              count: row.installmentCount,
              totalCents: row.installmentTotalCents,
            }
          : null,
      recurring: row.recurrenceId !== null,
      recurrence:
        row.recurrenceFreq !== null && row.recurrenceInterval !== null
          ? {
              freq: row.recurrenceFreq,
              interval: row.recurrenceInterval,
              byMonthDay: row.recurrenceByMonthDay,
              endOn: row.recurrenceEndOn,
            }
          : null,
      notes: row.notes,
    })),
    hasMore: rows.length > limit,
  };
}

export async function getTransaction(
  ctx: UserContext,
  id: string,
): Promise<TransactionListItem | null> {
  const [row] = await db
    .select({
      occurredOn: transactions.occurredOn,
      accountId: transactions.accountId,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.id, id),
        eq(transactions.userId, ctx.userId),
        isNull(transactions.deletedAt),
      ),
    )
    .limit(1);
  if (!row) return null;
  const { items } = await listTransactions(ctx, {
    start: row.occurredOn,
    end: row.occurredOn,
    accountId: row.accountId,
  });
  return items.find((item) => item.id === id) ?? null;
}

export type PeriodTotals = {
  incomeCents: number;
  /** Magnitude (positive). */
  expenseCents: number;
  pendingIncomeCents: number;
  pendingExpenseCents: number;
};

/** Income and expenses in [start, end], transfers and adjustments excluded. */
export async function periodTotals(
  ctx: UserContext,
  start: string,
  end: string,
  accountId?: string,
): Promise<PeriodTotals> {
  const sumWhere = (kind: "income" | "expense", status: TxnStatus) =>
    sql<number>`coalesce(sum(${transactions.amountCents}) filter (where ${transactions.kind} = ${kind} and ${transactions.status} = ${status}), 0)`.mapWith(
      Number,
    );
  const [row] = await db
    .select({
      income: sumWhere("income", "paid"),
      expense: sumWhere("expense", "paid"),
      pendingIncome: sumWhere("income", "pending"),
      pendingExpense: sumWhere("expense", "pending"),
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, ctx.userId),
        isNull(transactions.deletedAt),
        between(transactions.occurredOn, start, end),
        accountId ? eq(transactions.accountId, accountId) : undefined,
      ),
    );
  return {
    incomeCents: row?.income ?? 0,
    expenseCents: -(row?.expense ?? 0),
    pendingIncomeCents: row?.pendingIncome ?? 0,
    pendingExpenseCents: -(row?.pendingExpense ?? 0),
  };
}

/** Pending entries in non-card accounts up to `until` (overdue ones included). */
export async function pendingEntries(ctx: UserContext, until: string) {
  return db
    .select({
      id: transactions.id,
      description: transactions.description,
      amountCents: transactions.amountCents,
      kind: transactions.kind,
      occurredOn: transactions.occurredOn,
      accountId: transactions.accountId,
      accountName: finAccounts.name,
      accountType: finAccounts.type,
      includeInNetWorth: finAccounts.includeInNetWorth,
      categoryIcon: categories.icon,
      categoryColor: categories.color,
      transferId: transactions.transferId,
    })
    .from(transactions)
    .innerJoin(finAccounts, eq(finAccounts.id, transactions.accountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        eq(transactions.userId, ctx.userId),
        isNull(transactions.deletedAt),
        eq(transactions.status, "pending"),
        lte(transactions.occurredOn, until),
      ),
    )
    .orderBy(transactions.occurredOn);
}

async function requireOwnedTransaction(
  tx: Executor,
  ctx: UserContext,
  id: string,
) {
  const [row] = await tx
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.id, id),
        eq(transactions.userId, ctx.userId),
        isNull(transactions.deletedAt),
      ),
    )
    .limit(1);
  if (!row) throw notFound("Lançamento");
  return row;
}

export type TransactionPatch = {
  description?: string;
  amountCents?: number;
  categoryId?: string | null;
  accountId?: string;
  occurredOn?: string;
  notes?: string | null;
  paid?: boolean;
};

/** "Só este", "Este e os próximos" or "Todos" for installments and recurrences. */
export type EditScope = "this" | "future" | "all";

/**
 * Edits an entry; transfers keep both legs in sync. For an installment or a
 * recurring entry, `scope` carries the change to the rest of the series (see
 * `updateSeries`).
 */
export async function updateTransaction(
  ctx: UserContext,
  id: string,
  patch: TransactionPatch,
  scope: EditScope = "this",
): Promise<void> {
  if (patch.amountCents !== undefined) assertAmount(patch.amountCents);
  await db.transaction(async (tx) => {
    const row = await requireOwnedTransaction(tx, ctx, id);
    if (scope !== "this" && (row.installmentPlanId || row.recurrenceId)) {
      await updateSeries(tx, ctx, row, patch, scope);
      return;
    }
    const occurredOn = patch.occurredOn ?? row.occurredOn;
    const date = parse(occurredOn);
    const status =
      patch.paid === undefined ? row.status : patch.paid ? "paid" : "pending";
    const paidAt = status === "paid" ? (row.paidAt ?? new Date()) : null;

    if (row.kind === "transfer") {
      if (patch.accountId && patch.accountId !== row.accountId) {
        throw new DomainError(
          "Para mudar as contas, exclua e crie a transferência de novo.",
        );
      }
      const magnitude = patch.amountCents ?? Math.abs(row.amountCents);
      const legs = await tx
        .select({ id: transactions.id, amountCents: transactions.amountCents })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, ctx.userId),
            eq(transactions.transferId, row.transferId as string),
          ),
        );
      for (const leg of legs) {
        await tx
          .update(transactions)
          .set({
            amountCents: leg.amountCents < 0 ? -magnitude : magnitude,
            occurredOn,
            status,
            paidAt,
            ...(leg.id === row.id && patch.description !== undefined
              ? { description: patch.description.trim() || row.description }
              : {}),
            ...(patch.notes !== undefined
              ? { notes: patch.notes?.trim() || null }
              : {}),
          })
          .where(eq(transactions.id, leg.id));
      }
      return;
    }

    const kind = row.kind === "income" ? "income" : "expense";
    const account = await requireAccount(
      tx,
      ctx.userId,
      patch.accountId ?? row.accountId,
    );
    const categoryId =
      patch.categoryId === undefined ? row.categoryId : patch.categoryId;
    if (
      categoryId &&
      patch.categoryId !== undefined &&
      row.kind !== "adjustment"
    ) {
      await requireCategory(tx, ctx.userId, categoryId, kind);
    }
    const magnitude = patch.amountCents ?? Math.abs(row.amountCents);
    // A card entry follows its date and account to the right invoice.
    let invoiceId = account.cycle ? row.invoiceId : null;
    if (
      account.cycle &&
      (account.id !== row.accountId ||
        occurredOn !== row.occurredOn ||
        !row.invoiceId)
    ) {
      invoiceId = await ensureInvoice(
        tx,
        ctx.userId,
        account.id,
        invoiceFor(date, account.cycle),
      );
    }

    await tx
      .update(transactions)
      .set({
        accountId: account.id,
        categoryId,
        amountCents:
          row.kind === "adjustment"
            ? row.amountCents
            : row.amountCents < 0 || kind === "expense"
              ? -magnitude
              : magnitude,
        description:
          patch.description !== undefined
            ? patch.description.trim() || row.description
            : row.description,
        notes:
          patch.notes !== undefined ? patch.notes?.trim() || null : row.notes,
        occurredOn,
        status,
        paidAt,
        invoiceId,
      })
      .where(eq(transactions.id, row.id));
  });
}

/**
 * Series edit (doc 03 §10.1). "future" covers this entry and the later ones,
 * "all" every one. Installments share description, category and note, but
 * keep their amount and account (delete the purchase and enter it again
 * instead). A recurrence also changes its rule, and its paid entries other
 * than this one keep their values; "future" from a later occurrence splits
 * the rule: the old one ends the day before and a new one takes over from
 * here. Dates change one entry at a time.
 */
async function updateSeries(
  tx: Executor,
  ctx: UserContext,
  row: typeof transactions.$inferSelect,
  patch: TransactionPatch,
  scope: "future" | "all",
): Promise<void> {
  if (patch.occurredOn !== undefined && patch.occurredOn !== row.occurredOn) {
    throw new DomainError("Para mudar a data, altere só este lançamento.");
  }
  if (patch.paid !== undefined) {
    throw new DomainError("Marque como pago um lançamento de cada vez.");
  }
  const kind = row.kind === "income" ? "income" : "expense";
  if (patch.categoryId) {
    await requireCategory(tx, ctx.userId, patch.categoryId, kind);
  }
  const description = patch.description?.trim() || undefined;
  const shared = {
    ...(description ? { description } : {}),
    ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId } : {}),
  };
  const notes =
    patch.notes === undefined ? {} : { notes: patch.notes?.trim() || null };

  if (row.installmentPlanId) {
    const accountChanges =
      patch.accountId !== undefined && patch.accountId !== row.accountId;
    if (patch.amountCents !== undefined || accountChanges) {
      throw new DomainError(
        "Para mudar o valor ou a conta de várias parcelas, exclua a compra e lance de novo.",
      );
    }
    const values = { ...shared, ...notes };
    if (Object.keys(values).length === 0) return;
    if (scope === "all" && description) {
      await tx
        .update(installmentPlans)
        .set({ description })
        .where(
          and(
            eq(installmentPlans.id, row.installmentPlanId),
            eq(installmentPlans.userId, ctx.userId),
          ),
        );
    }
    await tx
      .update(transactions)
      .set(values)
      .where(
        and(
          eq(transactions.userId, ctx.userId),
          eq(transactions.installmentPlanId, row.installmentPlanId),
          isNull(transactions.deletedAt),
          scope === "future"
            ? gte(transactions.installmentNumber, row.installmentNumber ?? 1)
            : undefined,
        ),
      );
    return;
  }

  const [rule] = await tx
    .select()
    .from(recurrences)
    .where(
      and(
        eq(recurrences.id, row.recurrenceId as string),
        eq(recurrences.userId, ctx.userId),
      ),
    )
    .limit(1);
  if (!rule) throw notFound("Recorrência");
  const account =
    patch.accountId !== undefined && patch.accountId !== row.accountId
      ? await requireAccount(tx, ctx.userId, patch.accountId)
      : null;
  const amountCents =
    patch.amountCents === undefined
      ? undefined
      : rule.kind === "expense"
        ? -patch.amountCents
        : patch.amountCents;
  const ruleValues = {
    ...shared,
    ...(amountCents !== undefined ? { amountCents } : {}),
    ...(account ? { accountId: account.id } : {}),
  };

  const changesRule = Object.keys(ruleValues).length > 0;
  let ruleId = rule.id;
  if (changesRule && scope === "future" && row.occurredOn > rule.startOn) {
    const { id: _id, createdAt: _created, updatedAt: _updated, ...copy } = rule;
    ruleId = uuidv7();
    await tx.insert(recurrences).values({
      ...copy,
      ...ruleValues,
      id: ruleId,
      startOn: row.occurredOn,
    });
    await tx
      .update(recurrences)
      .set({ endOn: iso(addDays(parse(row.occurredOn), -1)) })
      .where(eq(recurrences.id, rule.id));
    // Every occurrence from here on, paid or not, now belongs to the new rule.
    await tx
      .update(transactions)
      .set({ recurrenceId: ruleId })
      .where(
        and(
          eq(transactions.userId, ctx.userId),
          eq(transactions.recurrenceId, rule.id),
          gte(transactions.occurredOn, row.occurredOn),
        ),
      );
  } else if (changesRule) {
    await tx
      .update(recurrences)
      .set(ruleValues)
      .where(eq(recurrences.id, rule.id));
  }

  const values = {
    ...shared,
    ...notes,
    ...(amountCents !== undefined ? { amountCents } : {}),
  };
  const targets = await tx
    .select({ id: transactions.id, occurredOn: transactions.occurredOn })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, ctx.userId),
        eq(transactions.recurrenceId, ruleId),
        isNull(transactions.deletedAt),
        or(eq(transactions.id, row.id), eq(transactions.status, "pending")),
        scope === "future"
          ? gte(transactions.occurredOn, row.occurredOn)
          : undefined,
      ),
    );
  if (!account) {
    if (Object.keys(values).length === 0 || targets.length === 0) return;
    await tx
      .update(transactions)
      .set(values)
      .where(
        inArray(
          transactions.id,
          targets.map((target) => target.id),
        ),
      );
    return;
  }
  // Another account: each entry also moves to that card's invoice, if any.
  for (const target of targets) {
    const invoiceId = account.cycle
      ? await ensureInvoice(
          tx,
          ctx.userId,
          account.id,
          invoiceFor(parse(target.occurredOn), account.cycle),
        )
      : null;
    await tx
      .update(transactions)
      .set({ ...values, accountId: account.id, invoiceId })
      .where(eq(transactions.id, target.id));
  }
}

export type DeleteScope = "this" | "future" | "all";

/**
 * Soft delete (undo with restoreTransactions). Transfers take both legs.
 * Installments: "all" removes the whole plan. Recurrences: "future" removes
 * this and the next pending occurrences and ends the rule the day before.
 * Returns the ids deleted, for the "Desfazer" toast.
 */
export async function deleteTransaction(
  ctx: UserContext,
  id: string,
  scope: DeleteScope = "this",
): Promise<string[]> {
  return db.transaction(async (tx) => {
    const row = await requireOwnedTransaction(tx, ctx, id);
    let where: SQL | undefined = eq(transactions.id, row.id);
    if (row.transferId) {
      where = eq(transactions.transferId, row.transferId);
    } else if (scope === "all" && row.installmentPlanId) {
      where = eq(transactions.installmentPlanId, row.installmentPlanId);
    } else if (scope === "future" && row.recurrenceId) {
      where = and(
        eq(transactions.recurrenceId, row.recurrenceId),
        gte(transactions.occurredOn, row.occurredOn),
        or(eq(transactions.id, row.id), eq(transactions.status, "pending")),
      );
      const dayBefore = iso(addDays(parse(row.occurredOn), -1));
      await tx
        .update(recurrences)
        .set({ endOn: dayBefore })
        .where(
          and(
            eq(recurrences.id, row.recurrenceId),
            eq(recurrences.userId, ctx.userId),
          ),
        );
    }
    const deleted = await tx
      .update(transactions)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(transactions.userId, ctx.userId),
          isNull(transactions.deletedAt),
          where,
        ),
      )
      .returning({ id: transactions.id });
    return deleted.map((item) => item.id);
  });
}

export async function restoreTransactions(ctx: UserContext, ids: string[]) {
  if (ids.length === 0) return;
  await db
    .update(transactions)
    .set({ deletedAt: null })
    .where(
      and(eq(transactions.userId, ctx.userId), inArray(transactions.id, ids)),
    );
}

export async function setTransactionPaid(
  ctx: UserContext,
  id: string,
  paid: boolean,
): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await requireOwnedTransaction(tx, ctx, id);
    const where = row.transferId
      ? eq(transactions.transferId, row.transferId)
      : eq(transactions.id, row.id);
    await tx
      .update(transactions)
      .set({
        status: paid ? "paid" : "pending",
        paidAt: paid ? new Date() : null,
      })
      .where(and(eq(transactions.userId, ctx.userId), where));
  });
}

export type DescriptionSuggestion = {
  description: string;
  categoryId: string | null;
  accountId: string;
  amountCents: number;
};

/** Autocomplete for the quick-add description (doc 02 §6.5). */
export async function descriptionSuggestions(
  ctx: UserContext,
  kind: "expense" | "income",
  q: string,
): Promise<DescriptionSuggestion[]> {
  const key = sql`f_unaccent(lower(${transactions.description}))`;
  const prefix = `${escapeLike(q.trim().toLowerCase())}%`;
  const rows = await db
    .selectDistinctOn([key], {
      description: transactions.description,
      categoryId: transactions.categoryId,
      accountId: transactions.accountId,
      amountCents: transactions.amountCents,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, ctx.userId),
        eq(transactions.kind, kind),
        isNull(transactions.deletedAt),
        q.trim() ? sql`${key} like f_unaccent(${prefix})` : undefined,
      ),
    )
    .orderBy(key, desc(transactions.occurredOn))
    .limit(8);
  return rows.map((row) => ({
    ...row,
    amountCents: Math.abs(row.amountCents),
  }));
}

/**
 * "Desfazer" right after creating: soft-deletes the rows just created (all
 * installments or occurrences) or both legs of a transfer, and stops the
 * recurrence they came from.
 */
export async function discardCreated(
  ctx: UserContext,
  input: { ids?: string[]; transferId?: string | null },
): Promise<string[]> {
  return db.transaction(async (tx) => {
    const where = input.transferId
      ? eq(transactions.transferId, input.transferId)
      : input.ids && input.ids.length > 0
        ? inArray(transactions.id, input.ids)
        : undefined;
    if (!where) return [];
    const deleted = await tx
      .update(transactions)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(transactions.userId, ctx.userId),
          isNull(transactions.deletedAt),
          where,
        ),
      )
      .returning({
        id: transactions.id,
        recurrenceId: transactions.recurrenceId,
      });
    const recurrenceIds = [
      ...new Set(
        deleted.map((row) => row.recurrenceId).filter((id) => id !== null),
      ),
    ];
    if (recurrenceIds.length > 0) {
      await tx
        .update(recurrences)
        .set({ pausedAt: new Date() })
        .where(
          and(
            eq(recurrences.userId, ctx.userId),
            inArray(recurrences.id, recurrenceIds),
          ),
        );
    }
    return deleted.map((row) => row.id);
  });
}
