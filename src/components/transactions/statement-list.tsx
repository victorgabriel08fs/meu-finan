"use client";

import { Clock, ReceiptText, SearchX } from "lucide-react";
import Link from "next/link";
import {
  type MouseEvent,
  useEffect,
  useId,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/app/empty-state";
import { DayHeader } from "@/components/finance/day-header";
import { TransactionRow } from "@/components/finance/transaction-row";
import { QuickAddButton } from "@/components/quick-add/quick-add-trigger";
import { Button } from "@/components/ui/button";
import { toastWithUndo } from "@/components/ui/toast";
import { dayHeaderLabel, relativeDayLabel } from "@/lib/format/date";
import { formatBRL } from "@/lib/format/money";
import {
  deleteTransactionAction,
  restoreTransactionsAction,
  setPaidAction,
} from "@/server/actions/transactions";
import {
  actionErrorMessage,
  GENERIC_ERROR,
  NETWORK_ERROR,
} from "./action-result";
import {
  groupByDay,
  type StatementItem,
  splitScheduled,
  toRowData,
} from "./statement-data";
import type { FilterCategory } from "./statement-filters";
import {
  type DeleteScope,
  statusOf,
  TransactionDetailSheet,
} from "./transaction-detail-sheet";
import { useStatementFilters } from "./use-statement-filters";

type StatementListProps = {
  items: StatementItem[];
  hasMore: boolean;
  /** `YYYY-MM-DD` in the user's time zone. */
  today: string;
  /** "outubro" */
  monthName: string;
  previousMonth: { href: string; name: string };
  /** Filters other than the month are on. */
  filtered: boolean;
  query: string;
  categories: FilterCategory[];
};

type OptimisticChange =
  | { type: "remove"; id: string }
  | { type: "status"; id: string; status: StatementItem["status"] };

function applyChange(
  items: StatementItem[],
  change: OptimisticChange,
): StatementItem[] {
  if (change.type === "remove") {
    return items.filter((item) => item.id !== change.id);
  }
  return items.map((item) =>
    item.id === change.id ? { ...item, status: change.status } : item,
  );
}

/**
 * The statement list (doc 02 §6.4): "Agendados" first (collapsible), then
 * one card per day under a sticky DayHeader with the day's total. A tap on a
 * row opens its detail sheet; paying and deleting show up at once
 * (useOptimistic) and can be undone from the toast.
 */
export function StatementList({
  items,
  hasMore,
  today,
  monthName,
  previousMonth,
  filtered,
  query,
  categories,
}: StatementListProps) {
  const [shown, applyOptimistic] = useOptimistic(items, applyChange);
  const [, startTransition] = useTransition();
  const [selected, setSelected] = useState<StatementItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [scheduledOpen, setScheduledOpen] = useState(true);
  const returnFocus = useRef<HTMLElement | null>(null);
  const scheduledId = useId();

  const selectedId = selected?.id;
  // The open entry left the list (moved to another month, deleted elsewhere).
  useEffect(() => {
    if (detailOpen && selectedId && !items.some((i) => i.id === selectedId)) {
      setDetailOpen(false);
    }
  }, [items, detailOpen, selectedId]);

  const detailItem =
    (selectedId ? shown.find((item) => item.id === selectedId) : undefined) ??
    selected;

  function openDetail(item: StatementItem, trigger: HTMLElement) {
    returnFocus.current = trigger;
    setSelected(item);
    setDetailOpen(true);
  }

  function setPaid(item: StatementItem, paid: boolean) {
    startTransition(async () => {
      applyOptimistic({
        type: "status",
        id: item.id,
        status: paid ? "paid" : "pending",
      });
      try {
        const result = await setPaidAction({ id: item.id, paid });
        const message = actionErrorMessage(result);
        if (message) {
          toast.error(message);
          return;
        }
        toastWithUndo(
          paid ? "Marcado como pago" : "Marcado como pendente",
          () => void undoPaid(item.id, !paid),
        );
      } catch {
        toast.error(NETWORK_ERROR);
      }
    });
  }

  async function undoPaid(id: string, paid: boolean) {
    try {
      const message = actionErrorMessage(await setPaidAction({ id, paid }));
      if (message) toast.error(message);
    } catch {
      toast.error(NETWORK_ERROR);
    }
  }

  function remove(item: StatementItem, scope: DeleteScope) {
    setDetailOpen(false);
    startTransition(async () => {
      applyOptimistic({ type: "remove", id: item.id });
      try {
        const result = await deleteTransactionAction({ id: item.id, scope });
        const message = actionErrorMessage(result);
        const ids = result?.data?.ids;
        if (message || !ids) {
          toast.error(message ?? GENERIC_ERROR);
          return;
        }
        toastWithUndo(
          item.kind === "transfer"
            ? "Transferência excluída"
            : ids.length > 1
              ? `${ids.length} lançamentos excluídos`
              : "Lançamento excluído",
          () => void restore(ids),
        );
      } catch {
        toast.error(NETWORK_ERROR);
      }
    });
  }

  async function restore(ids: string[]) {
    if (ids.length === 0) return;
    try {
      const message = actionErrorMessage(
        await restoreTransactionsAction({ ids }),
      );
      if (message) toast.error(message);
    } catch {
      toast.error(NETWORK_ERROR);
    }
  }

  const detail = (
    <TransactionDetailSheet
      item={detailItem}
      open={detailOpen}
      onOpenChange={setDetailOpen}
      today={today}
      categories={categories}
      onSetPaid={setPaid}
      onDelete={remove}
      returnFocusRef={returnFocus}
    />
  );

  if (shown.length === 0) {
    return (
      <>
        <StatementEmpty
          monthName={monthName}
          filtered={filtered}
          query={query}
        />
        {detail}
      </>
    );
  }

  const { scheduled, settled } = splitScheduled(shown);
  const days = groupByDay(settled);

  return (
    <div className="flex flex-col">
      {scheduled.length > 0 ? (
        <section aria-labelledby={`${scheduledId}-title`} className="mb-2">
          <div className="flex h-10 items-center justify-between gap-3">
            <h2
              id={`${scheduledId}-title`}
              className="flex items-center gap-1.5 text-caption font-bold text-fg-2"
            >
              <Clock aria-hidden="true" className="size-4" />
              Agendados · {scheduled.length}
            </h2>
            <button
              type="button"
              aria-expanded={scheduledOpen}
              aria-controls={`${scheduledId}-list`}
              onClick={() => setScheduledOpen((value) => !value)}
              className="relative -mr-1 h-10 rounded-control px-1 text-caption font-bold text-primary after:absolute after:inset-x-0 after:-inset-y-0.5"
            >
              {scheduledOpen ? "Recolher" : "Mostrar"}
            </button>
          </div>
          <RowList
            id={`${scheduledId}-list`}
            hidden={!scheduledOpen}
            items={scheduled}
            today={today}
            onOpen={openDetail}
          />
        </section>
      ) : null}

      {days.map((day) => (
        <section key={day.date} className="flex flex-col">
          <DayHeader
            label={dayHeaderLabel(day.date, today)}
            totalCents={day.totalCents}
          />
          <RowList items={day.items} today={today} onOpen={openDetail} />
        </section>
      ))}

      <div className="flex flex-col items-center gap-1 px-4 pt-6 pb-2 text-center">
        {hasMore ? (
          <p className="text-caption text-fg-3">
            Mostrando os lançamentos mais recentes de {monthName}. Use a busca
            ou os filtros para achar os demais.
          </p>
        ) : (
          <>
            <p className="text-caption text-fg-3">
              {filtered
                ? `Isso é tudo de ${monthName} com esses filtros`
                : `Isso é tudo de ${monthName}`}
            </p>
            <Button asChild variant="ghost" size="sm">
              <Link href={previousMonth.href}>Ver {previousMonth.name}</Link>
            </Button>
          </>
        )}
      </div>

      {detail}
    </div>
  );
}

function RowList({
  items,
  today,
  onOpen,
  id,
  hidden,
}: {
  items: StatementItem[];
  today: string;
  onOpen: (item: StatementItem, trigger: HTMLElement) => void;
  id?: string;
  hidden?: boolean;
}) {
  return (
    <ul
      id={id}
      hidden={hidden}
      className="overflow-hidden rounded-card bg-surface shadow-card"
    >
      {items.map((item, index) => (
        <li key={item.id} className="relative">
          {index > 0 ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-0 right-0 left-17 h-px bg-border"
            />
          ) : null}
          <div aria-hidden="true">
            <TransactionRow txn={toRowData(item)} today={today} />
          </div>
          <button
            type="button"
            aria-haspopup="dialog"
            aria-label={rowLabel(item, today)}
            onClick={(event: MouseEvent<HTMLButtonElement>) =>
              onOpen(item, event.currentTarget)
            }
            className="absolute inset-0 outline-0 transition-colors duration-100 hover:bg-fg/3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus active:bg-fg/6"
          />
        </li>
      ))}
    </ul>
  );
}

