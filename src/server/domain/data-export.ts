// "Exportar todos os dados" (Ajustes › Dados, doc 01 §11.8): everything the
// person has in the app, as JSON plus the ledger CSV, in a ZIP built in memory
// and sent straight in the response (never stored). Reads only the person's
// own rows: every query is scoped by user_id, the child tables through their
// parent's user_id. Of the shared tables (ADR-13), only the groups the person
// joined, and of the other members only the name. No secrets: no session
// token, password hash, passkey key, push endpoint or link verifier.
// When attachments exist (Vercel Blob), add their files to the archive.
import {
  and,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  isNull,
  or,
} from "drizzle-orm";
import { buildDataArchive, dataArchiveName } from "@/lib/export/archive";
import { dataReadme } from "@/lib/export/readme";
import { transactionsCsv } from "@/lib/import/export";
import { db, type Transaction } from "@/server/db/client";
import {
  account,
  accountYield,
  auditLog,
  balanceSnapshots,
  budgets,
  cardInvoices,
  categories,
  categorizationRules,
  creditCardDetails,
  featureFlagOverrides,
  finAccounts,
  goals,
  imports,
  installmentPlans,
  notifications,
  passkey,
  pushSubscriptions,
  recurrences,
  recurrenceTags,
  session,
  sharedBoxEntries,
  sharedBoxes,
  sharedBoxMembers,
  sharedExpenseShares,
  sharedExpenses,
  shareGroups,
  shareMembers,
  shareSettlements,
  simulations,
  tags,
  transactions,
  transactionTags,
  user,
  userSettings,
  userTips,
} from "@/server/db/schema";
import packageJson from "../../../package.json";
import type { UserContext } from "./context";
import { listExportRows } from "./imports";

/**
 * Tables with a user_id column that go into the archive (some only in part:
 * see `access`). A test lists every table with a user_id and fails when one
 * is in neither list, so a new table has to be placed here.
 */
export const EXPORTED_USER_TABLES = [
  "user_settings",
  "fin_accounts",
  "card_invoices",
  "categories",
  "tags",
  "categorization_rules",
  "transactions",
  "installment_plans",
  "recurrences",
  "goals",
  "budgets",
  "imports",
  "simulations",
  "notifications",
  "user_tips",
  "feature_flag_overrides",
  "share_members",
  "session",
  "passkey",
  "push_subscriptions",
  "account",
] as const;

/** Tables with a user_id column left out, and why. */
export const NOT_EXPORTED_USER_TABLES: Record<string, string> = {
  access_links:
    "Links de convite e redefinição: só guardam segredos (seletor e hash) e datas.",
};

// Every column except user_id (and the secrets, where a table has them).
const { userId: _settingsUser, ...settingsColumns } =
  getTableColumns(userSettings);
const { userId: _accountUser, ...finAccountColumns } =
  getTableColumns(finAccounts);
const { accountId: _cardAccount, ...creditCardColumns } =
  getTableColumns(creditCardDetails);
const { accountId: _yieldAccount, ...yieldColumns } =
  getTableColumns(accountYield);
const { userId: _invoiceUser, ...invoiceColumns } =
  getTableColumns(cardInvoices);
const { userId: _categoryUser, ...categoryColumns } =
  getTableColumns(categories);
const { userId: _tagUser, ...tagColumns } = getTableColumns(tags);
const { userId: _ruleUser, ...ruleColumns } =
  getTableColumns(categorizationRules);
const {
  userId: _transactionUser,
  attachmentPathname: _attachment,
  ...transactionColumns
} = getTableColumns(transactions);
const { userId: _planUser, ...planColumns } = getTableColumns(installmentPlans);
const { userId: _recurrenceUser, ...recurrenceColumns } =
  getTableColumns(recurrences);
