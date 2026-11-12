// The texts of a shared box (doc 02 §6.18, the plural of §6.10), pure: the
// projection sentence of the whole box and each member's line. Amounts are
// segments marked `money`, so the screens hide them in the privacy mode.
import { formatMoneyShort, monthYearLabel } from "@/components/charts/format";
import { deadlineMonth, type Segment } from "@/components/planning/goals/model";
import type { GoalProjection, YearMonth } from "@/lib/finance";

export const boxesHref = (groupId: string) =>
  `/compartilhado/${groupId}/caixinhas`;
export const boxHref = (groupId: string, boxId: string) =>
  `${boxesHref(groupId)}/${boxId}`;

const monthsLabel = (count: number) =>
  count === 1 ? "1 mês" : `${count} meses`;

/** The line under a shared box, for everyone together. */
export function boxProjectionSentence(input: {
  projection: GoalProjection | null;
  monthlyCents: number;
  savedCents: number;
  targetDate: string | null;
}): Segment[] {
  const { projection, monthlyCents, savedCents } = input;
  const deadline: YearMonth | null = deadlineMonth(input.targetDate);
  if (!projection) {
    return monthlyCents > 0
      ? [
          { text: "Sem objetivo. Juntos, vocês guardam " },
          { text: formatMoneyShort(monthlyCents), strong: true, money: true },
          { text: "/mês", strong: true },
          { text: "." },
        ]
      : savedCents > 0
        ? [
            { text: "Sem objetivo: vocês já guardaram " },
            { text: formatMoneyShort(savedCents), strong: true, money: true },
            { text: "." },
          ]
        : [{ text: "Sem objetivo. Guardem quanto e quando quiserem." }];
  }
  const eta = projection.eta ? monthYearLabel(projection.eta) : "";
  switch (projection.status) {
    case "achieved":
      return [{ text: "Vocês chegaram ao objetivo! Que tal a próxima?" }];
    case "no_plan":
      return [
        {
          text: "Definam quanto cada um guarda por mês para ver quando chegam lá.",
        },
      ];
    case "ahead":
      return [
        { text: "Chegam em " },
        { text: eta, strong: true },
        {
          text: `, ${monthsLabel(projection.slackMonths ?? 0)} antes do prazo.`,
        },
      ];
    case "on_track":
      return [
        { text: "No ritmo de vocês, chegam lá em " },
        { text: eta, strong: true },
        { text: deadline ? ", dentro do prazo." : "." },
      ];
    case "behind": {
      const due = deadline ? monthYearLabel(deadline) : "o prazo";
      if (projection.requiredMonthlyCents === null) {
        return [
          {
            text: `O prazo de ${due} chegou. Ajustem o prazo ou o objetivo para seguir acompanhando.`,
          },
        ];
      }
      return [
        { text: `Para chegar em ${due}, vocês precisam guardar ` },
        {
          text: formatMoneyShort(projection.requiredMonthlyCents),
          strong: true,
          money: true,
        },
        { text: "/mês", strong: true },
        { text: " (hoje: " },
        monthlyCents > 0
          ? { text: formatMoneyShort(monthlyCents), money: true }
          : { text: "nada planejado" },
        { text: ")." },
      ];
    }
  }
}

/** "R$ 2.900 de R$ 8.000" or, without a target, "R$ 2.900 guardados". */
export function savedOfTarget(
  savedCents: number,
  targetCents: number | null,
): Segment[] {
  return targetCents === null
    ? [
        { text: formatMoneyShort(savedCents), money: true },
        { text: " guardados" },
      ]
    : [
        { text: formatMoneyShort(savedCents), money: true },
        { text: " de " },
        { text: formatMoneyShort(targetCents), money: true },
      ];
}

/** The box's own screen: "R$ 2.900 guardados de R$ 8.000". */
export function heroSaved(
  savedCents: number,
  targetCents: number | null,
): Segment[] {
  const saved: Segment = { text: formatMoneyShort(savedCents), money: true };
  return targetCents === null
    ? [saved, { text: " guardados" }]
    : [
        saved,
        { text: " guardados de " },
        { text: formatMoneyShort(targetCents), money: true },
      ];
}

export type BoxMemberLine = {
  name: string;
  isMe: boolean;
  savedCents: number;
  monthlyPlanCents: number;
  shareCents: number | null;
  missingCents: number | null;
  projection: GoalProjection | null;
};

export type BoxMemberFact = { label: string; text: string; money: boolean };

/**
 * What the "Quem guarda" row shows under the name, one label and value each
 * ("Guardou R$ 1.800", "Por mês R$ 400", "Sua parte R$ 4.000", "Falta
 * R$ 2.200"), and, apart, when the person gets there ("mai/2027"). Whole
 * values drop the ",00", like the rest of the screen.
 */
export function memberFacts(member: BoxMemberLine): {
  facts: BoxMemberFact[];
  eta: string | null;
} {
  const facts: BoxMemberFact[] = [
    {
      label: "Guardou",
      text: formatMoneyShort(member.savedCents),
      money: true,
    },
    member.monthlyPlanCents > 0
      ? {
          label: "Por mês",
          text: formatMoneyShort(member.monthlyPlanCents),
          money: true,
        }
      : { label: "Por mês", text: "sem plano", money: false },
  ];
  let eta: string | null = null;
  if (member.shareCents !== null) {
    facts.push({
      label: member.isMe ? "Sua parte" : "Parte",
      text: formatMoneyShort(member.shareCents),
      money: true,
    });
    if (member.missingCents !== null && member.missingCents > 0) {
      facts.push({
        label: "Falta",
        text: formatMoneyShort(member.missingCents),
        money: true,
      });
      if (member.projection?.eta) eta = monthYearLabel(member.projection.eta);
    } else if (member.shareCents > 0) {
      facts.push({ label: "Parte", text: "completa", money: false });
    }
  }
  return { facts, eta };
}

/** Plain text of segments (tests, accessible names). */
export const segmentsText = (segments: readonly Segment[]) =>
  segments.map((segment) => segment.text).join("");

export type MonthEntries<T> = { month: string; entries: T[] };

/** Entries (newest first) grouped by their `YYYY-MM`, newest month first. */
export function entriesByMonth<T extends { occurredOn: string }>(
  entries: readonly T[],
): MonthEntries<T>[] {
  const months = new Map<string, T[]>();
  for (const entry of entries) {
    const month = entry.occurredOn.slice(0, 7);
    months.set(month, [...(months.get(month) ?? []), entry]);
  }
  return [...months].map(([month, list]) => ({ month, entries: list }));
}

/** "Ana guardou R$ 500,00" / "Você resgatou R$ 200,00" (the history). */
export function entryLine(entry: {
  name: string;
  mine: boolean;
  amountCents: number;
}): { before: string; amountCents: number } {
  const who = entry.mine ? "Você" : entry.name;
  const verb = entry.amountCents > 0 ? "guardou" : "resgatou";
  return {
    before: `${who} ${verb} `,
    amountCents: Math.abs(entry.amountCents),
  };
}

/** Basis points as a percent field shows them: 6000 → 60; 3333 → 33,33. */
export const percentText = (basisPoints: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(
    basisPoints / 100,
  );
