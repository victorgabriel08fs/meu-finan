import { ChevronRight, Minus, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { Money } from "@/components/money/money";
import { cn } from "@/lib/utils";
import { ForecastSheet } from "./forecast-sheet";

type BalanceHeroProps = {
  balanceCents: number;
  /** Net change of the counted accounts since the period started. */
  monthChangeCents: number;
  /** "outubro". */
  monthName: string;
  forecast: {
    balanceCents: number;
    pendingIncomeCents: number;
    pendingExpenseCents: number;
    invoicesDueCents: number;
    forecastCents: number;
  };
  /** "31/out": end of the period. */
  untilLabel: string;
};

/**
 * "Saldo em contas" (doc 02 §6.3): display amount, the month's change in a
 * chip, and the forecast for the end of the period with its explanation.
 * The top part opens /contas.
 */
export function BalanceHero({
  balanceCents,
  monthChangeCents,
  monthName,
  forecast,
  untilLabel,
}: BalanceHeroProps) {
  return (
    <section
      aria-labelledby="saldo-em-contas"
      className="rounded-card bg-surface p-5 shadow-card"
    >
      <Link
        href="/contas"
        className="-m-2 block rounded-control p-2 transition-colors duration-100 hover:bg-surface-2/50 active:bg-surface-2"
      >
        <h2
          id="saldo-em-contas"
          className="flex items-center gap-0.5 text-overline uppercase text-fg-3"
        >
          Saldo em contas
          <ChevronRight aria-hidden="true" className="size-4" />
        </h2>
        <Money
          cents={balanceCents}
          variant="display"
          tone="neutral"
          className="mt-1.5 block"
        />
      </Link>

      <div className="mt-3 flex">
        <MonthChangeChip cents={monthChangeCents} monthName={monthName} />
      </div>

      <div aria-hidden="true" className="mt-4 mb-3 h-px bg-border" />

      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-caption text-fg-3">
            Previsto para {untilLabel}
          </span>
          <Money
            cents={forecast.forecastCents}
            variant="headline"
            tone="neutral"
            className="text-title-3"
          />
          <span className="text-micro text-fg-3">
            considera contas agendadas e faturas
          </span>
        </div>
        <ForecastSheet {...forecast} untilLabel={untilLabel} />
      </div>
    </section>
  );
}

function MonthChangeChip({
  cents,
  monthName,
}: {
  cents: number;
  monthName: string;
}) {
  if (cents === 0) {
    return (
      <span className="inline-flex h-7.5 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-caption font-semibold text-fg-2">
        <Minus aria-hidden="true" className="size-4" />
        Sem variação em {monthName}
      </span>
    );
  }
  const up = cents > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        "inline-flex h-7.5 items-center gap-1.5 rounded-full px-3 text-caption font-semibold",
        up ? "bg-primary-soft text-on-primary-soft" : "bg-surface-2 text-fg-2",
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
      <Money
        cents={cents}
        variant="caption"
        sign="always"
        className="font-semibold text-inherit"
      />
      <span>em {monthName}</span>
    </span>
  );
}
