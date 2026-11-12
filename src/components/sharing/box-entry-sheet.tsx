"use client";

import { Info, Plus } from "lucide-react";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { type FormEvent, useId, useState } from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";
import { Money } from "@/components/money/money";
import { MoneyField } from "@/components/planning/form/money-field";
import { NativeSelect } from "@/components/planning/form/native-select";
import {
  actionErrorMessage,
  NETWORK_ERROR,
} from "@/components/transactions/action-result";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SheetContent } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { toastWithUndo } from "@/components/ui/toast";
import { formatBRL } from "@/lib/format/money";
import {
  contributeAction,
  undoEntryAction,
  withdrawAction,
} from "@/server/actions/sharing";

/** One of the person's own accounts (never a card), for the transfer. */
export type OwnAccount = {
  id: string;
  name: string;
  /** A caixinha (savings_box) of the person's own. */
  isBox: boolean;
  balanceCents: number;
};

type Errors = Partial<
  Record<"amount" | "date" | "from" | "to" | "form", string>
>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * "Guardar" and "Resgatar" (doc 02 §6.18): the amount, the date and, with
 * "Lançar no meu extrato" (on by default when the person has a caixinha of
 * their own), the transfer between their own accounts, saved with the entry.
 * Without it nothing goes to the statement. The toast offers "Desfazer".
 */
