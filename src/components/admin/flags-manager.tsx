"use client";

import { ChevronRight, UsersRound } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { useSheetTarget } from "@/components/planning/form/use-sheet";
import {
  type ActionResultLike,
  actionErrorMessage,
  NETWORK_ERROR,
} from "@/components/transactions/action-result";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { toastWithUndo } from "@/components/ui/toast";
import type { FlagKey } from "@/lib/flags/registry";
import {
  type FlagSetting,
  fromFlagSetting,
  resolveFlag,
  toFlagSetting,
} from "@/lib/flags/resolve";
import { fullDateLabel } from "@/lib/format/date";
import { setGlobalFlagAction, setUserFlagAction } from "@/server/actions/admin";
import type { FlagAdminItem } from "@/server/domain/flag-admin";
import { plural } from "./labels";
import { UserAvatar } from "./user-avatar";

type Person = { id: string; name: string; email: string };

const SETTING_OPTIONS = [
  { value: "default", label: "Padrão" },
  { value: "on", label: "Ligado" },
  { value: "off", label: "Desligado" },
];

const onOff = (enabled: boolean) => (enabled ? "ligado" : "desligado");

/** Runs an action, shows its error and offers to undo it. */
async function apply(
  call: () => Promise<ActionResultLike>,
  message: string,
  undo: () => Promise<ActionResultLike>,
) {
  try {
    const error = actionErrorMessage(await call());
    if (error) {
      toast.error(error);
      return;
    }
    toastWithUndo(message, () => {
      void undo()
        .then((result) => {
          const undoError = actionErrorMessage(result);
          if (undoError) toast.error(undoError);
        })
        .catch(() => toast.error(NETWORK_ERROR));
    });
  } catch {
    toast.error(NETWORK_ERROR);
  }
}

/**
 * Administração › Flags (doc 02 §6.17): every flag of the registry with its
 * global value (Padrão · Ligado · Desligado) and per-person exceptions. A
 * change counts from each person's next request.
 */
export function FlagsManager({
  flags,
  people,
}: {
  flags: FlagAdminItem[];
  people: Person[];
}) {
  const sheet = useSheetTarget<FlagKey>();
  const open = flags.find((flag) => flag.key === sheet.target);

  return (
    <>
      <p className="text-callout text-fg-2">
        Ligue ou desligue funcionalidades para todo mundo ou só para algumas
        pessoas. A mudança vale a partir da próxima tela que cada pessoa abrir.
      </p>
      {flags.map((flag) => (
        <FlagCard
          key={flag.key}
          flag={flag}
          onPeople={() => sheet.show(flag.key)}
        />
      ))}
      <Sheet open={sheet.isOpen} onOpenChange={sheet.onOpenChange}>
        {open ? (
          <PeopleSheetContent key={sheet.key} flag={open} people={people} />
        ) : null}
      </Sheet>
    </>
  );
}

