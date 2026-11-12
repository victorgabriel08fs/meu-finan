// Shared boxes of a group ("caixinha compartilhada", ADR-13, doc 03 §8.1):
// the record of what each member put in toward an optional target, with
// each one's monthly plan and part of the target. The money stays in each
// member's own accounts: an entry moves money between the person's own
// accounts only when they ask for it ("Lançar no meu extrato"), in the same
// transaction. Writes lock the group (FOR UPDATE), then the box, so what a
// member can still take out is checked against every write before it.
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";
import {
  type GoalProjection,
  parse,
  projectSharedBox,
  type SharedBoxMember,
  toYearMonth,
} from "@/lib/finance";
import { formatBRL } from "@/lib/format/money";
import { db, type Executor, type Transaction } from "@/server/db/client";
import {
  type ColorToken,
  type GoalExpectedRate,
  type ShareBoxTargetSplit,
  sharedBoxEntries,
  sharedBoxes,
  sharedBoxMembers,
  shareGroups,
  shareMembers,
  transactions,
} from "@/server/db/schema";
import { requireAccount } from "../accounts";
import type { UserContext } from "../context";
import { DomainError } from "../errors";
import { goalMonthlyRate } from "../goals";
import { getMarketRates, type MarketRates } from "../rates";
import { insertTransfer } from "../transactions";
import {
  accountOf,
  GROUP_NOT_FOUND,
  type GroupRow,
  groupMembers,
  historyName,
  type MemberRow,
  membersOfGroups,
  requireActiveMember,
} from "./membership";
import { boxHref, notifyMember, type PendingPush } from "./notices";

export const BOX_ARCHIVED = "Esta caixinha está arquivada.";
const OWNER_ONLY = "Só quem criou o grupo pode mudar as partes.";
const ENTRY_NOT_FOUND = "Registro não encontrado nesta caixinha.";

// Reading -------------------------------------------------------------------

export type BoxMemberView = {
  memberId: string;
  name: string;
  isMe: boolean;
  savedCents: number;
  monthlyPlanCents: number;
  /** Basis points of the target; meaningful with target_split = percent. */
  weight: number;
  shareCents: number | null;
  missingCents: number | null;
  projection: GoalProjection | null;
};

export type BoxSummary = {
  id: string;
  groupId: string;
  groupName: string;
  name: string;
  icon: string;
  color: ColorToken;
  targetCents: number | null;
  targetDate: string | null;
  expectedRate: GoalExpectedRate | null;
  rateLabel: string;
  /** What the active members have saved. */
  savedCents: number;
  /** The active members' monthly plans together. */
  monthlyCents: number;
  /** 0–1; null without a target. */
  progress: number | null;
  /** The whole box at everyone's pace; null without a target. */
  projection: GoalProjection | null;
  archived: boolean;
};

export type BoxEntryView = {
  id: string;
  memberId: string;
  /** "Você" is decided on the screen; this is the name in the history. */
  name: string;
  amountCents: number;
  occurredOn: string;
  mine: boolean;
  /** Mine only: made with a transfer between my own accounts. */
  withTransfer: boolean;
};

export type BoxDetail = BoxSummary & {
  targetSplit: ShareBoxTargetSplit;
  myMemberId: string;
  /** The viewer owns the group: they can change the parts. */
  isOwner: boolean;
  /** Active members, in the order invited. */
  members: BoxMemberView[];
  /** Who left the group with money recorded here (no longer counted). */
  departed: { memberId: string; name: string; savedCents: number }[];
  entries: BoxEntryView[];
  mySavedCents: number;
  /** My caixinha (savings_box) of the last entry I made with a transfer. */
  lastBoxAccountId: string | null;
};

type BoxRow = typeof sharedBoxes.$inferSelect;

/** Net saved per member and box (entries in minus out), not deleted. */
async function savedByMember(
  executor: Executor,
  boxIds: readonly string[],
): Promise<Map<string, number>> {
  if (boxIds.length === 0) return new Map();
  const rows = await executor
    .select({
      boxId: sharedBoxEntries.boxId,
      memberId: sharedBoxEntries.memberId,
      total:
        sql<number>`coalesce(sum(${sharedBoxEntries.amountCents}), 0)`.mapWith(
          Number,
        ),
    })
    .from(sharedBoxEntries)
    .where(
      and(
        inArray(sharedBoxEntries.boxId, [...boxIds]),
        isNull(sharedBoxEntries.deletedAt),
      ),
    )
    .groupBy(sharedBoxEntries.boxId, sharedBoxEntries.memberId);
  return new Map(
    rows.map((row) => [`${row.boxId}:${row.memberId}`, row.total]),
  );
}

