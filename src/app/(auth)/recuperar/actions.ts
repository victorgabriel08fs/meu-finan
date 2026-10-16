"use server";

import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/server/auth";
import { db } from "@/server/db/client";
import { account, passkey, session, user } from "@/server/db/schema";
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
 * Break-glass recovery (doc 01 §11.4): only while RECOVERY_TOKEN is set. Sets a
 * new password, ends every session and optionally removes all passkeys.
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

    const [owner] = await db.select({ id: user.id }).from(user).limit(1);
    if (!owner) {
      throw new ActionError(
        "Ainda não há acesso configurado. Use o primeiro acesso.",
      );
    }

    const context = await auth.$context;
    const hash = await context.password.hash(input.password);
    const now = new Date();

    await db.transaction(async (tx) => {
      const updated = await tx
        .update(account)
        .set({ password: hash, updatedAt: now })
        .where(
          and(
            eq(account.userId, owner.id),
            eq(account.providerId, "credential"),
          ),
        )
        .returning({ id: account.id });
      if (updated.length === 0) {
        await tx.insert(account).values({
          id: crypto.randomUUID(),
          accountId: owner.id,
          providerId: "credential",
          userId: owner.id,
          password: hash,
          createdAt: now,
          updatedAt: now,
        });
      }
      await tx.delete(session).where(eq(session.userId, owner.id));
      if (input.removePasskeys) {
        await tx.delete(passkey).where(eq(passkey.userId, owner.id));
      }
    });

    console.warn("[auth] acesso recuperado com RECOVERY_TOKEN", {
      removedPasskeys: input.removePasskeys,
    });
    redirect("/entrar?recuperado=1");
  });
