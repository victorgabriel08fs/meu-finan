"use client";

import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { type FormEvent, useId, useState } from "react";
import { toast } from "sonner";
import { CategoryIcon } from "@/components/finance/category-icon";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createAccountAction } from "@/server/actions/planning";
import {
  ACCOUNT_TYPE_OPTIONS,
  type AccountColor,
  type AccountType,
  accountHref,
  allowsNegativeBalance,
  cardCycleError,
  defaultColorFor,
} from "./account-meta";
import {
  CardCycleFields,
  CheckboxRow,
  ColorPicker,
  TypePicker,
} from "./form-controls";
import { MoneyField } from "./money-field";

type Field = "name" | "balance" | "limit" | "closingDay" | "dueDay";
type Errors = Partial<Record<Field | "form", string>>;

const optionOf = (type: AccountType) =>
  ACCOUNT_TYPE_OPTIONS.find((option) => option.value === type) ??
  ACCOUNT_TYPE_OPTIONS[0];

/**
 * Nova conta (doc 02 §6.2 step 2, §6.7): type chips, name, current balance
 * and color; credit cards ask for the limit, the closing and due days and
 * what is owed today. Creates the account and opens its screen.
 */
export function AccountForm({ initialType }: { initialType: AccountType }) {
  const id = useId();
  const router = useRouter();
  const [type, setType] = useState<AccountType>(initialType);
  const [name, setName] = useState(optionOf(initialType).defaultName);
  const [nameEdited, setNameEdited] = useState(false);
  const [color, setColor] = useState<AccountColor>(
    defaultColorFor(initialType),
  );
  const [colorEdited, setColorEdited] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [limit, setLimit] = useState<number | null>(null);
  const [closingDay, setClosingDay] = useState<number | null>(null);
  const [dueDay, setDueDay] = useState<number | null>(null);
  const [includeInNetWorth, setIncludeInNetWorth] = useState(true);
  const [errors, setErrors] = useState<Errors>({});
  const { executeAsync, isPending } = useAction(createAccountAction);

  const isCard = type === "credit_card";
  const option = optionOf(type);

  function changeType(next: AccountType) {
    setType(next);
    if (!nameEdited) setName(optionOf(next).defaultName);
    if (!colorEdited) setColor(defaultColorFor(next));
    setErrors({});
  }

  function clearError(field: Field) {
    setErrors((current) =>
      current[field] || current.form
        ? { ...current, [field]: undefined, form: undefined }
        : current,
    );
  }

  function validate(): Errors {
    const found: Errors = {};
    const trimmed = name.trim();
    if (!trimmed) found.name = "Informe um nome.";
    else if (trimmed.length > 60) found.name = "Use até 60 caracteres.";
    if (isCard) {
      if (limit === null || limit <= 0) {
        found.limit = "Informe o limite do cartão.";
      }
      const cycle = cardCycleError(closingDay, dueDay);
      if (cycle) found[cycle.field] = cycle.message;
      if (balance !== null && balance < 0) {
        found.balance = "Informe quanto você deve, sem sinal.";
      }
    } else if (
      balance !== null &&
      balance < 0 &&
      !allowsNegativeBalance(type)
    ) {
      found.balance = `${option.label} não fica com saldo negativo.`;
    }
    return found;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    const fieldIds: Record<Field, string> = {
      name: `${id}-name`,
      limit: `${id}-limit`,
      closingDay: `${id}-closing`,
      dueDay: `${id}-due`,
      balance: `${id}-balance`,
    };
    const firstInvalid = (Object.keys(fieldIds) as Field[]).find(
      (field) => found[field],
    );
    if (firstInvalid) {
      document.getElementById(fieldIds[firstInvalid])?.focus();
      return;
    }

    const result = await executeAsync({
      name: name.trim(),
      type,
      color,
      includeInNetWorth,
      initialBalanceCents: balance ?? 0,
      card:
        isCard && limit !== null && closingDay !== null && dueDay !== null
          ? { limitCents: limit, closingDay, dueDay }
          : null,
    });

    if (result?.data) {
      toast(isCard ? "Cartão criado" : "Conta criada");
      router.replace(accountHref({ id: result.data.id, type }));
      return;
    }
    const fieldErrors = result?.validationErrors?.fieldErrors;
    const message =
      result?.serverError ??
      result?.validationErrors?.formErrors?.[0] ??
      (fieldErrors ? undefined : "Não deu para criar a conta. Tente de novo.");
    setErrors({
      name: fieldErrors?.name?.[0],
      balance: fieldErrors?.initialBalanceCents?.[0],
      limit: fieldErrors?.card?.[0],
      form: message,
    });
    if (message) toast.error(message);
  }

  return (
    <form
      noValidate
      onSubmit={submit}
      className="flex flex-col gap-6"
      aria-describedby={errors.form ? `${id}-form-error` : undefined}
    >
      <TypePicker name={`${id}-type`} value={type} onChange={changeType} />

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-name`}>Nome</Label>
        <Input
          id={`${id}-name`}
          value={name}
          maxLength={60}
          autoComplete="off"
          enterKeyHint="next"
          onChange={(event) => {
            setName(event.target.value);
            setNameEdited(true);
            clearError("name");
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
              clearError("limit");
            }}
            error={errors.limit}
            enterKeyHint="next"
          />
          <CardCycleFields
            idPrefix={id}
            closingDay={closingDay}
            dueDay={dueDay}
            onClosingDayChange={(day) => {
              setClosingDay(day);
              clearError("closingDay");
              clearError("dueDay");
            }}
            onDueDayChange={(day) => {
              setDueDay(day);
              clearError("dueDay");
            }}
            errors={{ closingDay: errors.closingDay, dueDay: errors.dueDay }}
          />
          <MoneyField
            id={`${id}-balance`}
            label="Fatura atual (valor devido hoje)"
            value={balance}
            onValueChange={(cents) => {
              setBalance(cents);
              clearError("balance");
            }}
            description="Some o que já está na fatura aberta e o que ainda não foi pago. Deixe em branco se não deve nada."
            error={errors.balance}
          />
        </>
      ) : (
        <MoneyField
          id={`${id}-balance`}
          label="Saldo atual"
          value={balance}
          onValueChange={(cents) => {
            setBalance(cents);
            clearError("balance");
          }}
          allowNegative={allowsNegativeBalance(type)}
          description="Não precisa ser exato — você ajusta depois."
          error={errors.balance}
        />
      )}

      <ColorPicker
        name={`${id}-color`}
        value={color}
        onChange={(next) => {
          setColor(next);
          setColorEdited(true);
        }}
        preview={
          <CategoryIcon
            icon={option.icon}
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

      <div className="flex flex-col gap-3 pt-2">
        <FieldError id={`${id}-form-error`}>{errors.form}</FieldError>
        <Button type="submit" size="lg" className="w-full" loading={isPending}>
          {isCard ? "Criar cartão" : "Criar conta"}
        </Button>
      </div>
    </form>
  );
}
