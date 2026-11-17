"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/server/auth";
import { recoverOwnerAccess } from "@/server/domain/recovery";
import { readServerEnvSafe } from "@/server/env";
import { logEvent, requestMeta } from "@/server/observability/log";
import { captureServerMessage } from "@/server/observability/sentry";
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
 * the oldest account (the first access); if it matches no account (e.g. a
 * typo in the variable), nothing changes and the operator is told. Sets a new password,
 * ends every session, optionally removes all passkeys and restores the
 * account as an active administrator.
 */
export const recoverAccess = actionClient
  .inputSchema(recoverSchema)
  .action(async ({ parsedInput: input }) => {
    const requestHeaders = await headers();
    const limit = await throttle(`recover:${clientAddress(requestHeaders)}`, {
      windowSeconds: 900,
      max: 5,
    });
    const meta = requestMeta(requestHeaders);
    const refuse = (reason: string) => {
      logEvent("auth.recovery_failed", { reason, ...meta }, "warn");
      captureServerMessage("auth.recovery_failed", "warning", { reason });
    };
    if (!limit.ok) {
      refuse("rate_limited");
      throw new ActionError(
        `Muitas tentativas. Tente de novo em ${Math.ceil(limit.retryAfterSeconds / 60)} min.`,
      );
    }

    const recoveryToken = readServerEnvSafe("RECOVERY_TOKEN");
    if (recoveryToken.status === "invalid")
      console.error(recoveryToken.problem);
    if (recoveryToken.status !== "ok") {
      refuse("closed");
      throw new ActionError("Esta tela está fechada.");
    }
    if (!secretMatches(input.token, recoveryToken.value)) {
      refuse("bad_token");
      throw new ActionError("Código de recuperação inválido.");
    }

    const ownerEmailEnv = readServerEnvSafe("OWNER_EMAIL");
    if (ownerEmailEnv.status === "invalid") {
      // Never guess the account: an invalid OWNER_EMAIL closes the recovery.
      console.error(ownerEmailEnv.problem);
      refuse("closed");
      throw new ActionError("Esta tela está fechada.");
    }
    const ownerEmail =
      ownerEmailEnv.status === "ok" ? ownerEmailEnv.value : undefined;
    const context = await auth.$context;
    const recovered = await recoverOwnerAccess({
      ownerEmail,
      passwordHash: await context.password.hash(input.password),
      removePasskeys: input.removePasskeys,
    });
    if (!recovered) {
      refuse("no_account");
      throw new ActionError(
        ownerEmail
          ? "Nenhuma conta usa o e-mail de OWNER_EMAIL. Confira a variável na Vercel e faça um novo deploy."
          : "Ainda não há acesso configurado. Use o primeiro acesso.",
      );
    }

    // Server log only (the deployment's owner reads it); never in the URL.
    logEvent(
      "auth.recovery_used",
      { userId: recovered.id, removedPasskeys: input.removePasskeys, ...meta },
      "warn",
    );
    captureServerMessage("auth.recovery_used", "warning");
    redirect("/entrar?recuperado=1");
  });
