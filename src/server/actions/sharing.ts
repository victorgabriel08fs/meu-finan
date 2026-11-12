"use server";

import { createHash } from "node:crypto";
import { refresh } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import {
  BOX_NAME_MAX,
  EXPENSE_DESCRIPTION_MAX,
  GROUP_NAME_MAX,
  INVITE_PAIR_WINDOW_DAYS,
  INVITES_PER_DAY,
  INVITES_PER_PAIR,
  MAX_EXPENSES_PER_ADD,
  MAX_GROUP_MEMBERS,
  MAX_SPLIT_WEIGHT,
} from "@/lib/sharing/limits";
import { SHARE_SPLIT_METHODS } from "@/server/db/schema";
import { getUserContext } from "@/server/domain/context";
import {
  archiveBox,
  contribute,
  createBox,
  setMyPlan,
  setTargetWeights,
  undoEntry,
  updateBox,
  withdraw,
} from "@/server/domain/sharing/boxes";
import {
  addSharedExpenses,
  deleteSharedExpense,
  refreshFromSource,
  restoreSharedExpense,
  shareableExpenses,
  updateSharedExpense,
} from "@/server/domain/sharing/expenses";
import {
  createGroup,
  inviteToGroup,
  leaveGroup,
  removeMember,
  renameGroup,
  respondToInvite,
  setDefaultSplit,
} from "@/server/domain/sharing/groups";
import type { PendingPush } from "@/server/domain/sharing/notices";
import { settleUp, undoSettlement } from "@/server/domain/sharing/settlements";
import { deliverPushes } from "@/server/notify";
import { ActionError, flaggedAction } from "@/server/safe-action";
import { normalizeEmail } from "@/server/security/guards";
import { throttle } from "@/server/security/throttle";
import {
  amountCents,
  colorToken,
  expectedRate,
  iconName,
  idSchema,
  isoDate,
} from "./schemas";

/**
 * Shared finances (ADR-13, doc 01 §11.11), behind financas_compartilhadas.
 * Every action checks the session and the flag on the server, validates with
 * Zod and leaves membership and ownership to the domain; pushes go out after
 * the response (`after`), and refresh() redraws the page.
 */
const sharedAction = flaggedAction(
  "financas_compartilhadas",
  "O compartilhamento não está disponível.",
);

function finish(pending: readonly PendingPush[]): void {
  if (pending.length > 0) after(() => deliverPushes(pending));
  refresh();
}

const groupName = z
  .string()
  .trim()
  .min(1, { error: "Dê um nome ao grupo." })
  .max(GROUP_NAME_MAX, { error: `Use até ${GROUP_NAME_MAX} caracteres.` });
const email = z.email({ error: "Confira o e-mail." }).max(254);
const emails = z.array(email).max(MAX_GROUP_MEMBERS - 1);

const splitInputs = z
  .array(
    z.object({
      memberId: idSchema,
      value: z.number().int().min(0).max(99_999_999_999),
    }),
  )
  .min(1)
  .max(MAX_GROUP_MEMBERS);
const method = z.enum(SHARE_SPLIT_METHODS);
const splitSchema = z
  .object({ method, inputs: splitInputs })
  .refine(
    ({ method: kind, inputs }) =>
      inputs.every(({ value }) =>
        kind === "equal"
          ? value <= 1
          : kind === "percent"
            ? value <= 10_000
            : kind === "shares"
              ? value <= MAX_SPLIT_WEIGHT
              : true,
      ),
    { error: "Divisão inválida." },
  );
const expenseDescription = z
  .string()
  .trim()
  .min(1, { error: "Informe uma descrição." })
  .max(EXPENSE_DESCRIPTION_MAX, {
    error: `Use até ${EXPENSE_DESCRIPTION_MAX} caracteres.`,
  });

const DAY_SECONDS = 24 * 60 * 60;

