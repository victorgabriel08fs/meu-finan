"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { MAX_AMOUNT_CENTS } from "@/lib/import/amount";
import { checkFile, MAX_IMPORT_ROWS } from "@/lib/import/files";
import {
  analyzeStatement,
  type StatementOptions,
} from "@/lib/import/statement";
import { MAX_DESCRIPTION_LENGTH } from "@/lib/import/text";
import { IMPORT_FORMATS } from "@/server/db/schema";
import { getUserContext } from "@/server/domain/context";
import {
  confirmImport,
  importAccount,
  reviewImport,
  undoImport,
} from "@/server/domain/imports";
import { ActionError, authAction } from "@/server/safe-action";
import { idSchema, isoDate } from "./schemas";

const column = z.number().int().min(0).max(199);

const mappingSchema = z.object({
  headerRow: z.number().int().min(0).max(100_000).nullable(),
  date: column,
  description: z.array(column).min(1).max(3),
  amount: z.discriminatedUnion("mode", [
    z.object({
      mode: z.literal("signed"),
      amount: column,
      indicator: column.nullable(),
    }),
    z.object({ mode: z.literal("split"), debit: column, credit: column }),
  ]),
  id: column.nullable(),
  dateFormat: z.enum(["dmy", "ymd", "mdy"]),
  decimal: z.enum([",", "."]),
});

const optionsSchema = z.object({
  mapping: mappingSchema.nullable().optional(),
  invertSign: z.boolean().nullable().optional(),
});

const analyzeFields = z.object({
  accountId: z.uuid({ error: "Escolha a conta." }),
  file: z.instanceof(File, { error: "Escolha um arquivo OFX ou CSV." }),
  options: z
    .string({ error: "Envio inválido." })
    .max(10_000, { error: "Confira as colunas escolhidas." })
    .nullable(),
});

function parseOptions(text: string | null): StatementOptions {
  if (!text) return {};
  try {
    const parsed = optionsSchema.safeParse(JSON.parse(text));
    if (parsed.success) return parsed.data;
  } catch {
    // Falls through to the error below.
  }
  throw new ActionError("Confira as colunas escolhidas.");
}

/**
 * Steps 1–3 of "Importar extrato" (doc 02 §6.13): receives the file in a
 * FormData (`accountId`, `file`, optional `options` as JSON with the CSV
 * mapping and the sign choice), parses it in memory — nothing is stored — and
 * returns either the CSV columns to confirm or the rows to review, compared
 * with the ledger. Read-only.
 */
export const analyzeImportAction = authAction
  .inputSchema(z.instanceof(FormData, { error: "Envio inválido." }))
  .action(async ({ parsedInput: form, ctx: { user } }) => {
    const fields = analyzeFields.safeParse({
      accountId: form.get("accountId"),
      file: form.get("file"),
      options: form.get("options"),
    });
    if (!fields.success) {
      throw new ActionError(
        fields.error.issues[0]?.message ?? "Envio inválido.",
      );
    }
    const { accountId, file } = fields.data;
    // Size and type before reading the content.
    const problem = checkFile(file);
    if (problem) throw new ActionError(problem);
    const options = parseOptions(fields.data.options);

    const ctx = await getUserContext(user.id);
    const account = await importAccount(ctx, accountId);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = analyzeStatement({
      bytes,
      today: ctx.todayIso,
      isCard: account.type === "credit_card",
      options,
    });
    if (!result.ok) throw new ActionError(result.error);
    const fileName = file.name.slice(0, 120);
    if (result.stage === "mapping") {
      return { ...result, fileName, accountId: account.id };
    }
    const rows = await reviewImport(ctx, account.id, result.rows);
    return { ...result, rows, fileName, accountId: account.id };
  });

const INVALID_ROW = { error: "Há um lançamento inválido." };
const count = z
  .number(INVALID_ROW)
  .int(INVALID_ROW)
  .min(0, INVALID_ROW)
  .max(MAX_IMPORT_ROWS, INVALID_ROW);

const confirmRow = z.object({
  occurredOn: isoDate,
  amountCents: z
    .number({ error: "Valor inválido." })
    .int({ error: "Valor inválido." })
    .min(-MAX_AMOUNT_CENTS, { error: "Valor alto demais." })
    .max(MAX_AMOUNT_CENTS, { error: "Valor alto demais." })
    .refine((value) => value !== 0, { error: "Valor inválido." }),
  description: z
    .string(INVALID_ROW)
    .trim()
    .min(1, { error: "Há um lançamento sem descrição." })
    .refine((value) => Array.from(value).length <= MAX_DESCRIPTION_LENGTH, {
      error: "Use até 120 caracteres.",
    }),
  // FITID, the bank's id column or the row hash (src/lib/import/hash.ts).
  externalId: z
    .string(INVALID_ROW)
    .min(3, INVALID_ROW)
    .max(300, INVALID_ROW)
    .regex(/^(ofx|id|h):/, INVALID_ROW),
  categoryId: idSchema.nullable(),
});

/** Step 4: imports the rows kept in the review, re-validated one by one. */
export const confirmImportAction = authAction
  .inputSchema(
    z.object({
      accountId: idSchema,
      format: z.enum(IMPORT_FORMATS, INVALID_ROW),
      fileRows: count,
      duplicates: count,
      rows: z
        .array(confirmRow, INVALID_ROW)
        .min(1, { error: "Escolha ao menos um lançamento." })
        .max(MAX_IMPORT_ROWS, {
          error: "Importe até 2.000 lançamentos por vez.",
        }),
    }),
  )
  .action(async ({ parsedInput, ctx: { user } }) => {
    const result = await confirmImport(
      await getUserContext(user.id),
      parsedInput,
    );
    refresh();
    return result;
  });

/** "Desfazer importação" (24 h). */
export const undoImportAction = authAction
  .inputSchema(z.object({ importId: idSchema }))
  .action(async ({ parsedInput: { importId }, ctx: { user } }) => {
    const result = await undoImport(await getUserContext(user.id), importId);
    refresh();
    return result;
  });
