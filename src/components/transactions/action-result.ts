/**
 * Reading next-safe-action results on the client. Actions return
 * `{ data?, serverError?, validationErrors? }`; `serverError` is already a
 * pt-BR message safe to show (see src/server/safe-action.ts).
 */

type ValidationErrorsLike = {
  formErrors?: readonly string[];
  fieldErrors?: { readonly [field: string]: readonly string[] | undefined };
};

export type ActionResultLike =
  | {
      serverError?: unknown;
      validationErrors?: ValidationErrorsLike;
    }
  | null
  | undefined;

export const GENERIC_ERROR = "Algo deu errado. Tente novamente.";
export const NETWORK_ERROR = "Não conseguimos salvar. Verifique a conexão.";

/** The message to show for a failed result, or null when it succeeded. */
export function actionErrorMessage(result: ActionResultLike): string | null {
  if (!result) return GENERIC_ERROR;
  if (result.serverError !== undefined) {
    return typeof result.serverError === "string" && result.serverError
      ? result.serverError
      : GENERIC_ERROR;
  }
  const errors = result.validationErrors;
  if (errors) {
    const field = Object.values(errors.fieldErrors ?? {})
      .flatMap((messages) => messages ?? [])
      .find(Boolean);
    return errors.formErrors?.[0] ?? field ?? GENERIC_ERROR;
  }
  return null;
}
