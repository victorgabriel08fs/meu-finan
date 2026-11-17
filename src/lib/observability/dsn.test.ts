import { describe, expect, it } from "vitest";
import { isValidSentryDsn, parseSentryDsn } from "./dsn";

describe("parseSentryDsn", () => {
  it("returns the exact origin of a valid DSN", () => {
    expect(
      parseSentryDsn(" https://abc@o1.ingest.us.sentry.io/123 ")?.origin,
    ).toBe("https://o1.ingest.us.sentry.io");
  });

  it("accepts http only for localhost", () => {
    expect(parseSentryDsn("http://abc@localhost:9000/1")?.origin).toBe(
      "http://localhost:9000",
    );
    expect(parseSentryDsn("http://abc@o1.ingest.sentry.io/1")).toBeUndefined();
  });

  it("refuses missing key, missing id, garbage and empty values", () => {
    for (const raw of [
      "https://o1.ingest.sentry.io/1",
      "https://abc@o1.ingest.sentry.io/",
      "https://abc@o1.ingest.sentry.io/projeto",
      "lixo",
      "",
      "   ",
      undefined,
    ]) {
      expect(parseSentryDsn(raw)).toBeUndefined();
      expect(isValidSentryDsn(raw)).toBe(false);
    }
  });
});