const { userId: _goalUser, ...goalColumns } = getTableColumns(goals);
const { userId: _budgetUser, ...budgetColumns } = getTableColumns(budgets);
const {
  userId: _importUser,
  blobPathname: _blob,
  ...importColumns
} = getTableColumns(imports);
const { userId: _simulationUser, ...simulationColumns } =
  getTableColumns(simulations);

/** Groups every `[key, value]` row into a map of lists. */
function groupBy<K, V>(rows: readonly [K, V][]): Map<K, V[]> {
  const map = new Map<K, V[]>();
  for (const [key, value] of rows) {
    const list = map.get(key) ?? [];
    list.push(value);
    map.set(key, list);
  }
  return map;
}

export type AccountDataExport = Awaited<ReturnType<typeof readAccountData>>;

/**
 * Everything of the person, in one transaction (a consistent read). Money is
 * in integer cents (`...Cents`), rates are decimal strings, dates are
 * `YYYY-MM-DD` and timestamps become ISO strings in JSON.
 */
export async function collectAccountData(
  ctx: UserContext,
  now = new Date(),
): Promise<AccountDataExport> {
  return db.transaction((tx) => readAccountData(tx, ctx.userId, now));
}

async function readAccountData(tx: Transaction, userId: string, now: Date) {
  const [profile] = await tx
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(eq(user.id, userId));
  const [settings] = await tx
    .select(settingsColumns)
    .from(userSettings)
    .where(eq(userSettings.userId, userId));

  const accountRows = await tx
    .select({
      account: finAccountColumns,
      card: creditCardColumns,
      cardAccount: creditCardDetails.accountId,
      yield: yieldColumns,
      yieldAccount: accountYield.accountId,
    })
    .from(finAccounts)
    .leftJoin(
      creditCardDetails,
      eq(creditCardDetails.accountId, finAccounts.id),
    )
    .leftJoin(accountYield, eq(accountYield.accountId, finAccounts.id))
    .where(eq(finAccounts.userId, userId))
    .orderBy(finAccounts.sortOrder, finAccounts.createdAt);
  const cardInvoiceRows = await tx
    .select(invoiceColumns)
    .from(cardInvoices)
    .where(eq(cardInvoices.userId, userId))
    .orderBy(cardInvoices.referenceMonth);
  const balanceSnapshotRows = await tx
    .select(getTableColumns(balanceSnapshots))
    .from(balanceSnapshots)
    .innerJoin(finAccounts, eq(finAccounts.id, balanceSnapshots.accountId))
    .where(eq(finAccounts.userId, userId))
    .orderBy(balanceSnapshots.accountId, balanceSnapshots.onDate);

  const categoryRows = await tx
    .select(categoryColumns)
    .from(categories)
    .where(eq(categories.userId, userId))
    .orderBy(categories.kind, categories.sortOrder);
  const tagRows = await tx
    .select(tagColumns)
    .from(tags)
    .where(eq(tags.userId, userId));
  const ruleRows = await tx
    .select(ruleColumns)
    .from(categorizationRules)
    .where(eq(categorizationRules.userId, userId));

  // Soft-deleted entries too (with deletedAt): still the person's data.
  const transactionRows = await tx
    .select(transactionColumns)
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .orderBy(transactions.occurredOn, transactions.id);
  // Tags of each entry in a separate read, grouped here (no subquery).
  const transactionTagIds = groupBy(
    (
      await tx
        .select({
          transactionId: transactionTags.transactionId,
          tagId: transactionTags.tagId,
        })
        .from(transactionTags)
        .innerJoin(
          transactions,
          eq(transactions.id, transactionTags.transactionId),
        )
        .where(eq(transactions.userId, userId))
    ).map((row): [string, string] => [row.transactionId, row.tagId]),
  );
  const planRows = await tx
    .select(planColumns)
    .from(installmentPlans)
    .where(eq(installmentPlans.userId, userId));
  const recurrenceRows = await tx
    .select(recurrenceColumns)
    .from(recurrences)
    .where(eq(recurrences.userId, userId));
  const recurrenceTagIds = groupBy(
    (
      await tx
        .select({
          recurrenceId: recurrenceTags.recurrenceId,
          tagId: recurrenceTags.tagId,
        })
        .from(recurrenceTags)
        .innerJoin(recurrences, eq(recurrences.id, recurrenceTags.recurrenceId))
        .where(eq(recurrences.userId, userId))
    ).map((row): [string, string] => [row.recurrenceId, row.tagId]),
  );

  const goalRows = await tx
    .select(goalColumns)
    .from(goals)
    .where(eq(goals.userId, userId));
  const budgetRows = await tx
    .select(budgetColumns)
    .from(budgets)
    .where(eq(budgets.userId, userId))
    .orderBy(budgets.month);
  const importRows = await tx
    .select(importColumns)
    .from(imports)
    .where(eq(imports.userId, userId));
  const simulationRows = await tx
    .select(simulationColumns)
    .from(simulations)
    .where(eq(simulations.userId, userId));
  const notificationRows = await tx
    .select({
      id: notifications.id,
      type: notifications.type,
      payload: notifications.payload,
      readAt: notifications.readAt,
      dismissedAt: notifications.dismissedAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(notifications.createdAt);
  const tipsSeen = await tx
    .select({ tipId: userTips.tipId, seenAt: userTips.seenAt })
    .from(userTips)
    .where(eq(userTips.userId, userId));
  const flagOverrides = await tx
    .select({
      key: featureFlagOverrides.key,
      enabled: featureFlagOverrides.enabled,
    })
    .from(featureFlagOverrides)
    .where(eq(featureFlagOverrides.userId, userId));

  const sharing = await readSharing(tx, userId);

  const [password] = await tx
    .select({ id: account.id })
    .from(account)
    .where(
      and(
        eq(account.userId, userId),
        eq(account.providerId, "credential"),
        isNotNull(account.password),
      ),
    )
    .limit(1);
  const passkeys = await tx
    .select({
      name: passkey.name,
      deviceType: passkey.deviceType,
      backedUp: passkey.backedUp,
      createdAt: passkey.createdAt,
    })
    .from(passkey)
    .where(eq(passkey.userId, userId));
  const sessions = await tx
    .select({
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      expiresAt: session.expiresAt,
    })
    .from(session)
    .where(eq(session.userId, userId))
    .orderBy(session.createdAt);
  const pushDevices = await tx
    .select({
      createdAt: pushSubscriptions.createdAt,
      userAgent: pushSubscriptions.userAgent,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  // What administrators did to the account and what the person did there;
  // without the details (metadata, the other person's e-mail).
  const adminActivity = await tx
    .select({
      action: auditLog.action,
      actorName: auditLog.actorName,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .where(or(eq(auditLog.targetUserId, userId), eq(auditLog.actorId, userId)))
    .orderBy(auditLog.id);

  return {
    format: "prumo-export" as const,
    version: 1 as const,
    exportedAt: now.toISOString(),
    app: { version: packageJson.version },
    profile: profile ?? null,
    settings: settings ?? null,
    accounts: accountRows.map((row) => ({
      ...row.account,
      creditCard: row.cardAccount ? row.card : null,
      yield: row.yieldAccount ? row.yield : null,
    })),
    cardInvoices: cardInvoiceRows,
    balanceSnapshots: balanceSnapshotRows,
    categories: categoryRows,
    tags: tagRows,
    categorizationRules: ruleRows,
    transactions: transactionRows.map((row) => ({
      ...row,
      tagIds: transactionTagIds.get(row.id) ?? [],
    })),
    installmentPlans: planRows,
    recurrences: recurrenceRows.map((row) => ({
      ...row,
      tagIds: recurrenceTagIds.get(row.id) ?? [],
    })),
    goals: goalRows,
    budgets: budgetRows,
    imports: importRows,
    simulations: simulationRows,
    notifications: notificationRows,
    tipsSeen,
    flagOverrides,
    sharing,
    access: {
      hasPassword: password !== undefined,
      passkeys,
      sessions,
      pushDevices,
    },
    adminActivity,
  };
}

/**
 * The groups the person was invited to. A group they joined (active, left or
 * removed)
 * comes with its members' names, the expenses they paid or have a part in,
 * the settlements they are in and their own part of each shared box; one they
 * were only invited to (or declined) comes with its name and their status.
 * Never another member's e-mail.
 */
/** Statuses of someone who took part in the group (and has history there). */
const JOINED = new Set<string>(["active", "left", "removed"]);

async function readSharing(tx: Transaction, userId: string) {
  const mine = await tx
    .select({
      memberId: shareMembers.id,
      groupId: shareMembers.groupId,
      name: shareGroups.name,
      role: shareMembers.role,
      status: shareMembers.status,
      invitedAt: shareMembers.invitedAt,
      respondedAt: shareMembers.respondedAt,
      leftAt: shareMembers.leftAt,
    })
    .from(shareMembers)
    .innerJoin(shareGroups, eq(shareGroups.id, shareMembers.groupId))
    .where(eq(shareMembers.userId, userId))
    .orderBy(shareMembers.invitedAt);
  const joined = mine.filter((row) => JOINED.has(row.status));
  const groupIds = joined.map((row) => row.groupId);
  const memberIds = joined.map((row) => row.memberId);
  // With no joined group the lists below come back empty (inArray of an
  // empty list is false).

  // An invite to an e-mail without an account carries the e-mail as its
  // name: someone else's e-mail, so it goes out without a name.
  const members = (
    await tx
      .select({
        groupId: shareMembers.groupId,
        memberId: shareMembers.id,
        displayName: shareMembers.displayName,
        invitedEmail: shareMembers.invitedEmail,
        role: shareMembers.role,
        status: shareMembers.status,
      })
      .from(shareMembers)
      .where(inArray(shareMembers.groupId, groupIds))
  ).map(({ invitedEmail, displayName, ...member }) => ({
    ...member,
    displayName:
      displayName.trim().toLowerCase() === invitedEmail.trim().toLowerCase()
        ? null
        : displayName,
  }));
  const myShares = await tx
    .select({
      expenseId: sharedExpenseShares.expenseId,
      shareCents: sharedExpenseShares.shareCents,
    })
    .from(sharedExpenseShares)
    .where(inArray(sharedExpenseShares.memberId, memberIds));
  const shareBy = new Map(myShares.map((row) => [row.expenseId, row]));
  const expenses = await tx
    .select({
      id: sharedExpenses.id,
      groupId: sharedExpenses.groupId,
      description: sharedExpenses.description,
      amountCents: sharedExpenses.amountCents,
      occurredOn: sharedExpenses.occurredOn,
      splitMethod: sharedExpenses.splitMethod,
      paidByMemberId: sharedExpenses.paidByMember,
    })
    .from(sharedExpenses)
    .where(
      and(
        inArray(sharedExpenses.groupId, groupIds),
        isNull(sharedExpenses.deletedAt),
      ),
    )
    .orderBy(sharedExpenses.occurredOn);
  const settlements = await tx
    .select({
      id: shareSettlements.id,
      groupId: shareSettlements.groupId,
      fromMemberId: shareSettlements.fromMember,
      toMemberId: shareSettlements.toMember,
      amountCents: shareSettlements.amountCents,
      occurredOn: shareSettlements.occurredOn,
    })
    .from(shareSettlements)
    .where(
      and(
        isNull(shareSettlements.deletedAt),
        or(
          inArray(shareSettlements.fromMember, memberIds),
          inArray(shareSettlements.toMember, memberIds),
        ),
      ),
    )
    .orderBy(shareSettlements.occurredOn);
  const boxes = await tx
    .select({
      id: sharedBoxes.id,
      groupId: sharedBoxes.groupId,
      name: sharedBoxes.name,
      targetCents: sharedBoxes.targetCents,
      targetDate: sharedBoxes.targetDate,
      archivedAt: sharedBoxes.archivedAt,
    })
    .from(sharedBoxes)
    .where(inArray(sharedBoxes.groupId, groupIds));
  const plans = await tx
    .select({
      boxId: sharedBoxMembers.boxId,
      monthlyPlanCents: sharedBoxMembers.monthlyPlanCents,
    })
    .from(sharedBoxMembers)
    .where(inArray(sharedBoxMembers.memberId, memberIds));
  const planBy = new Map(plans.map((row) => [row.boxId, row.monthlyPlanCents]));
  const entries = groupBy(
    (
      await tx
        .select({
          boxId: sharedBoxEntries.boxId,
          id: sharedBoxEntries.id,
          amountCents: sharedBoxEntries.amountCents,
          occurredOn: sharedBoxEntries.occurredOn,
        })
        .from(sharedBoxEntries)
        .where(
          and(
            inArray(sharedBoxEntries.memberId, memberIds),
            isNull(sharedBoxEntries.deletedAt),
          ),
        )
        .orderBy(sharedBoxEntries.occurredOn)
    ).map(({ boxId, ...entry }): [string, typeof entry] => [boxId, entry]),
  );

  const mineIds = new Set(memberIds);
  return {
    groups: mine.map((row) => {
      if (!JOINED.has(row.status)) return groupHeader(row);
      const inGroup = <T extends { groupId: string }>(list: T[]) =>
        list
          .filter((item) => item.groupId === row.groupId)
          .map(({ groupId: _groupId, ...rest }) => rest);
      return {
        ...groupHeader(row),
        members: inGroup(members),
        expenses: inGroup(expenses)
          .filter(
            (expense) =>
              mineIds.has(expense.paidByMemberId) || shareBy.has(expense.id),
          )
          .map((expense) => ({
            ...expense,
            myShareCents: shareBy.get(expense.id)?.shareCents ?? 0,
          })),
        settlements: inGroup(settlements),
        boxes: inGroup(boxes).map((box) => ({
          ...box,
          myPlanCents: planBy.get(box.id) ?? 0,
          myEntries: entries.get(box.id) ?? [],
        })),
      };
    }),
  };
}

function groupHeader(row: {
  memberId: string;
  name: string;
  role: string;
  status: string;
  invitedAt: Date;
  respondedAt: Date | null;
  leftAt: Date | null;
}) {
  return {
    name: row.name,
    myMemberId: row.memberId,
    myRole: row.role,
    myStatus: row.status,
    invitedAt: row.invitedAt,
    joinedAt: row.status === "declined" ? null : row.respondedAt,
    leftAt: row.leftAt,
  };
}

const dateFormat = (timeZone: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone });
const timeFormat = (timeZone: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeStyle: "short", timeZone });

/**
 * The ZIP for the download: prumo-dados.json, lancamentos.csv (the same CSV
 * as "Exportar lançamentos") and LEIA-ME.txt. The CSV is read after the
 * transaction (listExportRows uses the global client).
 */
export async function buildAccountDataArchive(
  ctx: UserContext,
  now = new Date(),
): Promise<{ bytes: Uint8Array; filename: string }> {
  const data = await collectAccountData(ctx, now);
  const csv = transactionsCsv(await listExportRows(ctx, {}));
  const label = `${dateFormat(ctx.timeZone).format(now)}, ${timeFormat(ctx.timeZone).format(now)}`;
  const bytes = buildDataArchive(
    { json: JSON.stringify(data, null, 2), csv, readme: dataReadme(label) },
    now,
  );
  return { bytes, filename: dataArchiveName(ctx.todayIso) };
}
