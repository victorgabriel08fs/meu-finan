// Server Action clients (next-safe-action). Every action that reads or writes
// the owner's data uses `authAction`, which checks the session on the server.
import "server-only";
import { createSafeActionClient } from "next-safe-action";
import { requireUser } from "@/server/dal";
import { DomainError } from "@/server/domain/errors";

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
