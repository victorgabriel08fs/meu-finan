import { CalendarClock, CalendarOff, CircleSlash } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { type ReactNode, Suspense } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { noRecordsCopy } from "@/components/dashboard/block-no-records";
import { monthName } from "@/components/dashboard/labels";
import { buildRecapSlides, recapKicker } from "@/components/recap/model";
import { RecapFrame } from "@/components/recap/recap-frame";
import { RecapPlayer } from "@/components/recap/recap-player";
import { RecapSkeleton } from "@/components/recap/recap-skeleton";
import { firstClosingCopy } from "@/components/reports/closing-model";
import {
  closingHref,
  monthViewHref,
  parseMonthParam,
} from "@/components/reports/views";
import { statementHref } from "@/components/transactions/statement-params";
import { Button } from "@/components/ui/button";
import { isBeforeFirstRecord } from "@/lib/reports/coverage";
import { requireUser } from "@/server/dal";
import { getUserContext, periodMonthOf } from "@/server/domain/context";
import { closingRange } from "@/server/domain/month-closing";
import { MONTH_COMPARISON_MIN_DIFF_CENTS } from "@/server/domain/month-comparison";
import { monthRecap } from "@/server/domain/month-recap";
import { firstRecordOn } from "@/server/domain/request-reads";

export const metadata: Metadata = { title: "Retrospectiva do mês" };

export default function RetrospectivaPage({
  searchParams,
}: PageProps<"/retrospectiva">) {
  return (
    <Suspense fallback={<RecapSkeleton />}>
      <Recap searchParams={searchParams} />
    </Suspense>
  );
}

/** The frame with a message in it, for a month there is nothing to tell. */
function RecapEmpty({
  kicker,
  closeHref,
  children,
}: {
  kicker: string;
  closeHref: string;
  children: ReactNode;
}) {
  return (
    <RecapFrame kicker={kicker} closeHref={closeHref}>
      <div className="flex flex-1 flex-col justify-center">{children}</div>
    </RecapFrame>
  );
}

async function Recap({
  searchParams,
}: {
  searchParams: PageProps<"/retrospectiva">["searchParams"];
}) {
  const user = await requireUser();
  const ctx = await getUserContext(user.id);
  const { range, lastClosed, current } = closingRange(
    ctx,
    parseMonthParam((await searchParams).mes),
  );
  const first = await firstRecordOn(ctx);
  const kicker = "Retrospectiva do mês";

  // No month has closed with records yet.
  if (!first || first >= current.start) {
    return (
      <RecapEmpty kicker={kicker} closeHref="/inicio">
        <EmptyState
          icon={<CalendarClock />}
          title="O primeiro fechamento ainda não chegou"
          description={firstClosingCopy(current.end, current.month)}
          action={
            <Button asChild variant="tonal">
              <Link href="/inicio">Voltar ao Início</Link>
            </Button>
          }
        />
      </RecapEmpty>
    );
  }

  if (isBeforeFirstRecord(range.end, first)) {
    const firstMonth = periodMonthOf(ctx, first);
    const copy = noRecordsCopy(range.month, firstMonth);
    return (
      <RecapEmpty kicker={kicker} closeHref={closingHref(lastClosed.month)}>
        <EmptyState
          icon={<CalendarOff />}
          title={copy.title}
          description={copy.description}
          action={
            <Button asChild variant="tonal">
              <Link
                href={monthViewHref(
                  "/retrospectiva",
                  firstMonth,
                  lastClosed.month,
                )}
              >
                {copy.actionLabel}
              </Link>
            </Button>
          }
        />
      </RecapEmpty>
    );
  }

  const recap = await monthRecap(ctx, range);
  if (!recap) return null;
  const { closing } = recap;

  if (closing.incomeCents === 0 && closing.expenseCents === 0) {
    const month = monthName(closing.month);
    return (
      <RecapEmpty kicker={kicker} closeHref={closingHref(closing.month)}>
        <EmptyState
          icon={<CircleSlash />}
          title={`Nada pago em ${month}`}
          description="Sem receitas nem despesas pagas neste mês."
          action={
            <Button asChild variant="tonal">
              <Link
                href={statementHref(
                  {
                    month: closing.month,
                    accountId: null,
                    categoryId: null,
                    tagId: null,
                    kind: null,
                    status: null,
                    q: "",
                  },
                  closing.currentMonth,
                )}
              >
                Ver o extrato de {month}
              </Link>
            </Button>
          }
        />
      </RecapEmpty>
    );
  }

  return (
    <RecapPlayer
      userId={user.id}
      month={closing.month}
      kicker={recapKicker(closing.month)}
      slides={buildRecapSlides(recap, {
        minComparisonDiffCents: MONTH_COMPARISON_MIN_DIFF_CENTS,
      })}
      closeHref={closingHref(closing.month)}
    />
  );
}
