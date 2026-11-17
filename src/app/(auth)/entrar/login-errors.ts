import { DEACTIVATED_MESSAGE } from "@/lib/admin/status";
import { LOGIN_LOCKED, loginLockedMessage } from "@/lib/security/messages";

export type LoginError =
  | { status?: number; code?: string; retryAfter?: number }
  | null
  | undefined;

export const WRONG_CREDENTIALS = "E-mail ou senha incorretos.";
export const SIGN_IN_UNAVAILABLE =
  "Não foi possível entrar agora. Tente de novo em instantes.";

/**
 * What to tell the person after a failed sign-in. Only a real rejection of
 * the credentials says "wrong password": an origin refusal (403), a server
 * error or a network failure is not the person's mistake. Never echoes the
 * response body or names a variable.
 */
export function loginErrorMessage(error: LoginError): string | null {
  if (!error) return null;
  if (error.code === LOGIN_LOCKED) return loginLockedMessage(error.retryAfter);
  if (error.status === 429) {
    return "Muitas tentativas. Espere um minuto e tente de novo.";
  }
  // Only reached with the right password or passkey: it reveals nothing.
  if (error.code === "BANNED_USER") return DEACTIVATED_MESSAGE;
  if (error.status === 401 || error.code === "INVALID_EMAIL_OR_PASSWORD") {
    return WRONG_CREDENTIALS;
  }
  return SIGN_IN_UNAVAILABLE;
}

/** The person closed the browser's passkey prompt: not an error to show. */
export function isPasskeyCancel(error: { name?: string; code?: string }) {
  return (
    error.name === "NotAllowedError" ||
    error.name === "AbortError" ||
    error.code === "AUTH_CANCELLED" ||
    error.code === "ERROR_CEREMONY_ABORTED"
  );
}
