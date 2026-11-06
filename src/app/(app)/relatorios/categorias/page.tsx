import { ChartBar } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { CategoryRanking } from "@/components/reports/category-ranking";
import { parseReportPeriod } from "@/components/reports/model";
import { ReportEndNote } from "@/components/reports/report-month";
import {
  categoryDetailHref,
  clampReportMonth,
  parseMonthParam,
  reportWindowCaption,
} from "@/components/reports/views";
import { Card } from "@/components/ui/card";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { formatBRL } from "@/lib/format/money";
import { requireUser } from "@/server/dal";
import { getUserContext, resolvePeriod } from "@/server/domain/context";
import { categoryBreakdown, trailingPeriods } from "@/server/domain/reports";

export const metadata: Metadata = { title: "Relatórios · Categorias" };

export default function CategoriasRelatorioPage({
  searchParams,
}: PageProps<"/relatorios/categorias">) {
  return (
    <Suspense fallback={<CategoriesSkeleton />}>
      <Categories searchParams={searchParams} />
    </Suspense>
  );
}

async function Categories({
  searchParams,
}: {
  searchParams: PageProps<"/relatorios/categorias">["searchParams"];
}) {
  const user = await requireUser();
  const ctx = await getUserContext(user.id);
  const { periodo, mes } = await searchParams;
  const period = parseReportPeriod(periodo);
  const currentMonth = resolvePeriod(ctx, null).month;
  const month = clampReportMonth(parseMonthParam(mes), currentMonth);
  const range = resolvePeriod(ctx, month);
  const first = trailingPeriods(range, period)[0] ?? range;
  const breakdown = await categoryBreakdown(ctx, first.start, range.end);
  const note = (
    <ReportEndNote
      path="/relatorios/categorias"
      period={period}
      month={range.month}
      currentMonth={currentMonth}
    />
  );

  if (breakdown.items.length === 0) {
    return (
      <>
        {note}
        <EmptyState
          icon={<ChartBar />}
          title="Nenhuma despesa no período"
          description="Quando houver despesas pagas, o ranking das categorias aparece aqui."
        />
      </>
    );
  }

  return (
    <>
      {note}
      <Card asChild className="flex flex-col gap-1">
        <section aria-labelledby="relatorio-ranking">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col">
              <h2 id="relatorio-ranking" className="text-headline text-fg">
                Para onde foi o dinheiro
              </h2>
              <p className="text-caption text-fg-3">
                {reportWindowCaption(range, period)}
              </p>
            </div>
            <span className="shrink-0 text-callout font-bold text-fg tabular-nums">
              <span data-privacy-value="">
                {formatBRL(breakdown.totalCents)}
              </span>
              <span data-privacy-mask="">R$ ••••</span>
            </span>
          </div>
          <CategoryRanking
            items={breakdown.items}
            hrefFor={(categoryId) =>
              categoryDetailHref(categoryId, period, range.month, currentMonth)
            }
            linkHint="ver o detalhe da categoria"
            className="mt-2"
          />
          <p className="mt-2 border-t border-border pt-2.5 text-caption text-fg-3">
            Toque numa categoria para ver o detalhe e as subcategorias.
          </p>
        </section>
      </Card>
    </>
  );
}

function CategoriesSkeleton() {
  return (
    <LoadingRegion>
      <Skeleton className="h-125 rounded-card" />
    </LoadingRegion>
  );
}
