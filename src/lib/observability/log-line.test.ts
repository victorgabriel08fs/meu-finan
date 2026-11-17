import { describe, expect, it } from "vitest";
import { formatLogLine } from "./log-line";

const NOW = new Date("2026-11-17T12:00:00.000Z");

describe("formatLogLine", () => {
  it("is JSON with ts, level and event, and drops undefined", () => {
    const parsed = JSON.parse(
      formatLogLine(
        "info",
        "auth.sign_in",
        { userId: "u1", code: undefined },
        NOW,
      ),
    );
    expect(parsed).toEqual({
      ts: "2026-11-17T12:00:00.000Z",
      level: "info",
      event: "auth.sign_in",
      userId: "u1",
    });
  });

  it("masks sensitive keys but keeps hashes", () => {
    const parsed = JSON.parse(
      formatLogLine(
        "warn",
        "x",
        { email: "a@b.com", token: "t", emailHash: "abc123" },
        NOW,
      ),
    );
    expect(parsed.email).toBe("[removido]");
    expect(parsed.token).toBe("[removido]");
    expect(parsed.emailHash).toBe("abc123");
  });

  it("scrubs e-mails inside strings", () => {
    const line = formatLogLine(
      "error",
      "x",
      { reason: "falhou para ana@ex.com" },
      NOW,
    );
    expect(line).not.toContain("ana@ex.com");
  });
});
