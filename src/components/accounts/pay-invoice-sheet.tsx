"use client";

import { useAction } from "next-safe-action/hooks";
import { type FormEvent, useId, useState } from "react";
import { toast } from "sonner";
import { CategoryIcon } from "@/components/finance/category-icon";
import { Money } from "@/components/money/money";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { payInvoiceAction } from "@/server/actions/planning";
import { MoneyField } from "./money-field";

export type PaymentAccount = {
  id: string;
  name: string;
  icon: string;
  color: string;
  balanceCents: number;
};

type PayInvoiceSheetProps = {
  invoiceId: string;
  /** Suggested amount: what is still owed on the invoice. */
  outstandingCents: number;
  /** "fatura de outubro do Cartão principal". */
  invoiceLabel: string;
  /** Regular (non-card) accounts; the first one is preselected. */
  accounts: PaymentAccount[];
  /** `YYYY-MM-DD`, the default date. */
  today: string;
};

type Errors = Partial<Record<"amount" | "account" | "date" | "form", string>>;

/**
 * "Pagar fatura" (doc 02 §6.8): amount (the outstanding balance, editable for
 * a partial payment), the account it leaves from and the date. Saves a
 * transfer account → card; a future date leaves it scheduled.
 */
export function PayInvoiceSheet({
  invoiceId,
  outstandingCents,
  invoiceLabel,
  accounts,
  today,
}: PayInvoiceSheetProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<number | null>(outstandingCents);
  const [fromId, setFromId] = useState(accounts[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const [errors, setErrors] = useState<Errors>({});
  const { executeAsync, isPending } = useAction(payInvoiceAction);
  const scheduled = date > today;

  function changeOpen(next: boolean) {
    if (next) {
      setAmount(outstandingCents);
      setFromId(accounts[0]?.id ?? "");
      setDate(today);
      setErrors({});
    }
    setOpen(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found: Errors = {};
    if (amount === null || amount <= 0) {
      found.amount = "O valor precisa ser maior que zero.";
    }
    if (!fromId) found.account = "Escolha de qual conta sai o pagamento.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) found.date = "Escolha a data.";
    setErrors(found);
    if (Object.values(found).some(Boolean) || amount === null) return;

    const result = await executeAsync({
      invoiceId,
      fromAccountId: fromId,
      amountCents: amount,
      occurredOn: date,
    });
    if (result && !result.serverError && !result.validationErrors) {
      toast(scheduled ? "Pagamento agendado" : "Pagamento registrado");
      setOpen(false);
      return;
    }
    const fieldErrors = result?.validationErrors?.fieldErrors;
    const message =
      result?.serverError ??
      result?.validationErrors?.formErrors?.[0] ??
      (fieldErrors ? undefined : "Não deu para registrar o pagamento.");
    setErrors({
      amount: fieldErrors?.amountCents?.[0],
      account: fieldErrors?.fromAccountId?.[0],
      date: fieldErrors?.occurredOn?.[0],
      form: message,
    });
    if (message) toast.error(message);
  }

  return (
    <Sheet open={open} onOpenChange={changeOpen}>
      <SheetTrigger asChild>
        <Button size="lg" className="w-full">
          Pagar fatura
        </Button>
      </SheetTrigger>
      <SheetContent
        title="Pagar fatura"
        description={invoiceLabel}
        footer={
          <>
            <FieldError id={`${id}-form-error`}>{errors.form}</FieldError>
            <Button
              type="submit"
              form={`${id}-form`}
              size="lg"
              className="w-full"
              loading={isPending}
            >
              {scheduled ? "Agendar pagamento" : "Pagar fatura"}
            </Button>
          </>
        }
      >
        <form
          id={`${id}-form`}
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
            selectOnFocus
            description={
              <>
                Em aberto:{" "}
                <Money
                  cents={outstandingCents}
                  variant="caption"
                  tone="neutral"
                  className="font-semibold text-fg-2"
                />
                . Pode pagar só uma parte.
              </>
            }
            error={errors.amount}
          />

          <fieldset className="min-w-0">
            <legend className="mb-2 text-callout font-semibold text-fg">
              Pagar com
            </legend>
            <div
              className={cn(
                "overflow-hidden rounded-control border border-border-strong/40 [&>label+label]:border-t [&>label+label]:border-border",
                errors.account && "border-danger",
              )}
            >
              {accounts.map((account) => (
                <label
                  key={account.id}
                  className="flex min-h-15 cursor-pointer items-center gap-3 px-3 py-2 transition-colors duration-100 has-checked:bg-primary-soft/60 has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-focus"
                >
                  <input
                    type="radio"
                    name={`${id}-from`}
                    value={account.id}
                    checked={fromId === account.id}
                    onChange={() => {
                      setFromId(account.id);
                      setErrors((current) => ({
                        ...current,
                        account: undefined,
                      }));
                    }}
                    className="sr-only"
                  />
                  <CategoryIcon
                    icon={account.icon}
                    color={account.color}
                    size="sm"
                    shape="square"
                    className="size-9 rounded-chip"
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-body font-semibold text-fg">
                      {account.name}
                    </span>
                    <Money
                      cents={account.balanceCents}
                      variant="caption"
                      tone="neutral"
                      className="text-fg-3"
                    />
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex size-5.5 shrink-0 items-center justify-center rounded-full border-2",
                      fromId === account.id
                        ? "border-primary"
                        : "border-border-strong",
                    )}
                  >
                    {fromId === account.id ? (
                      <span className="size-2.5 rounded-full bg-primary" />
                    ) : null}
                  </span>
                </label>
              ))}
            </div>
            <FieldError id={`${id}-account-error`} className="mt-2">
              {errors.account}
            </FieldError>
          </fieldset>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-date`}>Data</Label>
            <Input
              id={`${id}-date`}
              type="date"
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
                setErrors((current) => ({ ...current, date: undefined }));
              }}
              aria-invalid={errors.date ? true : undefined}
              aria-describedby={`${id}-date-hint`}
              className="tabular-nums"
            />
            <p id={`${id}-date-hint`} className="text-caption text-fg-3">
              {scheduled
                ? "Com data futura, o pagamento fica agendado até o dia."
                : "O valor sai da conta escolhida e abate a fatura."}
            </p>
            <FieldError id={`${id}-date-error`}>{errors.date}</FieldError>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
