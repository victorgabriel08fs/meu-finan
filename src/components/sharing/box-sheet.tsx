"use client";

import { Archive } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { type FormEvent, useId, useState } from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";
import { CategoryIcon } from "@/components/finance/category-icon";
import {
  COLOR_CHOICES,
  GOAL_ICON_CHOICES,
  ICON_NAMES,
} from "@/components/planning/form/icon-names";
import { MoneyField } from "@/components/planning/form/money-field";
import { NativeSelect } from "@/components/planning/form/native-select";
import { ColorPicker, IconPicker } from "@/components/planning/form/pickers";
import { deadlineDate, deadlineMonth } from "@/components/planning/goals/model";
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
import { addMonths, type YearMonth } from "@/lib/finance";
import { BOX_NAME_MAX } from "@/lib/sharing/limits";
import {
  archiveBoxAction,
  createBoxAction,
  updateBoxAction,
} from "@/server/actions/sharing";
import type { ColorToken, GoalExpectedRate } from "@/server/db/schema";

export type BoxFormBox = {
  id: string;
  name: string;
  icon: string;
  color: ColorToken;
  targetCents: number | null;
  targetDate: string | null;
  expectedRate: GoalExpectedRate | null;
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

type Errors = Partial<Record<"name" | "target" | "deadline" | "form", string>>;

const compareMonths = (a: YearMonth, b: YearMonth) =>
  a.year * 12 + a.month - (b.year * 12 + b.month);

/**
 * "Nova caixinha" / "Editar caixinha" (doc 02 §6.18): name, icon and colour,
 * and the optional target and deadline. Editing also archives (any member),
 * with "Desfazer" in the toast.
 */
export function BoxSheet({
  groupId,
  box,
  today,
  onCreated,
  onDone,
}: {
  groupId: string;
  box: BoxFormBox | null;
  today: YearMonth;
  /** After creating: the screen opens the new box (once the sheet is gone). */
  onCreated?: (boxId: string) => void;
  onDone: () => void;
}) {
  const formId = useId();
  const iconLabelId = useId();
  const colorLabelId = useId();
  const targetLabelId = useId();
  const deadlineLabelId = useId();
  const [requestId] = useState(() => uuidv7());
  const initialDeadline = deadlineMonth(box?.targetDate ?? null);
  const [name, setName] = useState(box?.name ?? "");
  const [icon, setIcon] = useState(box?.icon ?? "plane");
  const [color, setColor] = useState<string>(box?.color ?? "cat-3");
  const [hasTarget, setHasTarget] = useState(
    box ? box.targetCents !== null : false,
  );
  const [targetCents, setTargetCents] = useState<number | null>(
    box?.targetCents ?? null,
  );
  const [hasDeadline, setHasDeadline] = useState(initialDeadline !== null);
  const [deadline, setDeadline] = useState<YearMonth>(
    initialDeadline ?? addMonths(today, 12),
  );
  const [errors, setErrors] = useState<Errors>({});
  const [confirmArchive, setConfirmArchive] = useState(false);
  const create = useAction(createBoxAction);
  const update = useAction(updateBoxAction);
  const archive = useAction(archiveBoxAction);
  const pending = create.isPending || update.isPending;
  const years = Array.from({ length: 31 }, (_, index) => today.year + index);

  function fail(result: Parameters<typeof actionErrorMessage>[0] | undefined) {
    const fields =
      (
        result?.validationErrors as
          | { fieldErrors?: Record<string, string[] | undefined> }
          | undefined
      )?.fieldErrors ?? {};
    setErrors({
      name: fields.name?.[0],
      target: fields.targetCents?.[0],
      deadline: fields.targetDate?.[0],
      form: !result
        ? NETWORK_ERROR
        : Object.keys(fields).length
          ? undefined
          : (actionErrorMessage(result) ?? undefined),
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found: Errors = {};
    if (name.trim() === "") found.name = "Dê um nome à caixinha.";
    if (hasTarget && (!targetCents || targetCents <= 0)) {
      found.target = "Informe quanto querem juntar.";
    }
    if (hasTarget && hasDeadline && compareMonths(deadline, today) <= 0) {
      found.deadline = "Escolha um mês depois deste.";
    }
    setErrors(found);
    if (Object.keys(found).length > 0) {
      requestAnimationFrame(() => {
        const invalid = document.querySelector<HTMLElement>(
          `[data-box-form="${formId}"] [aria-invalid="true"]`,
        );
        invalid?.focus();
        invalid?.scrollIntoView({ block: "center" });
      });
      return;
    }
    const input = {
      name: name.trim(),
      icon,
      color: color as ColorToken,
      targetCents: hasTarget ? targetCents : null,
      targetDate: hasTarget && hasDeadline ? deadlineDate(deadline) : null,
      expectedRate: box?.expectedRate ?? null,
    };
    if (box) {
      const result = await update
        .executeAsync({ boxId: box.id, ...input })
        .catch(() => undefined);
      if (!result || actionErrorMessage(result)) return fail(result);
      toast(`Caixinha ${input.name} salva.`);
      onDone();
      return;
    }
    const result = await create
      .executeAsync({ id: requestId, groupId, ...input })
      .catch(() => undefined);
    if (!result?.data) return fail(result);
    toast(`Caixinha ${input.name} criada.`);
    onCreated?.(result.data.boxId);
    onDone();
  }

  async function archiveBox(target: BoxFormBox) {
    const result = await archive
      .executeAsync({ boxId: target.id, archived: true })
      .catch(() => undefined);
    const message = result ? actionErrorMessage(result) : NETWORK_ERROR;
    if (message) {
      setErrors({ form: message });
      return;
    }
    onDone();
    toastWithUndo(`Caixinha ${target.name} arquivada.`, () => {
      void archiveBoxAction({ boxId: target.id, archived: false })
        .then((response) => {
          const failed = actionErrorMessage(response);
          if (failed) toast.error(failed);
        })
        .catch(() =>
          toast.error("Não deu para desfazer. Verifique a conexão."),
        );
    });
  }

  if (confirmArchive && box) {
    return (
      <SheetContent
        title={`Arquivar ${box.name}?`}
        description="A caixinha sai da lista do grupo para todos. O que cada um guardou continua nas contas de cada um."
        footer={
          <>
            <Button
              variant="destructive"
              size="lg"
              className="w-full"
              loading={archive.isPending}
              onClick={() => void archiveBox(box)}
            >
              Arquivar caixinha
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
      title={box ? "Editar caixinha" : "Nova caixinha"}
      footer={
        <>
          <FieldError id={`${formId}-form-error`}>{errors.form}</FieldError>
          <Button
            type="submit"
            form={formId}
            size="lg"
            className="w-full"
            loading={pending}
          >
            {box ? "Salvar caixinha" : "Criar caixinha"}
          </Button>
          {box ? (
            <Button
              variant="ghost"
              size="lg"
              className="w-full text-danger hover:bg-danger-soft/60 active:bg-danger-soft"
              onClick={() => setConfirmArchive(true)}
            >
              <Archive aria-hidden="true" />
              Arquivar caixinha
            </Button>
          ) : null}
        </>
      }
    >
      <form
        id={formId}
        data-box-form={formId}
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
              maxLength={BOX_NAME_MAX}
              autoComplete="off"
              enterKeyHint="next"
              placeholder="Viagem para Salvador"
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

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-3">
            <span
              id={targetLabelId}
              className="min-w-0 flex-[1_1_11rem] text-callout font-semibold text-fg"
            >
              Definir objetivo
            </span>
            <Switch
              className="ml-auto"
              checked={hasTarget}
              onCheckedChange={(checked) => {
                setHasTarget(checked);
                setErrors((current) => ({
                  ...current,
                  target: undefined,
                  deadline: undefined,
                }));
              }}
              labelledBy={targetLabelId}
            />
          </div>
          {hasTarget ? (
            <MoneyField
              id={`${formId}-target`}
              label="Quanto querem juntar"
              value={targetCents}
              onValueChange={(cents) => {
                setTargetCents(cents);
                setErrors((current) => ({ ...current, target: undefined }));
              }}
              error={errors.target}
              hint="A parte de cada um é igual; quem criou o grupo pode mudar depois."
            />
          ) : (
            <p className="text-caption text-fg-3">
              Sem objetivo, vocês acompanham quanto cada um já guardou.
            </p>
          )}
        </div>

        {hasTarget ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-x-3">
              <span
                id={deadlineLabelId}
                className="min-w-0 flex-[1_1_11rem] text-callout font-semibold text-fg"
              >
                Definir prazo
              </span>
              <Switch
                className="ml-auto"
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
                Sem prazo, mostramos quando vocês chegam lá no ritmo do plano de
                cada um.
              </p>
            )}
            <FieldError id={`${formId}-deadline-error`}>
              {errors.deadline}
            </FieldError>
          </div>
        ) : null}
      </form>
    </SheetContent>
  );
}
