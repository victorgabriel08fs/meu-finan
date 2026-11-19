// Social providers of Better Auth from the environment (doc 01 §11.2,
// ADR-15). Google is on only with both GOOGLE_CLIENT_ID and
// GOOGLE_CLIENT_SECRET valid; it never creates an account, never signs in
// with a bare ID token and always asks which Google account to use (one
// device, several accounts). Never throws: the build runs without env.
import "server-only";
import type { SocialProviders } from "better-auth/social-providers";
import type { SocialProviderId } from "@/lib/auth/social";
import { readServerEnvSafe } from "@/server/env";

export const GOOGLE_ENV_WARNING =
  "[auth] GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET precisam estar os dois definidos: login com Google desligado.";

export function socialProvidersFromEnv(): {
  providers: SocialProviders;
  enabled: SocialProviderId[];
} {
  const clientId = readServerEnvSafe("GOOGLE_CLIENT_ID");
  const clientSecret = readServerEnvSafe("GOOGLE_CLIENT_SECRET");
  if (clientId.status === "ok" && clientSecret.status === "ok") {
    return {
      providers: {
        google: {
          clientId: clientId.value,
          clientSecret: clientSecret.value,
          disableSignUp: true,
          disableImplicitSignUp: true,
          disableIdTokenSignIn: true,
          prompt: "select_account",
          overrideUserInfoOnSignIn: false,
        },
      },
      enabled: ["google"],
    };
  }
  if (clientId.status !== "unset" || clientSecret.status !== "unset") {
    console.warn(GOOGLE_ENV_WARNING);
  }
  return { providers: {}, enabled: [] };
}

let cached: SocialProviderId[] | undefined;

/** The providers this deployment can use (for the pages). */
export function enabledSocialProviders(): SocialProviderId[] {
  cached ??= socialProvidersFromEnv().enabled;
  return cached;
}
