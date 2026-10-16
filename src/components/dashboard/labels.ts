import { dayOfWeek, daysBetween, parse } from "@/lib/finance/dates";
import { fullDateLabel, monthLabel, shortDateLabel } from "@/lib/format/date";

/**
 * Pure pt-BR labels for the Início (doc 02 §6.3, §10). "Today" and "now" are
 * always arguments, so the same input renders the same text on the server
 * and in the browser.
 */

const WEEKDAYS = [
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
] as const;

/** "Bom dia" (5h–11h), "Boa tarde" (12h–17h), "Boa noite" — in `timeZone`. */
export function greetingFor(now: Date | number, timeZone: string): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      hourCycle: "h23",
    }).format(now),
  );
  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
}

/** "terça, 14 de outubro" for "2026-10-14" (the year is implied: it is today). */
export function weekdayDateLabel(isoDate: string): string {
  const weekday = WEEKDAYS[dayOfWeek(parse(isoDate))];
  return `${weekday}, ${fullDateLabel(isoDate).replace(/ de \d+$/, "")}`;
}

/** "AN" for "Ana Nunes", "A" for "Ana", "?" for an empty name. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase() || "?";
}

/** "Ana" for "Ana Nunes"; "você" when there is no name. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "você";
}

/** "outubro" for "2026-10". */
export function monthName(month: string): string {
  return monthLabel(month).split(" de ")[0] ?? month;
}

export type DueTone = "danger" | "warning" | "neutral";

/**
 * Due label of a pending bill (doc 02 §5.7, §6.3): "Venceu ontem" and "Venceu
 * há 3 dias" in --danger, "Vence hoje/amanhã/em 3 dias" in amber up to 3 days
 * ahead, then "Vence 20/out" in neutral.
 */
export function dueLabel(
  dueOn: string,
  today: string,
): { text: string; tone: DueTone; days: number } {
  const days = daysBetween(parse(today), parse(dueOn));
  if (days < -1)
    return { text: `Venceu há ${-days} dias`, tone: "danger", days };
  if (days === -1) return { text: "Venceu ontem", tone: "danger", days };
  if (days === 0) return { text: "Vence hoje", tone: "warning", days };
  if (days === 1) return { text: "Vence amanhã", tone: "warning", days };
  if (days <= 3)
    return { text: `Vence em ${days} dias`, tone: "warning", days };
  return { text: `Vence ${shortDateLabel(dueOn)}`, tone: "neutral", days };
}

/** Bold the figure of an insight ("32% menos", "45% acima"): [before, figure, after]. */
export function splitInsight(text: string): [string, string, string] {
  const match = /\d+% (?:menos|acima)/.exec(text);
  if (!match) return [text, "", ""];
  return [
    text.slice(0, match.index),
    match[0],
    text.slice(match.index + match[0].length),
  ];
}
