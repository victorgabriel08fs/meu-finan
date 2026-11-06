import { describe, expect, it } from "vitest";
import { earliestDate, isBeforeFirstRecord } from "./coverage";

describe("earliestDate", () => {
  it("picks the earliest date and ignores the missing ones", () => {
    expect(earliestDate("2026-03-10", "2025-12-31", null)).toBe("2025-12-31");
    expect(earliestDate(null, "2026-01-01")).toBe("2026-01-01");
    expect(earliestDate(undefined, null)).toBeNull();
    expect(earliestDate()).toBeNull();
  });
});

describe("isBeforeFirstRecord", () => {
  it("is true only for a period that closed before the first record", () => {
    expect(isBeforeFirstRecord("2025-12-31", "2026-01-01")).toBe(true);
    // The first record falls on the last day: the period has something.
    expect(isBeforeFirstRecord("2026-01-01", "2026-01-01")).toBe(false);
    expect(isBeforeFirstRecord("2026-10-31", "2026-01-01")).toBe(false);
  });

  it("is never true when there is no record at all", () => {
    expect(isBeforeFirstRecord("2000-01-31", null)).toBe(false);
  });
});
