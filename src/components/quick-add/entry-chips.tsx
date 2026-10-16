"use client";

import {
  ArrowRight,
  CalendarClock,
  CalendarDays,
  CircleCheck,
  Clock,
} from "lucide-react";
import type { MouseEvent } from "react";
import { CategoryIcon } from "@/components/finance/category-icon";
import { relativeDayLabel } from "@/lib/format/date";
import { cn } from "@/lib/utils";
import { ChoiceChip, choiceChipClass } from "./choice-chip";
import type { QuickAddAccount } from "./types";

type DateChipsProps = {
  /** Effective date, `YYYY-MM-DD`. */
  date: string;
  today: string;
  yesterday: string;
  /** null = today. */
  onChange: (date: string | null) => void;
};

/** "Hoje", "Ontem" and a native date picker for any other day (§6.5). */
export function DateChips({
  date,
  today,
  yesterday,
  onChange,
}: DateChipsProps) {
  const other = date !== today && date !== yesterday;

  function openPicker(event: MouseEvent<HTMLInputElement>) {
    try {
      event.currentTarget.showPicker();
    } catch {
      // Older browsers open their picker on their own (or take typing).
    }
  }

  return (
    <fieldset className="flex min-w-0 flex-wrap gap-2">
      <legend className="sr-only">Data</legend>
      <ChoiceChip
        selected={date === today}
        aria-pressed={date === today}
        onClick={() => onChange(null)}
      >
        Hoje
      </ChoiceChip>
      <ChoiceChip
        selected={date === yesterday}
        aria-pressed={date === yesterday}
        onClick={() => onChange(yesterday)}
      >
        Ontem
      </ChoiceChip>
      <label
        className={cn(
          choiceChipClass({ selected: other, icon: true }),
          "cursor-pointer has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus",
        )}
      >
        <CalendarDays aria-hidden="true" className="size-4" />
        <span className="min-w-0 truncate">
          {other ? relativeDayLabel(date, today) : "Outra data"}
        </span>
        <input
          type="date"
          aria-label="Escolher outra data"
          value={date}
          onClick={openPicker}
          onChange={(event) => {
            const value = event.target.value;
            if (value) onChange(value === today ? null : value);
          }}
          className="absolute inset-0 size-full cursor-pointer appearance-none opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:size-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
        />
      </label>
    </fieldset>
  );
}

/**
 * The paid switch: on ("Pago") for dates up to today, off after it. Its text
 * is the resulting status — "Pago", "Agendado" (future) or "Pendente".
 */
export function PaidSwitch({
  paid,
  label,
  onChange,
}: {
  paid: boolean;
  label: "Pago" | "Agendado" | "Pendente";
  onChange: (paid: boolean) => void;
}) {
  return (
    <ChoiceChip
      role="switch"
      aria-checked={paid}
      selected={paid}
      icon={
        paid ? (
          <CircleCheck aria-hidden="true" className="size-4.5" />
        ) : label === "Agendado" ? (
          <CalendarClock aria-hidden="true" className="size-4.5 text-fg-2" />
        ) : (
          <Clock aria-hidden="true" className="size-4.5 text-fg-2" />
        )
      }
      onClick={() => onChange(!paid)}
    >
      {label}
    </ChoiceChip>
  );
}

function AccountIcon({ account }: { account: QuickAddAccount | undefined }) {
  return (
    <CategoryIcon
      icon={account?.icon ?? "wallet"}
      color={account?.color ?? "neutral"}
      shape="square"
      size="sm"
      className="rounded-chip"
    />
  );
}

/** The account of an expense or income; opens the account sheet. */
export function AccountChip({
  account,
  invalid,
  onClick,
}: {
  account: QuickAddAccount | undefined;
  invalid?: boolean;
  onClick: () => void;
}) {
  return (
    <ChoiceChip
      aria-haspopup="dialog"
      aria-invalid={invalid || undefined}
      iconCircle
      icon={<AccountIcon account={account} />}
      onClick={onClick}
      className={cn(invalid && "border-danger")}
    >
      <span className="sr-only">Conta: </span>
      {account?.name ?? "Escolha a conta"}
    </ChoiceChip>
  );
}

/** "De" → "Para" of a transfer, in place of the category chips. */
export function TransferAccountChips({
  from,
  to,
  invalid,
  onPickFrom,
  onPickTo,
}: {
  from: QuickAddAccount | undefined;
  to: QuickAddAccount | undefined;
  invalid: "from" | "to" | null;
  onPickFrom: () => void;
  onPickTo: () => void;
}) {
  const slot = (
    label: string,
    account: QuickAddAccount | undefined,
    isInvalid: boolean,
    onClick: () => void,
  ) => (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-invalid={isInvalid || undefined}
      onClick={onClick}
      className={cn(
        choiceChipClass({ icon: true, iconCircle: true }),
        "min-w-0 flex-1 basis-0",
        isInvalid && "border-danger",
      )}
    >
      <AccountIcon account={account} />
      <span className="flex min-w-0 items-baseline gap-1.5">
        <span className="shrink-0 text-fg-3">{label}</span>
        <span className="truncate">{account?.name ?? "Escolha"}</span>
      </span>
    </button>
  );

  return (
    <div className="flex items-center gap-2">
      {slot("De", from, invalid === "from", onPickFrom)}
      <ArrowRight
        aria-hidden="true"
        className="size-4.5 shrink-0 text-transfer"
        strokeWidth={2}
      />
      {slot("Para", to, invalid === "to", onPickTo)}
    </div>
  );
}
