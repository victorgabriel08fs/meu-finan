"use server";

import { isAPIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  LEGAL_OUTDATED,
  LEGAL_REQUIRED,
  LEGAL_VERSION,
} from "@/lib/legal/version";
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
    // Invites only: the terms and privacy policy checkbox.
    acceptedLegal: z.boolean(),
    legalVersion: z.string().max(20).optional(),
  })
  .refine((input) => input.password === input.confirm, {
    path: ["confirm"],
    message: "As senhas não coincidem.",
  });

/**
 * Uses an invite or reset link (doc 01 §11.9): public, so rate-limited per
 * address; the token is checked again (constant time) and claimed in the same
 * transaction that sets the password. An invite also requires accepting the
 * terms and privacy policy (a reset does not: the account already exists, and
 * the DAL's gate asks if needed). Then the person is signed in: an invite
 * gets the default categories and, like the first access, goes to Segurança
 * to be offered a passkey and then on to the onboarding; a reset goes to
 * Segurança to register one again. Right after signing in the session is
 * fresh, so registering a passkey needs no new sign-in. Never logs the token.
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
    if (link.purpose === "invite") {
      if (!input.acceptedLegal) throw new ActionError(LEGAL_REQUIRED);
      if (input.legalVersion !== LEGAL_VERSION) {
        throw new ActionError(LEGAL_OUTDATED);
      }
    }

    const context = await auth.$context;
    const accepted = await acceptAccessLink(input.token, {
      passwordHash: await context.password.hash(input.password),
      removePasskeys: input.removePasskeys,
      legalVersion: input.acceptedLegal ? input.legalVersion : undefined,
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
        ? "/ajustes/seguranca?primeiro=1"
        : "/ajustes/seguranca?redefinido=1",
    );
  });