async function settingsByMember(
  executor: Executor,
  boxIds: readonly string[],
): Promise<Map<string, { monthlyPlanCents: number; targetWeight: number }>> {
  if (boxIds.length === 0) return new Map();
  const rows = await executor
    .select()
    .from(sharedBoxMembers)
    .where(inArray(sharedBoxMembers.boxId, [...boxIds]));
  return new Map(rows.map((row) => [`${row.boxId}:${row.memberId}`, row]));
}

type Computed = {
  summary: Omit<BoxSummary, "groupName">;
  members: BoxMemberView[];
  departed: BoxDetail["departed"];
};

/** A box's numbers from its rows: only active members count. */
function compute(
  ctx: UserContext,
  box: BoxRow,
  members: readonly (MemberRow & { deleted: boolean })[],
  saved: ReadonlyMap<string, number>,
  settings: ReadonlyMap<
    string,
    { monthlyPlanCents: number; targetWeight: number }
  >,
  market: MarketRates,
): Computed {
  const { monthlyRate, label } = goalMonthlyRate(box.expectedRate, market);
  const active = members.filter((member) => member.status === "active");
  const key = (memberId: string) => `${box.id}:${memberId}`;
  const percentWeights = active.map(
    (member) => settings.get(key(member.id))?.targetWeight ?? 0,
  );
  const byPercent =
    box.targetSplit === "percent" &&
    percentWeights.reduce((sum, weight) => sum + weight, 0) > 0;
  const inputs: SharedBoxMember[] = active.map((member, index) => ({
    id: member.id,
    // Never below zero: the domain refuses to take out more than was put in.
    savedCents: Math.max(0, saved.get(key(member.id)) ?? 0),
    monthlyCents: settings.get(key(member.id))?.monthlyPlanCents ?? 0,
    weight: byPercent ? (percentWeights[index] ?? 0) : 1,
  }));
  const projection = projectSharedBox({
    members: inputs,
    targetCents: active.length > 0 ? box.targetCents : null,
    targetMonth: box.targetDate
      ? toYearMonth(parse(box.targetDate))
      : undefined,
    monthlyRate,
    today: toYearMonth(ctx.today),
  });
  const views = active.map((member, index): BoxMemberView => {
    const row = projection.members[index];
    return {
      memberId: member.id,
      name: member.displayName,
      isMe: member.userId === ctx.userId,
      savedCents: row?.savedCents ?? 0,
      monthlyPlanCents: row?.monthlyCents ?? 0,
      weight: percentWeights[index] ?? 0,
      shareCents: row?.shareCents ?? null,
      missingCents: row?.missingCents ?? null,
      projection: row?.projection ?? null,
    };
  });
  const departed = members
    .filter((member) => member.status !== "active")
    .map((member) => ({
      memberId: member.id,
      name: historyName(member),
      savedCents: saved.get(key(member.id)) ?? 0,
    }))
    .filter((member) => member.savedCents !== 0);
  return {
    summary: {
      id: box.id,
      groupId: box.groupId,
      name: box.name,
      icon: box.icon,
      color: box.color,
      targetCents: box.targetCents,
      targetDate: box.targetDate,
      expectedRate: box.expectedRate,
      rateLabel: label,
      savedCents: projection.savedCents,
      monthlyCents: projection.monthlyCents,
      progress: projection.progress,
      projection: projection.total,
      archived: box.archivedAt !== null,
    },
    members: views,
    departed,
  };
}

/** The group's boxes, not archived, oldest first; for an active member. */
export async function listGroupBoxes(
  ctx: UserContext,
  groupId: string,
): Promise<BoxSummary[]> {
  const { group } = await requireActiveMember(db, ctx.userId, groupId);
  const boxes = await db
    .select()
    .from(sharedBoxes)
    .where(
      and(eq(sharedBoxes.groupId, groupId), isNull(sharedBoxes.archivedAt)),
    )
    .orderBy(asc(sharedBoxes.createdAt), asc(sharedBoxes.id));
  if (boxes.length === 0) return [];
  const ids = boxes.map((box) => box.id);
  const [members, saved, settings, market] = await Promise.all([
    groupMembers(db, groupId),
    savedByMember(db, ids),
    settingsByMember(db, ids),
    getMarketRates(),
  ]);
  return boxes.map((box) => ({
    ...compute(ctx, box, members, saved, settings, market).summary,
    groupName: group.name,
  }));
}

