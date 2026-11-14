import {
  ArrowLeftRight,
  CalendarClock,
  Minus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { CategoryIcon } from "@/components/finance/category-icon";
import { Money } from "@/components/money/money";
import { QuickAddButton } from "@/components/quick-add/quick-add-trigger";
import { Card } from "@/components/ui/card";
import { CLAMP_TITLE } from "@/components/ui/clamp";
import { formatBRL } from "@/lib/format/money";
import { cn } from "@/lib/utils";
import type {
  MonthComparison,
  MonthComparisonCategory,
} from "@/server/domain/month-comparison";
import { BlockInvite } from "./block-invite";
import { BlockLink } from "./block-link";
import {
  categoryDirectionHint,
  categoryPercentLabel,
  comparisonCaption,
  previousLine,
  totalChangeParts,
} from "./month-comparison-model";

type MonthComparisonBlockProps = {
  comparison: MonthComparison;
  /** "novembro". */
  monthName: string;
  /** "outubro". */
  previousMonthName: string;
  /** "Ver relatório": the categories report over the month on screen. */
  reportHref: string;
  /** Where a row opens: the category's detail over the month on screen. */
  hrefFor: (categoryId: string) => string;
  /** The smallest change a category needs to be listed (R$ 10,00). */
  minDiffCents: number;
};

/**
 * Comparado ao mês passado on the Início (doc 02 §6.3): paid expenses of the
 * month so far against the same point of the month before, and the main
 * categories that changed the most. Spending more is never red ("sem
 * culpa", §10.2); every amount goes through `Money`, so the discreet mode
 * masks it, and the direction is always said in words.
 */
export function MonthComparisonBlock({
  comparison,
  monthName,
  previousMonthName,
  reportHref,
  hrefFor,
  minDiffCents,
}: MonthComparisonBlockProps) {
  const { total, complete } = comparison;
  const previous = previousLine(comparison, previousMonthName);
  const noBaseline = total.baselineCents === 0;
  return (
    <Card asChild className="flex flex-col gap-3">
      <section aria-labelledby="inicio-comparado-mes">
        <div className="flex flex-wrap items-start justify-between gap-x-3">
          <div className="flex min-w-0 flex-[1_1_10rem] flex-col">
            <h2 id="inicio-comparado-mes" className="text-headline text-fg">
              Comparado ao mês passado
            </h2>
            <p className="text-caption text-fg-3">
              {comparisonCaption(comparison, monthName, previousMonthName)}
            </p>
          </div>
          <BlockLink href={reportHref}>Ver relatório</BlockLink>
        </div>

        <div className="@container flex flex-col items-start gap-2">
          <Money cents={total.currentCents} variant="title" tone="neutral" />
          <TotalChangeChip
            total={total}
            previousMonthName={previousMonthName}
            complete={complete}
          />
          {previous ? (
            <p className="text-caption text-fg-3">
              {previous}{" "}
              <Money
                cents={total.baselineCents}
                variant="caption"
                tone="neutral"
                className="font-semibold text-fg-2"
              />
            </p>
          ) : null}
        </div>

        {noBaseline ? null : (
          <div className="flex flex-col gap-1">
            <h3 className="text-callout font-semibold text-fg-2">
              O que mais mudou
            </h3>
            {comparison.categories.length === 0 ? (
              <p className="text-caption text-fg-3">
                Nenhuma categoria mudou mais de {formatBRL(minDiffCents)}.
              </p>
            ) : (
              <ul className="[&>li+li]:border-t [&>li+li]:border-border">
                {comparison.categories.map((item) => (
                  <li key={item.key}>
                    <CategoryChangeRow
                      item={item}
                      monthName={monthName}
                      previousMonthName={previousMonthName}
                      hrefFor={hrefFor}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </Card>
  );
}

/** Same look as the balance's month chip; the icon never says it alone. */
function TotalChangeChip({
  total,
  previousMonthName,
  complete,
}: {
  total: MonthComparison["total"];
  previousMonthName: string;
  complete: boolean;
}) {
  const parts = totalChangeParts(total, previousMonthName, complete);
  const down = parts.kind === "down";
  const Icon = parts.kind === "up" ? TrendingUp : down ? TrendingDown : Minus;
  return (
    <p
      className={cn(
        "inline-flex min-h-7.5 items-start gap-x-1.5 rounded-full @max-tight:rounded-control px-3 py-1 text-caption font-semibold",
        down
          ? "bg-primary-soft text-on-primary-soft"
          : "bg-surface-2 text-fg-2",
      )}
    >
      <Icon aria-hidden="true" className="mt-px size-4 shrink-0" />
      {parts.kind === "up" || parts.kind === "down" ? (
        <span>
          <Money
            cents={total.diffCents}
            variant="caption"
            sign="never"
            tone="neutral"
            className="font-semibold text-inherit"
          />
          {parts.suffix} ({parts.percent})
        </span>
      ) : (
        <span>{parts.suffix}</span>
      )}
    </p>
  );
}

function CategoryChangeRow({
  item,
  monthName,
  previousMonthName,
  hrefFor,
}: {
  item: MonthComparisonCategory;
  monthName: string;
  previousMonthName: string;
  hrefFor: (categoryId: string) => string;
}) {
  const body = (
    <>
      <span className="flex min-w-0 flex-[1_1_6rem] items-center gap-2.5">
        <CategoryIcon icon={item.icon} color={item.color} size="sm" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span
            className={cn("text-callout font-semibold text-fg", CLAMP_TITLE)}
          >
            {item.name}
          </span>
          <span className="text-caption text-fg-3">
            <Money
              cents={item.currentCents}
              variant="caption"
              tone="neutral"
              className="text-inherit"
            />{" "}
            em {monthName} ·{" "}
            <Money
              cents={item.baselineCents}
              variant="caption"
              tone="neutral"
              className="text-inherit"
            />{" "}
            em {previousMonthName}
          </span>
        </span>
      </span>
      <span className="ml-auto flex flex-col items-end">
        <span>
          <Money
            cents={item.diffCents}
            variant="callout"
            sign="always"
            tone="neutral"
            className="font-bold"
          />
          <span className="sr-only">
            {categoryDirectionHint(item, previousMonthName)}
          </span>
        </span>
        <span className="text-caption font-semibold text-fg-3 tabular-nums">
          {categoryPercentLabel(item)}
        </span>
      </span>
    </>
  );
  // Wraps the difference under the name when the row is narrow (large text).
  const rowClass =
    "flex min-h-11 flex-wrap items-center gap-x-2.5 gap-y-1 py-2.5";
  if (!item.categoryId) return <div className={rowClass}>{body}</div>;
  return (
    <Link
      href={hrefFor(item.categoryId)}
      className={cn(
        rowClass,
        "-mx-2 rounded-chip px-2 transition-colors duration-100 hover:bg-surface-2/60 active:bg-surface-2",
      )}
    >
      {body}
      <span className="sr-only">, ver o detalhe da categoria</span>
    </Link>
  );
}

/** Nothing paid in either window. */
export function MonthComparisonInvite({
  monthName,
  previousMonthName,
}: {
  monthName: string;
  previousMonthName: string;
}) {
  return (
    <BlockInvite
      icon={<ArrowLeftRight />}
      title="Nenhuma despesa para comparar"
      description={`Quando houver despesas pagas, o bloco compara ${monthName} com ${previousMonthName}.`}
      action={
        <QuickAddButton kind="expense" variant="tonal" size="sm">
          Adicionar despesa
        </QuickAddButton>
      }
    />
  );
}

/** A month ahead: nothing to compare yet. */
export function MonthComparisonFutureInvite({
  monthName,
}: {
  monthName: string;
}) {
  return (
    <BlockInvite
      icon={<CalendarClock />}
      title={`${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ainda não começou`}
      description="A comparação com o mês anterior aparece quando o mês começar."
    />
  );
}
