import { Repeat } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Money, spokenAmount } from "@/components/money/money";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { CLAMP_TEXT, CLAMP_TITLE } from "@/components/ui/clamp";
import { isInGrace, type NonBusinessDue } from "@/lib/finance/business-days";
import {
  relativeDayLabel,
  shortDateLabel,
  todayInTimeZone,
} from "@/lib/format/date";
import { graceLabel, nonBusinessSpoken } from "@/lib/format/due-day";
import { brlParts } from "@/lib/format/money";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "./category-icon";
import { NonBusinessHint } from "./non-business-hint";

export type TransactionRowData = {
  id: string;
  description: string;
  /** Signed cents: inflow > 0, outflow < 0. */
  amountCents: number;
  kind: "income" | "expense" | "transfer" | "adjustment";
  status: "pending" | "paid";
  /** `YYYY-MM-DD`. */
  occurredOn: string;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  accountName: string;
  installment?: { number: number; count: number } | null;
  /** Replaces the default "Categoria · Conta" line. */
  subtitle?: string;
  /** Part of a recurrence: shows the ↻ mark. */
  recurring?: boolean;
  /**
   * A pending expense due on a non-business day (flag alerta_dia_nao_util):
   * a third line says when the payment usually goes through.
   */
  nonBusinessDue?: NonBusinessDue | null;
};

type TransactionRowProps = {
  txn: TransactionRowData;
  /** Detail URL; the whole row becomes the link. */
  href?: string;
  /** Extra control at the far right (e.g. a tonal sm "Pagar" button). */
  trailing?: ReactNode;
  /** Today's date (`YYYY-MM-DD`) for due labels; defaults to today in São Paulo. */
  today?: string;
  className?: string;
};

const KIND_LABEL: Record<TransactionRowData["kind"], string> = {
  income: "Receita",
  expense: "Despesa",
  transfer: "Transferência",
  adjustment: "Ajuste de saldo",
};

/**
 * Statement row (doc 02 §5.7): 64px, category icon, title and "Categoria ·
 * Conta", amount right-aligned with tabular figures. Pending entries get a
 * dashed icon, the amount in --text-2 and a due badge (amber within 3 days);
 * transfers show the arrows icon and an unsigned amount. The amount is never
 * cut (§8): when it does not fit beside the title (large text), it moves to
 * a line of its own, still on the right. A pending expense due on a
 * non-business day gets a third line ("Dia não útil · passa para seg, 16
 * nov"), which moves under the whole row when the text is large.
 */
