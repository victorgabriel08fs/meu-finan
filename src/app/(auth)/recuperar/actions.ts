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
 * the owner's account: the OWNER_EMAIL one; only when that variable is unset,
 * the oldest administrator; if it matches no account (e.g. a typo in the
 * variable), nothing changes and the operator is told. Sets a new password,
 * ends every session, optionally removes all passkeys and restores the
 * account as an active administrator.
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

    const ownerEmail = readServerEnv("OWNER_EMAIL");
    const context = await auth.$context;
    const recovered = await recoverOwnerAccess({
      ownerEmail,
      passwordHash: await context.password.hash(input.password),
      removePasskeys: input.removePasskeys,
    });
    if (!recovered) {
      throw new ActionError(
        ownerEmail
          ? "Nenhuma conta usa o e-mail de OWNER_EMAIL. Confira a variável na Vercel e faça um novo deploy."
          : "Ainda não há acesso configurado. Use o primeiro acesso.",
      );
    }

    // Server log only (the deployment's owner reads it); never in the URL.
    console.warn("[auth] acesso recuperado com RECOVERY_TOKEN", {
      userId: recovered.id,
      email: recovered.email,
      removedPasskeys: input.removePasskeys,
    });
    redirect("/entrar?recuperado=1");
  });