export function BoxEntrySheet({
  mode,
  box,
  mySavedCents,
  accounts,
  lastBoxAccountId,
  todayIso,
  onDone,
}: {
  mode: "save" | "withdraw";
  box: { id: string; name: string };
  mySavedCents: number;
  accounts: OwnAccount[];
  lastBoxAccountId: string | null;
  todayIso: string;
  onDone: () => void;
}) {
  const id = useId();
  const recordLabelId = useId();
  const [requestId] = useState(() => uuidv7());
  const saving = mode === "save";
  const boxes = accounts.filter((account) => account.isBox);
  const preferredBox =
    boxes.find((account) => account.id === lastBoxAccountId)?.id ??
    boxes[0]?.id ??
    "";
  const others = (exclude: string) =>
    accounts.filter((account) => account.id !== exclude);
  const [amount, setAmount] = useState<number | null>(
    saving ? null : mySavedCents > 0 ? mySavedCents : null,
  );
  const [date, setDate] = useState(todayIso);
  const canRecord = boxes.length > 0 && accounts.length > 1;
  const [record, setRecord] = useState(canRecord);
  const [boxAccount, setBoxAccount] = useState(preferredBox);
  const [otherAccount, setOtherAccount] = useState(
    others(preferredBox).find((account) => !account.isBox)?.id ??
      others(preferredBox)[0]?.id ??
      "",
  );
  const [errors, setErrors] = useState<Errors>({});
  const save = useAction(contributeAction);
  const take = useAction(withdrawAction);
  const pending = save.isPending || take.isPending;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found: Errors = {};
    if (amount === null || amount <= 0) {
      found.amount = "O valor precisa ser maior que zero.";
    } else if (!saving && amount > mySavedCents) {
      found.amount =
        mySavedCents > 0
          ? `Você pode resgatar até ${formatBRL(mySavedCents)}, o que você guardou.`
          : "Você ainda não guardou nada nesta caixinha.";
    }
    if (!ISO_DATE.test(date)) found.date = "Escolha a data.";
    else if (date > todayIso)
      found.date = "A data não pode ser depois de hoje.";
    if (record && canRecord) {
      if (!boxAccount) found.to = "Escolha uma caixinha sua.";
      if (!otherAccount || otherAccount === boxAccount) {
        found.from = saving
          ? "Escolha de qual conta sai."
          : "Escolha para qual conta vai.";
      }
    }
    setErrors(found);
    if (Object.values(found).some(Boolean) || amount === null) {
      requestAnimationFrame(() => {
        document
          .querySelector<HTMLElement>(
            `[data-entry-form="${id}"] [aria-invalid="true"]`,
          )
          ?.focus();
      });
      return;
    }
    const amountCents = amount;
    const base = {
      id: requestId,
      boxId: box.id,
      amountCents,
      occurredOn: date,
    };
    const withTransfer = record && canRecord;
    const result = saving
      ? await save
          .executeAsync({
            ...base,
            ...(withTransfer
              ? { fromAccountId: otherAccount, toBoxAccountId: boxAccount }
              : {}),
          })
          .catch(() => undefined)
      : await take
          .executeAsync({
            ...base,
            ...(withTransfer
              ? { fromBoxAccountId: boxAccount, toAccountId: otherAccount }
              : {}),
          })
          .catch(() => undefined);
    const message = result ? actionErrorMessage(result) : NETWORK_ERROR;
    if (message || !result?.data) {
      setErrors({ form: message ?? NETWORK_ERROR });
      return;
    }
    const { entryId } = result.data;
    onDone();
    toastWithUndo(
      saving
        ? `${formatBRL(amountCents)} guardados em ${box.name}.`
        : `${formatBRL(amountCents)} resgatados de ${box.name}.`,
      () => {
        void undoEntryAction({ id: entryId })
          .then((response) => {
            const failed = actionErrorMessage(response);
            if (failed) toast.error(failed);
          })
          .catch(() =>
            toast.error("Não deu para desfazer. Verifique a conexão."),
          );
      },
    );
  }

  const otherChoices = others(boxAccount);
  const verb = saving ? "Guardar" : "Resgatar";

  return (
    <SheetContent
      title={verb}
      description={box.name}
      footer={
        <>
          <FieldError id={`${id}-form-error`}>{errors.form}</FieldError>
          <Button
            type="submit"
            form={`${id}-form`}
            size="lg"
            className="w-full"
            loading={pending}
          >
            {amount && amount > 0 ? `${verb} ${formatBRL(amount)}` : verb}
          </Button>
        </>
      }
    >
      <form
        id={`${id}-form`}
        data-entry-form={id}
        noValidate
        onSubmit={submit}
        className="flex flex-col gap-6 pb-2"
      >
        <MoneyField
          id={`${id}-amount`}
          label="Valor"
          value={amount}
          onValueChange={(cents) => {
            setAmount(cents);
            setErrors((current) => ({ ...current, amount: undefined }));
          }}
          error={errors.amount}
          hint={
            saving || errors.amount ? undefined : (
              <>
                Você pode resgatar até{" "}
                <Money
                  cents={mySavedCents}
                  variant="caption"
                  tone="neutral"
                  sign="never"
                  className="font-semibold text-fg-2"
                />
                , o que você guardou.
              </>
            )
          }
        />

        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-date`}>Data</Label>
          <Input
            id={`${id}-date`}
            type="date"
            value={date}
            max={todayIso}
            onChange={(event) => {
              setDate(event.target.value);
              setErrors((current) => ({ ...current, date: undefined }));
            }}
            aria-invalid={errors.date ? true : undefined}
            aria-describedby={errors.date ? `${id}-date-error` : undefined}
            className="tabular-nums"
          />
          <FieldError id={`${id}-date-error`}>{errors.date}</FieldError>
        </div>

        {canRecord ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span
                id={recordLabelId}
                className="min-w-0 flex-[1_1_11rem] text-callout font-semibold text-fg"
              >
                Lançar no meu extrato
              </span>
              <Switch
                className="ml-auto"
                checked={record}
                onCheckedChange={setRecord}
                labelledBy={recordLabelId}
                describedBy={`${id}-record-hint`}
              />
              <p
                id={`${id}-record-hint`}
                className="w-full text-caption text-fg-3"
              >
                {record
                  ? saving
                    ? "Registra a transferência entre as suas contas. Só você vê as suas contas."
                    : "Registra a transferência da sua caixinha de volta para a conta."
                  : "Só registra no grupo; o seu extrato fica como está."}
              </p>
            </div>
            {record ? (
              saving ? (
                <>
                  <AccountSelect
                    id={`${id}-from`}
                    label="Sai de"
                    value={otherAccount}
                    onChange={setOtherAccount}
                    accounts={otherChoices}
                    error={errors.from}
                  />
                  <AccountSelect
                    id={`${id}-to`}
                    label="Vai para"
                    value={boxAccount}
                    onChange={(value) => {
                      setBoxAccount(value);
                      if (value === otherAccount) {
                        setOtherAccount(others(value)[0]?.id ?? "");
                      }
                    }}
                    accounts={boxes}
                    error={errors.to}
                  />
                </>
              ) : (
                <>
                  <AccountSelect
                    id={`${id}-from`}
                    label="Sai de"
                    value={boxAccount}
                    onChange={(value) => {
                      setBoxAccount(value);
                      if (value === otherAccount) {
                        setOtherAccount(others(value)[0]?.id ?? "");
                      }
                    }}
                    accounts={boxes}
                    error={errors.to}
                  />
                  <AccountSelect
                    id={`${id}-to`}
                    label="Vai para"
                    value={otherAccount}
                    onChange={setOtherAccount}
                    accounts={otherChoices}
                    error={errors.from}
                  />
                </>
              )
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3 rounded-control bg-surface-2 px-4 py-3">
            <p className="flex items-start gap-3 text-callout text-fg-2">
              <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              Crie uma caixinha sua para lançar no extrato.
            </p>
            {/* Leaving the page from a sheet: the sheet goes with the page. */}
            <Button
              asChild
              variant="tonal"
              size="sm"
              className="max-w-full shrink"
            >
              <Link href="/contas/nova?tipo=caixinha">
                <Plus aria-hidden="true" />
                Criar caixinha
              </Link>
            </Button>
          </div>
        )}
      </form>
    </SheetContent>
  );
}

function AccountSelect({
  id,
  label,
  value,
  onChange,
  accounts,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  accounts: OwnAccount[];
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      >
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
      </NativeSelect>
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  );
}
