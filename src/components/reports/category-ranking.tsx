import { Ellipsis } from "lucide-react";
import Link from "next/link";
import { CategoryIcon } from "@/components/finance/category-icon";
import { Money } from "@/components/money/money";
import { formatPercent } from "@/lib/format/number";
import { cn } from "@/lib/utils";

export type RankedCategory = {
  categoryId: string | null;
  name: string;
  icon: string;
  color: string;
  cents: number;
  share: number;
};

type CategoryRankingProps = {
  items: RankedCategory[];
  /** Month the links open in the statement (`/extrato?categoria=…&mes=…`). */
  month: string;
  /** Show the first `limit` and fold the rest into "Outras N categorias". */
  limit?: number;
  className?: string;
};

/**
 * "Para onde foi o dinheiro" (doc 02 §6.12, §9.1): ranked horizontal bars in
 * one hue (--primary), the category icon as identity, value and share.
 */
export function CategoryRanking({
  items,
  month,
  limit,
  className,
}: CategoryRankingProps) {
  const shown = limit ? items.slice(0, limit) : items;
  const rest = limit ? items.slice(limit) : [];
  const max = items[0]?.cents ?? 0;
  const restCents = rest.reduce((sum, item) => sum + item.cents, 0);
  const restShare = rest.reduce((sum, item) => sum + item.share, 0);

  return (
    <ol className={cn("flex flex-col", className)}>
      {shown.map((item) => (
        <li key={item.categoryId ?? "sem-categoria"}>
          <RankRow item={item} max={max} month={month} />
        </li>
      ))}
      {rest.length > 0 ? (
        <li className="border-t border-border">
          <RankRow
            item={{
              categoryId: null,
              name: `Outras ${rest.length} ${rest.length === 1 ? "categoria" : "categorias"}`,
              icon: "ellipsis",
              color: "neutral",
              cents: restCents,
              share: restShare,
            }}
            max={Math.max(max, restCents)}
            month={month}
            muted
          />
        </li>
      ) : null}
    </ol>
  );
}

function RankRow({
  item,
  max,
  month,
  muted = false,
}: {
  item: RankedCategory;
  max: number;
  month: string;
  muted?: boolean;
}) {
  const width = max > 0 ? Math.max(1.5, (item.cents / max) * 100) : 0;
  const body = (
    <>
      <span className="flex items-center gap-2.5">
        {muted ? (
          <span
            aria-hidden="true"
            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-2"
          >
            <Ellipsis className="size-4" />
          </span>
        ) : (
          <CategoryIcon icon={item.icon} color={item.color} size="sm" />
        )}
        <span className="min-w-0 flex-1 truncate text-callout font-semibold text-fg">
          {item.name}
        </span>
        <Money
          cents={item.cents}
          variant="callout"
          tone="neutral"
          sign="never"
          className="font-bold"
        />
      </span>
      <span className="flex items-center gap-2.5 pl-9.5">
        <span aria-hidden="true" className="h-2 flex-1">
          <span
            className={cn(
              "block h-full rounded-r-[4px]",
              muted ? "bg-border-strong/40" : "bg-primary",
            )}
            style={{ width: `${width}%` }}
          />
        </span>
        <span className="w-12 text-right text-caption font-semibold text-fg-3 tabular-nums">
          {formatPercent(item.share)}
        </span>
      </span>
    </>
  );

  const rowClass = "flex flex-col gap-1.5 rounded-chip py-2.5";
  if (!item.categoryId) {
    return <div className={cn(rowClass, "px-0")}>{body}</div>;
  }
  return (
    <Link
      href={`/extrato?categoria=${item.categoryId}&mes=${month}`}
      className={cn(
        rowClass,
        "-mx-2 px-2 transition-colors duration-100 hover:bg-surface-2/60 active:bg-surface-2",
      )}
    >
      {body}
      <span className="sr-only">: ver os lançamentos do mês no extrato</span>
    </Link>
  );
}
