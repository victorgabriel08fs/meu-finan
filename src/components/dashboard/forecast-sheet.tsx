"use client";

import { Info } from "lucide-react";
import type { ReactNode } from "react";
import { Money } from "@/components/money/money";
import { IconButton } from "@/components/ui/icon-button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type ForecastSheetProps = {
  balanceCents: number;
  pendingIncomeCents: number;
  /** Magnitude (positive). */
  pendingExpenseCents: number;
  /** Magnitude (positive). */
  invoicesDueCents: number;
  forecastCents: number;
  /** "31/out": the last day of the period. */
  untilLabel: string;
};

/**
 * The "(i)" of the hero (doc 02 §6.3): opens a sheet with the forecast spelled
 * out — balance + income to receive − scheduled expenses − invoices due.
 */
export function ForecastSheet({
  balanceCents,
  pendingIncomeCents,
  pendingExpenseCents,
  invoicesDueCents,
  forecastCents,
  untilLabel,
}: ForecastSheetProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <IconButton
          label="Como calculamos o previsto"
          className="bg-surface-2 hover:bg-surface-3 [&_svg]:size-5"
        >
          <Info />
        </IconButton>
      </SheetTrigger>
      <SheetContent
        title="Como calculamos o previsto"
        description={`Quanto deve sobrar nas contas em ${untilLabel}, se tudo o que está agendado acontecer.`}
      >
        <dl className="flex flex-col">
          <Row label="Saldo em contas hoje">
            <Money cents={balanceCents} variant="headline" tone="neutral" />
          </Row>
          <Row label="Receitas a receber">
            <Money
              cents={pendingIncomeCents}
              variant="headline"
              sign="always"
            />
          </Row>
          <Row label="Despesas agendadas">
            <Money
              cents={-pendingExpenseCents}
              variant="headline"
              tone="neutral"
            />
          </Row>
          <Row label="Faturas a vencer">
            <Money
              cents={-invoicesDueCents}
              variant="headline"
              tone="neutral"
            />
          </Row>
          <Row label={`Previsto para ${untilLabel}`} total>
            <Money
              cents={forecastCents}
              variant="headline"
              tone="neutral"
              className="text-title-3"
            />
          </Row>
        </dl>
        <p className="mt-4 text-caption text-fg-3">
          Entram as contas incluídas no patrimônio; cartões de crédito ficam de
          fora do saldo. Compras no cartão pesam pela fatura, até a data de
          vencimento.
        </p>
      </SheetContent>
    </Sheet>
  );
}

function Row({
  label,
  total = false,
  children,
}: {
  label: string;
  total?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex min-h-13 items-center justify-between gap-3 py-2",
        total ? "mt-1 border-t-2 border-fg/80" : "border-t border-border",
        "first:border-t-0",
      )}
    >
      <dt
        className={cn(
          "min-w-0 text-body",
          total ? "font-bold text-fg" : "text-fg-2",
        )}
      >
        {label}
      </dt>
      <dd className="shrink-0">{children}</dd>
    </div>
  );
}
