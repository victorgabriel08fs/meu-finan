"use server";

import { isAPIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/server/auth";
import { ensureOwnerDefaults } from "@/server/db/seed-defaults";
import {
  acceptAccessLink,
  inspectAccessLink,
  LINK_UNAVAILABLE,
} from "@/server/domain/access-links";
import { ActionError, actionClient } from "@/server/safe-action";
import { clientAddress } from "@/server/security/guards";
import { throttle } from "@/server/security/throttle";

const acceptSchema = z
  .object({
    token: z.string().min(1).max(200),
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
 * Uses an invite or reset link (doc 01 §11.9): public, so rate-limited per
 * address; the token is checked again (constant time) and claimed in the same
 * transaction that sets the password. Then the person is signed in: an invite
 * gets the default categories and goes to the onboarding, a reset goes to
 * Segurança to register a passkey again. Never logs the token.
 */
export const acceptAccessLinkAction = actionClient
  .inputSchema(acceptSchema)
  .action(async ({ parsedInput: input }) => {
    const requestHeaders = await headers();
    const limit = await throttle(`invite:${clientAddress(requestHeaders)}`, {
      windowSeconds: 900,
      max: 10,
    });
    if (!limit.ok) {
      throw new ActionError(
        `Muitas tentativas. Tente de novo em ${Math.ceil(limit.retryAfterSeconds / 60)} min.`,
      );
    }

    // Cheap checks before the (deliberately slow) password hash.
    const link = await inspectAccessLink(input.token);
    if (!link || link.state !== "valid") {
      throw new ActionError(LINK_UNAVAILABLE);
    }

    const context = await auth.$context;
    const accepted = await acceptAccessLink(input.token, {
      passwordHash: await context.password.hash(input.password),
      removePasskeys: input.removePasskeys,
    });
    if (accepted.purpose === "invite") {
      await ensureOwnerDefaults(accepted.userId);
    }

    try {
      await auth.api.signInEmail({
        body: { email: accepted.email, password: input.password },
        headers: requestHeaders,
      });
    } catch (error) {
      // The password is set either way; the login page still works.
      console.error(
        "[convite] sign-in after accepting failed",
        isAPIError(error) ? error.status : "unexpected",
      );
      redirect("/entrar");
    }
    redirect(
      accepted.purpose === "invite"
        ? "/onboarding"
        : "/ajustes/seguranca?redefinido=1",
    );
  });