/** The two invite limits of ADR-13, counted before anything is written. */
async function throttleInvites(
  userId: string,
  list: readonly string[],
): Promise<void> {
  for (const address of list) {
    const day = await throttle(`share-invite:${userId}`, {
      windowSeconds: DAY_SECONDS,
      max: INVITES_PER_DAY,
    });
    if (!day.ok) {
      throw new ActionError(
        "Você já enviou muitos convites hoje. Tente de novo amanhã.",
      );
    }
    // Never the e-mail itself in the key.
    const digest = createHash("sha256")
      .update(normalizeEmail(address))
      .digest("hex");
    const pair = await throttle(
      `share-invite:${userId}:${digest.slice(0, 16)}`,
      {
        windowSeconds: INVITE_PAIR_WINDOW_DAYS * DAY_SECONDS,
        max: INVITES_PER_PAIR,
      },
    );
    if (!pair.ok) {
      throw new ActionError(
        "Você já convidou esse e-mail algumas vezes. Espere uns dias.",
      );
    }
  }
}

// Groups and invites ---------------------------------------------------------

export const createGroupAction = sharedAction
  .inputSchema(z.object({ id: idSchema, name: groupName, emails }))
  .action(async ({ parsedInput, ctx: { user } }) => {
    await throttleInvites(user.id, parsedInput.emails);
    const ctx = await getUserContext(user.id);
    const { groupId, pending } = await createGroup(ctx, parsedInput);
    finish(pending);
    return { groupId };
  });

export const inviteToGroupAction = sharedAction
  .inputSchema(z.object({ groupId: idSchema, emails: emails.min(1) }))
  .action(async ({ parsedInput, ctx: { user } }) => {
    await throttleInvites(user.id, parsedInput.emails);
    const ctx = await getUserContext(user.id);
    const { pending } = await inviteToGroup(
      ctx,
      parsedInput.groupId,
      parsedInput.emails,
    );
    finish(pending);
    // The same answer whether the e-mail has an account or not.
    return { invited: parsedInput.emails.length };
  });

export const respondToInviteAction = sharedAction
  .inputSchema(
    z.object({ memberId: idSchema, answer: z.enum(["accept", "decline"]) }),
  )
  .action(async ({ parsedInput, ctx: { user } }) => {
    const limit = await throttle(`share-respond:${user.id}`, {
      windowSeconds: 60,
      max: 30,
    });
    if (!limit.ok)
      throw new ActionError("Muitas tentativas. Espere um minuto.");
    const ctx = await getUserContext(user.id);
    const result = await respondToInvite(
      ctx,
      parsedInput.memberId,
      parsedInput.answer,
    );
    finish(result.pending);
    return { groupId: result.groupId, groupName: result.groupName };
  });

export const leaveGroupAction = sharedAction
  .inputSchema(z.object({ groupId: idSchema }))
  .action(async ({ parsedInput, ctx: { user } }) => {
    const ctx = await getUserContext(user.id);
    const { pending } = await leaveGroup(ctx, parsedInput.groupId);
    finish(pending);
  });

export const removeMemberAction = sharedAction
  .inputSchema(z.object({ groupId: idSchema, memberId: idSchema }))
  .action(async ({ parsedInput, ctx: { user } }) => {
    const ctx = await getUserContext(user.id);
    const { pending } = await removeMember(
      ctx,
      parsedInput.groupId,
      parsedInput.memberId,
    );
    finish(pending);
  });

export const renameGroupAction = sharedAction
  .inputSchema(z.object({ groupId: idSchema, name: groupName }))
  .action(async ({ parsedInput, ctx: { user } }) => {
    const ctx = await getUserContext(user.id);
    await renameGroup(ctx, parsedInput.groupId, parsedInput.name);
    finish([]);
  });

export const setDefaultSplitAction = sharedAction
  .inputSchema(z.object({ groupId: idSchema, split: splitSchema.nullable() }))
  .action(async ({ parsedInput, ctx: { user } }) => {
    const ctx = await getUserContext(user.id);
    const { split } = parsedInput;
    await setDefaultSplit(
      ctx,
      parsedInput.groupId,
      split
        ? {
            method: split.method,
            inputs: Object.fromEntries(
              split.inputs.map((input) => [input.memberId, input.value]),
            ),
          }
        : null,
    );
    finish([]);
  });

// Expenses -----------------------------------------------------------------

