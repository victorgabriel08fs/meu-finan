"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/server/auth";
import { recoverOwnerAccess } from "@/server/domain/recovery";
import { readServerEnv } from "@/server/env";
import { ActionError, actionClient } from "@/server/safe-action";
import { clientAddress, secretMatches } from "@/server/security/guards";
import { throttle } from "@/server/security/throttle";

const recoverSchema = z
  .object({
    token: z.string().trim().min(1, "Informe o código de recuperação."),
    password: z
      .string()
      .min(12, "Use pelo menos 12 caracteres.")
      .max(128, "Use no máximo 128 caracteres."),
    confirm: z.string(),
    removePasskeys: z.boolean(),
  })
  .refine((input) => input.password === input.confirm, {
    path: ["confirm"],
    message: "As senhas não coincidem.",
  });

/**
 * Break-glass recovery (doc 01 §11.4): only while RECOVERY_TOKEN is set. For
 * the owner's account (OWNER_EMAIL, or the oldest administrator): sets a new
 * password, ends every session, optionally removes all passkeys and restores
 * the account as an active administrator.
 */
export const recoverAccess = actionClient
  .inputSchema(recoverSchema)
  .action(async ({ parsedInput: input }) => {
    const limit = await throttle(`recover:${clientAddress(await headers())}`, {
      windowSeconds: 900,
      max: 5,
    });
    if (!limit.ok) {
      throw new ActionError(
        `Muitas tentativas. Tente de novo em ${Math.ceil(limit.retryAfterSeconds / 60)} min.`,
      );
    }

    const recoveryToken = readServerEnv("RECOVERY_TOKEN");
    if (!recoveryToken) throw new ActionError("A recuperação está desativada.");
    if (!secretMatches(input.token, recoveryToken)) {
      throw new ActionError("Código de recuperação inválido.");
    }

    const context = await auth.$context;
    const recovered = await recoverOwnerAccess({
      ownerEmail: readServerEnv("OWNER_EMAIL"),
      passwordHash: await context.password.hash(input.password),
      removePasskeys: input.removePasskeys,
    });
    if (!recovered) {
      throw new ActionError(
        "Ainda não há acesso configurado. Use o primeiro acesso.",
      );
    }

    console.warn("[auth] acesso recuperado com RECOVERY_TOKEN", {
      removedPasskeys: input.removePasskeys,
    });
    redirect("/entrar?recuperado=1");
  });
