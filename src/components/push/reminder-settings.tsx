"use client";

import {
  CalendarCheck,
  CalendarClock,
  ChartColumn,
  Eye,
  HandCoins,
  type LucideIcon,
  Sunrise,
} from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { SectionHeader } from "@/components/app/section-header";
import { Switch } from "@/components/planning/form/switch";
import {
  actionErrorMessage,
  NETWORK_ERROR,
} from "@/components/transactions/action-result";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { ReminderEvent } from "@/lib/notifications/events";
import type {
  BillsLeadDays,
  NotificationPreferences,
} from "@/lib/notifications/preferences";
import { saveNotificationPreferencesAction } from "@/server/actions/notifications";

const iconClass =
  "flex size-8 shrink-0 items-center justify-center rounded-chip bg-surface-2 text-fg-2 [&_svg]:size-5";
const rowClass = "flex min-h-16 items-center gap-3 py-2 pr-2 pl-4";

type ReminderRow = {
  event: ReminderEvent;
  icon: LucideIcon;
  label: string;
  description: (monthStartDay: number) => string;
};

/** The five notices, in the order of doc 02 §6.14. */
export const REMINDER_ROWS: readonly ReminderRow[] = [
  {
    event: "daily_summary",
    icon: Sunrise,
    label: "Resumo do dia",
    description: () => "Saldo, o que vence hoje e quanto dá para gastar.",
  },
  {
    event: "bills_due",
    icon: CalendarClock,
    label: "Contas a vencer",
    description: () => "Pendentes e faturas, e as que venceram sem pagar.",
  },
  {
    event: "income_countdown",
    icon: HandCoins,
    label: "Próxima receita",
    description: () =>
      "Nos 7 dias antes, com quanto dá para gastar por dia até lá.",
  },
  {
    event: "weekly_summary",
    icon: ChartColumn,
    label: "Resumo semanal",
    description: () => "Toda segunda, como foi a semana.",
  },
  {
    event: "monthly_summary",
    icon: CalendarCheck,
    label: "Resumo mensal",
    description: (day) =>
      `No dia ${day === 1 ? "1º" : day}, como foi o mês que fechou.`,
  },
];

const LEAD_OPTIONS: { value: `${BillsLeadDays}`; label: string }[] = [
  { value: "0", label: "No dia" },
  { value: "1", label: "1 dia" },
  { value: "3", label: "3 dias" },
];

const WHEN = "Chegam uma vez por dia, entre 6h e 7h (horário de Brasília)";

/** The note below the notices: when they arrive, and on how many devices. */
export function devicesNote(
  devices: number,
  preferences: NotificationPreferences,
): string {
  if (!Object.values(preferences.events).some(Boolean)) {
    return "Todos os avisos estão desligados.";
  }
  if (devices === 0) {
    return `${WHEN}. Nenhum aparelho recebe ainda: ligue “Receber notificações” acima.`;
  }
  return `${WHEN}, em ${devices} ${devices === 1 ? "aparelho" : "aparelhos"}.`;
}

/**
 * Saves the whole choice. Shows what went wrong, with "Tentar de novo"
 * (doc 02 §10.3) calling `retry`, and resolves to false when nothing was
 * saved.
 */
export async function persistNotificationPreferences(
  preferences: NotificationPreferences,
  retry: () => void,
): Promise<boolean> {
  const fail = (message: string) => {
    toast.error(message, {
      action: { label: "Tentar de novo", onClick: retry },
    });
    return false;
  };
  try {
    const message = actionErrorMessage(
      await saveNotificationPreferencesAction(preferences),
    );
    return message ? fail(message) : true;
  } catch {
    return fail(NETWORK_ERROR);
  }
}

type ReminderListProps = {
  preferences: NotificationPreferences;
  monthStartDay: number;
  /** Devices of the person that receive notifications. */
  devices: number;
  onChange: (next: NotificationPreferences) => void;
};

