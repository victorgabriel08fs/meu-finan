"use client";

import { Archive } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { type FormEvent, useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { formatMoneyShort } from "@/components/charts/format";
import { CategoryIcon } from "@/components/finance/category-icon";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SheetContent } from "@/components/ui/sheet";
import { addMonths, projectGoal, type YearMonth } from "@/lib/finance";
import { formatRate } from "@/lib/format/number";
import {
  archiveGoalAction,
  createGoalAction,
  updateGoalAction,
} from "@/server/actions/planning";
import { DecimalField } from "../form/decimal-field";
import {
  COLOR_CHOICES,
  GOAL_ICON_CHOICES,
  ICON_NAMES,
} from "../form/icon-names";
import { MoneyField } from "../form/money-field";
import { NativeSelect } from "../form/native-select";
import { ChoiceChips, ColorPicker, IconPicker } from "../form/pickers";
import { Switch } from "../form/switch";
import { type MarketRatesView, marketRateLabel } from "../market";
import {
  deadlineDate,
  deadlineMonth,
  formFromRate,
  type GoalRate,
  goalAnnualRate,
  goalMonthlyRate,
  projectionSentence,
  RATE_BOUNDS,
  RATE_DEFAULTS,
  type RateKind,
  rateFromForm,
} from "./model";

export type GoalFormGoal = {
  id: string;
  name: string;
  icon: string;
  color: string;
  targetCents: number;
  currentCents: number;
  targetDate: string | null;
  monthlyPlanCents: number;
  expectedRate: GoalRate | null;
  accountId: string | null;
};

export type GoalAccount = {
  id: string;
  name: string;
  balanceCents: number;
};

const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

const NETWORK_ERROR = "Não conseguimos salvar. Verifique a conexão.";

type Errors = Partial<
  Record<
    "name" | "target" | "saved" | "monthly" | "deadline" | "rate" | "form",
    string
  >
>;

const compareMonths = (a: YearMonth, b: YearMonth) =>
  a.year * 12 + a.month - (b.year * 12 + b.month);

