// Tags (task 18): free labels across categories. Each person has their own;
// a transaction (expense or income) can have up to ten, and a recurrence keeps
// the ones the daily job copies to its new occurrences. Every id received is
// checked against tags.user_id before it is linked.
import {
  and,
  asc,
  count,
  eq,
  inArray,
  isNull,
  notInArray,
  sql,
} from "drizzle-orm";
import {
  MAX_ACTIVE_TAGS,
  MAX_TAGS_PER_ENTRY,
  normalizeTagName,
} from "@/lib/tags/name";
import { db, type Executor } from "@/server/db/client";
import { isUniqueViolation } from "@/server/db/errors";
import {
  recurrenceTags,
  tags,
  transactions,
  transactionTags,
} from "@/server/db/schema";
import { DomainError, notFound } from "./errors";

export type TagItem = { id: string; name: string; archived: boolean };

export const TAG_NAME_TAKEN = "Já existe uma etiqueta com esse nome.";
export const TAG_LIMIT_REACHED = `Você chegou a ${MAX_ACTIVE_TAGS} etiquetas. Arquive alguma para criar outra.`;
export const TAG_ARCHIVED = "Esta etiqueta está arquivada.";
export const TOO_MANY_TAGS = `Escolha até ${MAX_TAGS_PER_ENTRY} etiquetas.`;

const columns = { id: tags.id, name: tags.name, archivedAt: tags.archivedAt };

const toItem = (row: {
  id: string;
  name: string;
  archivedAt: Date | null;
}): TagItem => ({
  id: row.id,
  name: row.name,
  archived: row.archivedAt !== null,
});

/** The order of every tag list: name ignoring case and accents. */
const byName = sql`f_unaccent(lower(${tags.name}))`;

/** The person's tags in name order; archived ones only when asked. */
export async function listTags(
  userId: string,
  { includeArchived = false }: { includeArchived?: boolean } = {},
  executor: Executor = db,
): Promise<TagItem[]> {
  const rows = await executor
    .select(columns)
    .from(tags)
    .where(
      and(
        eq(tags.userId, userId),
        includeArchived ? undefined : isNull(tags.archivedAt),
      ),
    )
    .orderBy(asc(byName));
  return rows.map(toItem);
}

/** Active tags, for the Ajustes row. */
export async function countActiveTags(
  userId: string,
  executor: Executor = db,
): Promise<number> {
  const [row] = await executor
    .select({ count: count() })
    .from(tags)
    .where(and(eq(tags.userId, userId), isNull(tags.archivedAt)));
  return row?.count ?? 0;
}

export type TagWithUsage = TagItem & {
  /** Entries (not deleted, any status) carrying the tag. */
  entries: number;
};

/** Every tag with its entry count, for Ajustes › Etiquetas: two reads, no correlated subquery. */
export async function listTagsWithUsage(
  userId: string,
): Promise<TagWithUsage[]> {
  const [list, counts] = await Promise.all([
    listTags(userId, { includeArchived: true }),
    db
      .select({ tagId: transactionTags.tagId, count: count() })
      .from(transactionTags)
      .innerJoin(
        transactions,
        eq(transactions.id, transactionTags.transactionId),
      )
      .where(
        and(eq(transactions.userId, userId), isNull(transactions.deletedAt)),
      )
      .groupBy(transactionTags.tagId),
  ]);
  const entries = new Map(counts.map((row) => [row.tagId, row.count]));
  return list.map((tag) => ({ ...tag, entries: entries.get(tag.id) ?? 0 }));
}

/**
 * The person's tag with this name, ignoring case, accents and a leading `#`
 * (archived ones included). Uses the unique index; meant for task 21 too.
 */
