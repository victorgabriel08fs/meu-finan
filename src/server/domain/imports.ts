// Statement imports (doc 02 §6.13, doc 01 RF-13) and the CSV export of the
// ledger (doc 02 §6.14, "Dados"). Parsing is pure (src/lib/import); this
// module checks ownership, compares the rows with the ledger, suggests
// categories and writes the import in one transaction.
import {
  and,
  asc,
  between,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  ne,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import {
  type InvoiceDates,
  invoiceFor,
  isoMonth,
  parse,
  periodContaining,
} from "@/lib/finance";
import { addDaysIso } from "@/lib/import/date";
import {
  type ExistingEntry,
  matchLikelyDuplicates,
} from "@/lib/import/duplicates";
import type { ExportRow } from "@/lib/import/export";
import { MAX_IMPORT_ROWS } from "@/lib/import/files";
import type { ImportFormatName, StatementRow } from "@/lib/import/statement";
import {
  type CategoryRule,
  createCategorySuggester,
  type HistoryEntry,
  type Suggestion,
} from "@/lib/import/suggest";
import { MAX_DESCRIPTION_LENGTH } from "@/lib/import/text";
import { db, type Executor } from "@/server/db/client";
import {
  type CategoryKind,
  categories,
  categorizationRules,
  type FinAccountType,
  finAccounts,
  imports,
  installmentPlans,
  type TxnKind,
  transactions,
} from "@/server/db/schema";
import { requireAccount } from "./accounts";
import { ensureInvoice } from "./cards";
import { requireCategory } from "./categories";
import type { UserContext } from "./context";
import { DomainError, notFound } from "./errors";

/** "Desfazer importação" stays available this long (doc 02 §6.13). */
export const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Entries dated later than this many days ahead are refused. */
const MAX_DAYS_AHEAD = 366;
/** Rows per INSERT statement (16 parameters each, far below Postgres' limit). */
const INSERT_CHUNK = 500;

export type ImportAccount = {
  id: string;
  name: string;
  type: FinAccountType;
};

/** The account chosen for an import: the user's own and active; cards too. */
export async function importAccount(
  ctx: UserContext,
  accountId: string,
): Promise<ImportAccount> {
  const account = await requireAccount(db, ctx.userId, accountId);
  return { id: account.id, name: account.name, type: account.type };
}

/** new · duplicate: same external id already in the account · maybe: looks like an entry there. */
export type ReviewStatus = "new" | "duplicate" | "maybe";

export type ReviewRow = StatementRow & {
  kind: "income" | "expense";
  status: ReviewStatus;
  /** The entry it looks like ("Talvez já exista"). */
  match: { description: string; occurredOn: string } | null;
  /** Suggested category (of the row's kind), or null. */
  categoryId: string | null;
  suggestion: Suggestion["source"] | null;
};

/**
 * Compares the parsed rows with the account's ledger and suggests a category
 * for each (doc 02 §6.13, step 3). Read-only.
 */
export async function reviewImport(
  ctx: UserContext,
  accountId: string,
  rows: readonly StatementRow[],
): Promise<ReviewRow[]> {
  const account = await requireAccount(db, ctx.userId, accountId);
  if (rows.length === 0) return [];
  const externalIds = [...new Set(rows.map((row) => row.externalId))];
  const dates = rows.map((row) => row.occurredOn).sort();
  const from = addDaysIso(dates[0] as string, -1);
  const to = addDaysIso(dates[dates.length - 1] as string, 1);

  const [known, nearby, history, rules] = await Promise.all([
    // Deleted rows included: the unique index (account_id, external_id) covers them.
    db
      .select({ externalId: transactions.externalId })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, ctx.userId),
          eq(transactions.accountId, account.id),
          inArray(transactions.externalId, externalIds),
        ),
      ),
    db
      .select({
        id: transactions.id,
        occurredOn: transactions.occurredOn,
        amountCents: transactions.amountCents,
        description: transactions.description,
        externalId: transactions.externalId,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, ctx.userId),
          eq(transactions.accountId, account.id),
          isNull(transactions.deletedAt),
          ne(transactions.kind, "adjustment"),
          between(transactions.occurredOn, from, to),
        ),
      ),
    categoryHistory(ctx),
    categoryRules(ctx),
  ]);

  const existingIds = new Set(
    known.flatMap((row) => (row.externalId === null ? [] : [row.externalId])),
  );
  const duplicate = rows.map((row) => existingIds.has(row.externalId));
  const fileIds = new Set(externalIds);
  // Entries that are this file's own rows (same external id) are exact
  // duplicates, not look-alikes; hand-typed ones and other imports are.
  const candidates: ExistingEntry[] = nearby.filter(
    (entry) => entry.externalId === null || !fileIds.has(entry.externalId),
  );
  const matches = matchLikelyDuplicates(
    rows.flatMap((row, key) =>
      duplicate[key]
        ? []
        : [{ key, occurredOn: row.occurredOn, amountCents: row.amountCents }],
    ),
    candidates,
  );
  const suggest = createCategorySuggester(history, rules);

  return rows.map((row, index) => {
    const kind = row.amountCents < 0 ? "expense" : "income";
    const match = matches.get(index);
    const suggestion = suggest(row.description, kind, account.id);
    return {
      ...row,
      kind,
      status: duplicate[index] ? "duplicate" : match ? "maybe" : "new",
      match: match
        ? { description: match.description, occurredOn: match.occurredOn }
        : null,
      categoryId: suggestion?.categoryId ?? null,
      suggestion: suggestion?.source ?? null,
    };
  });
}

