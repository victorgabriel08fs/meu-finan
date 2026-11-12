"use client";

import { Info, Pencil, RefreshCw, Trash } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { Money } from "@/components/money/money";
import {
  actionErrorMessage,
  NETWORK_ERROR,
} from "@/components/transactions/action-result";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { SheetContent } from "@/components/ui/sheet";
import { toastWithUndo } from "@/components/ui/toast";
import { fullDateLabel, shortDateLabel } from "@/lib/format/date";
import { percentLabel, SPLIT_METHOD_DETAIL } from "@/lib/sharing/labels";
import {
  deleteSharedExpenseAction,
  refreshFromSourceAction,
  restoreSharedExpenseAction,
  updateSharedExpenseAction,
} from "@/server/actions/sharing";
import type { SharedExpenseView } from "@/server/domain/sharing/expenses";
import {
  draftInputs,
  previewSplit,
  type SplitDraft,
  type SplitMember,
} from "./model";
import { SplitEditor } from "./split-editor";

/**
 * An expense of the group (doc 02 §6.18): total, date, who paid, how it was
 * divided and each part, who added it. Its creator also sees the entry it
 * came from (and "Desatualizada" when it changed), and can change the split
 * or take it out of the group (with "Desfazer"). An expense with someone who
 * left is read only.
 */
