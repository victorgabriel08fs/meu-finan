import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import {
  formatBRL,
  formatCompactBRL,
  type SignDisplay,
} from "@/lib/format/money";
import { cn } from "@/lib/utils";

/**
 * Amount in compact form ("R$ 105,8 mil") with the full value for screen
 * readers (doc 02 §8: values are never cut); hidden in privacy mode like
 * <Money>. `sign="always"` adds "+" to a positive change.
 */
export function CompactMoney({
  cents,
  sign = "auto",
}: {
  cents: number;
  sign?: SignDisplay;
}) {
  return (
    <span data-slot="money" className="whitespace-nowrap">
      <span data-privacy-value="">
        <span aria-hidden="true">{formatCompactBRL(cents, { sign })}</span>
        <span className="sr-only">{formatBRL(cents, { sign })}</span>
      </span>
      <span data-privacy-mask="" role="img" aria-label="valor oculto">
        <span aria-hidden="true">R$ ••••</span>
      </span>
    </span>
  );
}

/** Narrow KPI tile (doc 02 §6.12): caption label, compact value, support line. */
export function KpiTile({
  label,
  value,
  support,
  className,
}: {
  label: string;
  value: ReactNode;
  support?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("flex min-w-0 flex-col gap-1 p-3.5", className)}>
      <span className="text-caption font-semibold text-fg-2">{label}</span>
      <span className="text-title-3 text-fg">{value}</span>
      {support ? <span className="text-micro text-fg-3">{support}</span> : null}
    </Card>
  );
}
