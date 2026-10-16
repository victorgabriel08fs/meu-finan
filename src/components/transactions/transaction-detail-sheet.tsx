"use client";

import { CircleCheck, Clock, Pencil, Repeat, Trash } from "lucide-react";
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useState,
} from "react";
import { CategoryIcon } from "@/components/finance/category-icon";
import { Money } from "@/components/money/money";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { fullDateLabel, relativeDayLabel } from "@/lib/format/date";
import {
  recurrenceLabel,
  type StatementItem,
  transferEnds,
} from "./statement-data";
import type { FilterCategory } from "./statement-filters";
import { TransactionEditForm } from "./transaction-edit-form";

export type DeleteScope = "this" | "future" | "all";

type Mode = "view" | "edit" | "delete";

type TransactionDetailSheetProps = {
  /** Entry on screen; kept while the sheet animates out. */
  item: StatementItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  today: string;
  categories: FilterCategory[];
  onSetPaid: (item: StatementItem, paid: boolean) => void;
  onDelete: (item: StatementItem, scope: DeleteScope) => void;
  /** Row that opened the sheet: the focus goes back to it. */
  returnFocusRef: RefObject<HTMLElement | null>;
};

const KIND_LABEL: Record<StatementItem["kind"], string> = {
  income: "Receita",
  expense: "Despesa",
  transfer: "Transferência",
  adjustment: "Ajuste de saldo",
};

/** "Pago", "Agendado", "Vence hoje", "Vencido" (expenses) or "Pendente". */
export function statusOf(
  item: StatementItem,
  today: string,
): { label: string; tone: BadgeTone } {
  if (item.status === "paid") return { label: "Pago", tone: "primary" };
  if (item.occurredOn > today) return { label: "Agendado", tone: "neutral" };
  if (item.kind !== "expense") return { label: "Pendente", tone: "warning" };
  return item.occurredOn === today
    ? { label: "Vence hoje", tone: "warning" }
    : { label: "Vencido", tone: "danger" };
}

/**
 * Detail of an entry (doc 02 §6.6) in a sheet over the statement: icon,
 * amount, status and the grouped facts, with Marcar como pago/pendente,
 * Editar (inline form) and Excluir (with a scope for installments and
 * recurrences; undone from the toast).
 */
