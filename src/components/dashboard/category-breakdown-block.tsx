import { ChartPie } from "lucide-react";
import { QuickAddButton } from "@/components/quick-add/quick-add-trigger";
import {
  CategoryRanking,
  type RankedCategory,
} from "@/components/reports/category-ranking";
import { Card } from "@/components/ui/card";
import { formatBRL } from "@/lib/format/money";
import { BlockInvite } from "./block-invite";
import { BlockLink } from "./block-link";

type CategoryBreakdownBlockProps = {
  items: RankedCategory[];
  totalCents: number;
  /** Where a row opens: the category's detail over the month on screen. */
  hrefFor: (categoryId: string) => string;
  /** "outubro". */
  monthName: string;
  /** The month is still running: what was paid so far. */
  isCurrent: boolean;
  /** Where "Ver relatório" or "Ver no extrato" goes, and its label. */
  link: { href: string; label: string };
};

/** Categories shown before "Outras N categorias". */
export const CATEGORY_BLOCK_LIMIT = 5;

/**
 * Para onde foi o dinheiro on the Início (doc 02 §6.3, §6.12): the report's
 * ranking for the month on screen, the five biggest categories and the rest
 * folded, the month's total beside the caption.
 */
export function CategoryBreakdownBlock({
  items,
  totalCents,
  hrefFor,
  monthName,
  isCurrent,
  link,
}: CategoryBreakdownBlockProps) {
  return (
    <Card asChild className="flex flex-col gap-3">
      <section aria-labelledby="inicio-categorias">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <h2 id="inicio-categorias" className="text-headline text-fg">
              Para onde foi o dinheiro
            </h2>
            <p className="text-caption text-fg-3">
              Despesas pagas em {monthName}
              {isCurrent ? ", até hoje" : ""}
            </p>
          </div>
          <BlockLink href={link.href}>{link.label}</BlockLink>
        </div>
        <p className="-mt-1 flex items-baseline justify-between gap-3 text-callout">
          <span className="font-semibold text-fg-2">Total</span>
          <span className="font-semibold text-fg tabular-nums">
            <span data-privacy-value="">{formatBRL(totalCents)}</span>
            <span data-privacy-mask="" role="img" aria-label="valor oculto">
              <span aria-hidden="true">R$ ••••</span>
            </span>
          </span>
        </p>
        <CategoryRanking
          items={items}
          hrefFor={hrefFor}
          linkHint="ver o detalhe da categoria"
          limit={CATEGORY_BLOCK_LIMIT}
        />
      </section>
    </Card>
  );
}

/** A month without paid expenses (a month ahead included). */
export function CategoryBreakdownInvite({ monthName }: { monthName: string }) {
  return (
    <BlockInvite
      icon={<ChartPie />}
      title={`Nenhuma despesa paga em ${monthName}`}
      description="Quando houver, o ranking mostra para onde foi o dinheiro."
      action={
        <QuickAddButton kind="expense" variant="tonal" size="sm">
          Adicionar despesa
        </QuickAddButton>
      }
    />
  );
}