/**
 * Every box (not archived) of every group the person is active in, for
 * Planejar › Metas.
 */
export async function listMyBoxes(ctx: UserContext): Promise<BoxSummary[]> {
  const mine = await db
    .select({ groupId: shareMembers.groupId, groupName: shareGroups.name })
    .from(shareMembers)
    .innerJoin(shareGroups, eq(shareGroups.id, shareMembers.groupId))
    .where(
      and(
        eq(shareMembers.userId, ctx.userId),
        eq(shareMembers.status, "active"),
      ),
    );
  if (mine.length === 0) return [];
  const groupIds = mine.map((row) => row.groupId);
  const boxes = await db
    .select()
    .from(sharedBoxes)
    .where(
      and(
        inArray(sharedBoxes.groupId, groupIds),
        isNull(sharedBoxes.archivedAt),
      ),
    )
    .orderBy(asc(sharedBoxes.createdAt), asc(sharedBoxes.id));
  if (boxes.length === 0) return [];
  const ids = boxes.map((box) => box.id);
  const [members, saved, settings, market] = await Promise.all([
    membersOfGroups(db, groupIds),
    savedByMember(db, ids),
    settingsByMember(db, ids),
    getMarketRates(),
  ]);
  const names = new Map(mine.map((row) => [row.groupId, row.groupName]));
  return boxes.map((box) => {
    const people = members.filter((member) => member.groupId === box.groupId);
    return {
      ...compute(ctx, box, people, saved, settings, market).summary,
      groupName: names.get(box.groupId) ?? "",
    };
  });
}

/**
 * One box, archived or not, with each member's part and the history; for an
 * active member of its group. "Grupo não encontrado." for anyone else and
 * for a box that does not exist.
 */
export async function getBox(
  ctx: UserContext,
  boxId: string,
): Promise<BoxDetail> {
  const [box] = await db
    .select()
    .from(sharedBoxes)
    .where(eq(sharedBoxes.id, boxId))
    .limit(1);
  if (!box) throw new DomainError(GROUP_NOT_FOUND);
  const { group, member } = await requireActiveMember(
    db,
    ctx.userId,
    box.groupId,
  );
  const [members, saved, settings, market, entries, last] = await Promise.all([
    groupMembers(db, box.groupId),
    savedByMember(db, [box.id]),
    settingsByMember(db, [box.id]),
    getMarketRates(),
    db
      .select({
        id: sharedBoxEntries.id,
        memberId: sharedBoxEntries.memberId,
        amountCents: sharedBoxEntries.amountCents,
        occurredOn: sharedBoxEntries.occurredOn,
        sourceTransferId: sharedBoxEntries.sourceTransferId,
      })
      .from(sharedBoxEntries)
      .where(
        and(
          eq(sharedBoxEntries.boxId, box.id),
          isNull(sharedBoxEntries.deletedAt),
        ),
      )
      .orderBy(
        desc(sharedBoxEntries.occurredOn),
        desc(sharedBoxEntries.createdAt),
      ),
    lastBoxAccount(ctx, member.id),
  ]);
  const computed = compute(ctx, box, members, saved, settings, market);
  const names = new Map(members.map((row) => [row.id, historyName(row)]));
  return {
    ...computed.summary,
    groupName: group.name,
    targetSplit: box.targetSplit,
    myMemberId: member.id,
    isOwner: member.role === "owner",
    members: computed.members,
    departed: computed.departed,
    entries: entries.map((entry) => {
      const mine = entry.memberId === member.id;
      return {
        id: entry.id,
        memberId: entry.memberId,
        name: names.get(entry.memberId) ?? "Alguém",
        amountCents: entry.amountCents,
        occurredOn: entry.occurredOn,
        mine,
        withTransfer: mine && entry.sourceTransferId !== null,
      };
    }),
    mySavedCents: Math.max(0, saved.get(`${box.id}:${member.id}`) ?? 0),
    lastBoxAccountId: last,
  };
}

