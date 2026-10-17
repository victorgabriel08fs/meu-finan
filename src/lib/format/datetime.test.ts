import { describe, expect, it } from "vitest";
import {
  clockLabel,
  deadlineLabel,
  localDayOf,
  pastMomentLabel,
} from "./datetime";

// Sábado, 17/out/2026, 15:00 em São Paulo (UTC−3).
const NOW = "2026-10-17T18:00:00Z";

describe("clockLabel", () => {
  it("uses the time zone and 24 hours", () => {
    expect(clockLabel("2026-10-17T18:05:00Z")).toBe("15:05");
    expect(clockLabel("2026-10-17T02:30:00Z")).toBe("23:30");
    expect(clockLabel("2026-10-17T18:05:00Z", "UTC")).toBe("18:05");
  });
});

describe("localDayOf", () => {
  it("is the calendar day in the time zone", () => {
    expect(localDayOf("2026-10-17T02:30:00Z")).toBe("2026-10-16");
    expect(localDayOf("2026-10-17T03:30:00Z")).toBe("2026-10-17");
  });
});

describe("pastMomentLabel", () => {
  it.each([
    ["2026-10-17T17:59:30Z", "agora"],
    ["2026-10-17T17:55:00Z", "há 5 min"],
    ["2026-10-17T15:00:00Z", "há 3 h"],
    ["2026-10-17T03:10:00Z", "há 14 h"],
    ["2026-10-16T21:15:00Z", "ontem, 18:15"],
    ["2026-10-14T12:00:00Z", "há 3 dias"],
    ["2026-10-02T12:00:00Z", "2/out"],
    ["2025-12-20T12:00:00Z", "20/dez/25"],
  ])("%s → %s", (at, label) => {
    expect(pastMomentLabel(at, NOW)).toBe(label);
  });
});

describe("deadlineLabel", () => {
  it.each([
    ["2026-10-17T21:30:00Z", "hoje, 18:30"],
    ["2026-10-18T13:00:00Z", "amanhã, 10:00"],
    ["2026-10-20T17:32:00Z", "ter, 20/out, 14:32"],
    ["2026-10-16T13:00:00Z", "ontem, 10:00"],
    ["2026-10-10T13:00:00Z", "sáb, 10/out, 10:00"],
  ])("%s → %s", (at, label) => {
    expect(deadlineLabel(at, NOW)).toBe(label);
  });
});
