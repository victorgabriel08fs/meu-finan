import { ArrowLeft, ArrowUpRight, ReceiptText, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";
import { EmptyState } from "@/components/app/empty-state";
import { monthName } from "@/components/charts/format";
import { CategoryIcon } from "@/components/finance/category-icon";
import { Money } from "@/components/money/money";
import { CategoryMonthsCard } from "@/components/reports/category-detail";
import { CategoryRanking } from "@/components/reports/category-ranking";
import { parseReportPeriod } from "@/components/reports/model";
import {
  clampReportMonth,
  parseMonthParam,
  periodHref,
  reportWindowCaption,
} from "@/components/reports/views";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CLAMP_TITLE } from "@/components/ui/clamp";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { formatPercent } from "@/lib/format/number";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/dal";
import { categoryDetail } from "@/server/domain/category-report";
import { getUserContext, resolvePeriod } from "@/server/domain/context";

export const metadata: Metadata = { title: "Relatórios · Categoria" };

type Props = PageProps<"/relatorios/categorias/[id]">;

/**
 * Detalhe da categoria (doc 02 §6.12): the total in the window, the split per
 * subcategory, month by month and what weighed the most. Opens from the
 * ranking with its `?periodo=` and `?mes=`; the statement is one tap away.
 */
export default function CategoriaDetalhePage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <Detail params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Detail({
  params,
  searchParams,
}: {
  params: Props["params"];
  searchParams: Props["searchParams"];
}) {
  const user = await requireUser();
  const [{ id }, { periodo, mes }, ctx] = await Promise.all([
    params,
    searchParams,
    getUserContext(user.id),
  ]);
  const period = parseReportPeriod(periodo);
  const currentMonth = resolvePeriod(ctx, null).month;
  const month = clampReportMonth(parseMonthParam(mes), currentMonth);
  const range = resolvePeriod(ctx, month);
  const listHref = periodHref(
    "/relatorios/categorias",
    period,
    month === currentMonth ? null : month,
  );
  // The id comes from the URL: anything that is not a uuid is not a category.
  const detail = z.uuid().safeParse(id).success
    ? await categoryDetail(ctx, id, range, period)
    : null;

  const back = (
    <Link
      href={listHref}
      className="-ml-2 inline-flex min-h-11 w-fit items-center gap-1 rounded-control px-2 text-callout font-semibold text-primary transition-colors duration-100 hover:bg-primary-soft/60 active:bg-primary-soft"
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      Todas as categorias
    </Link>
  );

  if (!detail) {
    return (
      <>
        {back}
        <EmptyState
          icon={<SearchX />}
          title="Categoria não encontrada"
          description="Ela pode ter sido mesclada com outra, ou o link está incompleto."
          action={
            <Button asChild variant="tonal">
              <Link href={listHref}>Ver categorias</Link>
            </Button>
          }
        />
      </>
    );
  }

  const { category } = detail;
  const isExpense = category.kind === "expense";
  const noun = isExpense ? "despesas" : "receitas";
  const name = category.archived
    ? `${category.label} (arquivada)`
    : category.label;
  const statementHref = `/extrato?categoria=${category.id}&mes=${range.month}`;

  if (detail.totalCents === 0) {
    return (
      <>
        {back}
        <EmptyState
          icon={<ReceiptText />}
          title={`Nenhuma ${isExpense ? "despesa" : "receita"} em ${category.label} no período`}
          description={`Quando houver ${noun} pagas nesta categoria, o detalhe aparece aqui.`}
          action={
            <Button asChild variant="tonal">
              <Link href={statementHref}>Ver no extrato</Link>
            </Button>
          }
        />
      </>
    );
  }

  const ranked = detail.bySubcategory.map((item) => ({
    categoryId: item.categoryId,
    name: item.archived ? `${item.name} (arquivada)` : item.name,
    icon: item.icon,
    color: item.color,
    cents: item.cents,
    share: item.share,
  }));

  return (
    <>
      {back}
      <Card asChild className="flex flex-col gap-3">
        <section aria-labelledby="categoria-resumo">
          <div className="flex items-center gap-3">
            <CategoryIcon icon={category.icon} color={category.color} />
            <div className="flex min-w-0 flex-1 flex-col">
              <h2
                id="categoria-resumo"
                className="text-headline break-words text-fg"
              >
                {name}
              </h2>
              <p className="text-caption text-fg-3">
                {reportWindowCaption(range, period)}
              </p>
            </div>
          </div>
          <Money
            cents={detail.totalCents}
            variant="title"
            tone="neutral"
            sign="never"
            className="block"
          />
          <p className="text-callout text-fg-2">
            {formatPercent(detail.share)} das {noun} do período
          </p>
        </section>
      </Card>

      <Button asChild variant="tonal" className="max-w-full">
        <Link href={statementHref}>
          Ver lançamentos de {monthName(range.month)} no extrato
          <ArrowUpRight aria-hidden="true" />
        </Link>
      </Button>

      {ranked.length > 0 ? (
        <Card asChild className="flex flex-col gap-1">
          <section aria-labelledby="categoria-subcategorias">
            <h2 id="categoria-subcategorias" className="text-headline text-fg">
              Por subcategoria
            </h2>
            <CategoryRanking
              items={ranked}
              hrefFor={(subId) =>
                `/extrato?categoria=${subId}&mes=${range.month}`
              }
              linkHint={`ver no extrato de ${monthName(range.month)}`}
            />
          </section>
        </Card>
      ) : null}

      {period >= 3 ? (
        <CategoryMonthsCard
          months={detail.months.map(({ month: item, cents, partial }) => ({
            month: item,
            cents,
            partial,
          }))}
          label={category.label}
          kind={category.kind}
        />
      ) : null}

      {detail.topDescriptions.length > 0 ? (
        <Card asChild className="flex flex-col gap-1">
          <section aria-labelledby="categoria-pesou">
            <h2 id="categoria-pesou" className="text-headline text-fg">
              O que mais pesou
            </h2>
            <ol className="flex flex-col [&>li+li]:border-t [&>li+li]:border-border">
              {detail.topDescriptions.map((item) => (
                <li
                  key={item.description}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5"
                >
                  <span className="flex min-w-0 flex-[1_1_8rem] flex-col">
                    <span
                      className={cn(
                        "text-callout font-semibold text-fg",
                        CLAMP_TITLE,
                      )}
                    >
                      {item.description}
                    </span>
                    <span className="text-caption text-fg-3">
                      {item.count === 1
                        ? "1 lançamento"
                        : `${item.count} lançamentos`}
                    </span>
                  </span>
                  <Money
                    cents={item.cents}
                    variant="callout"
                    tone="neutral"
                    sign="never"
                    className="ml-auto font-bold"
                  />
                </li>
              ))}
            </ol>
          </section>
        </Card>
      ) : null}
    </>
  );
}

function DetailSkeleton() {
  return (
    <LoadingRegion className="flex flex-col gap-4">
      <Skeleton className="h-11 w-48 rounded-chip" />
      <Skeleton className="h-36 rounded-card" />
      <Skeleton className="h-12 rounded-control" />
      <Skeleton className="h-60 rounded-card" />
      <Skeleton className="h-72 rounded-card" />
    </LoadingRegion>
  );
}