/**
 * The caixinha of my own the last time I saved with a transfer, in any
 * shared box: followed only through my own transfer (user_id = me).
 */
async function lastBoxAccount(
  ctx: UserContext,
  memberId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ accountId: transactions.accountId })
    .from(sharedBoxEntries)
    .innerJoin(
      transactions,
      and(
        eq(transactions.transferId, sharedBoxEntries.sourceTransferId),
        eq(transactions.userId, ctx.userId),
        sql`${transactions.amountCents} > 0`,
        isNull(transactions.deletedAt),
      ),
    )
    .where(
      and(
        eq(sharedBoxEntries.memberId, memberId),
        isNull(sharedBoxEntries.deletedAt),
        isNotNull(sharedBoxEntries.sourceTransferId),
        sql`${sharedBoxEntries.amountCents} > 0`,
      ),
    )
    .orderBy(desc(sharedBoxEntries.createdAt))
    .limit(1);
  return row?.accountId ?? null;
}

// Writing -------------------------------------------------------------------

/**
 * The box and the person's active membership in its group, both locked
 * (the group first, as every write to a group). With `writable`, an
 * archived box is refused.
 */
async function lockBox(
  tx: Transaction,
  ctx: UserContext,
  boxId: string,
  { writable = true }: { writable?: boolean } = {},
): Promise<{ box: BoxRow; group: GroupRow; member: MemberRow }> {
  const [found] = await tx
    .select({ groupId: sharedBoxes.groupId })
    .from(sharedBoxes)
    .where(eq(sharedBoxes.id, boxId))
    .limit(1);
  // A box that exists nowhere reads like one of a group the person is not in.
  if (!found) throw new DomainError(GROUP_NOT_FOUND);
  const { group, member } = await requireActiveMember(
    tx,
    ctx.userId,
    found.groupId,
    { lock: true },
  );
  const [box] = await tx
    .select()
    .from(sharedBoxes)
    .where(and(eq(sharedBoxes.id, boxId), eq(sharedBoxes.groupId, group.id)))
    .for("update");
  if (!box) throw new DomainError(GROUP_NOT_FOUND);
  if (writable && box.archivedAt) throw new DomainError(BOX_ARCHIVED);
  return { box, group, member };
}

export type BoxInput = {
  name: string;
  icon: string;
  color: ColorToken;
  targetCents: number | null;
  targetDate: string | null;
  expectedRate: GoalExpectedRate | null;
};

function validateBox(ctx: UserContext, input: BoxInput): void {
  if (
    input.targetCents !== null &&
    (!Number.isSafeInteger(input.targetCents) || input.targetCents <= 0)
  ) {
    throw new DomainError("O objetivo precisa ser maior que zero.");
  }
  if (input.targetDate && input.targetDate <= ctx.todayIso) {
    throw new DomainError("O prazo precisa ser uma data futura.");
  }
}

/** A new box in the group (any active member). */
export async function createBox(
  ctx: UserContext,
  groupId: string,
  input: BoxInput & { id: string },
): Promise<{ boxId: string }> {
  validateBox(ctx, input);
  return db.transaction(async (tx) => {
    const { member } = await requireActiveMember(tx, ctx.userId, groupId, {
      lock: true,
    });
    const [existing] = await tx
      .select({ groupId: sharedBoxes.groupId })
      .from(sharedBoxes)
      .where(eq(sharedBoxes.id, input.id))
      .limit(1);
    if (existing) {
      if (existing.groupId !== groupId) throw new DomainError(GROUP_NOT_FOUND);
      return { boxId: input.id };
    }
    await tx.insert(sharedBoxes).values({
      id: input.id,
      groupId,
      name: input.name.trim(),
      icon: input.icon,
      color: input.color,
      targetCents: input.targetCents,
      targetDate: input.targetDate,
      expectedRate: input.expectedRate,
      createdByMember: member.id,
    });
    return { boxId: input.id };
  });
}

