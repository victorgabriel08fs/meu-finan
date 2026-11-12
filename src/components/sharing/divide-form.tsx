"use client";

import { useAction } from "next-safe-action/hooks";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";
import { Money } from "@/components/money/money";
import { NativeSelect } from "@/components/planning/form/native-select";
import {
  actionErrorMessage,
  NETWORK_ERROR,
} from "@/components/transactions/action-result";
import { Label } from "@/components/ui/label";
import { addSharedExpensesAction } from "@/server/actions/sharing";
import type { ShareTarget } from "@/server/domain/sharing/groups";
import {
  draftInputs,
  initialDraft,
  previewSplit,
  type SplitDraft,
} from "./model";
import { SplitEditor } from "./split-editor";

/**
 * "Dividir" in the detail of an expense (doc 02 §6.6, §6.18): the group and
 * how to divide it. The copy keeps the entry's description, amount and date,
 * paid by the person; the entry itself stays as it is.
 */
export function DivideForm({
  formId,
  transaction,
  groups,
  onPendingChange,
  onError,
  onDone,
}: {
  formId: string;
  transaction: {
    id: string;
    description: string;
    amountCents: number;
    occurredOn: string;
  };
  groups: readonly ShareTarget[];
  onPendingChange: (pending: boolean) => void;
  onError: (message: string | null) => void;
  onDone: () => void;
}) {
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const group = groups.find((item) => item.id === groupId) ?? groups[0];
  const [requestId] = useState(() => uuidv7());
  const amountCents = Math.abs(transaction.amountCents);
  const [drafts, setDrafts] = useState<Record<string, SplitDraft>>({});
  const draft =
    (group && drafts[group.id]) ??
    (group
      ? initialDraft(group.members, group.defaultSplit, amountCents)
      : null);
  const { executeAsync } = useAction(addSharedExpensesAction);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!group || !draft) return;
    const preview = previewSplit(amountCents, draft, group.members);
    if (!preview?.ok) return;
    onPendingChange(true);
    onError(null);
    try {
      const result = await executeAsync({
        groupId: group.id,
        items: [
          {
            id: requestId,
            description: transaction.description.slice(0, 80),
            amountCents,
            occurredOn: transaction.occurredOn,
            paidByMemberId: group.myMemberId,
            transactionId: transaction.id,
            method: draft.method,
            inputs: draftInputs(draft, group.members).filter(
              (input) => input.value > 0,
            ),
          },
        ],
      });
      const message = actionErrorMessage(result);
      if (message) {
        onError(message);
        return;
      }
      toast(`Dividida em ${group.name}.`);
      onDone();
    } catch {
      onError(NETWORK_ERROR);
    } finally {
      onPendingChange(false);
    }
  }

  if (!group || !draft) return null;
  return (
    <form
      id={formId}
      noValidate
      onSubmit={submit}
      className="flex flex-col gap-5 pb-2"
    >
      <p className="text-callout text-fg-2">
        {transaction.description} ·{" "}
        <Money
          cents={amountCents}
          variant="callout"
          tone="neutral"
          sign="never"
        />{" "}
        · pago por você
      </p>
      {groups.length > 1 ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${formId}-group`}>Grupo</Label>
          <NativeSelect
            id={`${formId}-group`}
            value={group.id}
            onChange={(event) => setGroupId(event.target.value)}
          >
            {groups.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      ) : null}
      <p className="text-caption text-fg-3">
        Grupo: {group.name}. Só a descrição, o valor e a data vão para o grupo.
      </p>
      <SplitEditor
        members={group.members}
        totalCents={amountCents}
        draft={draft}
        onDraftChange={(next) =>
          setDrafts((current) => ({ ...current, [group.id]: next }))
        }
      />
    </form>
  );
}
