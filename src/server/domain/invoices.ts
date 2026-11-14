// Card invoice rows (doc 03 §9): card_invoices only stores the cycle dates;
// totals, payments and status are derived from the ledger in cards.ts.
import { and, eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { type InvoiceDates, iso, isoMonth } from "@/lib/finance";
import type { Executor } from "@/server/db/client";
import { cardInvoices } from "@/server/db/schema";

/** Id of the invoice with these dates, created on first use. */
export async function ensureInvoice(
  tx: Executor,
  userId: string,
  accountId: string,
  dates: InvoiceDates,
): Promise<string> {
  const referenceMonth = `${isoMonth(dates.referenceMonth)}-01`;
  const [created] = await tx
    .insert(cardInvoices)
    .values({
      id: uuidv7(),
      userId,
      accountId,
      referenceMonth,
      closingDate: iso(dates.closingDate),
      dueDate: iso(dates.dueDate),
    })
    .onConflictDoNothing({
      target: [cardInvoices.accountId, cardInvoices.referenceMonth],
    })
    .returning({ id: cardInvoices.id });
  if (created) return created.id;
  const [existing] = await tx
    .select({ id: cardInvoices.id })
    .from(cardInvoices)
    .where(
      and(
        eq(cardInvoices.accountId, accountId),
        eq(cardInvoices.referenceMonth, referenceMonth),
      ),
    )
    .limit(1);
  if (!existing) throw new Error("card invoice upsert returned nothing");
  return existing.id;
}