/** The user's descriptions with their categories, most recent first. */
async function categoryHistory(ctx: UserContext): Promise<HistoryEntry[]> {
  const uses = sql<number>`count(*)`.mapWith(Number);
  const lastUsedOn = sql<string>`to_char(max(${transactions.occurredOn}), 'YYYY-MM-DD')`;
  const rows = await db
    .select({
      description: transactions.description,
      kind: transactions.kind,
      categoryId: transactions.categoryId,
      uses,
      lastUsedOn,
    })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        eq(transactions.userId, ctx.userId),
        eq(categories.userId, ctx.userId),
        isNull(transactions.deletedAt),
        isNull(categories.archivedAt),
        inArray(transactions.kind, ["income", "expense"]),
      ),
    )
    .groupBy(
      transactions.description,
      transactions.kind,
      transactions.categoryId,
    )
    .orderBy(desc(lastUsedOn))
    .limit(5000);
  return rows.flatMap((row) =>
    row.categoryId !== null && (row.kind === "income" || row.kind === "expense")
      ? [{ ...row, kind: row.kind, categoryId: row.categoryId }]
      : [],
  );
}

/** Explicit "description → category" rules of active categories. */
async function categoryRules(ctx: UserContext): Promise<CategoryRule[]> {
  return db
    .select({
      pattern: categorizationRules.pattern,
      kind: categories.kind,
      categoryId: categorizationRules.categoryId,
      accountId: categorizationRules.accountId,
      hits: categorizationRules.hits,
    })
    .from(categorizationRules)
    .innerJoin(categories, eq(categories.id, categorizationRules.categoryId))
    .where(
      and(
        eq(categorizationRules.userId, ctx.userId),
        eq(categories.userId, ctx.userId),
        isNull(categories.archivedAt),
      ),
    );
}

export type ConfirmImportRow = {
  occurredOn: string;
  /** Signed cents: negative is an expense, positive an income. */
  amountCents: number;
  description: string;
  externalId: string;
  categoryId: string | null;
};

export type ConfirmImportInput = {
  accountId: string;
  format: ImportFormatName;
  rows: ConfirmImportRow[];
  /** Rows the file had and duplicates found in the review, for the stats. */
  fileRows: number;
  duplicates: number;
};

export type ConfirmImportResult = {
  importId: string;
  imported: number;
  /** Rows that already existed when inserting (unique external id). */
  skipped: number;
  /** First and last date of the imported rows. */
  start: string | null;
  end: string | null;
  /** Statement period (?mes=YYYY-MM) to look at them: the last one up to today. */
  month: string | null;
};

const kindOf = (amountCents: number): "income" | "expense" =>
  amountCents < 0 ? "expense" : "income";

/** Re-checks every row: the client is not trusted with what it sends back. */
function assertRows(ctx: UserContext, rows: readonly ConfirmImportRow[]) {
  if (rows.length === 0) {
    throw new DomainError("Escolha ao menos um lançamento.");
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new DomainError(
      `Importe até ${MAX_IMPORT_ROWS.toLocaleString("pt-BR")} lançamentos por vez.`,
    );
  }
  const latest = addDaysIso(ctx.todayIso, MAX_DAYS_AHEAD);
  const seen = new Set<string>();
  for (const row of rows) {
    try {
      parse(row.occurredOn);
    } catch {
      throw new DomainError("Há um lançamento com data inválida.");
    }
    if (row.occurredOn > latest) {
      throw new DomainError("Há um lançamento com data muito no futuro.");
    }
    if (!Number.isSafeInteger(row.amountCents) || row.amountCents === 0) {
      throw new DomainError("Há um lançamento com valor inválido.");
    }
    const length = Array.from(row.description.trim()).length;
    if (length === 0 || length > MAX_DESCRIPTION_LENGTH) {
      throw new DomainError("Há um lançamento com descrição inválida.");
    }
    if (seen.has(row.externalId)) {
      throw new DomainError("Há lançamentos repetidos no envio.");
    }
    seen.add(row.externalId);
  }
}

