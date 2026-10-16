"use client";

import { ChevronDown, Minus, Plus, X } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import type { QuickAddDraft, RepeatFrequency } from "@/stores/quick-add";
import { ChoiceChip } from "./choice-chip";
import {
  installmentPreview,
  MAX_INSTALLMENTS,
  MIN_INSTALLMENTS,
} from "./entry";
import { Switch } from "./switch";

const REPEAT_OPTIONS: { value: RepeatFrequency; label: string }[] = [
  { value: "never", label: "Nunca" },
  { value: "weekly", label: "Toda semana" },
  { value: "monthly", label: "Todo mês" },
  { value: "yearly", label: "Todo ano" },
];

type MoreOptionsProps = {
  draft: QuickAddDraft;
  /** Date of the entry: the repetition cannot end before it. */
  date: string;
  /** Resolved amount, for the installment preview. */
  amountCents: number | null;
  onChange: (patch: Partial<QuickAddDraft>) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * "Mais opções" of the quick-add sheet (doc 02 §6.5): Parcelar (expenses,
 * 2–72x with a preview), Repetir (weekly, monthly, yearly, optional end) and
 * Nota. Installments and repetition exclude each other, as on the server.
 */
export function MoreOptions({
  draft,
  date,
  amountCents,
  onChange,
  open,
  onOpenChange,
}: MoreOptionsProps) {
  const panelId = useId();
  const isExpense = draft.kind === "expense";
  const installing = isExpense && draft.installments >= MIN_INSTALLMENTS;
  const repeating = draft.repeat !== "never";

  const summary = [
    installing ? `${draft.installments}x` : null,
    !installing && repeating
      ? REPEAT_OPTIONS.find((option) => option.value === draft.repeat)?.label
      : null,
    draft.notes.trim() ? "nota" : null,
  ].filter(Boolean);
  const hint =
    summary.length > 0
      ? summary.join(" · ")
      : isExpense
        ? "parcelar, repetir, nota"
        : "repetir, nota";

  return (
    <div className="flex flex-col">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onOpenChange(!open)}
        className="-mx-1 inline-flex h-11 items-center gap-1.5 self-start rounded-control px-1 text-callout font-bold text-primary"
      >
        Mais opções
        <span className="font-medium text-fg-3">· {hint}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-4 transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="mt-1 flex flex-col gap-5 rounded-card bg-surface-2/60 p-4"
      >
        {isExpense ? (
          <InstallmentsControl
            count={draft.installments}
            amountCents={amountCents}
            blockedByRepeat={repeating}
            onChange={(installments) => onChange({ installments })}
          />
        ) : null}
        <RepeatControl
          repeat={draft.repeat}
          endOn={draft.repeatEndOn}
          minDate={date}
          blockedByInstallments={installing}
          onChange={onChange}
        />
        <NotesField
          value={draft.notes}
          onChange={(notes) => onChange({ notes })}
        />
      </div>
    </div>
  );
}

