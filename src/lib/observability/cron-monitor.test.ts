import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cronCheckInStatus, DAILY_MONITOR_CONFIG } from "./cron-monitor";

describe("daily monitor", () => {
  it("uses the schedule of vercel.json", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8")) as {
      crons: { path: string; schedule: string }[];
    };
    const daily = config.crons.find((c) => c.path === "/api/cron/daily");
    expect(DAILY_MONITOR_CONFIG.schedule.value).toBe(daily?.schedule);
  });

  it("maps job status to check-in status", () => {
    expect(cronCheckInStatus("ok")).toBe("ok");
    expect(cronCheckInStatus("partial")).toBe("ok");
    expect(cronCheckInStatus("failed")).toBe("error");
  });
});