/**
 * "Importar N lançamentos" (doc 02 §6.13, step 4): one transaction that
 * records the import and inserts its rows as expenses (negative) or incomes
 * (positive), paid when dated today or earlier, attached to the card invoice
 * of their date on a credit card. Rows whose external id already exists in
 * the account are skipped (ON CONFLICT DO NOTHING) and counted.
 */
export async function confirmImport(
  ctx: UserContext,
  input: ConfirmImportInput,
): Promise<ConfirmImportResult> {
  assertRows(ctx, input.rows);
  return db.transaction(async (tx) => {
    const account = await requireAccount(tx, ctx.userId, input.accountId);

    // Ownership and kind of every category received.
    const categoryKinds = new Map<string, CategoryKind>();
    for (const row of input.rows) {
      if (row.categoryId === null || categoryKinds.has(row.categoryId)) {
        continue;
      }
      const category = await requireCategory(tx, ctx.userId, row.categoryId);
      categoryKinds.set(category.id, category.kind);
    }
    for (const row of input.rows) {
      if (row.categoryId === null) continue;
      const kind = kindOf(row.amountCents);
      if (categoryKinds.get(row.categoryId) !== kind) {
        throw new DomainError(
          kind === "expense"
            ? `"${row.description}" é uma despesa: escolha uma categoria de despesa.`
            : `"${row.description}" é uma receita: escolha uma categoria de receita.`,
        );
      }
    }

    const importId = uuidv7();
    await tx.insert(imports).values({
      id: importId,
      userId: ctx.userId,
      accountId: account.id,
      format: input.format,
      status: "done",
      stats: {
        rows: input.fileRows,
        duplicates: input.duplicates,
        imported: 0,
      },
    });

    const invoices = new Map<string, string>();
    const invoiceId = async (date: string) => {
      if (!account.cycle) return null;
      const dates: InvoiceDates = invoiceFor(parse(date), account.cycle);
      const key = isoMonth(dates.referenceMonth);
      const known = invoices.get(key);
      if (known) return known;
      const id = await ensureInvoice(tx, ctx.userId, account.id, dates);
      invoices.set(key, id);
      return id;
    };

    const paidAt = new Date();
    const values: (typeof transactions.$inferInsert)[] = [];
    for (const row of input.rows) {
      const paid = row.occurredOn <= ctx.todayIso;
      values.push({
        id: uuidv7(),
        userId: ctx.userId,
        accountId: account.id,
        categoryId: row.categoryId,
        kind: kindOf(row.amountCents) as TxnKind,
        status: paid ? "paid" : "pending",
        paidAt: paid ? paidAt : null,
        amountCents: row.amountCents,
        description: row.description.trim(),
        occurredOn: row.occurredOn,
        importId,
        externalId: row.externalId,
        invoiceId: await invoiceId(row.occurredOn),
      });
    }

    const inserted: { occurredOn: string }[] = [];
    for (let start = 0; start < values.length; start += INSERT_CHUNK) {
      const chunk = values.slice(start, start + INSERT_CHUNK);
      inserted.push(
        ...(await tx
          .insert(transactions)
          .values(chunk)
          .onConflictDoNothing()
          .returning({ occurredOn: transactions.occurredOn })),
      );
    }
    const skipped = values.length - inserted.length;
    await tx
      .update(imports)
      .set({
        stats: {
          rows: Math.max(input.fileRows, values.length),
          duplicates: input.duplicates + skipped,
          imported: inserted.length,
        },
      })
      .where(eq(imports.id, importId));

    const dates = inserted.map((row) => row.occurredOn).sort();
    const end = dates[dates.length - 1] ?? null;
    return {
      importId,
      imported: inserted.length,
      skipped,
      start: dates[0] ?? null,
      end,
      month: end ? statementMonth(ctx, end) : null,
    };
  });
}

/**
 * The statement period (`?mes=YYYY-MM`) that shows an entry dated `date`, or
 * today's when it is in the future.
 */
export function statementMonth(ctx: UserContext, date: string): string {
  const focus = date < ctx.todayIso ? date : ctx.todayIso;
  const { label } = periodContaining(parse(focus), ctx.monthStartDay);
  return `${label.year}-${String(label.month).padStart(2, "0")}`;
}

/**
 * "Desfazer importação": soft-deletes every entry of the import still in the
 * ledger, for 24 hours after it. Their external ids are released, so the same
 * file can be imported again (the entries stay restorable until the purge).
 */