export function TransactionRow({
  txn,
  href,
  trailing,
  today,
  className,
}: TransactionRowProps) {
  const pending = txn.status === "pending";
  const transfer = txn.kind === "transfer";
  const adjustment = txn.kind === "adjustment";

  const icon = transfer
    ? "arrow-left-right"
    : (txn.categoryIcon ?? (adjustment ? "scale" : "ellipsis"));
  const color = transfer ? "transfer" : (txn.categoryColor ?? "neutral");
  const categoryText = transfer
    ? "Transferência"
    : (txn.categoryName ?? (adjustment ? "Ajuste de saldo" : "Sem categoria"));
  const subtitle = txn.subtitle ?? `${categoryText} · ${txn.accountName}`;
  const todayIso = today ?? todayInTimeZone();
  const due = pending ? dueBadge(txn, todayIso) : null;
  const nonBusiness =
    pending && txn.kind === "expense" ? (txn.nonBusinessDue ?? null) : null;

  const dayLabel = relativeDayLabel(txn.occurredOn, todayIso).toLowerCase();
  const label = [
    txn.description,
    `${KIND_LABEL[txn.kind].toLowerCase()} de ${spokenAmount(
      txn.amountCents,
      brlParts(txn.amountCents, { sign: "never" }),
    )}`,
    subtitle.replace(" · ", ", "),
    // A caller's subtitle may already carry the day.
    subtitle.toLowerCase().includes(dayLabel) ? null : dayLabel,
    txn.installment
      ? `parcela ${txn.installment.number} de ${txn.installment.count}`
      : null,
    txn.recurring ? "recorrente" : null,
    due?.text.toLowerCase() ?? null,
    nonBusiness ? nonBusinessSpoken(nonBusiness) : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div
      data-slot="transaction-row"
      className={cn(
        "@container relative flex min-h-16 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 transition-colors duration-100",
        href && "has-[a:active]:bg-surface-2",
        className,
      )}
    >
      <div className="flex min-w-0 flex-[1_1_9rem] items-center gap-3">
        <CategoryIcon icon={icon} color={color} size="md" dashed={pending} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className={cn("text-headline text-fg", CLAMP_TITLE)}>
            {href ? (
              <Link
                href={href}
                aria-label={label}
                className="outline-0 after:absolute after:inset-0 after:rounded-control focus-visible:after:outline-2 focus-visible:after:outline-solid focus-visible:after:-outline-offset-2 focus-visible:after:outline-focus"
              >
                {txn.description}
              </Link>
            ) : (
              txn.description
            )}
          </p>
          <p className="flex min-w-0 items-center gap-1.5 text-caption text-fg-3">
            <span className={cn("min-w-0", CLAMP_TEXT)}>{subtitle}</span>
            {txn.recurring ? (
              <Repeat
                role="img"
                aria-label="recorrente"
                className="size-3.5 shrink-0"
              />
            ) : null}
            {txn.installment ? (
              <Badge tone="neutral" className="min-h-4.5 px-1 py-0 text-micro">
                {txn.installment.number}/{txn.installment.count}
              </Badge>
            ) : null}
          </p>
          {nonBusiness ? <NonBusinessHint nb={nonBusiness} /> : null}
        </div>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-3">
        <div className="flex flex-col items-end gap-0.5">
          <Money
            cents={txn.amountCents}
            variant="headline"
            tone={transfer ? "transfer" : adjustment ? "neutral" : "auto"}
            sign={adjustment ? "always" : "auto"}
            className={cn(pending && "text-fg-2")}
          />
          {due ? (
            <Badge tone={due.tone} className="min-h-5 py-0 text-micro">
              {due.text}
            </Badge>
          ) : null}
        </div>
        {trailing ? (
          <div className="relative z-10 shrink-0">{trailing}</div>
        ) : null}
      </div>
      {nonBusiness ? (
        <NonBusinessHint nb={nonBusiness} placement="below" />
      ) : null}
    </div>
  );
}

/**
 * "Vence amanhã" (amber within 3 days), "Venceu ontem" (red), "Agendado ·
 * 15/out"; "Prazo até seg, 16 nov" (amber) after a non-business due date,
 * up to the next business day.
 */
function dueBadge(
  txn: TransactionRowData,
  today: string,
): { text: string; tone: BadgeTone } {
  const scheduled = {
    text: `Agendado · ${shortDateLabel(txn.occurredOn)}`,
    tone: "neutral" as const,
  };
  if (txn.kind !== "expense") return scheduled;
  if (isInGrace(txn.occurredOn, txn.nonBusinessDue, today)) {
    return {
      text: graceLabel(txn.nonBusinessDue.nextBusinessDay, today),
      tone: "warning",
    };
  }

  const days = daysFrom(today, txn.occurredOn);
  if (days < -1) return { text: `Venceu há ${-days} dias`, tone: "danger" };
  if (days === -1) return { text: "Venceu ontem", tone: "danger" };
  if (days === 0) return { text: "Vence hoje", tone: "warning" };
  if (days === 1) return { text: "Vence amanhã", tone: "warning" };
  if (days <= 3) return { text: `Vence em ${days} dias`, tone: "warning" };
  return scheduled;
}

/** Whole days from `from` to `to` (both `YYYY-MM-DD`). */
function daysFrom(from: string, to: string): number {
  return Math.round((utcDay(to) - utcDay(from)) / 86_400_000);
}

function utcDay(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}
