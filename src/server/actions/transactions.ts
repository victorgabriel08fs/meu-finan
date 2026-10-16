"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getUserContext } from "@/server/domain/context";
import {
  createTransaction,
  createTransfer,
  deleteTransaction,
  descriptionSuggestions,
  restoreTransactions,
  setTransactionPaid,
  updateTransaction,
} from "@/server/domain/transactions";
import { authAction } from "@/server/safe-action";
import { amountCents, description, idSchema, isoDate } from "./schemas";

const entrySchema = z.object({
  kind: z.enum(["expense", "income"]),
  id: idSchema.optional(),
  amountCents,
  accountId: idSchema,
  categoryId: idSchema.nullable(),
  description: description.optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  occurredOn: isoDate,
  paid: z.boolean().optional(),
  installments: z.number().int().min(1).max(72).nullable().optional(),
  recurrence: z
    .object({
      freq: z.enum(["weekly", "monthly", "yearly"]),
      interval: z.number().int().min(1).max(12).optional(),
      endOn: isoDate.nullable().optional(),
    })
    .nullable()
    .optional(),
});

const transferSchema = z.object({
  kind: z.literal("transfer"),
  id: idSchema.optional(),
  amountCents,
  fromAccountId: idSchema,
  toAccountId: idSchema,
  description: description.optional(),
  occurredOn: isoDate,
  paid: z.boolean().optional(),
});

/** Nova transação: despesa, receita ou transferência (doc 02 §6.5). */
export const createEntryAction = authAction
  .inputSchema(z.discriminatedUnion("kind", [entrySchema, transferSchema]))
  .action(async ({ parsedInput: input, ctx: { user } }) => {
    const ctx = await getUserContext(user.id);
    if (input.kind === "transfer") {
      const { kind: _kind, ...transfer } = input;
      const result = await createTransfer(ctx, transfer);
      refresh();
      return { ids: [] as string[], transferId: result.transferId };
    }
    const result = await createTransaction(ctx, input);
    refresh();
    return { ids: result.ids, transferId: null };
  });

export const updateTransactionAction = authAction
  .inputSchema(
    z.object({
      id: idSchema,
      patch: z.object({
        description: description.optional(),
        amountCents: amountCents.optional(),
        categoryId: idSchema.nullable().optional(),
        accountId: idSchema.optional(),
        occurredOn: isoDate.optional(),
        notes: z.string().trim().max(500).nullable().optional(),
        paid: z.boolean().optional(),
      }),
    }),
  )
  .action(async ({ parsedInput: { id, patch }, ctx: { user } }) => {
    await updateTransaction(await getUserContext(user.id), id, patch);
    refresh();
  });

export const deleteTransactionAction = authAction
  .inputSchema(
    z.object({
      id: idSchema,
      scope: z.enum(["this", "future", "all"]).default("this"),
    }),
  )
  .action(async ({ parsedInput: { id, scope }, ctx: { user } }) => {
    const ids = await deleteTransaction(
      await getUserContext(user.id),
      id,
      scope,
    );
    refresh();
    return { ids };
  });

export const restoreTransactionsAction = authAction
  .inputSchema(z.object({ ids: z.array(idSchema).min(1).max(1000) }))
  .action(async ({ parsedInput: { ids }, ctx: { user } }) => {
    await restoreTransactions(await getUserContext(user.id), ids);
    refresh();
  });

export const setPaidAction = authAction
  .inputSchema(z.object({ id: idSchema, paid: z.boolean() }))
  .action(async ({ parsedInput: { id, paid }, ctx: { user } }) => {
    await setTransactionPaid(await getUserContext(user.id), id, paid);
    refresh();
  });

/** Autocomplete for the description field; read-only. */
export const suggestionsAction = authAction
  .inputSchema(
    z.object({ kind: z.enum(["expense", "income"]), q: z.string().max(60) }),
  )
  .action(async ({ parsedInput: { kind, q }, ctx: { user } }) => {
    const ctx = await getUserContext(user.id);
    return descriptionSuggestions(ctx, kind, q);
  });
