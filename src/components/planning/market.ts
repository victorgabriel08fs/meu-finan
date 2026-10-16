import { shortDateLabel } from "@/lib/format/date";
import { formatRate } from "@/lib/format/number";

/** Market rates as the server sends them (`getMarketRates`, doc 03 §2.3). */
export type MarketRatesView = {
  cdiAnnual: number;
  selicAnnual: number;
  ipcaAnnual: number;
  source: "bcb" | "estimate";
  /** Date of the CDI value (YYYY-MM-DD) when synced from the BCB. */
  asOf: string | null;
};

const INDEX_NAMES = { cdi: "CDI", selic: "Selic", ipca: "IPCA" } as const;

/** "· BCB, 13/out" or "· estimativa": where an index value comes from. */
export function marketSourceSuffix(market: MarketRatesView): string {
  if (market.source === "bcb") {
    return market.asOf ? `BCB, ${shortDateLabel(market.asOf)}` : "BCB";
  }
  return "estimativa";
}

/** "CDI 13,65% a.a. · BCB, 13/out" (doc 03 §2.3: always show value, source and date). */
export function marketRateLabel(
  index: keyof typeof INDEX_NAMES,
  market: MarketRatesView,
  value?: number,
): string {
  const annual =
    value ??
    (index === "cdi"
      ? market.cdiAnnual
      : index === "selic"
        ? market.selicAnnual
        : market.ipcaAnnual);
  return `${INDEX_NAMES[index]} ${formatRate({ kind: "annual", value: annual })} · ${marketSourceSuffix(market)}`;
}
