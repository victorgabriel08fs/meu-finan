"use client";

import { CalendarRange, Palette } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { toast } from "sonner";
import { SectionHeader } from "@/components/app/section-header";
import { ThemeSwitcher } from "@/components/app/theme-switcher";
import { monthName } from "@/components/charts/format";
import { NativeSelect } from "@/components/planning/form/native-select";
import { Label } from "@/components/ui/label";
import {
  iso,
  MAX_PERIOD_START_DAY,
  parseMonth,
  periodForMonth,
} from "@/lib/finance";
import { periodLabel } from "@/lib/format/date";
import { updatePreferencesAction } from "@/server/actions/planning";

const DAYS = Array.from(
  { length: MAX_PERIOD_START_DAY },
  (_, index) => index + 1,
);

/** "outubro vai de 5/out a 4/nov": the financial month for a start day. */
function periodExample(month: string, startDay: number): string {
  const period = periodForMonth(parseMonth(month), startDay);
  return `${monthName(month).replace(/^./, (letter) => letter.toUpperCase())} vai de ${periodLabel(
    iso(period.start),
    iso(period.end),
  ).replace(" – ", " a ")}.`;
}

/** Ajustes › Preferências (doc 02 §6.14): theme and the financial month start. */
export function PreferencesForm({
  monthStartDay,
  currentMonth,
}: {
  monthStartDay: number;
  currentMonth: string;
}) {
  const [day, setDay] = useState(monthStartDay);
  const save = useAction(updatePreferencesAction, {
    onSuccess: ({ input }) => {
      toast(
        input.monthStartDay === 1
          ? "O mês financeiro agora começa no dia 1."
          : `O mês financeiro agora começa no dia ${input.monthStartDay}.`,
      );
    },
    onError: ({ error }) => {
      setDay(monthStartDay);
      toast(
        error.serverError ?? "Não conseguimos salvar. Verifique a conexão.",
      );
    },
  });

  return (
    <>
      <section aria-labelledby="preferencias-aparencia">
        <SectionHeader id="preferencias-aparencia" title="Aparência" />
        <div className="flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-card">
          <span className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-chip bg-surface-2 text-fg-2 [&_svg]:size-5"
            >
              <Palette />
            </span>
            <span className="text-body font-semibold text-fg">Tema</span>
          </span>
          <ThemeSwitcher />
          <p className="text-caption text-fg-3">Vale para este aparelho.</p>
        </div>
      </section>

      <section aria-labelledby="preferencias-mes">
        <SectionHeader id="preferencias-mes" title="Mês financeiro" />
        <div className="flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-card">
          <span className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-chip bg-surface-2 text-fg-2 [&_svg]:size-5"
            >
              <CalendarRange />
            </span>
            <Label htmlFor="inicio-do-mes" className="text-body text-fg">
              Início do mês
            </Label>
          </span>
          <NativeSelect
            id="inicio-do-mes"
            value={day}
            disabled={save.isPending}
            aria-describedby="inicio-do-mes-ajuda"
            onChange={(event) => {
              const next = Number(event.target.value);
              setDay(next);
              save.execute({ monthStartDay: next });
            }}
          >
            {DAYS.map((value) => (
              <option key={value} value={value}>
                Dia {value}
              </option>
            ))}
          </NativeSelect>
          <p id="inicio-do-mes-ajuda" className="text-caption text-fg-3">
            Útil se o salário cai depois do dia 1: orçamentos, relatórios e o
            extrato contam o mês a partir desse dia.{" "}
            {periodExample(currentMonth, day)}
          </p>
        </div>
      </section>
    </>
  );
}
