import { ReceiptText } from "lucide-react";
import { TransactionRow } from "@/components/finance/transaction-row";
import { QuickAddButton } from "@/components/quick-add/quick-add-trigger";
import { Card } from "@/components/ui/card";
import { relativeDayLabel } from "@/lib/format/date";
import type { TopExpense } from "@/server/domain/dashboard";
import { BlockInvite } from "./block-invite";
import { BlockLink } from "./block-link";

type TopExpensesBlockProps = {
  items: TopExpense[];
  /** `YYYY-MM-DD` in the user's time zone. */
  today: string;
  /** Where a row opens: the statement narrowed to that entry. */
  hrefFor: (item: TopExpense) => string;
  /** "Ver no Extrato": the person's expenses. */
  extractHref: string;
};

/**
 * Maior gasto da semana on the Início (doc 02 §6.3): the biggest paid
 * expenses of the last 7 days as statement rows, each one a link to the
 * Extrato. Amounts go through `Money`, so the discreet mode masks them.
 */
export function TopExpensesBlock({
  items,
  today,
  hrefFor,
  extractHref,
}: TopExpensesBlockProps) {
  return (
    <Card asChild className="flex flex-col gap-3">
      <section aria-labelledby="inicio-maior-gasto">
        <div className="flex flex-wrap items-start justify-between gap-x-3">
          <div className="flex min-w-0 flex-[1_1_10rem] flex-col">
            <h2 id="inicio-maior-gasto" className="text-headline text-fg">
              Maior gasto da semana
            </h2>
            <p className="text-caption text-fg-3">Pagas nos últimos 7 dias</p>
          </div>
          <BlockLink href={extractHref}>Ver no Extrato</BlockLink>
        </div>
        <ul className="-mx-4 -mb-2 [&>li+li]:border-t [&>li+li]:border-border">
          {items.map((item) => (
            <li key={item.id}>
              <TransactionRow
                txn={{
                  id: item.id,
                  description: item.description,
                  amountCents: item.amountCents,
                  kind: "expense",
                  status: "paid",
                  occurredOn: item.occurredOn,
                  categoryName: item.categoryName,
                  categoryIcon: item.categoryIcon,
                  categoryColor: item.categoryColor,
                  accountName: item.accountName,
                  installment: item.installment,
                  recurring: item.recurring,
                  subtitle: `${item.categoryName ?? "Sem categoria"} · ${relativeDayLabel(item.occurredOn, today)}`,
                }}
                href={hrefFor(item)}
                today={today}
              />
            </li>
          ))}
        </ul>
      </section>
    </Card>
  );
}

/** No paid expense in the last 7 days. */
export function TopExpensesInvite() {
  return (
    <BlockInvite
      icon={<ReceiptText />}
      title="Nenhum gasto nos últimos 7 dias"
      description="Quando você lançar uma despesa, as maiores aparecem aqui."
      action={
        <QuickAddButton kind="expense" variant="tonal" size="sm">
          Adicionar gasto
        </QuickAddButton>
      }
    />
  );
}