const expenseItem = z.intersection(
  z.object({
    id: idSchema,
    description: z.string().trim().max(120),
    amountCents,
    occurredOn: isoDate,
    paidByMemberId: idSchema,
    transactionId: idSchema.nullish(),
  }),
  splitSchema,
);

export const addSharedExpensesAction = sharedAction
  .inputSchema(
    z.object({
      groupId: idSchema,
      items: z.array(expenseItem).min(1).max(MAX_EXPENSES_PER_ADD),
    }),
  )
  .action(async ({ parsedInput, ctx: { user } }) => {
    for (const item of parsedInput.items) {
      if (
        !item.transactionId &&
        !expenseDescription.safeParse(item.description).success
      ) {
        throw new ActionError("Informe uma descrição de até 80 caracteres.");
      }
    }
    const ctx = await getUserContext(user.id);
    const { added, pending } = await addSharedExpenses(
      ctx,
      parsedInput.groupId,
      parsedInput.items,
    );
    finish(pending);
    return { added };
  });

export const updateSharedExpenseAction = sharedAction
  .inputSchema(
    z.intersection(
      z.object({
        id: idSchema,
        paidByMemberId: idSchema,
        description: expenseDescription.optional(),
        amountCents: amountCents.optional(),
        occurredOn: isoDate.optional(),
      }),
      splitSchema,
    ),
  )
  .action(async ({ parsedInput, ctx: { user } }) => {
    const ctx = await getUserContext(user.id);
    const { id, ...update } = parsedInput;
    const { pending } = await updateSharedExpense(ctx, id, update);
    finish(pending);
  });

export const deleteSharedExpenseAction = sharedAction
  .inputSchema(z.object({ id: idSchema }))
  .action(async ({ parsedInput, ctx: { user } }) => {
    const ctx = await getUserContext(user.id);
    const { pending } = await deleteSharedExpense(ctx, parsedInput.id);
    finish(pending);
  });

export const restoreSharedExpenseAction = sharedAction
  .inputSchema(z.object({ id: idSchema }))
  .action(async ({ parsedInput, ctx: { user } }) => {
    const ctx = await getUserContext(user.id);
    await restoreSharedExpense(ctx, parsedInput.id);
    finish([]);
  });

export const refreshFromSourceAction = sharedAction
  .inputSchema(z.object({ id: idSchema }))
  .action(async ({ parsedInput, ctx: { user } }) => {
    const ctx = await getUserContext(user.id);
    const { pending } = await refreshFromSource(ctx, parsedInput.id);
    finish(pending);
  });

/**
 * "Do meu extrato": the person's own expenses of the period not in a group
 * yet. A read (nothing changes), so no refresh().
 */
export const listShareableExpensesAction = sharedAction
  .inputSchema(
    z.object({
      groupId: idSchema,
      start: isoDate,
      end: isoDate,
      categoryId: idSchema.nullable(),
    }),
  )
  .action(async ({ parsedInput, ctx: { user } }) => {
    const ctx = await getUserContext(user.id);
    const { groupId, ...filter } = parsedInput;
    if (filter.start > filter.end) throw new ActionError("Confira as datas.");
    return { items: await shareableExpenses(ctx, groupId, filter) };
  });

// Settlements --------------------------------------------------------------

export const settleUpAction = sharedAction
  .inputSchema(
    z.object({
      id: idSchema,
      groupId: idSchema,
      withMemberId: idSchema,
      amountCents,
      expectedCents: z.number().int().min(-99_999_999_999).max(99_999_999_999),
      occurredOn: isoDate,
    }),
  )
  .action(async ({ parsedInput, ctx: { user } }) => {
    const ctx = await getUserContext(user.id);
    const { groupId, ...input } = parsedInput;
    const { settlementId, pending } = await settleUp(ctx, groupId, input);
    finish(pending);
    return { settlementId };
  });

export const undoSettlementAction = sharedAction
  .inputSchema(z.object({ id: idSchema }))
  .action(async ({ parsedInput, ctx: { user } }) => {
    const ctx = await getUserContext(user.id);
    await undoSettlement(ctx, parsedInput.id);
    finish([]);
  });

// Shared boxes -------------------------------------------------------------

const boxSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: "Dê um nome à caixinha." })
    .max(BOX_NAME_MAX, { error: `Use até ${BOX_NAME_MAX} caracteres.` }),
  icon: iconName,
  color: colorToken,
  targetCents: amountCents.nullable(),
  targetDate: isoDate.nullable(),
  expectedRate: expectedRate.nullable(),
});

export const createBoxAction = sharedAction
  .inputSchema(boxSchema.extend({ id: idSchema, groupId: idSchema }))
  .action(async ({ parsedInput: { groupId, ...input }, ctx: { user } }) => {
    const ctx = await getUserContext(user.id);
    const { boxId } = await createBox(ctx, groupId, input);
    finish([]);
    return { boxId };
  });

export const updateBoxAction = sharedAction
  .inputSchema(boxSchema.extend({ boxId: idSchema }))
  .action(async ({ parsedInput: { boxId, ...input }, ctx: { user } }) => {
    const ctx = await getUserContext(user.id);
    await updateBox(ctx, boxId, input);
    finish([]);
  });

export const archiveBoxAction = sharedAction
  .inputSchema(z.object({ boxId: idSchema, archived: z.boolean() }))
  .action(async ({ parsedInput, ctx: { user } }) => {
    const ctx = await getUserContext(user.id);
    await archiveBox(ctx, parsedInput.boxId, parsedInput.archived);
    finish([]);
  });

export const setMyPlanAction = sharedAction
  .inputSchema(
    z.object({
      boxId: idSchema,
      monthlyCents: z.number().int().min(0).max(99_999_999_999),
    }),
  )
  .action(async ({ parsedInput, ctx: { user } }) => {
    const ctx = await getUserContext(user.id);
    await setMyPlan(ctx, parsedInput.boxId, parsedInput.monthlyCents);
    finish([]);
  });

export const setTargetWeightsAction = sharedAction
  .inputSchema(
    z.object({
      boxId: idSchema,
      split: z.discriminatedUnion("method", [
        z.object({ method: z.literal("equal") }),
        z.object({
          method: z.literal("percent"),
          weights: z
            .array(
              z.object({
                memberId: idSchema,
                basisPoints: z.number().int().min(0).max(10_000),
              }),
            )
            .min(1)
            .max(MAX_GROUP_MEMBERS),
        }),
      ]),
    }),
  )
  .action(async ({ parsedInput: { boxId, split }, ctx: { user } }) => {
    const ctx = await getUserContext(user.id);
    await setTargetWeights(
      ctx,
      boxId,
      split.method === "equal"
        ? split
        : {
            method: "percent",
            weights: Object.fromEntries(
              split.weights.map((row) => [row.memberId, row.basisPoints]),
            ),
          },
    );
    finish([]);
  });

const entrySchema = z.object({
  id: idSchema,
  boxId: idSchema,
  amountCents,
  occurredOn: isoDate,
});

/**
 * "Guardar": what the person put in, and, with "Lançar no meu extrato", the
 * transfer between their own accounts (checked as theirs by the domain).
 */
export const contributeAction = sharedAction
  .inputSchema(
    entrySchema.extend({
      fromAccountId: idSchema.nullish(),
      toBoxAccountId: idSchema.nullish(),
    }),
  )
  .action(async ({ parsedInput: { boxId, ...input }, ctx: { user } }) => {
    const ctx = await getUserContext(user.id);
    const { entryId, transferId, pending } = await contribute(
      ctx,
      boxId,
      input,
    );
    finish(pending);
    return { entryId, transferId };
  });

export const withdrawAction = sharedAction
  .inputSchema(
    entrySchema.extend({
      fromBoxAccountId: idSchema.nullish(),
      toAccountId: idSchema.nullish(),
    }),
  )
  .action(async ({ parsedInput: { boxId, ...input }, ctx: { user } }) => {
    const ctx = await getUserContext(user.id);
    const { entryId, transferId, pending } = await withdraw(ctx, boxId, input);
    finish(pending);
    return { entryId, transferId };
  });

export const undoEntryAction = sharedAction
  .inputSchema(z.object({ id: idSchema }))
  .action(async ({ parsedInput, ctx: { user } }) => {
    const ctx = await getUserContext(user.id);
    await undoEntry(ctx, parsedInput.id);
    finish([]);
  });
