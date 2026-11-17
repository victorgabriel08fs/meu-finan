// The terms of use and the privacy policy (/termos, /privacidade) share one
// version: the day the current text was published. Change it only for a
// relevant change (a typo fix keeps it): everyone then accepts again at
// /aceitar-termos before using the app. Pure, so the client bundle can send
// the version it showed and the server can compare it.

/** ISO day of publication of the current terms and policy. */
export const LEGAL_VERSION = "2026-11-17";

/** Who is responsible for the data (LGPD, art. 5º, VI): a natural person. */
export const LEGAL_CONTROLLER = "Victor Gabriel";

export const LEGAL_REQUIRED =
  "Aceite os termos de uso e a política de privacidade para continuar.";
export const LEGAL_OUTDATED =
  "Os termos foram atualizados. Recarregue a página e leia a nova versão.";

/**
 * True when the accepted version is missing or older than the current one.
 * ISO days compare as strings; a newer version (after a rollback) counts as
 * accepted, so nobody is asked twice.
 */
export function needsLegalAcceptance(
  accepted: string | null | undefined,
): boolean {
  return !accepted || accepted < LEGAL_VERSION;
}

/** A real calendar day written as YYYY-MM-DD. */
export function isLegalVersion(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
