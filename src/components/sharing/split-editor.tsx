"use client";

import { Check, Minus, Plus } from "lucide-react";
import { useId } from "react";
import { Money } from "@/components/money/money";
import { DecimalField } from "@/components/planning/form/decimal-field";
import { MoneyField } from "@/components/planning/form/money-field";
import { NativeSelect } from "@/components/planning/form/native-select";
import { IconButton } from "@/components/ui/icon-button";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { SplitMethod } from "@/lib/finance/split";
import { SPLIT_METHOD_LABELS, splitErrorLabel } from "@/lib/sharing/labels";
import { MAX_SPLIT_WEIGHT } from "@/lib/sharing/limits";
import { cn } from "@/lib/utils";
import {
  basisPointsFromPercent,
  defaultInputs,
  percentFromBasisPoints,
  previewSplit,
  type SplitDraft,
  type SplitMember,
} from "./model";

type SplitEditorProps = {
  members: readonly SplitMember[];
  /** The expense's total; null while it is not typed (lot: each its own). */
  totalCents: number | null;
  draft: SplitDraft;
  onDraftChange: (draft: SplitDraft) => void;
  /** "Quem pagou": the member id and its setter; left out when fixed. */
  paidBy?: { value: string; onChange: (memberId: string) => void };
  /** Methods offered (a lot of expenses has no fixed amounts). */
  methods?: readonly SplitMethod[];
};

const ALL_METHODS: readonly SplitMethod[] = [
  "equal",
  "amounts",
  "percent",
  "shares",
];

/**
 * The split of an expense (doc 02 §6.18): Iguais · Valores · Percentual ·
 * Cotas, "Quem pagou", one line per member with its input and its part,
 * and why it does not close (aria-live). The server splits again on save.
 */