/** Name, look, target, deadline and rate of a box (any active member). */
export async function updateBox(
  ctx: UserContext,
  boxId: string,
  input: BoxInput,
): Promise<void> {
  validateBox(ctx, input);
  await db.transaction(async (tx) => {
    const { box } = await lockBox(tx, ctx, boxId);
    await tx
      .update(sharedBoxes)
      .set({
        name: input.name.trim(),
        icon: input.icon,
        color: input.color,
        targetCents: input.targetCents,
        targetDate: input.targetDate,
        expectedRate: input.expectedRate,
      })
      .where(eq(sharedBoxes.id, box.id));
  });
}

/** Archives a box (any active member), or brings it back ("Desfazer"). */
export async function archiveBox(
  ctx: UserContext,
  boxId: string,
  archived: boolean,
): Promise<void> {
  await db.transaction(async (tx) => {
    const { box } = await lockBox(tx, ctx, boxId, { writable: false });
    await tx
      .update(sharedBoxes)
      .set({ archivedAt: archived ? (box.archivedAt ?? new Date()) : null })
      .where(eq(sharedBoxes.id, box.id));
  });
}

/** "Mudar meu plano": how much the person plans to save a month, their row only. */
export async function setMyPlan(
  ctx: UserContext,
  boxId: string,
  monthlyCents: number,
): Promise<void> {
  if (!Number.isSafeInteger(monthlyCents) || monthlyCents < 0) {
    throw new DomainError("O valor por mês não pode ser negativo.");
  }
  await db.transaction(async (tx) => {
    const { box, member } = await lockBox(tx, ctx, boxId);
    await tx
      .insert(sharedBoxMembers)
      .values({
        boxId: box.id,
        memberId: member.id,
        monthlyPlanCents: monthlyCents,
      })
      .onConflictDoUpdate({
        target: [sharedBoxMembers.boxId, sharedBoxMembers.memberId],
        set: { monthlyPlanCents: monthlyCents },
      });
  });
}

export type TargetSplitInput =
  | { method: "equal" }
  | { method: "percent"; weights: Record<string, number> };

/**
 * Each active member's part of the target (the group's owner): equal, or
 * percentages (basis points) for every active member, summing to 100%.
 */
export async function setTargetWeights(
  ctx: UserContext,
  boxId: string,
  split: TargetSplitInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    const { box, group, member } = await lockBox(tx, ctx, boxId);
    if (member.role !== "owner") throw new DomainError(OWNER_ONLY);
    if (split.method === "equal") {
      await tx
        .update(sharedBoxes)
        .set({ targetSplit: "equal" })
        .where(eq(sharedBoxes.id, box.id));
      return;
    }
    const active = (await groupMembers(tx, group.id)).filter(
      (row) => row.status === "active",
    );
    const ids = new Set(active.map((row) => row.id));
    const given = Object.entries(split.weights);
    if (given.length !== active.length || given.some(([id]) => !ids.has(id))) {
      throw new DomainError(
        "O grupo mudou. Confira as pessoas e tente de novo.",
      );
    }
    const sum = given.reduce((total, [, weight]) => total + weight, 0);
    if (
      given.some(
        ([, weight]) =>
          !Number.isInteger(weight) || weight < 0 || weight > 10_000,
      ) ||
      sum !== 10_000
    ) {
      throw new DomainError(
        `Os percentuais somam ${formatPercentPoints(sum)}. Precisam somar 100%.`,
      );
    }
    for (const [memberId, weight] of given) {
      await tx
        .insert(sharedBoxMembers)
        .values({ boxId: box.id, memberId, targetWeight: weight })
        .onConflictDoUpdate({
          target: [sharedBoxMembers.boxId, sharedBoxMembers.memberId],
          set: { targetWeight: weight },
        });
    }
    await tx
      .update(sharedBoxes)
      .set({ targetSplit: "percent" })
      .where(eq(sharedBoxes.id, box.id));
  });
}

