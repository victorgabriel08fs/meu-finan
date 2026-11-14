import {
  ArrowLeft,
  ArrowUpRight,
  ReceiptText,
  SearchX,
  Tag,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";
import { entriesLabel } from "@/app/(app)/ajustes/etiquetas/messages";
import { EmptyState } from "@/components/app/empty-state";
import { monthName } from "@/components/charts/format";
import { CategoryIcon } from "@/components/finance/category-icon";
import { Money } from "@/components/money/money";
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
import { shortDateLabel } from "@/lib/format/date";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/dal";
import { getUserContext, resolvePeriod } from "@/server/domain/context";
import { trailingPeriods } from "@/server/domain/reports";
import { tagDetail } from "@/server/domain/tag-report";

export const metadata: Metadata = { title: "Relatórios · Etiqueta" };

type Props = PageProps<"/relatorios/etiquetas/[id]">;

const LIMIT = 50;

/**
 * Detalhe da etiqueta (task 18, doc 02 §6.12): the paid expenses and income
 * with the tag in the window and its entries, newest first. Opens from the
 * list with its `?periodo=` and `?mes=`; the statement is one tap away.
 */
export default function EtiquetaDetalhePage({ params, searchParams }: Props) {
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
  const first = trailingPeriods(range, period)[0] ?? range;
  const listHref = periodHref(
    "/relatorios/etiquetas",
    period,
    month === currentMonth ? null : month,
  );
  // The id comes from the URL: anything that is not a uuid is not a tag.
  const detail = z.uuid().safeParse(id).success
    ? await tagDetail(ctx, id, first.start, range.end, LIMIT)
    : null;

  const back = (
    <Link
      href={listHref}
      className="-ml-2 inline-flex min-h-11 w-fit items-center gap-1 rounded-control px-2 text-callout font-semibold text-primary transition-colors duration-100 hover:bg-primary-soft/60 active:bg-primary-soft"
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      Todas as etiquetas
    </Link>
  );

  if (!detail) {
    return (
      <>
        {back}
        <EmptyState
          icon={<SearchX />}
          title="Etiqueta não encontrada"
          description="O link pode estar incompleto."
          action={
            <Button asChild variant="tonal">
              <Link href={listHref}>Ver etiquetas</Link>
            </Button>
          }
        />
      </>
    );
  }

  const { tag } = detail;
  const name = tag.archived ? `${tag.name} (arquivada)` : tag.name;
  const statementHref = `/extrato?etiqueta=${tag.id}&mes=${range.month}`;

  if (detail.count === 0) {
    return (
      <>
        {back}
        <EmptyState
          icon={<ReceiptText />}
          title={`Nenhum lançamento com ${tag.name} no período`}
          description="Quando houver lançamentos pagos com esta etiqueta, eles aparecem aqui."
          action={
            <Button asChild variant="tonal">
              <Link href={statementHref}>Ver no extrato</Link>
            </Button>
          }
        />
      </>
    );
  }

  return (
    <>
      {back}
      <Card asChild className="flex flex-col gap-3">
        <section aria-labelledby="etiqueta-resumo">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-2"
            >
              <Tag className="size-5" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <h2
                id="etiqueta-resumo"
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
            cents={detail.expenseCents}
            variant="title"
            tone="neutral"
            sign="never"
            className="block"
          />
          <p className="text-callout text-fg-2">
            em {entriesLabel(detail.count)}
          </p>
          {detail.incomeCents > 0 ? (
            <p className="text-callout text-fg-2">
              Receitas:{" "}
              <Money
                cents={detail.incomeCents}
                variant="callout"
                tone="income"
              />
            </p>
          ) : null}
        </section>
      </Card>

      <Button asChild variant="tonal" className="max-w-full">
        <Link href={statementHref}>
          {period === 1
            ? `Ver lançamentos de ${monthName(range.month)} no extrato`
            : `Ver só ${monthName(range.month)} no extrato`}
          <ArrowUpRight aria-hidden="true" />
        </Link>
      </Button>

      <Card asChild className="flex flex-col gap-1">
        <section aria-labelledby="etiqueta-lancamentos">
          <h2 id="etiqueta-lancamentos" className="text-headline text-fg">
            Lançamentos
          </h2>
          <ul className="flex flex-col [&>li+li]:border-t [&>li+li]:border-border">
            {detail.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-2.5">
                <CategoryIcon
                  icon={item.categoryIcon ?? "ellipsis"}
                  color={item.categoryColor ?? "neutral"}
                  size="sm"
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span
                    className={cn(
                      "text-callout font-semibold text-fg",
                      CLAMP_TITLE,
                    )}
                  >
                    {item.description}
                  </span>
                  <span className="truncate text-caption text-fg-3">
                    {[
                      shortDateLabel(item.occurredOn),
                      item.categoryLabel ?? "Sem categoria",
                      item.accountName,
                    ].join(" · ")}
                  </span>
                </span>
                <Money
                  cents={item.amountCents}
                  variant="callout"
                  className="shrink-0 font-bold"
                />
              </li>
            ))}
          </ul>
          {detail.hasMore ? (
            <p className="mt-1 border-t border-border pt-2.5 text-caption text-fg-3">
              Mostrando os {LIMIT} mais recentes.
            </p>
          ) : null}
        </section>
      </Card>
    </>
  );
}

function DetailSkeleton() {
  return (
    <LoadingRegion className="flex flex-col gap-4">
      <Skeleton className="h-11 w-48 rounded-chip" />
      <Skeleton className="h-36 rounded-card" />
      <Skeleton className="h-12 rounded-control" />
      <Skeleton className="h-96 rounded-card" />
    </LoadingRegion>
  );
}
