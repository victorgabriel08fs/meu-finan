"use client";

import { useAction } from "next-safe-action/hooks";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { toast } from "sonner";
import { CategoryIcon } from "@/components/finance/category-icon";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { updateAccountAction } from "@/server/actions/planning";
import {
  type AccountColor,
  type AccountSnapshot,
  cardCycleError,
  defaultColorFor,
  isAccountColor,
} from "./account-meta";
import { CardCycleFields, CheckboxRow, ColorPicker } from "./form-controls";
import { MoneyField } from "./money-field";

type AccountEditSheetProps = {
  account: AccountSnapshot;
  trigger: ReactNode;
};

type Errors = Partial<
  Record<"name" | "limit" | "closingDay" | "dueDay" | "form", string>
>;

/**
 * "Editar" (doc 02 §6.7): name, color and whether the account counts in the
 * net worth; cards also edit the limit and the closing/due days.
 */
export function AccountEditSheet({ account, trigger }: AccountEditSheetProps) {
  const id = useId();
  const isCard = account.type === "credit_card";
  const initialColor = isAccountColor(account.color)
    ? account.color
    : defaultColorFor(account.type);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(account.name);
  const [color, setColor] = useState<AccountColor>(initialColor);
  const [includeInNetWorth, setIncludeInNetWorth] = useState(
    account.includeInNetWorth,
  );
  const [limit, setLimit] = useState<number | null>(
    account.card?.limitCents ?? null,
  );
  const [closingDay, setClosingDay] = useState<number | null>(
    account.card?.closingDay ?? null,
  );
  const [dueDay, setDueDay] = useState<number | null>(
    account.card?.dueDay ?? null,
  );
  const [errors, setErrors] = useState<Errors>({});
  const { executeAsync, isPending } = useAction(updateAccountAction);

  function changeOpen(next: boolean) {
    if (next) {
      setName(account.name);
      setColor(initialColor);
      setIncludeInNetWorth(account.includeInNetWorth);
      setLimit(account.card?.limitCents ?? null);
      setClosingDay(account.card?.closingDay ?? null);
      setDueDay(account.card?.dueDay ?? null);
      setErrors({});
    }
    setOpen(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found: Errors = {};
    const trimmed = name.trim();
    if (!trimmed) found.name = "Informe um nome.";
    if (isCard) {
      if (limit === null || limit <= 0) {
        found.limit = "Informe o limite do cartão.";
      }
      const cycle = cardCycleError(closingDay, dueDay);
      if (cycle) found[cycle.field] = cycle.message;
    }
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;

    const result = await executeAsync({
      id: account.id,
      name: trimmed,
      color,
      includeInNetWorth,
      card:
        isCard && limit !== null && closingDay !== null && dueDay !== null
          ? { limitCents: limit, closingDay, dueDay }
          : undefined,
    });
    if (result && !result.serverError && !result.validationErrors) {
      toast("Alterações salvas");
      setOpen(false);
      return;
    }
    const fieldErrors = result?.validationErrors?.fieldErrors;
    const message =
      result?.serverError ??
      result?.validationErrors?.formErrors?.[0] ??
      (fieldErrors ? undefined : "Não deu para salvar. Tente de novo.");
    setErrors({
      name: fieldErrors?.name?.[0],
      limit: fieldErrors?.card?.[0],
      form: message,
    });
    if (message) toast.error(message);
  }

  return (
    <Sheet open={open} onOpenChange={changeOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent
        title={isCard ? "Editar cartão" : "Editar conta"}
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
              Salvar alterações
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
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-name`}>Nome</Label>
            <Input
              id={`${id}-name`}
              value={name}
              maxLength={60}
              autoComplete="off"
              enterKeyHint="done"
              onChange={(event) => {
                setName(event.target.value);
                setErrors((current) => ({ ...current, name: undefined }));
              }}
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? `${id}-name-error` : undefined}
            />
            <FieldError id={`${id}-name-error`}>{errors.name}</FieldError>
          </div>

          {isCard ? (
            <>
              <MoneyField
                id={`${id}-limit`}
                label="Limite total"
                value={limit}
                onValueChange={(cents) => {
                  setLimit(cents);
                  setErrors((current) => ({ ...current, limit: undefined }));
                }}
                error={errors.limit}
              />
              <CardCycleFields
                idPrefix={id}
                closingDay={closingDay}
                dueDay={dueDay}
                onClosingDayChange={(day) => {
                  setClosingDay(day);
                  setErrors((current) => ({
                    ...current,
                    closingDay: undefined,
                    dueDay: undefined,
                  }));
                }}
                onDueDayChange={(day) => {
                  setDueDay(day);
                  setErrors((current) => ({ ...current, dueDay: undefined }));
                }}
                errors={{
                  closingDay: errors.closingDay,
                  dueDay: errors.dueDay,
                }}
              />
              <p className="-mt-3 text-caption text-fg-3">
                Novos dias valem para as próximas faturas.
              </p>
            </>
          ) : null}

          <ColorPicker
            name={`${id}-color`}
            value={color}
            onChange={setColor}
            preview={
              <CategoryIcon
                icon={account.icon}
                color={color}
                size="sm"
                shape="square"
                className="rounded-chip"
              />
            }
          />

          <CheckboxRow
            id={`${id}-net-worth`}
            checked={includeInNetWorth}
            onChange={setIncludeInNetWorth}
            label="Incluir no patrimônio"
            description={
              isCard
                ? "A fatura entra como dívida no patrimônio líquido."
                : "O saldo entra no total das contas e no patrimônio."
            }
          />
        </form>
      </SheetContent>
    </Sheet>
  );
}
