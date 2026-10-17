// Server Action clients (next-safe-action). Every action that reads or writes
// a user's data uses `authAction`, which checks the session on the server;
// the actions of Administração use `adminAction`, which also checks the role.
import "server-only";
import { createSafeActionClient } from "next-safe-action";
import type { FlagKey } from "@/lib/flags/registry";
import { getAdmin, requireUser } from "@/server/dal";
import { DomainError } from "@/server/domain/errors";
import { isFlagEnabled } from "@/server/flags";

/** An error whose message is safe to show to the user (pt-BR). */
export class ActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionError";
  }
}

export const actionClient = createSafeActionClient({
  // { formErrors: string[], fieldErrors: { [field]: string[] } } on the client.
  defaultValidationErrorsShape: "flattened",
  handleServerError(error) {
    if (error instanceof ActionError || error instanceof DomainError) {
      return error.message;
    }
    console.error("[action]", error);
    return "Algo deu errado. Tente novamente.";
  },
});

export const authAction = actionClient.use(async ({ next }) => {
  const user = await requireUser();
  return next({ ctx: { user } });
});

/** Shown when a non-administrator calls an action of Administração. */
export const NOT_ALLOWED = "Você não tem permissão para fazer isso.";

/**
 * Actions of Administração. The role is read again from the database on every
 * call (the session lookup has no cookie cache), before the input is even
 * parsed; the domain re-checks it inside the transaction that makes the change.
 */
export const adminAction = actionClient.use(async ({ next }) => {
  const admin = await getAdmin();
  if (!admin) throw new ActionError(NOT_ALLOWED);
  return next({ ctx: { admin } });
});

/**
 * `authAction` for a feature behind a flag (doc 01 §11.10): refuses on the
 * server when the flag is off for the signed-in user, whatever the UI shows.
 */
export function flaggedAction(key: FlagKey, offMessage: string) {
  return authAction.use(async ({ next, ctx }) => {
    if (!(await isFlagEnabled(key, ctx.user.id))) {
      throw new ActionError(offMessage);
    }
    return next();
  });
}
