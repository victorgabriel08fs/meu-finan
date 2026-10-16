"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db/client";
import { userSettings } from "@/server/db/schema";
import {
  adjustBalance,
  archiveAccount,
  createAccount,
  updateAccount,
} from "@/server/domain/accounts";
import {
  copyBudgetsFromPreviousMonth,
  deleteBudget,
  upsertBudget,
} from "@/server/domain/budgets";
import { payInvoice } from "@/server/domain/cards";
import { createCategory } from "@/server/domain/categories";
import { getUserContext } from "@/server/domain/context";
import { archiveGoal, createGoal, updateGoal } from "@/server/domain/goals";
import { authAction } from "@/server/safe-action";
import {
  amountCents,
  colorToken,
  iconName,
  idSchema,
  isoDate,
  signedCents,
  yearMonth,
} from "./schemas";

const name = z
  .string()
  .trim()
  .min(1, { error: "Informe um nome." })
  .max(60, { error: "Use até 60 caracteres." });
const day = z.number().int().min(1).max(31);
const cardSchema = z.object({
  limitCents: z.number().int().min(0),
  closingDay: day,
  dueDay: day,
});

// Contas ----------------------------------------------------------------------

export const createAccountAction = authAction
  .inputSchema(
    z.object({
      name,
      type: z.enum([
        "checking",
        "savings",
        "cash",
        "investment",
        "credit_card",
        "other",
      ]),
      color: colorToken.optional(),
      icon: iconName.optional(),
      initialBalanceCents: signedCents,
      includeInNetWorth: z.boolean().optional(),
      card: cardSchema.nullable().optional(),
    }),
  )
  .action(async ({ parsedInput, ctx: { user } }) => {
    const id = await createAccount(user.id, parsedInput);
    refresh();
    return { id };
  });

export const updateAccountAction = authAction
  .inputSchema(
    z.object({
      id: idSchema,
      name: name.optional(),
      color: colorToken.optional(),
      icon: iconName.optional(),
      includeInNetWorth: z.boolean().optional(),
      card: cardSchema.nullable().optional(),
    }),
  )
  .action(async ({ parsedInput: { id, ...patch }, ctx: { user } }) => {
    await updateAccount(user.id, id, {
      ...patch,
      card: patch.card ?? undefined,
    });
    refresh();
  });

export const archiveAccountAction = authAction
  .inputSchema(z.object({ id: idSchema }))
  .action(async ({ parsedInput: { id }, ctx: { user } }) => {
    await archiveAccount(user.id, id);
    refresh();
  });

export const adjustBalanceAction = authAction
  .inputSchema(z.object({ id: idSchema, realBalanceCents: signedCents }))
  .action(async ({ parsedInput: { id, realBalanceCents }, ctx: { user } }) => {
    const difference = await adjustBalance(
      await getUserContext(user.id),
      id,
      realBalanceCents,
    );
    refresh();
    return { difference };
  });

export const payInvoiceAction = authAction
  .inputSchema(
    z.object({
      invoiceId: idSchema,
      fromAccountId: idSchema,
      amountCents,
      occurredOn: isoDate,
    }),
  )
  .action(async ({ parsedInput, ctx: { user } }) => {
    await payInvoice(await getUserContext(user.id), parsedInput);
    refresh();
  });

// Categorias -----------------------------------------------------------------

export const createCategoryAction = authAction
  .inputSchema(
    z.object({
      kind: z.enum(["income", "expense"]),
      name: name.max(40, { error: "Use até 40 caracteres." }),
      icon: iconName,
      color: colorToken,
    }),
  )
  .action(async ({ parsedInput, ctx: { user } }) => {
    const id = await createCategory(user.id, parsedInput);
    refresh();
    return { id };
  });

// Orçamentos -----------------------------------------------------------------

export const upsertBudgetAction = authAction
  .inputSchema(
    z.object({ categoryId: idSchema, month: yearMonth, amountCents }),
  )
  .action(async ({ parsedInput, ctx: { user } }) => {
    await upsertBudget(await getUserContext(user.id), parsedInput);
    refresh();
  });

export const deleteBudgetAction = authAction
  .inputSchema(z.object({ id: idSchema }))
  .action(async ({ parsedInput: { id }, ctx: { user } }) => {
    await deleteBudget(await getUserContext(user.id), id);
    refresh();
  });

export const copyBudgetsAction = authAction
  .inputSchema(z.object({ month: yearMonth }))
  .action(async ({ parsedInput: { month }, ctx: { user } }) => {
    const copied = await copyBudgetsFromPreviousMonth(
      await getUserContext(user.id),
      month,
    );
    refresh();
    return { copied };
  });

// Metas ----------------------------------------------------------------------

const goalSchema = z.object({
  name,
  icon: iconName,
  color: colorToken,
  targetCents: amountCents,
  targetDate: isoDate.nullable(),
  accountId: idSchema.nullable(),
  savedCents: z.number().int().min(0),
  monthlyPlanCents: z.number().int().min(0),
  expectedRate: z
    .discriminatedUnion("index", [
      z.object({ index: z.literal("fixed"), annual: z.number().min(0).max(1) }),
      z.object({ index: z.literal("cdi"), pct: z.number().min(0).max(3) }),
      z.object({ index: z.literal("selic"), pct: z.number().min(0).max(3) }),
      z.object({
        index: z.literal("ipca"),
        spread: z.number().min(-0.1).max(0.5),
      }),
    ])
    .nullable(),
});

export const createGoalAction = authAction
  .inputSchema(goalSchema)
  .action(async ({ parsedInput, ctx: { user } }) => {
    const id = await createGoal(await getUserContext(user.id), parsedInput);
    refresh();
    return { id };
  });

export const updateGoalAction = authAction
  .inputSchema(goalSchema.extend({ id: idSchema }))
  .action(async ({ parsedInput: { id, ...input }, ctx: { user } }) => {
    await updateGoal(await getUserContext(user.id), id, input);
    refresh();
  });

export const archiveGoalAction = authAction
  .inputSchema(z.object({ id: idSchema }))
  .action(async ({ parsedInput: { id }, ctx: { user } }) => {
    await archiveGoal(await getUserContext(user.id), id);
    refresh();
  });

// Ajustes --------------------------------------------------------------------

export const updatePreferencesAction = authAction
  .inputSchema(
    z.object({
      monthStartDay: z.number().int().min(1).max(28).optional(),
      onboardingDone: z.boolean().optional(),
    }),
  )
  .action(async ({ parsedInput, ctx: { user } }) => {
    await db
      .update(userSettings)
      .set({
        ...(parsedInput.monthStartDay !== undefined
          ? { monthStartDay: parsedInput.monthStartDay }
          : {}),
        ...(parsedInput.onboardingDone ? { onboardingDoneAt: new Date() } : {}),
      })
      .where(eq(userSettings.userId, user.id));
    refresh();
  });
