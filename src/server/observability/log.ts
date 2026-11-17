import "server-only";
import { createHmac } from "node:crypto";
import { formatLogLine, type LogFields } from "@/lib/observability/log-line";
import { readServerEnvSafe } from "@/server/env";
import { clientAddress } from "@/server/security/guards";

const DEV_KEY = "meu-finan-log-dev";

/** One structured JSON line in the function logs. */
export function logEvent(
  event: string,
  fields: LogFields,
  level: "info" | "warn" | "error" = "info",
): void {
  const line = formatLogLine(level, event, fields);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

/** HMAC of an IP or e-mail, 16 hex characters: correlates events without exposing the value. */
export function hashForLog(value: string): string {
  const secret = readServerEnvSafe("BETTER_AUTH_SECRET");
  const key = secret.status === "ok" ? secret.value : DEV_KEY;
  return createHmac("sha256", key).update(value).digest("hex").slice(0, 16);
}

export function requestMeta(headers: Headers | undefined): {
  ipHash: string;
  country: string | null;
} {
  const source = headers ?? new Headers();
  return {
    ipHash: hashForLog(clientAddress(source)),
    country: source.get("x-vercel-ip-country"),
  };
}