const KIND_WORD: Record<StatementItem["kind"], string> = {
  income: "receita",
  expense: "despesa",
  transfer: "transferência",
  adjustment: "ajuste de saldo",
};

/** "Supermercado, despesa de R$ 64,50, Mercado, Conta principal, hoje, pago". */
function rowLabel(item: StatementItem, today: string): string {
  const where =
    item.kind === "transfer"
      ? item.amountCents < 0
        ? `de ${item.accountName} para ${item.counterpartName ?? "outra conta"}`
        : `de ${item.counterpartName ?? "outra conta"} para ${item.accountName}`
      : `${item.categoryName ?? "sem categoria"}, ${item.accountName}`;
  return [
    item.description,
    `${KIND_WORD[item.kind]} de ${formatBRL(Math.abs(item.amountCents))}`,
    where,
    relativeDayLabel(item.occurredOn, today).toLowerCase(),
    statusOf(item, today).label.toLowerCase(),
    item.installment
      ? `parcela ${item.installment.number} de ${item.installment.count}`
      : null,
    item.recurring ? "recorrente" : null,
  ]
    .filter(Boolean)
    .join(", ");
}

function StatementEmpty({
  monthName,
  filtered,
  query,
}: {
  monthName: string;
  filtered: boolean;
  query: string;
}) {
  if (!filtered) {
    return (
      <EmptyState
        icon={<ReceiptText />}
        title={`Nenhum lançamento em ${monthName}`}
        description="Registre seu primeiro gasto — leva 5 segundos."
        action={
          <QuickAddButton kind="expense">Adicionar despesa</QuickAddButton>
        }
      />
    );
  }
  return (
    <EmptyState
      icon={<SearchX />}
      title={
        query ? `Nada com “${query}”` : "Nada encontrado com esses filtros"
      }
      description={
        query
          ? "Tente outra palavra ou confira os filtros."
          : `Nenhum lançamento de ${monthName} combina com os filtros escolhidos.`
      }
      action={<ClearFiltersButton />}
    />
  );
}

function ClearFiltersButton() {
  const { clearAll, isPending } = useStatementFilters();
  return (
    <Button
      variant="tonal"
      loading={isPending}
      data-pending={isPending ? "" : undefined}
      onClick={clearAll}
    >
      Limpar filtros
    </Button>
  );
}
