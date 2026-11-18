// Market rates (doc 03 §2.3) against a real (in-memory) Postgres: estimates
// before the first sync, the BCB's values after it.
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// getMarketRates is `'use cache'`: outside Next, its cache calls do nothing.
const cacheTag = vi.fn();
const cacheLife = vi.fn();
vi.mock("next/cache", () => ({ cacheTag, cacheLife }));
process.env.DATABASE_URL = "pglite:memory";

let rates: typeof import("./rates");
let db: typeof import("../db/client").db;
let schema: typeof import("../db/schema");

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  ({ db } = await import("../db/client"));
  await migrate(db as never, { migrationsFolder: "drizzle" });
  rates = await import("./rates");
  schema = await import("../db/schema");
}, 60_000);

describe("getMarketRates", () => {
  it("falls back to the estimates while market_rates is empty, tagged for the sync", async () => {
    const result = await rates.getMarketRates();
    expect(result).toEqual({
      ...rates.ESTIMATED_RATES,
      source: "estimate",
      asOf: null,
    });
    expect(cacheTag).toHaveBeenCalledWith(rates.RATES_CACHE_TAG);
    expect(rates.RATES_CACHE_TAG).toBe("rates");
    expect(cacheLife).toHaveBeenCalledWith("hours");
  });

  it("reads the latest BCB values once synced", async () => {
    await db.insert(schema.marketRates).values([
      { index: "cdi", refDate: "2026-11-10", value: "10.00000000" },
      { index: "cdi", refDate: "2026-11-17", value: "14.90000000" },
      { index: "selic", refDate: "2026-11-17", value: "15.00000000" },
    ]);
    const result = await rates.getMarketRates();
    expect(result.source).toBe("bcb");
    expect(result.asOf).toBe("2026-11-17");
    expect(result.cdiAnnual).toBeCloseTo(0.149, 10);
    expect(result.selicAnnual).toBeCloseTo(0.15, 10);
    // Fewer than 12 months of IPCA: the estimate.
    expect(result.ipcaAnnual).toBe(rates.ESTIMATED_RATES.ipcaAnnual);
  });
});
