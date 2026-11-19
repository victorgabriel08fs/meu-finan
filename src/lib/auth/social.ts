// Sign-in with a social provider (doc 01 §11.2, ADR-15), pure. Google only
// opens an account that its owner linked in Ajustes › Segurança: it never
// creates one and never links by itself from a matching e-mail.
import { DEACTIVATED_MESSAGE } from "@/lib/admin/status";

export const SOCIAL_PROVIDERS = {
  google: { label: "Google" },
} as const;

export type SocialProviderId = keyof typeof SOCIAL_PROVIDERS;

export function isSocialProviderId(value: unknown): value is SocialProviderId {
  return typeof value === "string" && Object.hasOwn(SOCIAL_PROVIDERS, value);
}

/** The flag that turns sign-in and linking with Google on. */
export const GOOGLE_FLAG = "entrar_com_google" as const;

export const SIGN_IN_UNAVAILABLE =
  "Não foi possível entrar agora. Tente de novo em instantes.";

export const GOOGLE_NOT_LINKED =
  "Nenhuma conta do Prumo está vinculada a essa conta Google. Entre com passkey ou senha e vincule em Ajustes › Segurança.";

/** Own error codes of the guards in src/server/auth-social-guard.ts. */
export const SOCIAL_SIGN_IN_OFF = "SOCIAL_SIGN_IN_OFF";
export const SOCIAL_SIGN_IN_OFF_MESSAGE =
  "O login com Google está desligado agora.";
export const CREDENTIAL_REQUIRED = "CREDENTIAL_REQUIRED";
export const CREDENTIAL_REQUIRED_MESSAGE =
  "A senha continua sendo um jeito de entrar e não pode ser removida aqui.";
export const ID_TOKEN_REFUSED = "ID_TOKEN_REFUSED";

/** The person closed or cancelled the Google screen: nothing to show. */
const CANCELLED = "access_denied";

/**
 * What /entrar shows for the `?error=` the OAuth callback redirects with.
 * "No account with that e-mail" and "an account that never linked Google"
 * read the same, so the screen never reveals whether an e-mail has an account.
 */
export function socialSignInErrorMessage(
  code: string | undefined,
): string | null {
  if (!code || code === CANCELLED) return null;
  switch (code) {
    case "signup_disabled":
    case "account_not_linked":
    case "email_not_found":
    case "unable_to_link_account":
      return GOOGLE_NOT_LINKED;
    // Only reached after Google proved the identity of a linked account.
    case "BANNED_USER":
      return DEACTIVATED_MESSAGE;
    default:
      return SIGN_IN_UNAVAILABLE;
  }
}

/** What Ajustes › Segurança shows for the `?error=` of a failed link. */
export function socialLinkErrorMessage(
  code: string | undefined,
  accountEmail: string,
): string | null {
  if (!code || code === CANCELLED) return null;
  switch (code) {
    case "email_does_not_match":
      return `Essa conta Google usa outro e-mail. Escolha a conta com ${accountEmail}.`;
    case "account_already_linked_to_different_user":
      return "Essa conta Google já está vinculada a outra conta do Prumo.";
    case "unable_to_link_account":
      return "Não foi possível vincular essa conta Google. Confira se o e-mail dela está verificado no Google.";
    default:
      return "Não foi possível vincular agora. Tente de novo.";
  }
}