/** Create or edit a goal (doc 02 §6.10 "Criar meta"), with a live projection. */
export function GoalSheet({
  goal,
  accounts,
  market,
  today,
  suggestedMonthlyCents,
  onDone,
}: {
  goal: GoalFormGoal | null;
  accounts: GoalAccount[];
  market: MarketRatesView;
  today: YearMonth;
  /** "Ajustar plano": starts the monthly field at the amount that meets the deadline. */
  suggestedMonthlyCents?: number | null;
  onDone: () => void;
}) {
  const formId = useId();
  const iconLabelId = useId();
  const colorLabelId = useId();
  const rateLabelId = useId();
  const deadlineLabelId = useId();
  // New goals start at 100% do CDI; an existing goal keeps its rate (or none).
  const initialRate = formFromRate(
    goal ? goal.expectedRate : { index: "cdi", pct: 1 },
  );
  const initialDeadline = deadlineMonth(goal?.targetDate ?? null);
  const defaultDeadline = addMonths(today, 12);

  const [name, setName] = useState(goal?.name ?? "");
  const [icon, setIcon] = useState(goal?.icon ?? "piggy-bank");
  const [color, setColor] = useState(goal?.color ?? "cat-3");
  const [targetCents, setTargetCents] = useState<number | null>(
    goal?.targetCents ?? null,
  );
  const [accountId, setAccountId] = useState(goal?.accountId ?? "");
  const [savedCents, setSavedCents] = useState<number | null>(
    goal && !goal.accountId ? goal.currentCents : 0,
  );
  const [monthlyCents, setMonthlyCents] = useState<number | null>(
    suggestedMonthlyCents ?? goal?.monthlyPlanCents ?? null,
  );
  const [hasDeadline, setHasDeadline] = useState(initialDeadline !== null);
  const [deadline, setDeadline] = useState<YearMonth>(
    initialDeadline ?? defaultDeadline,
  );
  const [rateKind, setRateKind] = useState<RateKind>(initialRate.kind);
  const [ratePercent, setRatePercent] = useState<number | null>(
    initialRate.percent,
  );
  const [errors, setErrors] = useState<Errors>({});
  const [confirmArchive, setConfirmArchive] = useState(false);

  const account = accounts.find((item) => item.id === accountId);
  const currentCents = account
    ? Math.max(0, account.balanceCents)
    : (savedCents ?? 0);
  const rate =
    rateKind === "none" || ratePercent === null
      ? null
      : rateFromForm(rateKind, ratePercent);

  const preview = useMemo(() => {
    if (!targetCents || targetCents <= 0) return null;
    try {
      const projection = projectGoal({
        currentCents,
        targetCents,
        monthlyCents: monthlyCents ?? 0,
        monthlyRate: goalMonthlyRate(rate, market),
        today,
        targetMonth: hasDeadline ? deadline : undefined,
      });
      return projectionSentence({
        projection,
        monthlyPlanCents: monthlyCents ?? 0,
        deadline: hasDeadline ? deadline : null,
      });
    } catch {
      return null;
    }
  }, [
    currentCents,
    targetCents,
    monthlyCents,
    rate,
    market,
    today,
    hasDeadline,
    deadline,
  ]);

  const onSuccess = () => {
    toast(goal ? `Meta ${name.trim()} salva.` : `Meta ${name.trim()} criada.`);
    onDone();
  };
  const onError = ({
    error,
  }: {
    error: {
      serverError?: string;
      validationErrors?: { fieldErrors?: Record<string, string[] | undefined> };
    };
  }) => {
    const fields = error.validationErrors?.fieldErrors ?? {};
    setErrors({
      name: fields.name?.[0],
      target: fields.targetCents?.[0],
      monthly: fields.monthlyPlanCents?.[0],
      deadline: fields.targetDate?.[0],
      rate: fields.expectedRate?.[0],
      form:
        error.serverError ??
        (Object.keys(fields).length ? undefined : NETWORK_ERROR),
    });
  };
  const create = useAction(createGoalAction, { onSuccess, onError });
  const update = useAction(updateGoalAction, { onSuccess, onError });
  const archive = useAction(archiveGoalAction, {
    onSuccess: () => {
      toast(`Meta ${goal?.name ?? ""} arquivada.`);
      onDone();
    },
    onError: ({ error }) =>
      setErrors({ form: error.serverError ?? NETWORK_ERROR }),
  });
  const pending = create.isPending || update.isPending;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: Errors = {};
    if (name.trim() === "") next.name = "Dê um nome para a meta.";
    if (!targetCents || targetCents <= 0)
      next.target = "Informe quanto quer juntar.";
    if (hasDeadline && compareMonths(deadline, today) <= 0) {
      next.deadline = "Escolha um mês depois deste.";
    }
    if (rateKind !== "none") {
      const bounds = RATE_BOUNDS[rateKind];
      if (ratePercent === null) next.rate = "Informe a rentabilidade esperada.";
      else if (ratePercent < bounds.min || ratePercent > bounds.max) {
        next.rate = `Use um valor entre ${bounds.min} e ${bounds.max}.`;
      }
    }
    setErrors(next);
    if (Object.keys(next).length > 0 || !targetCents) {
      // After the errors render: focus (and scroll to) the first invalid field.
      requestAnimationFrame(() => {
        document
          .querySelector<HTMLElement>(
            `[data-goal-form="${formId}"] [aria-invalid="true"]`,
          )
          ?.focus();
      });
      return;
    }
    const input = {
      name: name.trim(),
      icon,
      color: color as (typeof COLOR_CHOICES)[number],
      targetCents,
      targetDate: hasDeadline ? deadlineDate(deadline) : null,
      accountId: accountId || null,
      savedCents: accountId ? 0 : (savedCents ?? 0),
      monthlyPlanCents: monthlyCents ?? 0,
      expectedRate: rate,
    };
    if (goal) update.execute({ id: goal.id, ...input });
    else create.execute(input);
  }

  const years = Array.from({ length: 51 }, (_, index) => today.year + index);
  const rateOptions: { value: RateKind; label: string }[] = [
    { value: "none", label: "Sem rendimento" },
    { value: "cdi", label: "% do CDI" },
    { value: "fixed", label: "Prefixado" },
    { value: "ipca", label: "IPCA +" },
  ];
  if (rateKind === "selic")
    rateOptions.push({ value: "selic", label: "% da Selic" });

  if (confirmArchive && goal) {
    return (
      <SheetContent
        title={`Arquivar ${goal.name}?`}
        description="A meta sai da lista. O dinheiro e os lançamentos continuam onde estão."
        footer={
          <>
            <Button
              variant="destructive"
              size="lg"
              className="w-full"
              loading={archive.isPending}
              onClick={() => archive.execute({ id: goal.id })}
            >
              Arquivar meta
            </Button>
            <Button
              variant="secondary"
              size="lg"
              className="w-full"
              onClick={() => setConfirmArchive(false)}
            >
              Cancelar
            </Button>
          </>
        }
      >
        <FieldError id={`${formId}-archive-error`}>{errors.form}</FieldError>
      </SheetContent>
    );
  }

  return (
    <SheetContent
      title={goal ? "Editar meta" : "Nova meta"}
      footer={
        <>
          <Button
            type="submit"
            form={formId}
            size="lg"
            className="w-full"
            loading={pending}
          >
            {goal ? "Salvar meta" : "Criar meta"}
          </Button>
          {goal ? (
            <Button
              variant="ghost"
              size="lg"
              className="w-full text-danger hover:bg-danger-soft/60 active:bg-danger-soft"
              onClick={() => setConfirmArchive(true)}
            >
              <Archive aria-hidden="true" />
              Arquivar meta
            </Button>
          ) : null}
        </>
      }
    >
      <form
        id={formId}
        data-goal-form={formId}
        onSubmit={submit}
        noValidate
        className="flex flex-col gap-6 pb-2"
      >
        <div className="flex items-end gap-3">
          <CategoryIcon icon={icon} color={color} size="lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Label htmlFor={`${formId}-name`}>Nome</Label>
            <Input
              id={`${formId}-name`}
              value={name}
              maxLength={60}
              autoComplete="off"
              enterKeyHint="next"
              placeholder="Reserva de emergência"
              onChange={(event) => {
                setName(event.target.value);
                setErrors((current) => ({ ...current, name: undefined }));
              }}
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={
                errors.name ? `${formId}-name-error` : undefined
              }
            />
          </div>
        </div>
        <FieldError id={`${formId}-name-error`} className="-mt-4">
          {errors.name}
        </FieldError>

        <div className="flex flex-col gap-2">
          <span id={iconLabelId} className="text-callout font-semibold text-fg">
            Ícone
          </span>
          <IconPicker
            icons={GOAL_ICON_CHOICES}
            value={icon}
            onChange={setIcon}
            color={color}
            labelledBy={iconLabelId}
            names={ICON_NAMES}
          />
        </div>

        <div className="flex flex-col gap-2">
          <span
            id={colorLabelId}
            className="text-callout font-semibold text-fg"
          >
            Cor
          </span>
          <ColorPicker
            colors={COLOR_CHOICES.filter((choice) => choice !== "neutral")}
            value={color}
            onChange={setColor}
            labelledBy={colorLabelId}
          />
        </div>

        <MoneyField
          id={`${formId}-target`}
          label="Quanto quer juntar"
          value={targetCents}
          onValueChange={(cents) => {
            setTargetCents(cents);
            setErrors((current) => ({ ...current, target: undefined }));
          }}
          error={errors.target}
          enterKeyHint="next"
        />

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <span
              id={deadlineLabelId}
              className="text-callout font-semibold text-fg"
            >
              Definir prazo
            </span>
            <Switch
              checked={hasDeadline}
              onCheckedChange={(checked) => {
                setHasDeadline(checked);
                setErrors((current) => ({ ...current, deadline: undefined }));
              }}
              labelledBy={deadlineLabelId}
            />
          </div>
          {hasDeadline ? (
            <fieldset className="grid grid-cols-[3fr_2fr] gap-2">
              <legend className="sr-only">Prazo</legend>
              <div className="flex flex-col gap-1.5">
                <Label
                  htmlFor={`${formId}-month`}
                  className="text-caption text-fg-2"
                >
                  Mês
                </Label>
                <NativeSelect
                  id={`${formId}-month`}
                  value={deadline.month}
                  onChange={(event) =>
                    setDeadline((current) => ({
                      ...current,
                      month: Number(event.target.value),
                    }))
                  }
                  aria-invalid={errors.deadline ? true : undefined}
                  aria-describedby={
                    errors.deadline ? `${formId}-deadline-error` : undefined
                  }
                >
                  {MONTHS.map((label, index) => (
                    <option key={label} value={index + 1}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label
                  htmlFor={`${formId}-year`}
                  className="text-caption text-fg-2"
                >
                  Ano
                </Label>
                <NativeSelect
                  id={`${formId}-year`}
                  value={deadline.year}
                  onChange={(event) =>
                    setDeadline((current) => ({
                      ...current,
                      year: Number(event.target.value),
                    }))
                  }
                  aria-invalid={errors.deadline ? true : undefined}
                >
                  {years.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </fieldset>
          ) : (
            <p className="text-caption text-fg-3">
              Sem prazo, mostramos quando você chega lá no ritmo do aporte.
            </p>
          )}
          <FieldError id={`${formId}-deadline-error`}>
            {errors.deadline}
          </FieldError>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={`${formId}-account`}>Onde está guardado</Label>
          <NativeSelect
            id={`${formId}-account`}
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            aria-describedby={`${formId}-account-hint`}
          >
            <option value="">Não vincular — informo o valor</option>
            {accounts.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {formatMoneyShort(item.balanceCents)}
              </option>
            ))}
          </NativeSelect>
          <p id={`${formId}-account-hint`} className="text-caption text-fg-3">
            {account
              ? `O progresso acompanha o saldo de ${account.name}.`
              : "Com uma conta vinculada, o progresso acompanha o saldo dela."}
          </p>
        </div>

        {account ? null : (
          <MoneyField
            id={`${formId}-saved`}
            label="Quanto já guardou"
            value={savedCents}
            onValueChange={setSavedCents}
            error={errors.saved}
            enterKeyHint="next"
          />
        )}

        <MoneyField
          id={`${formId}-monthly`}
          label="Aporte mensal planejado"
          value={monthlyCents}
          onValueChange={(cents) => {
            setMonthlyCents(cents);
            setErrors((current) => ({ ...current, monthly: undefined }));
          }}
          error={errors.monthly}
          hint={
            suggestedMonthlyCents
              ? `Para cumprir o prazo: ${formatMoneyShort(suggestedMonthlyCents)}/mês.`
              : "Opcional. Com ele, calculamos quando você chega lá."
          }
        />

        <div className="flex flex-col gap-2">
          <span id={rateLabelId} className="text-callout font-semibold text-fg">
            Rentabilidade esperada
          </span>
          <ChoiceChips
            labelledBy={rateLabelId}
            label="Rentabilidade esperada"
            options={rateOptions}
            value={rateKind}
            onChange={(kind) => {
              setRateKind(kind);
              setRatePercent(kind === "none" ? null : RATE_DEFAULTS[kind]);
              setErrors((current) => ({ ...current, rate: undefined }));
            }}
          />
          {rateKind === "none" ? (
            <p className="text-caption text-fg-3">
              Dinheiro parado, sem juros.
            </p>
          ) : (
            <DecimalField
              id={`${formId}-rate`}
              label={
                rateKind === "fixed"
                  ? "Taxa prefixada"
                  : rateKind === "ipca"
                    ? "Juro acima do IPCA"
                    : rateKind === "selic"
                      ? "Percentual da Selic"
                      : "Percentual do CDI"
              }
              hideLabel
              value={ratePercent}
              onValueChange={(value) => {
                setRatePercent(value);
                setErrors((current) => ({ ...current, rate: undefined }));
              }}
              prefix={rateKind === "ipca" ? "IPCA +" : undefined}
              suffix={
                rateKind === "fixed"
                  ? "% a.a."
                  : rateKind === "ipca"
                    ? "% a.a."
                    : rateKind === "selic"
                      ? "% da Selic"
                      : "% do CDI"
              }
              step={rateKind === "cdi" || rateKind === "selic" ? 1 : 0.25}
              min={RATE_BOUNDS[rateKind].min}
              max={RATE_BOUNDS[rateKind].max}
              allowNegative={rateKind === "ipca"}
              error={errors.rate}
              hint={rateHint(rateKind, rate, market)}
            />
          )}
        </div>

        {preview ? (
          <output
            aria-live="polite"
            className="block rounded-control bg-primary-soft/60 p-4 text-callout text-fg-2"
          >
            {preview.map((segment, index) =>
              segment.strong ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: static sentence parts
                <strong key={index} className="font-bold text-fg">
                  {segment.text}
                </strong>
              ) : (
                // biome-ignore lint/suspicious/noArrayIndexKey: static sentence parts
                <span key={index}>{segment.text}</span>
              ),
            )}
          </output>
        ) : null}

        <FieldError id={`${formId}-form-error`}>{errors.form}</FieldError>
      </form>
    </SheetContent>
  );
}

function rateHint(
  kind: RateKind,
  rate: GoalRate | null,
  market: MarketRatesView,
): string {
  if (kind === "none") return "";
  const annual = rate ? goalAnnualRate(rate, market) : null;
  const equivalent =
    annual === null
      ? ""
      : ` · ≈ ${formatRate({ kind: "annual", value: annual })}`;
  if (kind === "cdi") return `${marketRateLabel("cdi", market)}${equivalent}`;
  if (kind === "selic")
    return `${marketRateLabel("selic", market)}${equivalent}`;
  if (kind === "ipca") return `${marketRateLabel("ipca", market)}${equivalent}`;
  if (!rate) return "Taxa fixa ao ano.";
  return `Taxa fixa ao ano · ≈ ${formatRate({ kind: "monthly", value: goalMonthlyRate(rate, market) })}`;
}
