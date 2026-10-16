import { describe, expect, it } from "vitest";
import { addDaysIso, detectDateFormat, isoDate, parseDate } from "./date";

describe("parseDate", () => {
  it.each([
    ["14/10/2026", "2026-10-14"],
    ["1/2/2026", "2026-02-01"],
    ["14-10-2026", "2026-10-14"],
    ["14.10.2026", "2026-10-14"],
    ["14/10/26", "2026-10-14"],
    ["31/12/89", "1989-12-31"],
    ["14/10/2026 10:32:00", "2026-10-14"],
    ["14 out 2026", "2026-10-14"],
    ["14/out/2026", "2026-10-14"],
    ["14 OUT. 2026", "2026-10-14"],
    ["7 de março de 2026", "2026-03-07"],
    ["14 Oct 2026", "2026-10-14"],
    ["29/02/2028", "2028-02-29"],
  ])("dmy %s → %s", (text, iso) => {
    expect(parseDate(text, "dmy")).toBe(iso);
  });

  it.each([
    ["2026-10-14", "2026-10-14"],
    ["2026/10/14", "2026-10-14"],
    ["2026-10-14T10:32:00Z", "2026-10-14"],
    ["2026-10-14 10:32", "2026-10-14"],
    ["20261014", "2026-10-14"],
    ["20261014120000", "2026-10-14"],
  ])("ymd %s → %s", (text, iso) => {
    expect(parseDate(text, "ymd")).toBe(iso);
  });

  it("reads month/day/year", () => {
    expect(parseDate("10/14/2026", "mdy")).toBe("2026-10-14");
    expect(parseDate("10/14/2026", "dmy")).toBeNull();
  });

  it.each([
    "",
    "31/02/2026",
    "29/02/2026",
    "00/10/2026",
    "14/13/2026",
    "14/10/202",
    "14/xyz/2026",
    "Saldo anterior",
    "2026-10-14",
  ])("rejects %j as day/month/year", (text) => {
    expect(parseDate(text, "dmy")).toBeNull();
  });
});

describe("detectDateFormat", () => {
  it("prefers day/month in a tie", () => {
    expect(detectDateFormat(["01/02/2026", "05/06/2026"])).toBe("dmy");
  });

  it("switches to month/day when the second number passes 12", () => {
    expect(detectDateFormat(["01/02/2026", "10/14/2026"])).toBe("mdy");
    expect(detectDateFormat(["13/02/2026", "10/11/2026"])).toBe("dmy");
  });

  it("recognises ISO dates and tolerates a few bad cells", () => {
    const cells = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"];
    expect(detectDateFormat([...cells, "Total", ""])).toBe("ymd");
    expect(detectDateFormat([...cells.slice(1), "Total"])).toBeNull();
  });

  it("gives up when most cells are not dates", () => {
    expect(detectDateFormat(["PADARIA", "MERCADO", "14/10/2026"])).toBeNull();
    expect(detectDateFormat([])).toBeNull();
  });
});

describe("helpers", () => {
  it("validates calendar dates", () => {
    expect(isoDate(2026, 2, 28)).toBe("2026-02-28");
    expect(isoDate(2026, 2, 29)).toBeNull();
    expect(isoDate(2024, 2, 29)).toBe("2024-02-29");
    expect(isoDate(1900, 2, 29)).toBeNull();
    expect(isoDate(2000, 2, 29)).toBe("2000-02-29");
    expect(isoDate(999, 1, 1)).toBeNull();
  });

  it("adds days across months and years", () => {
    expect(addDaysIso("2026-10-14", 1)).toBe("2026-10-15");
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysIso("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDaysIso("2026-10-14", 366)).toBe("2027-10-15");
  });
});