function FlagCard({
  flag,
  onPeople,
}: {
  flag: FlagAdminItem;
  onPeople: () => void;
}) {
  const [, startTransition] = useTransition();
  const stored = toFlagSetting(flag.global);
  const [setting, setOptimistic] = useOptimistic(stored);
  const effective = resolveFlag(flag.key, fromFlagSetting(setting)).enabled;

  function change(next: string) {
    const value = next as FlagSetting;
    if (value === stored) return;
    startTransition(async () => {
      setOptimistic(value);
      await apply(
        () =>
          setGlobalFlagAction({ key: flag.key, value: fromFlagSetting(value) }),
        value === "default"
          ? `${flag.label} voltou ao padrão (${onOff(flag.defaultValue)}).`
          : `${flag.label} ${onOff(value === "on")} para todos.`,
        () =>
          setGlobalFlagAction({
            key: flag.key,
            value: fromFlagSetting(stored),
          }),
      );
    });
  }

  return (
    <Card className="flex flex-col gap-4 p-5" data-flag={flag.key}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-headline text-fg">{flag.label}</h2>
          <p className="mt-0.5 truncate font-mono text-caption text-fg-3">
            {flag.key}
          </p>
        </div>
        <Badge tone={effective ? "primary" : "neutral"}>
          {effective ? "Ligado" : "Desligado"}
        </Badge>
      </div>
      <p className="text-callout text-fg-2">{flag.description}</p>
      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-fg-3">
        <div className="flex gap-1">
          <dt>Padrão:</dt>
          <dd className="font-semibold text-fg-2">
            {onOff(flag.defaultValue)}
          </dd>
        </div>
        <div className="flex gap-1">
          <dt>Área:</dt>
          <dd className="font-semibold text-fg-2">{flag.owner}</dd>
        </div>
        <div className="flex gap-1">
          <dt>Desde:</dt>
          <dd className="font-semibold text-fg-2">
            {fullDateLabel(flag.since)}
          </dd>
        </div>
      </dl>

      <div className="flex flex-col gap-2">
        <span className="text-callout font-semibold text-fg">Para todos</span>
        <SegmentedControl
          ariaLabel={`${flag.label} para todos`}
          options={SETTING_OPTIONS}
          value={setting}
          onValueChange={change}
        />
        <p className="text-caption text-fg-3">
          {setting === "default"
            ? `Segue o padrão do código: ${onOff(flag.defaultValue)}.`
            : "Vale para todo mundo, menos as exceções abaixo."}
        </p>
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <div className="flex min-h-9 items-center justify-between gap-3">
          <span className="text-callout font-semibold text-fg">
            Exceções por pessoa
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="-mr-2"
            onClick={onPeople}
          >
            <UsersRound aria-hidden="true" />
            Ajustar
          </Button>
        </div>
        {flag.overrides.length === 0 ? (
          <p className="text-caption text-fg-3">
            Nenhuma: todo mundo segue o valor acima.
          </p>
        ) : (
          <ul className="-mx-2 flex flex-col">
            {flag.overrides.map((person) => (
              <li key={person.userId}>
                <button
                  type="button"
                  onClick={onPeople}
                  className="flex min-h-12 w-full items-center gap-3 rounded-control px-2 text-left transition-colors duration-100 hover:bg-surface-2/60 active:bg-surface-2"
                >
                  <UserAvatar
                    name={person.name}
                    className="size-8 text-caption"
                  />
                  <span className="min-w-0 flex-1 truncate text-callout font-semibold text-fg">
                    {person.name}
                  </span>
                  <Badge tone={person.enabled ? "primary" : "neutral"}>
                    {person.enabled ? "Ligado" : "Desligado"}
                  </Badge>
                  <ChevronRight
                    aria-hidden="true"
                    className="size-4 shrink-0 text-fg-3"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function PeopleSheetContent({
  flag,
  people,
}: {
  flag: FlagAdminItem;
  people: Person[];
}) {
  const global = resolveFlag(flag.key, flag.global).enabled;
  const own = new Map(flag.overrides.map((row) => [row.userId, row.enabled]));
  return (
    <SheetContent
      title={`${flag.label} por pessoa`}
      description={`Uma exceção vale só para a pessoa e ganha do valor para todos (agora: ${onOff(global)}).`}
    >
      <p className="mb-3 text-caption text-fg-3">
        {plural(flag.overrides.length, "exceção", "exceções")} ·{" "}
        {plural(people.length, "pessoa", "pessoas")}
      </p>
      <ul className="flex flex-col pb-2 [&>li+li]:border-t [&>li+li]:border-border">
        {people.map((person) => (
          <PersonRow
            key={person.id}
            flag={flag}
            person={person}
            stored={toFlagSetting(own.get(person.id))}
            globalEnabled={global}
          />
        ))}
      </ul>
    </SheetContent>
  );
}

function PersonRow({
  flag,
  person,
  stored,
  globalEnabled,
}: {
  flag: FlagAdminItem;
  person: Person;
  stored: FlagSetting;
  globalEnabled: boolean;
}) {
  const [, startTransition] = useTransition();
  const [setting, setOptimistic] = useOptimistic(stored);
  const firstName = person.name.trim().split(/\s+/)[0] || person.name;

  function change(next: string) {
    const value = next as FlagSetting;
    if (value === stored) return;
    startTransition(async () => {
      setOptimistic(value);
      await apply(
        () =>
          setUserFlagAction({
            userId: person.id,
            key: flag.key,
            value: fromFlagSetting(value),
          }),
        value === "default"
          ? `${firstName} volta a seguir o valor para todos (${onOff(globalEnabled)}).`
          : `${flag.label} ${onOff(value === "on")} para ${firstName}.`,
        () =>
          setUserFlagAction({
            userId: person.id,
            key: flag.key,
            value: fromFlagSetting(stored),
          }),
      );
    });
  }

  return (
    <li className="flex flex-col gap-2.5 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <UserAvatar name={person.name} className="size-8 text-caption" />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-callout font-semibold text-fg">
            {person.name}
          </span>
          <span className="truncate text-caption text-fg-3">
            {person.email}
          </span>
        </div>
      </div>
      <SegmentedControl
        ariaLabel={`${flag.label} para ${person.name}`}
        options={SETTING_OPTIONS}
        value={setting}
        onValueChange={change}
      />
    </li>
  );
}