export async function findTagByName(
  executor: Executor,
  userId: string,
  name: string,
  { lock = false }: { lock?: boolean } = {},
): Promise<TagItem | null> {
  const query = executor
    .select(columns)
    .from(tags)
    .where(
      and(
        eq(tags.userId, userId),
        sql`f_unaccent(lower(${tags.name})) = f_unaccent(lower(${normalizeTagName(name)}))`,
      ),
    )
    .limit(1);
  const [row] = lock ? await query.for("update") : await query;
  return row ? toItem(row) : null;
}

export type EnsuredTag = {
  id: string;
  name: string;
  created: boolean;
  restored: boolean;
};

/**
 * Creates a tag, or reuses the one with the same name: an archived one is
 * restored; an active one is returned, or refused with `failIfActive`
 * (Ajustes creates on purpose; the picker just wants the tag).
 */
export async function ensureTag(
  userId: string,
  rawName: string,
  { failIfActive = false }: { failIfActive?: boolean } = {},
): Promise<EnsuredTag> {
  const name = normalizeTagName(rawName);
  if (name.length < 1) throw new DomainError("Informe um nome.");
  if (name.length > 30) throw new DomainError("Use até 30 caracteres.");
  return db.transaction(async (tx) => {
    const reuse = async (found: TagItem): Promise<EnsuredTag> => {
      if (found.archived) {
        await tx
          .update(tags)
          .set({ archivedAt: null })
          .where(and(eq(tags.id, found.id), eq(tags.userId, userId)));
        return {
          id: found.id,
          name: found.name,
          created: false,
          restored: true,
        };
      }
      if (failIfActive) throw new DomainError(TAG_NAME_TAKEN);
      return {
        id: found.id,
        name: found.name,
        created: false,
        restored: false,
      };
    };

    const existing = await findTagByName(tx, userId, name, { lock: true });
    if (existing) return reuse(existing);
    if ((await countActiveTags(userId, tx)) >= MAX_ACTIVE_TAGS) {
      throw new DomainError(TAG_LIMIT_REACHED);
    }
    const [inserted] = await tx
      .insert(tags)
      .values({ userId, name })
      .onConflictDoNothing()
      .returning({ id: tags.id, name: tags.name });
    if (inserted) return { ...inserted, created: true, restored: false };
    // Someone created the same name at the same time.
    const raced = await findTagByName(tx, userId, name, { lock: true });
    if (!raced) throw new DomainError(TAG_NAME_TAKEN);
    return reuse(raced);
  });
}

/** Renames a tag (archived ones too). */
export async function renameTag(
  userId: string,
  id: string,
  rawName: string,
): Promise<{ name: string }> {
  const name = normalizeTagName(rawName);
  if (name.length < 1) throw new DomainError("Informe um nome.");
  if (name.length > 30) throw new DomainError("Use até 30 caracteres.");
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ id: tags.id })
        .from(tags)
        .where(and(eq(tags.id, id), eq(tags.userId, userId)))
        .for("update");
      if (!row) throw notFound("Etiqueta");
      await tx
        .update(tags)
        .set({ name })
        .where(and(eq(tags.id, id), eq(tags.userId, userId)));
      return { name };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new DomainError(TAG_NAME_TAKEN);
    throw error;
  }
}

/** Archives or restores a tag; idempotent. Entries keep it either way. */
export async function setTagArchived(
  userId: string,
  id: string,
  archived: boolean,
): Promise<{ name: string }> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ name: tags.name, archivedAt: tags.archivedAt })
      .from(tags)
      .where(and(eq(tags.id, id), eq(tags.userId, userId)))
      .for("update");
    if (!row) throw notFound("Etiqueta");
    if (archived !== (row.archivedAt !== null)) {
      await tx
        .update(tags)
        .set({ archivedAt: archived ? new Date() : null })
        .where(and(eq(tags.id, id), eq(tags.userId, userId)));
    }
    return { name: row.name };
  });
}

/**
 * Checks the tags about to be linked to an entry: at most ten, all the
 * person's own, none archived unless it is already on the entry (`keepIds`).
 * Returns them without repeats.
 */
