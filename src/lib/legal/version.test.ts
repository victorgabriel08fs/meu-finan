import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isLegalVersion, LEGAL_VERSION, needsLegalAcceptance } from "./version";

const day = fc
  .date({ min: new Date("2020-01-01"), max: new Date("2040-12-31") })
  .filter((date) => !Number.isNaN(date.getTime()))
  .map((date) => date.toISOString().slice(0, 10));

describe("needsLegalAcceptance", () => {
  it("asks when nothing was accepted", () => {
    expect(needsLegalAcceptance(null)).toBe(true);
    expect(needsLegalAcceptance(undefined)).toBe(true);
    expect(needsLegalAcceptance("")).toBe(true);
  });

  it("asks for an older version and not for the current or a newer one", () => {
    expect(needsLegalAcceptance("2020-01-01")).toBe(true);
    expect(needsLegalAcceptance(LEGAL_VERSION)).toBe(false);
    // After a rollback nobody who accepted a newer text is asked again.
    expect(needsLegalAcceptance("2099-12-31")).toBe(false);
  });

  it("asks exactly when the accepted day is before the current one", () => {
    fc.assert(
      fc.property(day, (accepted) => {
        expect(needsLegalAcceptance(accepted)).toBe(accepted < LEGAL_VERSION);
      }),
    );
  });
});

describe("isLegalVersion", () => {
  it("accepts the current version and real days only", () => {
    expect(isLegalVersion(LEGAL_VERSION)).toBe(true);
    for (const bad of ["2026-02-30", "2026-13-01", "26-11-17", "", "hoje"]) {
      expect(isLegalVersion(bad), bad).toBe(false);
    }
  });
});
