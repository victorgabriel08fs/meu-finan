import { CalendarClock } from "lucide-react";
import Link from "next/link";
import { Money, spokenAmount } from "@/components/money/money";
import { QuickAddButton } from "@/components/quick-add/quick-add-trigger";
import { Card } from "@/components/ui/card";
import { monthLabel } from "@/lib/format/date";
import { brlParts } from "@/lib/format/money";
import type { EndingInstallment } from "@/lib/home/installments-ending";
import type { InstallmentsEnding } from "@/server/domain/dashboard";
import { BlockInvite } from "./block-invite";

type InstallmentsEndingBlockProps = {
  summary: InstallmentsEnding;
  /** Where a row opens: the statement narrowed to the next installment. */
  hrefFor: (item: EndingInstallment) => string;
};

/** "março de 2027" for the date of the last installment. */
function endMonth(item: EndingInstallment): string {
  return monthLabel(item.endsOn.slice(0, 7));
}

function remainingText(item: EndingInstallment): string {
  return item.remainingCount === 1
    ? `última parcela · ${endMonth(item)}`
    : `faltam ${item.remainingCount} · acaba em ${endMonth(item)}`;
}

function rowLabel(item: EndingInstallment): string {
  const left =
    item.remainingCount === 1
      ? `falta 1 parcela, a última, em ${endMonth(item)}`
      : `faltam ${item.remainingCount} parcelas, acaba em ${endMonth(item)}`;
  return `${item.description}, parcela ${item.nextNumber} de ${item.count}, ${left}, restam ${spokenAmount(
    item.remainingCents,
    brlParts(item.remainingCents, { sign: "never" }),
  )}; abrir no Extrato`;
}

/**
 * Parcelas a terminar on the Início (doc 02 §6.3): purchases in installments
 * with something left to pay, the ones that end first, and what leaves the
 * budget each month. Amounts go through `Money` (discreet mode masks them).
 */
export function InstallmentsEndingBlock({
  summary,
  hrefFor,
}: InstallmentsEndingBlockProps) {
  const { items, totalPlans, monthlyCents } = summary;
  const more = totalPlans - items.length;
  return (
    <Card asChild className="flex flex-col gap-3">
      <section aria-labelledby="inicio-parcelas-a-terminar">
        <div className="flex flex-col">
          <h2 id="inicio-parcelas-a-terminar" className="text-headline text-fg">
            Parcelas a terminar
          </h2>
          <p className="text-caption text-fg-3">
            Saem <Money cents={monthlyCents} variant="caption" tone="neutral" />{" "}
            por mês
          </p>
        </div>
        <ul className="-mx-4 [&>li+li]:border-t [&>li+li]:border-border">
          {items.map((item) => (
            <li
              key={item.planId}
              className="relative flex min-h-16 items-center gap-3 px-4 py-2.5 transition-colors duration-100 has-[a:active]:bg-surface-2"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="truncate text-body text-fg">
                  <Link
                    href={hrefFor(item)}
                    aria-label={rowLabel(item)}
                    className="outline-0 after:absolute after:inset-0 after:rounded-control focus-visible:after:outline-2 focus-visible:after:outline-solid focus-visible:after:-outline-offset-2 focus-visible:after:outline-focus"
                  >
                    {item.description}
                  </Link>
                </p>
                <p className="text-caption text-fg-3">
                  {item.remainingCount === 1
                    ? remainingText(item)
                    : `parcela ${item.nextNumber} de ${item.count} · ${remainingText(item)}`}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <span className="text-micro text-fg-3">falta pagar</span>
                <Money
                  cents={item.remainingCents}
                  variant="headline"
                  tone="neutral"
                />
              </div>
            </li>
          ))}
        </ul>
        {more > 0 ? (
          <p className="text-caption text-fg-3">
            {more === 1
              ? "e mais 1 compra parcelada"
              : `e mais ${more} compras parceladas`}
          </p>
        ) : null}
      </section>
    </Card>
  );
}

/** No installment left to pay. */
export function InstallmentsEndingInvite() {
  return (
    <BlockInvite
      icon={<CalendarClock />}
      title="Nenhuma parcela em aberto"
      description="Quando você parcelar uma compra, o que falta pagar aparece aqui."
      action={
        <QuickAddButton kind="expense" variant="tonal" size="sm">
          Adicionar gasto
        </QuickAddButton>
      }
    />
  );
}