export function SplitEditor({
  members,
  totalCents,
  draft,
  onDraftChange,
  paidBy,
  methods = ALL_METHODS,
}: SplitEditorProps) {
  const id = useId();
  // Without a total (a lot of expenses) the choice is still checked, on a
  // stand-in amount whose parts are not shown.
  const preview = previewSplit(totalCents ?? 10_000, draft, members);
  const parts = new Map(
    preview?.ok && totalCents !== null
      ? preview.shares.map((share) => [share.memberId, share.shareCents])
      : [],
  );
  // An equal split that leaves cents: who gets them (largest remainder).
  let roundingNote: string | null = null;
  if (
    draft.method === "equal" &&
    totalCents !== null &&
    preview?.ok &&
    preview.shares.length > 0
  ) {
    const base = Math.floor(totalCents / preview.shares.length);
    const extra = preview.shares.filter((share) => share.shareCents > base);
    if (extra.length > 0) {
      const names = extra.map((share) => {
        const member = members.find((item) => item.id === share.memberId);
        return member?.isMe ? "você" : (member?.name ?? "");
      });
      const who =
        names.length === 1
          ? (names[0] ?? "")
          : `${names.slice(0, -1).join(", ")} e ${names.at(-1)}`;
      roundingNote =
        extra.length === 1
          ? `1 centavo fica com ${who}.`
          : `${extra.length} centavos ficam com ${who}.`;
    }
  }
  const setInput = (memberId: string, value: number) =>
    onDraftChange({ ...draft, inputs: { ...draft.inputs, [memberId]: value } });

  return (
    <div className="flex flex-col gap-4">
      {paidBy ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-payer`}>Quem pagou</Label>
          <NativeSelect
            id={`${id}-payer`}
            value={paidBy.value}
            onChange={(event) => paidBy.onChange(event.target.value)}
          >
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.isMe ? "Você" : member.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      ) : null}

      <fieldset className="flex min-w-0 flex-col gap-3">
        <legend className="mb-2 text-callout font-semibold text-fg">
          Como dividir
        </legend>
        <SegmentedControl
          ariaLabel="Como dividir"
          options={methods.map((method) => ({
            value: method,
            label: SPLIT_METHOD_LABELS[method],
          }))}
          value={draft.method}
          className="min-h-12 [&>button]:min-h-11"
          onValueChange={(value) => {
            const method = value as SplitMethod;
            onDraftChange({
              method,
              inputs: defaultInputs(method, members, totalCents),
            });
          }}
        />
        {draft.method === "shares" ? (
          <p className="text-caption text-fg-3">
            Ex.: 2 cotas para Ana e 1 para Bruno.
          </p>
        ) : null}

        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-control border border-border-strong/40">
          {members.map((member) => {
            const name = member.isMe ? "Você" : member.name;
            const value = draft.inputs[member.id] ?? 0;
            const part = parts.get(member.id);
            const fieldId = `${id}-${member.id}`;
            return (
              <li
                key={member.id}
                className="flex min-h-15 flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2"
              >
                {draft.method === "equal" ? (
                  <label
                    htmlFor={fieldId}
                    className="flex min-w-0 flex-[1_1_9rem] cursor-pointer items-center gap-3"
                  >
                    <input
                      id={fieldId}
                      type="checkbox"
                      checked={value > 0}
                      onChange={(event) =>
                        setInput(member.id, event.target.checked ? 1 : 0)
                      }
                      className="peer sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className="flex size-6 shrink-0 items-center justify-center rounded-md border-2 border-border-strong text-on-primary peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus [&_svg]:size-4"
                    >
                      {value > 0 ? <Check strokeWidth={3} /> : null}
                    </span>
                    <span className="min-w-0 truncate text-body font-semibold text-fg">
                      {name}
                    </span>
                  </label>
                ) : (
                  <span className="min-w-0 flex-[1_1_7rem] truncate text-body font-semibold text-fg">
                    {name}
                  </span>
                )}

                {draft.method === "amounts" ? (
                  <MoneyField
                    id={fieldId}
                    label={`Parte de ${name}`}
                    hideLabel
                    size="sm"
                    value={value}
                    onValueChange={(cents) => setInput(member.id, cents ?? 0)}
                    className="w-36 shrink-0"
                  />
                ) : null}
                {draft.method === "percent" ? (
                  <DecimalField
                    id={fieldId}
                    label={`Percentual de ${name}`}
                    hideLabel
                    size="sm"
                    suffix="%"
                    min={0}
                    max={100}
                    digits={2}
                    value={percentFromBasisPoints(value)}
                    onValueChange={(percent) =>
                      setInput(member.id, basisPointsFromPercent(percent ?? 0))
                    }
                    className="w-32 shrink-0"
                  />
                ) : null}
                {draft.method === "shares" ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <IconButton
                      label={`Menos uma cota para ${name}`}
                      disabled={value <= 0}
                      onClick={() =>
                        setInput(member.id, Math.max(0, value - 1))
                      }
                    >
                      <Minus />
                    </IconButton>
                    <output
                      aria-live="polite"
                      aria-label={`${value} ${value === 1 ? "cota" : "cotas"} para ${name}`}
                      className="w-6 text-center text-headline tabular-nums text-fg"
                    >
                      {value}
                    </output>
                    <IconButton
                      label={`Mais uma cota para ${name}`}
                      disabled={value >= MAX_SPLIT_WEIGHT}
                      onClick={() =>
                        setInput(
                          member.id,
                          Math.min(MAX_SPLIT_WEIGHT, value + 1),
                        )
                      }
                    >
                      <Plus />
                    </IconButton>
                  </div>
                ) : null}

                {totalCents !== null ? (
                  <span
                    className={cn(
                      "ml-auto shrink-0 text-right text-callout text-fg-2",
                      part === undefined && "text-fg-3",
                    )}
                  >
                    {part === undefined ? (
                      "—"
                    ) : (
                      <Money
                        cents={part}
                        variant="callout"
                        tone="neutral"
                        className="text-fg-2"
                      />
                    )}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
        {roundingNote ? (
          <p className="text-caption text-fg-3">{roundingNote}</p>
        ) : null}
        <p aria-live="polite" className="min-h-5 text-caption text-danger">
          {preview && !preview.ok ? splitErrorLabel(preview.error) : ""}
        </p>
      </fieldset>
    </div>
  );
}