/** Avisos and Privacidade as they look for a given choice. */
export function ReminderList({
  preferences,
  monthStartDay,
  devices,
  onChange,
}: ReminderListProps) {
  const ids = useId();
  const setEvent = (event: ReminderEvent, on: boolean) =>
    onChange({
      ...preferences,
      events: { ...preferences.events, [event]: on },
    });

  return (
    <>
      <section aria-labelledby="notificacoes-avisos">
        <SectionHeader id="notificacoes-avisos" title="Avisos" />
        <ul
          aria-labelledby="notificacoes-avisos"
          className="overflow-hidden rounded-2xl bg-surface shadow-card"
        >
          {REMINDER_ROWS.map(({ event, icon: Icon, label, description }) => {
            const on = preferences.events[event];
            const id = `${ids}-${event}`;
            return (
              <li
                key={event}
                data-event={event}
                className="border-border not-first:border-t"
              >
                <div className={rowClass}>
                  <span aria-hidden="true" className={iconClass}>
                    <Icon />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span
                      id={`${id}-label`}
                      className="text-body font-semibold text-fg"
                    >
                      {label}
                    </span>
                    <span id={`${id}-hint`} className="text-caption text-fg-3">
                      {description(monthStartDay)}
                    </span>
                  </span>
                  <Switch
                    checked={on}
                    onCheckedChange={(next) => setEvent(event, next)}
                    labelledBy={`${id}-label`}
                    describedBy={`${id}-hint`}
                  />
                </div>
                {event === "bills_due" && on ? (
                  <div className="flex flex-col gap-2 px-4 pb-3 sm:max-w-md sm:pl-15">
                    <span className="text-caption text-fg-2">
                      Avisar com antecedência
                    </span>
                    <SegmentedControl
                      ariaLabel="Avisar com antecedência"
                      wrap
                      options={LEAD_OPTIONS}
                      value={String(preferences.billsLeadDays)}
                      onValueChange={(value) =>
                        onChange({
                          ...preferences,
                          billsLeadDays: Number(value) as BillsLeadDays,
                        })
                      }
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 px-4 text-caption text-fg-3">
          {devicesNote(devices, preferences)}
        </p>
      </section>

      <section aria-labelledby="notificacoes-privacidade">
        <SectionHeader id="notificacoes-privacidade" title="Privacidade" />
        <div className="overflow-hidden rounded-2xl bg-surface shadow-card">
          <div className={rowClass}>
            <span aria-hidden="true" className={iconClass}>
              <Eye />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span
                id={`${ids}-amounts-label`}
                className="text-body font-semibold text-fg"
              >
                Mostrar valores nas notificações
              </span>
              <span
                id={`${ids}-amounts-hint`}
                className="text-caption text-fg-3"
              >
                Ligado, saldos e valores aparecem na tela bloqueada. Desligado,
                só o essencial: “Aluguel vence amanhã”.
              </span>
            </span>
            <Switch
              checked={preferences.showAmounts}
              onCheckedChange={(showAmounts) =>
                onChange({ ...preferences, showAmounts })
              }
              labelledBy={`${ids}-amounts-label`}
              describedBy={`${ids}-amounts-hint`}
            />
          </div>
        </div>
      </section>
    </>
  );
}

/**
 * Ajustes › Notificações › Avisos and Privacidade (doc 02 §6.14): saved on
 * every tap, for every device of the person. The change shows at once; if
 * it is not saved, the screen goes back to the last saved choice.
 */
export function ReminderSettings({
  initial,
  monthStartDay,
  devices,
}: {
  initial: NotificationPreferences;
  monthStartDay: number;
  devices: number;
}) {
  const [preferences, setPreferences] = useState(initial);
  const saved = useRef(initial);
  const latest = useRef(0);

  async function change(next: NotificationPreferences) {
    setPreferences(next);
    latest.current += 1;
    const attempt = latest.current;
    if (await persistNotificationPreferences(next, () => void change(next))) {
      saved.current = next;
    } else if (attempt === latest.current) {
      setPreferences(saved.current);
    }
  }

  return (
    <ReminderList
      preferences={preferences}
      monthStartDay={monthStartDay}
      devices={devices}
      onChange={(next) => void change(next)}
    />
  );
}
