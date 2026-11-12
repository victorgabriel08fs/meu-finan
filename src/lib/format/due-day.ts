import type { NonBusinessDue } from "@/lib/finance/business-days";
import { dayOfWeek, daysBetween, parse } from "@/lib/finance/dates";
import { fullDateLabel, shortDateLabel, weekdayDateLabel } from "./date";

/**
 * pt-BR texts of a bill due on a non-business day (doc 02 §10.3): the row
 * note, what a screen reader hears, the detail and, while the payment can
 * still go through on the next business day, the "Prazo até …" label.
 * "Today" is always an argument. The wording says "costuma": the rule holds
 * for boletos and card invoices, not for every bill.
 */

/** Indexed by `dayOfWeek` (0 = Sunday). */
const WEEKDAY_NAMES = [
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
] as const;

/** "segunda, 16 de novembro". */
function spokenDate(date: string): string {
  const weekday = WEEKDAY_NAMES[dayOfWeek(parse(date))];
  return `${weekday}, ${fullDateLabel(date).replace(/ de \d+$/, "")}`;
}

/** The row line: "Dia não útil · passa para seg, 16 nov". */
export function nonBusinessShort(nb: NonBusinessDue): string {
  return `Dia não útil · passa para ${weekdayDateLabel(nb.nextBusinessDay)}`;
}

/** Appended to a row's accessible name: "vence em dia não útil, passa para segunda, 16 de novembro". */
export function nonBusinessSpoken(nb: NonBusinessDue): string {
  return `vence em dia não útil, passa para ${spokenDate(nb.nextBusinessDay)}`;
}

/** "num sábado, dia não útil", "num feriado (Consciência Negra)", … */
function whyNotBusiness(nb: NonBusinessDue, dueOn: string): string {
  switch (nb.reason) {
    case "saturday":
      return "num sábado, dia não útil";
    case "sunday":
      return "num domingo, dia não útil";
    case "holiday":
      return nb.holidayName ? `num feriado (${nb.holidayName})` : "num feriado";
    case "no_banking":
      return `num dia sem expediente bancário (${shortDateLabel(dueOn)})`;
  }
}

/**
 * The detail sheet and the invoice: why the day is not a business day, when
 * the payment usually goes through and, while there is time, the last
 * business day before it ("pague hoje" on that day itself), with the dates
 * spelled out ("segunda, 16 de novembro").
 */
export function nonBusinessDetail(
  nb: NonBusinessDue,
  dueOn: string,
  today: string,
): string {
  const verb = dueOn < today ? "Venceu" : "Vence";
  const parts = [
    `${verb} ${whyNotBusiness(nb, dueOn)}.`,
    `O pagamento costuma passar para o próximo dia útil, ${spokenDate(nb.nextBusinessDay)}.`,
  ];
  if (nb.previousBusinessDay > today) {
    parts.push(
      `Se preferir não esperar, pague até ${spokenDate(nb.previousBusinessDay)}.`,
    );
  } else if (nb.previousBusinessDay === today) {
    parts.push("Se preferir não esperar, pague hoje.");
  }
  return parts.join(" ");
}

/**
 * Between a non-business due date and the next business day, in place of
 * "Venceu …": "Prazo até hoje", "Prazo até amanhã", "Prazo até seg, 16 nov".
 */
export function graceLabel(effective: string, today: string): string {
  const days = daysBetween(parse(today), parse(effective));
  if (days <= 0) return "Prazo até hoje";
  if (days === 1) return "Prazo até amanhã";
  return `Prazo até ${weekdayDateLabel(effective)}`;
}