function InstallmentsControl({
  count,
  amountCents,
  blockedByRepeat,
  onChange,
}: {
  count: number;
  amountCents: number | null;
  blockedByRepeat: boolean;
  onChange: (count: number) => void;
}) {
  const labelId = useId();
  const hintId = useId();
  const on = count >= MIN_INSTALLMENTS;
  const [typed, setTyped] = useState<string | null>(null);
  const preview =
    on && amountCents !== null ? installmentPreview(amountCents, count) : null;

  function clamp(value: number) {
    return Math.min(MAX_INSTALLMENTS, Math.max(MIN_INSTALLMENTS, value));
  }

  function commit(text: string) {
    const value = Number.parseInt(text, 10);
    if (Number.isFinite(value) && clamp(value) !== count)
      onChange(clamp(value));
    setTyped(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span id={labelId} className="text-callout font-semibold text-fg">
          Parcelar
        </span>
        <Switch
          checked={on}
          aria-labelledby={labelId}
          aria-describedby={blockedByRepeat ? hintId : undefined}
          disabled={blockedByRepeat}
          onCheckedChange={(checked) => onChange(checked ? 2 : 1)}
        />
      </div>
      {blockedByRepeat ? (
        <p id={hintId} className="text-caption text-fg-3">
          Para parcelar, escolha “Nunca” em Repetir.
        </p>
      ) : null}
      {on ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Menos uma parcela"
              disabled={count <= MIN_INSTALLMENTS}
              onClick={() => onChange(clamp(count - 1))}
              className="inline-flex size-11 items-center justify-center rounded-full bg-surface text-fg shadow-card transition-[scale] active:scale-94 disabled:opacity-40"
            >
              <Minus aria-hidden="true" className="size-5" />
            </button>
            <label className="flex h-11 w-24 items-center justify-center gap-0.5 rounded-control border border-border-strong bg-surface text-headline focus-within:border-primary focus-within:shadow-[inset_0_0_0_1px_var(--primary)]">
              <span className="sr-only">Número de parcelas</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                enterKeyHint="done"
                value={typed ?? String(count)}
                onChange={(event) =>
                  setTyped(event.target.value.replace(/\D/g, "").slice(0, 2))
                }
                onBlur={(event) => commit(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commit(event.currentTarget.value);
                  }
                }}
                className="w-8 bg-transparent text-right tabular-nums outline-none"
              />
              <span aria-hidden="true">x</span>
            </label>
            <button
              type="button"
              aria-label="Mais uma parcela"
              disabled={count >= MAX_INSTALLMENTS}
              onClick={() => onChange(clamp(count + 1))}
              className="inline-flex size-11 items-center justify-center rounded-full bg-surface text-fg shadow-card transition-[scale] active:scale-94 disabled:opacity-40"
            >
              <Plus aria-hidden="true" className="size-5" />
            </button>
          </div>
          <p className="text-callout text-fg-2 tabular-nums" aria-live="polite">
            {preview ? (
              <>
                <span className="font-semibold text-fg">{preview.each}</span>
                {preview.first ? ` · ${preview.first}` : null}
              </>
            ) : (
              "Digite o valor total para ver as parcelas."
            )}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function RepeatControl({
  repeat,
  endOn,
  minDate,
  blockedByInstallments,
  onChange,
}: {
  repeat: RepeatFrequency;
  endOn: string | null;
  minDate: string;
  blockedByInstallments: boolean;
  onChange: (patch: Partial<QuickAddDraft>) => void;
}) {
  const hintId = useId();
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 text-callout font-semibold text-fg">
        Repetir
      </legend>
      <div className="flex flex-wrap gap-2">
        {REPEAT_OPTIONS.map((option) => {
          const selected = option.value === repeat;
          return (
            <ChoiceChip
              key={option.value}
              selected={selected}
              aria-pressed={selected}
              disabled={blockedByInstallments && option.value !== "never"}
              aria-describedby={blockedByInstallments ? hintId : undefined}
              className="h-9"
              onClick={() =>
                onChange({
                  repeat: option.value,
                  repeatEndOn: option.value === "never" ? null : endOn,
                })
              }
            >
              {option.label}
            </ChoiceChip>
          );
        })}
      </div>
      {blockedByInstallments ? (
        <p id={hintId} className="text-caption text-fg-3">
          Lançamentos parcelados não se repetem.
        </p>
      ) : null}
      {repeat !== "never" ? (
        <div className="mt-1 flex items-end gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="text-caption font-semibold text-fg-2">
              Até (opcional)
            </span>
            <input
              type="date"
              value={endOn ?? ""}
              min={minDate}
              onChange={(event) =>
                onChange({ repeatEndOn: event.target.value || null })
              }
              className="h-11 w-full rounded-control border border-border-strong bg-surface px-3 text-input text-fg outline-none focus-visible:border-primary focus-visible:shadow-[inset_0_0_0_1px_var(--primary)]"
            />
          </label>
          {endOn ? (
            <button
              type="button"
              aria-label="Sem data de término"
              onClick={() => onChange({ repeatEndOn: null })}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-fg-2 hover:bg-surface-3"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          ) : null}
        </div>
      ) : null}
    </fieldset>
  );
}

function NotesField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-callout font-semibold text-fg">Nota</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={500}
        rows={2}
        placeholder="Detalhes, para lembrar depois"
        className="min-h-20 w-full resize-y rounded-control border border-border-strong bg-surface px-3.5 py-3 text-input text-fg outline-none placeholder:text-fg-3 focus-visible:border-primary focus-visible:shadow-[inset_0_0_0_1px_var(--primary)]"
      />
    </label>
  );
}
