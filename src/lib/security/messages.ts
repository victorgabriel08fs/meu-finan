/** Codes and texts of the login hardening, shared by the server and the client. */
export const PASSWORD_COMPROMISED = "PASSWORD_COMPROMISED";
export const LOGIN_LOCKED = "LOGIN_LOCKED";

export const LEAKED_PASSWORD_MESSAGE =
  "Essa senha já apareceu em vazamentos de outros sites. Escolha outra.";

/** The e-mail's attempt limit was reached; the passkey still works. */
export function loginLockedMessage(retryAfterSeconds?: number): string {
  if (
    retryAfterSeconds === undefined ||
    !Number.isFinite(retryAfterSeconds) ||
    retryAfterSeconds <= 0
  ) {
    return "Muitas tentativas com este e-mail. Espere alguns minutos ou entre com a passkey.";
  }
  const wait =
    retryAfterSeconds < 60
      ? `${Math.ceil(retryAfterSeconds)} s`
      : `${Math.ceil(retryAfterSeconds / 60)} min`;
  return `Muitas tentativas com este e-mail. Tente de novo em ${wait} ou entre com a passkey.`;
}
