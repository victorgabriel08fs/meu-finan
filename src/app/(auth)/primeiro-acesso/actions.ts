"use server";

import { isAPIError } from "better-auth/api";
import { count } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth, SETUP_TOKEN_HEADER } from "@/server/auth";
import { db } from "@/server/db/client";
import { user } from "@/server/db/schema";
import { ensureOwnerDefaults } from "@/server/db/seed-defaults";
import { readServerEnv } from "@/server/env";
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
  })
  .refine((input) => input.password === input.confirm, {
    path: ["confirm"],
    message: "As senhas não coincidem.",
  });

/**
 * One-time owner setup (doc 01 §11.1). Fails closed without SETUP_TOKEN or
 * OWNER_EMAIL, once a user exists, or with a wrong token; Better Auth's own
 * hooks repeat the token and owner checks.
 */
export const setupOwner = actionClient
  .inputSchema(setupSchema)
  .action(async ({ parsedInput: input }) => {
    const requestHeaders = await headers();
    const limit = await throttle(`setup:${clientAddress(requestHeaders)}`, {
      windowSeconds: 600,
      max: 5,
    });
    if (!limit.ok) {
      throw new ActionError(
        `Muitas tentativas. Tente de novo em ${Math.ceil(limit.retryAfterSeconds / 60)} min.`,
      );
    }

    const setupToken = readServerEnv("SETUP_TOKEN");
    const ownerEmail = readServerEnv("OWNER_EMAIL");
    if (!setupToken || !ownerEmail) {
      throw new ActionError("O primeiro acesso está desativado.");
    }
    if (!secretMatches(input.token, setupToken)) {
      throw new ActionError("Código de configuração inválido.");
    }
    const [row] = await db.select({ total: count() }).from(user);
    if ((row?.total ?? 0) > 0) {
      throw new ActionError(
        "O acesso já foi configurado. Entre pela tela de login.",
      );
    }
    if (!isOwnerEmail(input.email, ownerEmail)) {
      // Never echo OWNER_EMAIL back.
      throw new ActionError("Use o e-mail configurado para o dono do app.");
    }

    const forwarded = new Headers(requestHeaders);
    forwarded.set(SETUP_TOKEN_HEADER, input.token);
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
        throw new ActionError(
          "Não foi possível criar o acesso. Confira os dados.",
        );
      }
      throw error;
    }

    await ensureOwnerDefaults(userId);
    redirect("/ajustes/seguranca?primeiro=1");
  });