export async function undoImport(
  ctx: UserContext,
  importId: string,
  now: number = Date.now(),
): Promise<{ undone: number }> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: imports.id, createdAt: imports.createdAt })
      .from(imports)
      .where(and(eq(imports.id, importId), eq(imports.userId, ctx.userId)))
      .limit(1);
    if (!row) throw notFound("Importação");
    if (now - row.createdAt.getTime() > UNDO_WINDOW_MS) {
      throw new DomainError(
        "Só dá para desfazer uma importação nas primeiras 24 horas.",
      );
    }
    const undone = await tx
      .update(transactions)
      .set({ deletedAt: new Date(), externalId: null })
      .where(
        and(
          eq(transactions.userId, ctx.userId),
          eq(transactions.importId, row.id),
          isNull(transactions.deletedAt),
        ),
      )
      .returning({ id: transactions.id });
    return { undone: undone.length };
  });
}

export type RecentImport = {
  id: string;
  accountId: string;
  accountName: string;
  format: ImportFormatName;
  createdAt: Date;
  /** Entries created by the import. */
  imported: number;
  /** Of those, still in the ledger (0 after "Desfazer"). */
  active: number;
  start: string | null;
  end: string | null;
  /** Statement period that shows the latest of them. */
  month: string | null;
  undoable: boolean;
};

/** "Importações recentes" on /importar, newest first. */
export async function listRecentImports(
  ctx: UserContext,
  options: { limit?: number; now?: number; executor?: Executor } = {},
): Promise<RecentImport[]> {
  const now = options.now ?? Date.now();
  const active =
    sql<number>`count(${transactions.id}) filter (where ${transactions.deletedAt} is null)`.mapWith(
      Number,
    );
  const start = sql<
    string | null
  >`to_char(min(${transactions.occurredOn}), 'YYYY-MM-DD')`;
  const end = sql<
    string | null
  >`to_char(max(${transactions.occurredOn}), 'YYYY-MM-DD')`;
  const rows = await (options.executor ?? db)
    .select({
      id: imports.id,
      accountId: imports.accountId,
      accountName: finAccounts.name,
      format: imports.format,
      createdAt: imports.createdAt,
      stats: imports.stats,
      active,
      start,
      end,
    })
    .from(imports)
    .innerJoin(finAccounts, eq(finAccounts.id, imports.accountId))
    .leftJoin(transactions, eq(transactions.importId, imports.id))
    .where(eq(imports.userId, ctx.userId))
    .groupBy(imports.id, finAccounts.name)
    .orderBy(desc(imports.createdAt))
    .limit(options.limit ?? 5);
  return rows.map((row) => ({
    id: row.id,
    accountId: row.accountId,
    accountName: row.accountName,
    format: row.format,
    createdAt: row.createdAt,
    imported: row.stats?.imported ?? row.active,
    active: row.active,
    start: row.start,
    end: row.end,
    month: row.end ? statementMonth(ctx, row.end) : null,
    undoable: row.active > 0 && now - row.createdAt.getTime() <= UNDO_WINDOW_MS,
  }));
}

const parentCategory = alias(categories, "parent_category");

/**
 * Ledger rows for "Exportar lançamentos (CSV)", oldest first: every entry not
 * deleted, transfers once per leg with that leg's account. `start`/`end`
 * (inclusive, YYYY-MM-DD) narrow the period; without them, everything.
 */
export async function listExportRows(
  ctx: UserContext,
  range: { start?: string | null; end?: string | null } = {},
): Promise<ExportRow[]> {
  const rows = await db
    .select({
      occurredOn: transactions.occurredOn,
      description: transactions.description,
      categoryName: categories.name,
      parentName: parentCategory.name,
      accountName: finAccounts.name,
      kind: transactions.kind,
      status: transactions.status,
      amountCents: transactions.amountCents,
      installmentNumber: transactions.installmentNumber,
      installmentCount: installmentPlans.count,
      notes: transactions.notes,
    })
    .from(transactions)
    .innerJoin(finAccounts, eq(finAccounts.id, transactions.accountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .leftJoin(parentCategory, eq(parentCategory.id, categories.parentId))
    .leftJoin(
      installmentPlans,
      eq(installmentPlans.id, transactions.installmentPlanId),
    )
    .where(
      and(
        eq(transactions.userId, ctx.userId),
        isNull(transactions.deletedAt),
        range.start ? gte(transactions.occurredOn, range.start) : undefined,
        range.end ? lte(transactions.occurredOn, range.end) : undefined,
      ),
    )
    .orderBy(
      asc(transactions.occurredOn),
      asc(transactions.createdAt),
      asc(transactions.id),
    );
  return rows.map((row) => ({
    occurredOn: row.occurredOn,
    description: row.description,
    categoryName: row.categoryName
      ? row.parentName
        ? `${row.parentName} › ${row.categoryName}`
        : row.categoryName
      : null,
    accountName: row.accountName,
    kind: row.kind,
    status: row.status,
    amountCents: row.amountCents,
    installment:
      row.installmentNumber !== null && row.installmentCount !== null
        ? { number: row.installmentNumber, count: row.installmentCount }
        : null,
    notes: row.notes,
  }));
}