/** 9000 → "90%", 3333 → "33,33%". */
function formatPercentPoints(basisPoints: number): string {
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(basisPoints / 100)}%`;
}

export type EntryInput = {
  /** From the client: the same entry sent twice is recorded once. */
  id: string;
  amountCents: number;
  occurredOn: string;
};

export type ContributeInput = EntryInput & {
  /** With "Lançar no meu extrato": my account the money leaves (not a card). */
  fromAccountId?: string | null;
  /** …and my caixinha (savings_box) it goes to. */
  toBoxAccountId?: string | null;
};

export type WithdrawInput = EntryInput & {
  /** With "Lançar no meu extrato": my caixinha the money leaves… */
  fromBoxAccountId?: string | null;
  /** …and my account it goes to (not a card). */
  toAccountId?: string | null;
};

export type EntryResult = {
  entryId: string;
  transferId: string | null;
  pending: PendingPush[];
};

function assertEntry(ctx: UserContext, input: EntryInput): void {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    throw new DomainError("O valor precisa ser maior que zero.");
  }
  if (input.occurredOn > ctx.todayIso) {
    throw new DomainError("A data não pode ser depois de hoje.");
  }
}

/** The entry already recorded with this client id, when it is mine in this box. */
async function replayed(
  tx: Transaction,
  input: EntryInput,
  boxId: string,
  memberId: string,
): Promise<EntryResult | null> {
  const [done] = await tx
    .select({
      id: sharedBoxEntries.id,
      boxId: sharedBoxEntries.boxId,
      memberId: sharedBoxEntries.memberId,
      sourceTransferId: sharedBoxEntries.sourceTransferId,
    })
    .from(sharedBoxEntries)
    .where(eq(sharedBoxEntries.id, input.id))
    .limit(1);
  if (!done) return null;
  if (done.boxId !== boxId || done.memberId !== memberId) {
    throw new DomainError("Este registro já existe.");
  }
  return { entryId: done.id, transferId: done.sourceTransferId, pending: [] };
}

/** What a member has in the box now (entries in minus out). */
async function savedOf(
  tx: Executor,
  boxId: string,
  memberId: string,
): Promise<number> {
  const [row] = await tx
    .select({
      total:
        sql<number>`coalesce(sum(${sharedBoxEntries.amountCents}), 0)`.mapWith(
          Number,
        ),
    })
    .from(sharedBoxEntries)
    .where(
      and(
        eq(sharedBoxEntries.boxId, boxId),
        eq(sharedBoxEntries.memberId, memberId),
        isNull(sharedBoxEntries.deletedAt),
      ),
    );
  return row?.total ?? 0;
}

/** What the group's active members have in the box now. */
async function activeTotal(tx: Executor, box: BoxRow): Promise<number> {
  const [row] = await tx
    .select({
      total:
        sql<number>`coalesce(sum(${sharedBoxEntries.amountCents}), 0)`.mapWith(
          Number,
        ),
    })
    .from(sharedBoxEntries)
    .innerJoin(shareMembers, eq(shareMembers.id, sharedBoxEntries.memberId))
    .where(
      and(
        eq(sharedBoxEntries.boxId, box.id),
        isNull(sharedBoxEntries.deletedAt),
        eq(shareMembers.status, "active"),
      ),
    );
  return row?.total ?? 0;
}

/** The other active members with an account, to tell. */
async function othersOf(
  tx: Executor,
  groupId: string,
  memberId: string,
): Promise<{ memberId: string; userId: string }[]> {
  const rows = await groupMembers(tx, groupId);
  return rows.flatMap((row) =>
    row.status === "active" && row.id !== memberId && row.userId
      ? [{ memberId: row.id, userId: row.userId }]
      : [],
  );
}

/**
 * The day's notice to the other members (one per actor and day, the sums
 * add up), and "chegou ao objetivo" to everyone the first time the total
 * reaches the target.
 */
async function notifyEntry(
  tx: Transaction,
  ctx: UserContext,
  context: { box: BoxRow; group: GroupRow; member: MemberRow },
  amountCents: number,
  totalBefore: number,
): Promise<PendingPush[]> {
  const { box, group, member } = context;
  const actor = await accountOf(tx, ctx.userId);
  const others = await othersOf(tx, group.id, member.id);
  const url = boxHref(group.id, box.id);
  const tag = `caixinha-${box.id}`;
  const saving = amountCents > 0;
  const pending: PendingPush[] = [];
  for (const other of others) {
    const push = await notifyMember(
      tx,
      { userId: other.userId },
      `box_activity:${box.id}:${member.id}:${ctx.todayIso}`,
      {
        type: "box_activity",
        groupId: group.id,
        groupName: group.name,
        boxId: box.id,
        boxName: box.name,
        actorName: actor.name,
        saved: saving ? 1 : 0,
        savedCents: saving ? amountCents : 0,
        withdrawn: saving ? 0 : 1,
        withdrawnCents: saving ? 0 : -amountCents,
        amounts: true,
      },
      {
        push: true,
        url,
        tag,
        sum: ["saved", "savedCents", "withdrawn", "withdrawnCents"],
      },
    );
    if (push) pending.push(push);
  }
  const target = box.targetCents;
  if (
    target !== null &&
    totalBefore < target &&
    totalBefore + amountCents >= target
  ) {
    const everyone = [{ memberId: member.id, userId: ctx.userId }, ...others];
    for (const person of everyone) {
      const push = await notifyMember(
        tx,
        { userId: person.userId },
        `box_reached:${box.id}`,
        {
          type: "box_reached",
          groupId: group.id,
          groupName: group.name,
          boxId: box.id,
          boxName: box.name,
          amounts: false,
        },
        // Whoever made it reach the target sees it on the screen already.
        { push: person.userId !== ctx.userId, url, tag, once: true },
      );
      if (push) pending.push(push);
    }
  }
  return pending;
}

/**
 * "Guardar": records what the person put in the box and, when they ask for
 * it, the transfer from one of their accounts to a caixinha of their own,
 * all in one transaction.
 */
export async function contribute(
  ctx: UserContext,
  boxId: string,
  input: ContributeInput,
): Promise<EntryResult> {
  assertEntry(ctx, input);
  return db.transaction(async (tx) => {
    const context = await lockBox(tx, ctx, boxId);
    const { box, member } = context;
    const again = await replayed(tx, input, box.id, member.id);
    if (again) return again;

    let transferId: string | null = null;
    if (input.fromAccountId || input.toBoxAccountId) {
      if (!input.fromAccountId || !input.toBoxAccountId) {
        throw new DomainError("Escolha de onde sai e para qual caixinha vai.");
      }
      const from = await requireAccount(tx, ctx.userId, input.fromAccountId);
      if (from.type === "credit_card") {
        throw new DomainError("O dinheiro sai de uma conta, não de um cartão.");
      }
      const to = await requireAccount(tx, ctx.userId, input.toBoxAccountId);
      if (to.type !== "savings_box") {
        throw new DomainError("Escolha uma caixinha sua para guardar.");
      }
      ({ transferId } = await insertTransfer(tx, ctx, {
        fromAccountId: from.id,
        toAccountId: to.id,
        amountCents: input.amountCents,
        occurredOn: input.occurredOn,
        description: `Caixinha ${box.name}`,
      }));
    }
    const totalBefore = await activeTotal(tx, box);
    await tx.insert(sharedBoxEntries).values({
      id: input.id,
      boxId: box.id,
      memberId: member.id,
      amountCents: input.amountCents,
      occurredOn: input.occurredOn,
      sourceTransferId: transferId,
    });
    const pending = await notifyEntry(
      tx,
      ctx,
      context,
      input.amountCents,
      totalBefore,
    );
    return { entryId: input.id, transferId, pending };
  });
}

/** "Você pode resgatar até R$ 1.800,00, o que você guardou." */
export function withdrawLimitMessage(savedCents: number): string {
  return savedCents > 0
    ? `Você pode resgatar até ${formatBRL(savedCents)}, o que você guardou.`
    : "Você ainda não guardou nada nesta caixinha.";
}

/**
 * "Resgatar": takes out at most what the person put in themself, checked
 * under the lock, and, when they ask for it, the transfer from their own
 * caixinha back to one of their accounts.
 */
export async function withdraw(
  ctx: UserContext,
  boxId: string,
  input: WithdrawInput,
): Promise<EntryResult> {
  assertEntry(ctx, input);
  return db.transaction(async (tx) => {
    const context = await lockBox(tx, ctx, boxId);
    const { box, member } = context;
    const again = await replayed(tx, input, box.id, member.id);
    if (again) return again;
    const mine = await savedOf(tx, box.id, member.id);
    if (input.amountCents > mine) {
      throw new DomainError(withdrawLimitMessage(Math.max(0, mine)));
    }

    let transferId: string | null = null;
    if (input.fromBoxAccountId || input.toAccountId) {
      if (!input.fromBoxAccountId || !input.toAccountId) {
        throw new DomainError("Escolha de qual caixinha sai e para onde vai.");
      }
      const from = await requireAccount(tx, ctx.userId, input.fromBoxAccountId);
      if (from.type !== "savings_box") {
        throw new DomainError("O resgate sai de uma caixinha sua.");
      }
      const to = await requireAccount(tx, ctx.userId, input.toAccountId);
      if (to.type === "credit_card") {
        throw new DomainError(
          "O resgate vai para uma conta, não para um cartão.",
        );
      }
      ({ transferId } = await insertTransfer(tx, ctx, {
        fromAccountId: from.id,
        toAccountId: to.id,
        amountCents: input.amountCents,
        occurredOn: input.occurredOn,
        description: `Resgate · Caixinha ${box.name}`,
      }));
    }
    const totalBefore = await activeTotal(tx, box);
    await tx.insert(sharedBoxEntries).values({
      id: input.id,
      boxId: box.id,
      memberId: member.id,
      amountCents: -input.amountCents,
      occurredOn: input.occurredOn,
      sourceTransferId: transferId,
    });
    const pending = await notifyEntry(
      tx,
      ctx,
      context,
      -input.amountCents,
      totalBefore,
    );
    return { entryId: input.id, transferId, pending };
  });
}

/**
 * "Desfazer" of an entry, by whoever made it: the entry goes, with both legs
 * of its transfer (mine only). An entry in is refused when taking it back
 * would leave the person with less than nothing (they took it out since).
 */
export async function undoEntry(
  ctx: UserContext,
  entryId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [found] = await tx
      .select({ boxId: sharedBoxEntries.boxId })
      .from(sharedBoxEntries)
      .where(eq(sharedBoxEntries.id, entryId))
      .limit(1);
    if (!found) throw new DomainError(GROUP_NOT_FOUND);
    const { box, member } = await lockBox(tx, ctx, found.boxId, {
      writable: false,
    });
    const [entry] = await tx
      .select()
      .from(sharedBoxEntries)
      .where(
        and(
          eq(sharedBoxEntries.id, entryId),
          eq(sharedBoxEntries.boxId, box.id),
          eq(sharedBoxEntries.memberId, member.id),
          isNull(sharedBoxEntries.deletedAt),
        ),
      )
      .limit(1);
    if (!entry) throw new DomainError(ENTRY_NOT_FOUND);
    if (entry.amountCents > 0) {
      const mine = await savedOf(tx, box.id, member.id);
      if (mine - entry.amountCents < 0) {
        throw new DomainError(
          "Não dá para desfazer: você já resgatou parte desse valor.",
        );
      }
    }
    const now = new Date();
    await tx
      .update(sharedBoxEntries)
      .set({ deletedAt: now })
      .where(eq(sharedBoxEntries.id, entry.id));
    if (entry.sourceTransferId) {
      await tx
        .update(transactions)
        .set({ deletedAt: now })
        .where(
          and(
            eq(transactions.transferId, entry.sourceTransferId),
            eq(transactions.userId, ctx.userId),
            isNull(transactions.deletedAt),
          ),
        );
    }
  });
}

// Membership changes (called by groups.ts inside its transaction) -----------

/**
 * Back to equal parts in every box of the group: percentages chosen for the
 * people who were in it no longer cover the people who are.
 */
export async function resetBoxTargets(
  tx: Executor,
  groupId: string,
): Promise<void> {
  await tx
    .update(sharedBoxes)
    .set({ targetSplit: "equal" })
    .where(
      and(
        eq(sharedBoxes.groupId, groupId),
        eq(sharedBoxes.targetSplit, "percent"),
      ),
    );
}

/** Whether a box, an entry or a member row points at the member. */
export async function hasBoxHistory(
  tx: Executor,
  memberId: string,
): Promise<boolean> {
  const [entry, row, created] = await Promise.all([
    tx
      .select({ id: sharedBoxEntries.id })
      .from(sharedBoxEntries)
      .where(eq(sharedBoxEntries.memberId, memberId))
      .limit(1),
    tx
      .select({ id: sharedBoxMembers.boxId })
      .from(sharedBoxMembers)
      .where(eq(sharedBoxMembers.memberId, memberId))
      .limit(1),
    tx
      .select({ id: sharedBoxes.id })
      .from(sharedBoxes)
      .where(eq(sharedBoxes.createdByMember, memberId))
      .limit(1),
  ]);
  return entry.length + row.length + created.length > 0;
}
