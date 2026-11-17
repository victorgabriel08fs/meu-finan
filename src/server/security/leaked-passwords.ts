// Refuses passwords found in known leaks (Pwned Passwords, k-anonymity: only
// the first 5 characters of the SHA-1 leave the server). Own module instead of
// Better Auth's haveIBeenPwned plugin, which fails closed when the service is
// down (nobody could set a password), covers only Better Auth endpoints (the
// invite and recovery actions hash the password themselves) and has no timeout.
// Here an unreachable service accepts the password (the 12-character minimum
// still applies) and says so in the log.
import "server-only";
import { createHash } from "node:crypto";
import { APIError } from "better-auth/api";
import {
  LEAKED_PASSWORD_MESSAGE,
  PASSWORD_COMPROMISED,
} from "@/lib/security/messages";
import { pwnedCount } from "@/lib/security/pwned-range";
import { readServerEnvSafe } from "@/server/env";

const RANGE_URL = "https://api.pwnedpasswords.com/range/";
const DEFAULT_TIMEOUT_MS = 2500;

function skip(reason: string): false {
  console.warn(
    "[auth] checagem de senha vazada indisponível; seguindo sem ela",
    { reason },
  );
  return false;
}

export async function isPasswordLeaked(
  password: string,
  options: { fetch?: typeof fetch; timeoutMs?: number } = {},
): Promise<boolean> {
  // Read on every call, never at module load.
  const setting = readServerEnvSafe("PASSWORD_LEAK_CHECK");
  if (setting.status === "invalid") console.warn(setting.problem);
  if (setting.status === "ok" && setting.value === "off") return false;

  const hash = createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  const doFetch = options.fetch ?? fetch;

  try {
    const response = await doFetch(`${RANGE_URL}${prefix}`, {
      headers: { "Add-Padding": "true", "User-Agent": "meu-finan-auth/1.0" },
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) return skip(`status ${response.status}`);
    return pwnedCount(await response.text(), suffix) > 0;
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    return skip(timedOut ? "timeout" : "network");
  }
}

/** For Better Auth hooks: refuses a leaked password with PASSWORD_COMPROMISED. */
export async function rejectLeakedPassword(password: unknown): Promise<void> {
  if (typeof password !== "string") return;
  if (await isPasswordLeaked(password)) {
    throw new APIError("BAD_REQUEST", {
      code: PASSWORD_COMPROMISED,
      message: LEAKED_PASSWORD_MESSAGE,
    });
  }
}
