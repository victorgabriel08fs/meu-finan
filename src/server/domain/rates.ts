// Market rates for projections (doc 03 §2.3): the latest values synced from the
// BCB by the daily cron, or documented estimates until the first sync.
import { desc, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { marketRates } from "@/server/db/schema";

export type MarketRates = {
  /** CDI, decimal per year (0.1365 = 13,65% a.a.). */
  cdiAnnual: number;
  selicAnnual: number;
  /** IPCA accumulated over the last 12 months, decimal. */
  ipcaAnnual: number;
  /** "bcb" when synced; "estimate" while the cron has not run yet. */
  source: "bcb" | "estimate";
  /** Date of the CDI value used (YYYY-MM-DD), when synced. */
  asOf: string | null;
};

/** Used until the first sync; shown as "estimativa" in the UI. */
export const ESTIMATED_RATES = {
  cdiAnnual: 0.1365,
  selicAnnual: 0.1375,
  ipcaAnnual: 0.045,
} as const;

export async function getMarketRates(): Promise<MarketRates> {
  const latest = (index: "cdi" | "selic") =>
    db
      .select({ value: marketRates.value, refDate: marketRates.refDate })
      .from(marketRates)
      .where(eq(marketRates.index, index))
      .orderBy(desc(marketRates.refDate))
      .limit(1);
  const [[cdi], [selic], ipcaMonths] = await Promise.all([
    latest("cdi"),
    latest("selic"),
    db
      .select({ value: marketRates.value })
      .from(marketRates)
      .where(eq(marketRates.index, "ipca"))
      .orderBy(desc(marketRates.refDate))
      .limit(12),
  ]);

  // SGS values are percentages: CDI/Selic per year, IPCA per month.
  const ipcaAnnual =
    ipcaMonths.length === 12
      ? ipcaMonths.reduce(
          (acc, row) => acc * (1 + Number(row.value) / 100),
          1,
        ) - 1
      : ESTIMATED_RATES.ipcaAnnual;

  if (!cdi) return { ...ESTIMATED_RATES, source: "estimate", asOf: null };
  return {
    cdiAnnual: Number(cdi.value) / 100,
    selicAnnual: selic
      ? Number(selic.value) / 100
      : ESTIMATED_RATES.selicAnnual,
    ipcaAnnual,
    source: "bcb",
    asOf: cdi.refDate,
  };
}
