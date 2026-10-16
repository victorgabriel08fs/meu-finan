// Zod building blocks shared by the Server Actions.
import { z } from "zod";
import { COLOR_TOKENS } from "@/server/db/schema";

export const idSchema = z.uuid({ error: "Identificador inválido." });
export const isoDate = z.iso.date({ error: "Data inválida." });
export const yearMonth = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, { error: "Mês inválido." });
/** Positive amount in cents (the sign comes from the kind of entry). */
export const amountCents = z
  .number({ error: "Informe um valor." })
  .int({ error: "Valor inválido." })
  .positive({ error: "O valor precisa ser maior que zero." })
  .max(99_999_999_999, { error: "Valor alto demais." });
export const signedCents = z
  .number({ error: "Informe um valor." })
  .int({ error: "Valor inválido." })
  .min(-99_999_999_999)
  .max(99_999_999_999);
export const description = z
  .string()
  .trim()
  .max(120, { error: "Use até 120 caracteres." });
export const colorToken = z.enum(COLOR_TOKENS);
export const iconName = z
  .string()
  .regex(/^[a-z0-9-]{1,40}$/, { error: "Ícone inválido." });
