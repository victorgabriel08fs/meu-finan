import "server-only";
import { sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { db } from "@/server/db/client";
import { marketRates } from "@/server/db/schema";
import { fetchSgsSeries, SGS_SERIES } from "../bcb-sgs";
import { describeError, type JobStep, type JsonObject } from "../runner";

/**
 * Cache tag of every market_rates read (`'use cache'` + `cacheTag(RATES_CACHE_TAG)`).
 * The Selic target series (432) also holds future dates, valid until the next
 * Copom meeting: read the latest row with `ref_date <= today`.
 */
export const RATES_CACHE_TAG = "rates";

/** Upserts the latest CDI, Selic and IPCA observations from BCB SGS into market_rates. */
export const syncMarketRates: JobStep = {
  name: "syncMarketRates",
  async run({ signal }) {
    const outcomes = await Promise.all(
      SGS_SERIES.map(async (series) => {
        try {
          const result = await fetchSgsSeries(series.code, series.lastN, {
            signal,
          });
          return { series, ok: true as const, result };
        } catch (error) {
          return { series, ok: false as const, error: describeError(error) };
        }
      }),
    );

    const rows: (typeof marketRates.$inferInsert)[] = [];
    const seriesReport: JsonObject[] = [];
    const failures: string[] = [];
    for (const outcome of outcomes) {
      const { index, code } = outcome.series;
      if (!outcome.ok) {
        failures.push(`${index} (SGS ${code}): ${outcome.error}`);
        seriesReport.push({ index, code, error: outcome.error });
        continue;
      }
      const { points, rejected } = outcome.result;
      rows.push(
        ...points.map(({ refDate, value }) => ({ index, refDate, value })),
      );
      seriesReport.push({
        index,
        code,
        points: points.length,
        rejected,
        latestRefDate: points.at(-1)?.refDate ?? null,
      });
    }

    if (failures.length === outcomes.length) {
      throw new Error(`Every SGS series failed. ${failures.join(" | ")}`);
    }

    const excludedValue = sql`excluded.${sql.identifier(marketRates.value.name)}`;
    const changed =
      rows.length === 0
        ? []
        : await db
            .insert(marketRates)
            .values(rows)
            .onConflictDoUpdate({
              target: [marketRates.index, marketRates.refDate],
              set: { value: excludedValue },
              // Unchanged observations are neither rewritten nor returned.
              setWhere: sql`${marketRates.value} is distinct from ${excludedValue}`,
            })
            .returning({ refDate: marketRates.refDate });

    if (changed.length > 0) revalidateTag(RATES_CACHE_TAG, "max");

    const details: JsonObject = {
      series: seriesReport,
      changedRows: changed.length,
      revalidated: changed.length > 0,
    };
    if (failures.length > 0) {
      return { status: "partial", error: failures.join(" | "), details };
    }
    return { status: "ok", details };
  },
};