export async function requireTagsForLink(
  executor: Executor,
  userId: string,
  tagIds: readonly string[],
  keepIds: ReadonlySet<string> = new Set(),
): Promise<string[]> {
  const ids = [...new Set(tagIds)];
  if (ids.length > MAX_TAGS_PER_ENTRY) throw new DomainError(TOO_MANY_TAGS);
  if (ids.length === 0) return [];
  const rows = await executor
    .select({ id: tags.id, archivedAt: tags.archivedAt })
    .from(tags)
    .where(and(eq(tags.userId, userId), inArray(tags.id, ids)));
  if (rows.length !== ids.length) throw notFound("Etiqueta");
  if (rows.some((row) => row.archivedAt !== null && !keepIds.has(row.id))) {
    throw new DomainError(TAG_ARCHIVED);
  }
  return ids;
}

/**
 * Sets the tags of these transactions to exactly `tagIds`. Callers have
 * already checked that both the transactions and the tags are the person's.
 */
export async function replaceTransactionTags(
  tx: Executor,
  transactionIds: readonly string[],
  tagIds: readonly string[],
): Promise<void> {
  if (transactionIds.length === 0) return;
  await tx
    .delete(transactionTags)
    .where(
      and(
        inArray(transactionTags.transactionId, [...transactionIds]),
        tagIds.length
          ? notInArray(transactionTags.tagId, [...tagIds])
          : undefined,
      ),
    );
  if (tagIds.length === 0) return;
  await tx
    .insert(transactionTags)
    .values(
      transactionIds.flatMap((transactionId) =>
        tagIds.map((tagId) => ({ transactionId, tagId })),
      ),
    )
    .onConflictDoNothing();
}

/** Sets the tags a recurrence copies to its next occurrences (checked by the caller). */
export async function replaceRecurrenceTags(
  tx: Executor,
  recurrenceId: string,
  tagIds: readonly string[],
): Promise<void> {
  await tx
    .delete(recurrenceTags)
    .where(
      and(
        eq(recurrenceTags.recurrenceId, recurrenceId),
        tagIds.length
          ? notInArray(recurrenceTags.tagId, [...tagIds])
          : undefined,
      ),
    );
  if (tagIds.length === 0) return;
  await tx
    .insert(recurrenceTags)
    .values(tagIds.map((tagId) => ({ recurrenceId, tagId })))
    .onConflictDoNothing();
}

/** The tags a recurrence copies to its occurrences. */
export async function recurrenceTagIds(
  executor: Executor,
  recurrenceId: string,
): Promise<string[]> {
  const rows = await executor
    .select({ tagId: recurrenceTags.tagId })
    .from(recurrenceTags)
    .where(eq(recurrenceTags.recurrenceId, recurrenceId));
  return rows.map((row) => row.tagId);
}

/** The ids of the tags on one transaction. */
export async function transactionTagIds(
  executor: Executor,
  transactionId: string,
): Promise<Set<string>> {
  const rows = await executor
    .select({ tagId: transactionTags.tagId })
    .from(transactionTags)
    .where(eq(transactionTags.transactionId, transactionId));
  return new Set(rows.map((row) => row.tagId));
}

/** The tags of each transaction, in name order (archived ones included). */
export async function tagsForTransactions(
  userId: string,
  ids: readonly string[],
  executor: Executor = db,
): Promise<Map<string, TagItem[]>> {
  const result = new Map<string, TagItem[]>();
  if (ids.length === 0) return result;
  const rows = await executor
    .select({
      transactionId: transactionTags.transactionId,
      ...columns,
    })
    .from(transactionTags)
    .innerJoin(tags, eq(tags.id, transactionTags.tagId))
    .where(
      and(
        eq(tags.userId, userId),
        inArray(transactionTags.transactionId, [...ids]),
      ),
    )
    .orderBy(asc(byName));
  for (const { transactionId, ...tag } of rows) {
    const list = result.get(transactionId) ?? [];
    list.push(toItem(tag));
    result.set(transactionId, list);
  }
  return result;
}
