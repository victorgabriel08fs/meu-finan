"use client";

import {
  CalendarCheck,
  CalendarClock,
  CalendarX,
  ChartColumn,
  Eye,
  HandCoins,
  type LucideIcon,
  Sunrise,
} from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { SectionHeader } from "@/components/app/section-header";
import { SettingRow } from "@/components/app/setting-row";
import {
  actionErrorMessage,
  NETWORK_ERROR,
} from "@/components/transactions/action-result";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";
import type { ReminderEvent } from "@/lib/notifications/events";
import type {
  BillsLeadDays,
  NotificationPreferences,
} from "@/lib/notifications/preferences";
import { saveNotificationPreferencesAction } from "@/server/actions/notifications";

type ReminderRow = {
  event: ReminderEvent;
  icon: LucideIcon;
  label: string;
  description: (monthStartDay: number) => string;
};

/**
 * The notices, in the order of doc 02 §6.14. "Vencimento em dia não útil"
 * shows only with the flag alerta_dia_nao_util.
 */
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
    event: "non_business_due",
    icon: CalendarX,
    label: "Vencimento em dia não útil",
    description: () =>
      "No último dia útil antes, quando uma conta vence no fim de semana ou num feriado.",
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

/** The rows on screen: without "Vencimento em dia não útil" when its flag is off. */
export function visibleReminderRows(nonBusinessDue: boolean): ReminderRow[] {
  return REMINDER_ROWS.filter(
    (row) => nonBusinessDue || row.event !== "non_business_due",
  );
}

/**
 * The note below the notices: when they arrive, and on how many devices.
 * Only the rows on screen (`events`) count as on. With the bell
 * (central_notificacoes) they also stay in the notification center, devices
 * or not.
 */
export function devicesNote(
  devices: number,
  preferences: NotificationPreferences,
  events: readonly ReminderEvent[] = REMINDER_ROWS.map((row) => row.event),
  bell = false,
): string {
  if (!events.some((event) => preferences.events[event])) {
    return "Todos os avisos estão desligados.";
  }
  const devicesText = `${devices} ${devices === 1 ? "aparelho" : "aparelhos"}`;
  if (bell) {
    return devices === 0
      ? `${WHEN}, no sino do app. Para receber também no celular, ligue “Receber notificações” acima.`
      : `${WHEN}, no sino e em ${devicesText}.`;
  }
  if (devices === 0) {
    return `${WHEN}. Nenhum aparelho recebe ainda: ligue “Receber notificações” acima.`;
  }
  return `${WHEN}, em ${devicesText}.`;
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
  /** The flag alerta_dia_nao_util, read on the server: shows its row. */
  nonBusinessDue?: boolean;
  /** The flag central_notificacoes, read on the server: the notices reach the bell. */
  bell?: boolean;
  onChange: (next: NotificationPreferences) => void;
};

/** Avisos and Privacidade as they look for a given choice. */
export function ReminderList({
  preferences,
  monthStartDay,
  devices,
  nonBusinessDue = false,
  bell = false,
  onChange,
}: ReminderListProps) {
  const ids = useId();
  const rows = visibleReminderRows(nonBusinessDue);
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
          {rows.map(({ event, icon: Icon, label, description }) => {
            const on = preferences.events[event];
            const id = `${ids}-${event}`;
            return (
              <li
                key={event}
                data-event={event}
                className="border-border not-first:border-t"
              >
                <SettingRow
                  id={id}
                  icon={Icon}
                  label={label}
                  description={description(monthStartDay)}
                  control={
                    <Switch
                      checked={on}
                      onCheckedChange={(next) => setEvent(event, next)}
                      labelledBy={`${id}-label`}
                      describedBy={`${id}-hint`}
                    />
                  }
                />
                {event === "bills_due" && on ? (
                  <div className="flex flex-col gap-2 px-4 pb-3 sm:max-w-md sm:pl-15">
                    <span className="text-caption text-fg-2">
                      Avisar com antecedência
                    </span>
                    <SegmentedControl
                      ariaLabel="Avisar com antecedência"
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
          {devicesNote(
            devices,
            preferences,
            rows.map((row) => row.event),
            bell,
          )}
        </p>
      </section>

      <section aria-labelledby="notificacoes-privacidade">
        <SectionHeader id="notificacoes-privacidade" title="Privacidade" />
        <div className="overflow-hidden rounded-2xl bg-surface shadow-card">
          <SettingRow
            id={`${ids}-amounts`}
            icon={Eye}
            label="Mostrar valores nas notificações"
            description="Ligado, saldos e valores aparecem na tela bloqueada. Desligado, só o essencial: “Aluguel vence amanhã”."
            control={
              <Switch
                checked={preferences.showAmounts}
                onCheckedChange={(showAmounts) =>
                  onChange({ ...preferences, showAmounts })
                }
                labelledBy={`${ids}-amounts-label`}
                describedBy={`${ids}-amounts-hint`}
              />
            }
          />
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
  nonBusinessDue = false,
  bell = false,
}: {
  initial: NotificationPreferences;
  monthStartDay: number;
  devices: number;
  /** The flag alerta_dia_nao_util, read on the server. */
  nonBusinessDue?: boolean;
  /** The flag central_notificacoes, read on the server. */
  bell?: boolean;
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
      nonBusinessDue={nonBusinessDue}
      bell={bell}
      onChange={(next) => void change(next)}
    />
  );
}