export function ExpenseDetailSheet({
  expense,
  members,
  meId,
  name,
  onDone,
}: {
  expense: SharedExpenseView;
  /** The group's active members. */
  members: readonly SplitMember[];
  meId: string;
  name: (memberId: string) => string;
  onDone: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<SplitDraft>(() => ({
    method: expense.method,
    inputs: Object.fromEntries(
      members.map((member) => [
        member.id,
        expense.shares.find((share) => share.memberId === member.id)?.input ??
          0,
      ]),
    ),
  }));
  const [paidBy, setPaidBy] = useState(expense.paidByMemberId);
  const [error, setError] = useState<string | undefined>();
  const update = useAction(updateSharedExpenseAction);
  const remove = useAction(deleteSharedExpenseAction);
  const refresh = useAction(refreshFromSourceAction);
  const mine = expense.createdByMemberId === meId;
  const canChange = mine && !expense.readOnly;
  const typed = expense.source === null;

  async function save() {
    const preview = previewSplit(expense.amountCents, draft, members);
    if (!preview?.ok) return;
    const result = await update
      .executeAsync({
        id: expense.id,
        paidByMemberId: typed ? paidBy : meId,
        method: draft.method,
        inputs: draftInputs(draft, members).filter((input) => input.value > 0),
      })
      .catch(() => undefined);
    const message = result ? actionErrorMessage(result) : NETWORK_ERROR;
    if (message) {
      setError(message);
      return;
    }
    toast("Divisão atualizada.");
    onDone();
  }

  async function takeOut() {
    const result = await remove
      .executeAsync({ id: expense.id })
      .catch(() => undefined);
    const message = result ? actionErrorMessage(result) : NETWORK_ERROR;
    if (message) {
      setError(message);
      return;
    }
    onDone();
    toastWithUndo("Despesa tirada do grupo", () => {
      void restoreSharedExpenseAction({ id: expense.id })
        .then((response) => {
          const failed = actionErrorMessage(response);
          if (failed) toast.error(failed);
        })
        .catch(() =>
          toast.error("Não deu para desfazer. Verifique a conexão."),
        );
    });
  }

  async function refreshCopy() {
    const result = await refresh
      .executeAsync({ id: expense.id })
      .catch(() => undefined);
    const message = result ? actionErrorMessage(result) : NETWORK_ERROR;
    if (message) {
      setError(message);
      return;
    }
    toast("Despesa atualizada.");
    onDone();
  }

  const inputLabel = (input: number) =>
    expense.method === "percent"
      ? percentLabel(input)
      : expense.method === "shares"
        ? `${input} ${input === 1 ? "cota" : "cotas"}`
        : null;

  let footer: ReactNode = null;
  if (editing) {
    const preview = previewSplit(expense.amountCents, draft, members);
    footer = (
      <>
        <FieldError id={`${expense.id}-error`}>{error}</FieldError>
        <Button
          size="lg"
          className="w-full"
          loading={update.isPending}
          disabled={!preview?.ok}
          onClick={() => void save()}
        >
          Salvar divisão
        </Button>
        <Button
          variant="ghost"
          className="w-full"
          onClick={() => setEditing(false)}
        >
          Cancelar
        </Button>
      </>
    );
  } else if (canChange) {
    footer = (
      <>
        <FieldError id={`${expense.id}-error`}>{error}</FieldError>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => setEditing(true)}>
            <Pencil aria-hidden="true" />
            Editar divisão
          </Button>
          <Button
            variant="ghost"
            className="text-danger hover:bg-danger-soft active:bg-danger-soft"
            loading={remove.isPending}
            onClick={() => void takeOut()}
          >
            <Trash aria-hidden="true" />
            Tirar do grupo
          </Button>
        </div>
      </>
    );
  }

  return (
    <SheetContent
      title={editing ? "Editar divisão" : expense.description}
      footer={footer}
      className="md:max-w-120"
    >
      {editing ? (
        <div className="pb-2">
          <p className="mb-4 text-callout text-fg-2">
            {expense.description} ·{" "}
            <Money
              cents={expense.amountCents}
              variant="callout"
              tone="neutral"
              sign="never"
            />
          </p>
          <SplitEditor
            members={members}
            totalCents={expense.amountCents}
            draft={draft}
            onDraftChange={setDraft}
            paidBy={typed ? { value: paidBy, onChange: setPaidBy } : undefined}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-5 pb-2">
          <div className="flex flex-col items-center gap-1 pt-1 text-center">
            <Money
              cents={expense.amountCents}
              variant="display"
              tone="neutral"
              sign="never"
            />
            <p className="text-callout text-fg-2">
              {fullDateLabel(expense.occurredOn)}
            </p>
          </div>

          {expense.source?.stale ? (
            <div className="flex flex-col items-start gap-2 rounded-control bg-warning-soft px-4 py-3 text-callout text-fg">
              <p>
                <strong className="font-semibold">Desatualizada:</strong> o
                lançamento agora é{" "}
                <Money
                  cents={expense.source.stale.amountCents}
                  variant="callout"
                  tone="neutral"
                  sign="never"
                />
                {expense.source.stale.description !== expense.description
                  ? ` (${expense.source.stale.description})`
                  : ""}
                .
              </p>
              {canChange ? (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={refresh.isPending}
                  onClick={() => void refreshCopy()}
                >
                  <RefreshCw aria-hidden="true" />
                  Atualizar
                </Button>
              ) : null}
            </div>
          ) : null}

          <dl className="overflow-hidden rounded-card bg-surface-2/60 [&>div+div]:border-t [&>div+div]:border-border">
            <Fact label="Pago por">{name(expense.paidByMemberId)}</Fact>
            <Fact label="Divisão">{SPLIT_METHOD_DETAIL[expense.method]}</Fact>
            {expense.source ? (
              <Fact label="No seu extrato">
                {expense.source.accountName || "Lançamento seu"}
              </Fact>
            ) : null}
            <Fact label="Adicionada por">
              {name(expense.createdByMemberId)}
              <span className="font-normal text-fg-3">
                {" "}
                em {shortDateLabel(expense.createdAt.slice(0, 10))}
              </span>
            </Fact>
          </dl>

          <section aria-labelledby={`${expense.id}-parts`}>
            <h3
              id={`${expense.id}-parts`}
              className="mb-2 text-overline text-fg-3 uppercase"
            >
              Partes
            </h3>
            <ul className="overflow-hidden rounded-card bg-surface-2/60 [&>li+li]:border-t [&>li+li]:border-border">
              {expense.shares.map((share) => {
                const detail = inputLabel(share.input);
                return (
                  <li
                    key={share.memberId}
                    className="flex min-h-12 items-baseline justify-between gap-4 px-4 py-3"
                  >
                    <span className="text-body text-fg">
                      {name(share.memberId)}
                      {detail ? (
                        <span className="text-fg-3"> · {detail}</span>
                      ) : null}
                    </span>
                    <Money
                      cents={share.shareCents}
                      variant="headline"
                      tone="neutral"
                      sign="never"
                    />
                  </li>
                );
              })}
            </ul>
          </section>

          {mine && expense.readOnly ? (
            <p className="flex items-start gap-3 rounded-control bg-surface-2 px-4 py-3 text-callout text-fg-2">
              <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              Esta despesa inclui quem saiu do grupo e não pode mais ser mudada.
            </p>
          ) : null}
          {!canChange ? (
            <FieldError id={`${expense.id}-error`}>{error}</FieldError>
          ) : null}
        </div>
      )}
    </SheetContent>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-12 items-baseline justify-between gap-4 px-4 py-3">
      <dt className="shrink-0 text-callout text-fg-2">{label}</dt>
      <dd className="min-w-0 text-right text-body font-semibold text-fg">
        {children}
      </dd>
    </div>
  );
}
