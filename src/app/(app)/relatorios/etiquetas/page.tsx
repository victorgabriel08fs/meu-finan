import { ChevronRight, ReceiptText, Tag } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { entriesLabel } from "@/app/(app)/ajustes/etiquetas/messages";
import { EmptyState } from "@/components/app/empty-state";
import { Money } from "@/components/money/money";
import { parseReportPeriod } from "@/components/reports/model";
import { ReportEndNote } from "@/components/reports/report-month";
import {
  clampReportMonth,
  parseMonthParam,
  reportWindowCaption,
  tagDetailHref,
} from "@/components/reports/views";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/server/dal";
import { getUserContext, resolvePeriod } from "@/server/domain/context";
import { trailingPeriods } from "@/server/domain/reports";
import { tagBreakdown } from "@/server/domain/tag-report";
import { listTags } from "@/server/domain/tags";

export const metadata: Metadata = { title: "Relatórios · Etiquetas" };

/**
 * Relatórios › Etiquetas (task 18, doc 02 §6.12): the paid expenses and
 * income of each tag in the window. An entry with two tags counts in both.
 */
export default function EtiquetasRelatorioPage({
  searchParams,
}: PageProps<"/relatorios/etiquetas">) {
  return (
    <Suspense fallback={<TagsSkeleton />}>
      <Tags searchParams={searchParams} />
    </Suspense>
  );
}

async function Tags({
  searchParams,
}: {
  searchParams: PageProps<"/relatorios/etiquetas">["searchParams"];
}) {
  const user = await requireUser();
  const ctx = await getUserContext(user.id);
  const { periodo, mes } = await searchParams;
  const period = parseReportPeriod(periodo);
  const currentMonth = resolvePeriod(ctx, null).month;
  const month = clampReportMonth(parseMonthParam(mes), currentMonth);
  const range = resolvePeriod(ctx, month);
  const first = trailingPeriods(range, period)[0] ?? range;
  const [breakdown, tags] = await Promise.all([
    tagBreakdown(ctx, first.start, range.end),
    listTags(ctx.userId, { includeArchived: true }),
  ]);
  const note = (
    <ReportEndNote
      path="/relatorios/etiquetas"
      period={period}
      month={range.month}
      currentMonth={currentMonth}
    />
  );

  if (tags.length === 0) {
    return (
      <>
        {note}
        <EmptyState
          icon={<Tag />}
          title="Nenhuma etiqueta ainda"
          description="Crie etiquetas em Ajustes para juntar lançamentos, como os de uma viagem."
          action={
            <Button asChild variant="tonal">
              <Link href="/ajustes/etiquetas">Criar etiquetas</Link>
            </Button>
          }
        />
      </>
    );
  }

  if (breakdown.items.length === 0) {
    return (
      <>
        {note}
        <EmptyState
          icon={<ReceiptText />}
          title="Nenhum lançamento com etiqueta no período"
          description="Quando houver lançamentos pagos com etiqueta, o total de cada uma aparece aqui."
        />
      </>
    );
  }

  return (
    <>
      {note}
      <Card asChild className="flex flex-col gap-1">
        <section aria-labelledby="relatorio-etiquetas">
          <div className="flex min-w-0 flex-col">
            <h2 id="relatorio-etiquetas" className="text-headline text-fg">
              Por etiqueta
            </h2>
            <p className="text-caption text-fg-3">
              {reportWindowCaption(range, period)} · só lançamentos pagos
            </p>
          </div>
          <ul className="mt-2 -mx-2 flex flex-col">
            {breakdown.items.map((item) => {
              const name = item.archived
                ? `${item.name} (arquivada)`
                : item.name;
              return (
                <li key={item.tagId}>
                  <Link
                    href={tagDetailHref(
                      item.tagId,
                      period,
                      range.month,
                      currentMonth,
                    )}
                    className="flex min-h-14 items-center gap-3 rounded-control px-2 py-2 transition-colors duration-100 hover:bg-surface-2/60 active:bg-surface-2"
                  >
                    <span
                      aria-hidden="true"
                      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-2"
                    >
                      <Tag className="size-5" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-callout font-semibold text-fg">
                        {name}
                      </span>
                      <span className="text-caption text-fg-3">
                        {entriesLabel(item.count)}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end">
                      <span className="sr-only">Despesas </span>
                      <Money
                        cents={item.expenseCents}
                        variant="callout"
                        tone="neutral"
                        sign="never"
                        className="font-bold"
                      />
                      {item.incomeCents > 0 ? (
                        <span className="text-caption text-fg-3">
                          Receitas{" "}
                          <Money
                            cents={item.incomeCents}
                            variant="caption"
                            tone="income"
                          />
                        </span>
                      ) : null}
                    </span>
                    <ChevronRight
                      aria-hidden="true"
                      className="size-5 shrink-0 text-fg-3"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 border-t border-border pt-2.5 text-caption text-fg-3">
            Um lançamento com mais de uma etiqueta entra no total de cada uma.
          </p>
        </section>
      </Card>
    </>
  );
}

function TagsSkeleton() {
  return (
    <LoadingRegion>
      <Skeleton className="h-100 rounded-card" />
    </LoadingRegion>
  );
}
