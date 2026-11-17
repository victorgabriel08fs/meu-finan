// "Login recente" for what cannot be undone or exposes everything at once
// (Ajustes › Dados: exportar todos os dados, excluir minha conta), pure so the
// client can share the message. Measured from the session's creation, i.e.
// the moment the person signed in; Better Auth's freshAge (1 day) stays only
// for its own routes (password, passkeys).

/** How long a sign-in counts as recent. */
export const RECENT_SIGN_IN_MINUTES = 15;

/**
 * What the server answers without a recent sign-in; the client compares with
 * it to open the "Entre de novo para continuar" step.
 */
export const RECENT_SIGN_IN_REQUIRED =
  "Por segurança, entre de novo para continuar.";

/** A session created up to this far in the future (clock skew) still counts. */
const FUTURE_TOLERANCE_MS = 60_000;

/** Whether a sign-in at `signedInAt` is at most `maxMinutes` old at `now`. */
export function isRecentSignIn(
  signedInAt: Date,
  now: Date,
  maxMinutes = RECENT_SIGN_IN_MINUTES,
): boolean {
  const age = now.getTime() - signedInAt.getTime();
  if (Number.isNaN(age)) return false;
  return age >= -FUTURE_TOLERANCE_MS && age <= maxMinutes * 60_000;
}
