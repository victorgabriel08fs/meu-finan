"use server";

import { isAPIError } from "better-auth/api";
import { count } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { returnValidationErrors } from "next-safe-action";
import { z } from "zod";
import {
  LEGAL_OUTDATED,
  LEGAL_REQUIRED,
  LEGAL_VERSION,
} from "@/lib/legal/version";
import {
  LEAKED_PASSWORD_MESSAGE,
  PASSWORD_COMPROMISED,
} from "@/lib/security/messages";
import { auth, LEGAL_VERSION_HEADER, SETUP_TOKEN_HEADER } from "@/server/auth";
import { db } from "@/server/db/client";
import { user } from "@/server/db/schema";
import { ensureOwnerDefaults } from "@/server/db/seed-defaults";
import { recordAudit } from "@/server/domain/audit";
import { readServerEnvSafe } from "@/server/env";
import { logEvent, requestMeta } from "@/server/observability/log";
import { ActionError, actionClient } from "@/server/safe-action";
import {
  clientAddress,
  isOwnerEmail,
  secretMatches,
} from "@/server/security/guards";
import { throttle } from "@/server/security/throttle";

const setupSchema = z
  .object({
    token: z.string().trim().min(1, "Informe o código de configuração."),
    name: z
      .string()
      .trim()
      .min(1, "Informe seu nome.")
      .max(60, "Use até 60 caracteres."),
    email: z.email("Informe um e-mail válido.").trim(),
    password: z
      .string()
      .min(12, "Use pelo menos 12 caracteres.")
      .max(128, "Use no máximo 128 caracteres."),
    confirm: z.string(),
    acceptedLegal: z.literal(true, { error: LEGAL_REQUIRED }),
    legalVersion: z.string().max(20),
  })
  .refine((input) => input.password === input.confirm, {
    path: ["confirm"],
    message: "As senhas não coincidem.",
  });

/**
 * One-time setup of the first account, the administrator (doc 01 §11.1).
 * Fails closed without SETUP_TOKEN or OWNER_EMAIL, once a user exists, or
 * with a wrong token; Better Auth's own hooks repeat the token and owner
 * checks, require the accepted terms and make the account an administrator.
 */
export const setupOwner = actionClient
  .inputSchema(setupSchema)
  .action(async ({ parsedInput: input }) => {
    if (input.legalVersion !== LEGAL_VERSION) {
      throw new ActionError(LEGAL_OUTDATED);
    }
    const requestHeaders = await headers();
    const limit = await throttle(`setup:${clientAddress(requestHeaders)}`, {
      windowSeconds: 600,
      max: 5,
    });
    const meta = requestMeta(requestHeaders);
    const refuse = (reason: string) =>
      logEvent("auth.setup_failed", { reason, ...meta }, "warn");
    if (!limit.ok) {
      refuse("rate_limited");
      throw new ActionError(
        `Muitas tentativas. Tente de novo em ${Math.ceil(limit.retryAfterSeconds / 60)} min.`,
      );
    }

    const setupToken = readServerEnvSafe("SETUP_TOKEN");
    const ownerEmailEnv = readServerEnvSafe("OWNER_EMAIL");
    for (const gate of [setupToken, ownerEmailEnv]) {
      if (gate.status === "invalid") console.error(gate.problem);
    }
    if (setupToken.status !== "ok" || ownerEmailEnv.status !== "ok") {
      refuse("closed");
      throw new ActionError("Esta tela está fechada.");
    }
    const ownerEmail = ownerEmailEnv.value;
    if (!secretMatches(input.token, setupToken.value)) {
      refuse("bad_token");
      throw new ActionError("Código de configuração inválido.");
    }
    const [row] = await db.select({ total: count() }).from(user);
    if ((row?.total ?? 0) > 0) {
      refuse("already_done");
      throw new ActionError(
        "O acesso já foi configurado. Entre pela tela de login.",
      );
    }
    if (!isOwnerEmail(input.email, ownerEmail)) {
      refuse("not_owner_email");
      // Never echo OWNER_EMAIL back.
      throw new ActionError("Use o e-mail configurado para o dono do app.");
    }

    const forwarded = new Headers(requestHeaders);
    forwarded.set(SETUP_TOKEN_HEADER, input.token);
    forwarded.set(LEGAL_VERSION_HEADER, input.legalVersion);
    let userId: string;
    try {
      const result = await auth.api.signUpEmail({
        body: {
          name: input.name,
          email: input.email.toLowerCase(),
          password: input.password,
        },
        headers: forwarded,
      });
      userId = result.user.id;
    } catch (error) {
      if (isAPIError(error)) {
        if (error.body?.code === PASSWORD_COMPROMISED) {
          returnValidationErrors(setupSchema, {
            password: { _errors: [LEAKED_PASSWORD_MESSAGE] },
          });
        }
        throw new ActionError(
          "Não foi possível criar o acesso. Confira os dados.",
        );
      }
      throw error;
    }

    await ensureOwnerDefaults(userId);
    await recordAudit(db, {
      action: "setup.completed",
      actor: { id: userId, name: input.name },
      metadata: { role: "admin", legalVersion: LEGAL_VERSION },
    });
    logEvent("auth.setup_done", { userId, ...meta });
    redirect("/ajustes/seguranca?primeiro=1");
  });