export function TransactionDetailSheet({
  item,
  open,
  onOpenChange,
  today,
  categories,
  onSetPaid,
  onDelete,
  returnFocusRef,
}: TransactionDetailSheetProps) {
  const [mode, setMode] = useState<Mode>("view");
  const [saving, setSaving] = useState(false);
  const formId = useId();
  const itemId = item?.id;

  // Every opening (or another entry) starts on the details.
  useEffect(() => {
    if (open && itemId) {
      setMode("view");
      setSaving(false);
    }
  }, [open, itemId]);

  if (!item) {
    return <Sheet open={false} onOpenChange={onOpenChange} />;
  }

  const pending = item.status === "pending";
  const transfer = item.kind === "transfer";
  const adjustment = item.kind === "adjustment";
  const status = statusOf(item, today);

  function requestDelete(target: StatementItem) {
    if (target.installment || target.recurring) setMode("delete");
    else onDelete(target, "this");
  }

  let footer: ReactNode;
  if (mode === "edit") {
    footer = (
      <>
        <Button
          type="submit"
          form={formId}
          size="lg"
          className="w-full"
          loading={saving}
        >
          Salvar alterações
        </Button>
        <Button
          variant="ghost"
          className="w-full"
          disabled={saving}
          onClick={() => setMode("view")}
        >
          Cancelar
        </Button>
      </>
    );
  } else if (mode === "delete") {
    const installment = item.installment;
    footer = (
      <>
        <p className="pb-1 text-callout text-fg-2">
          {installment
            ? `Esta é a parcela ${installment.number} de ${installment.count}. O que você quer excluir?`
            : "Este lançamento se repete. O que você quer excluir?"}
        </p>
        <Button
          variant="secondary"
          size="lg"
          className="w-full text-danger"
          onClick={() => onDelete(item, "this")}
        >
          {installment ? "Só esta parcela" : "Só este"}
        </Button>
        <Button
          variant="destructive"
          size="lg"
          className="w-full"
          onClick={() => onDelete(item, installment ? "all" : "future")}
        >
          {installment ? "Todas as parcelas" : "Este e os próximos"}
        </Button>
        <Button
          variant="ghost"
          className="w-full"
          onClick={() => setMode("view")}
        >
          Cancelar
        </Button>
      </>
    );
  } else {
    footer = (
      <>
        {adjustment ? null : (
          <Button
            variant={pending ? "tonal" : "secondary"}
            size="lg"
            className="w-full"
            onClick={() => onSetPaid(item, pending)}
          >
            {pending ? (
              <CircleCheck aria-hidden="true" />
            ) : (
              <Clock aria-hidden="true" />
            )}
            {pending ? "Marcar como pago" : "Marcar como pendente"}
          </Button>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => setMode("edit")}>
            <Pencil aria-hidden="true" />
            Editar
          </Button>
          <Button
            variant="ghost"
            className="text-danger hover:bg-danger-soft active:bg-danger-soft"
            onClick={() => requestDelete(item)}
          >
            <Trash aria-hidden="true" />
            Excluir
          </Button>
        </div>
      </>
    );
  }

  const ends = transfer ? transferEnds(item) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title={mode === "edit" ? "Editar lançamento" : item.description}
        footer={footer}
        className="md:max-w-120"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const target = returnFocusRef.current;
          if (target?.isConnected) target.focus({ preventScroll: true });
        }}
      >
        {mode === "edit" ? (
          <TransactionEditForm
            key={item.id}
            item={item}
            categories={categories}
            formId={formId}
            onPendingChange={setSaving}
            onDone={() => setMode("view")}
          />
        ) : (
          <div className="flex flex-col gap-5 pb-2">
            <div className="flex flex-col items-center gap-2 pt-1 text-center">
              <CategoryIcon
                icon={
                  transfer
                    ? "arrow-left-right"
                    : (item.categoryIcon ?? (adjustment ? "scale" : "ellipsis"))
                }
                color={
                  transfer ? "transfer" : (item.categoryColor ?? "neutral")
                }
                size="lg"
                dashed={pending}
              />
              <Money
                cents={item.amountCents}
                variant="display"
                tone={transfer ? "transfer" : adjustment ? "neutral" : "auto"}
                sign={adjustment ? "always" : "auto"}
                className={transfer ? "text-fg" : undefined}
              />
              <div className="flex flex-wrap justify-center gap-1.5">
                <Badge tone={status.tone}>{status.label}</Badge>
                <Badge tone={transfer ? "transfer" : "neutral"}>
                  {KIND_LABEL[item.kind]}
                </Badge>
                {item.installment ? (
                  <Badge>
                    {item.installment.number}/{item.installment.count}
                  </Badge>
                ) : null}
                {item.recurring ? (
                  <Badge>
                    <Repeat aria-hidden="true" />
                    Recorrente
                  </Badge>
                ) : null}
              </div>
            </div>

            <dl className="overflow-hidden rounded-card bg-surface-2/60 [&>div+div]:border-t [&>div+div]:border-border">
              {ends ? (
                <>
                  <Fact label="De">{ends.from}</Fact>
                  <Fact label="Para">{ends.to}</Fact>
                </>
              ) : (
                <>
                  <Fact label="Categoria">
                    {item.categoryName ??
                      (adjustment ? "Ajuste de saldo" : "Sem categoria")}
                  </Fact>
                  <Fact label="Conta">{item.accountName}</Fact>
                </>
              )}
              <Fact label="Data">
                {fullDateLabel(item.occurredOn)}
                <span className="text-fg-3">
                  {" "}
                  · {relativeDayLabel(item.occurredOn, today)}
                </span>
              </Fact>
              <Fact label="Status">{status.label}</Fact>
              {item.installment ? (
                <Fact label="Parcela">
                  {item.installment.number} de {item.installment.count}
                  <span className="font-normal text-fg-3">
                    {" "}
                    · total{" "}
                    <Money
                      cents={item.installment.totalCents}
                      variant="callout"
                      sign="never"
                      tone="neutral"
                      className="text-fg-3"
                    />
                  </span>
                </Fact>
              ) : null}
              {item.recurring ? (
                <Fact label="Repetição">
                  {item.recurrence
                    ? recurrenceLabel(item.recurrence, item.occurredOn)
                    : "Lançamento recorrente"}
                </Fact>
              ) : null}
              {item.notes ? (
                <Fact label="Nota" stacked>
                  <span className="whitespace-pre-wrap">{item.notes}</span>
                </Fact>
              ) : null}
            </dl>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Fact({
  label,
  stacked = false,
  children,
}: {
  label: string;
  stacked?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={
        stacked
          ? "flex flex-col gap-1 px-4 py-3"
          : "flex min-h-12 items-baseline justify-between gap-4 px-4 py-3"
      }
    >
      <dt className="shrink-0 text-callout text-fg-2">{label}</dt>
      <dd
        className={
          stacked
            ? "text-body text-fg"
            : "min-w-0 text-right text-body font-semibold text-fg"
        }
      >
        {children}
      </dd>
    </div>
  );
}
