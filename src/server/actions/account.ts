"use server";

// The person's own account (Ajustes › Dados, doc 01 §11.8). Needs a recent
// sign-in; the user always comes from the session, never from the input.
import { z } from "zod";
import { deleteOwnAccount } from "@/server/domain/users";
import { ActionError, recentSignInAction } from "@/server/safe-action";
import { throttle } from "@/server/security/throttle";

/**
 * "Excluir minha conta": the account and all its data, confirmed with the
 * e-mail. The sessions go with the account (cascade), so the cookie left in
 * the browser opens nothing. It is not cleared here: changing cookies in a
 * Server Action re-renders the page, whose session check would send the
 * person to /entrar before the client's own full page load to
 * /entrar?excluida=1. The client clears it (Better Auth's sign-out clears the
 * cookies even without a session), then leaves. No refresh() for the same
 * reason.
 */
export const deleteOwnAccountAction = recentSignInAction
  .inputSchema(z.object({ confirmEmail: z.string().trim().min(1).max(320) }))
  .action(async ({ parsedInput, ctx: { user } }) => {
    const limit = await throttle(`account-delete:${user.id}`, {
      windowSeconds: 600,
      max: 5,
    });
    if (!limit.ok) {
      throw new ActionError(
        "Muitas tentativas. Espere alguns minutos e tente de novo.",
      );
    }
    await deleteOwnAccount(user.id, parsedInput.confirmEmail);
    return { ok: true as const };
  });
