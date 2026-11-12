// What the screens of Compartilhado (doc 02 §6.18) compute on the client,
// pure: the split editor's state and its result, and the presets for
// "Lançar no meu extrato". The server splits again on every save.
import {
  allocate,
  PERCENT_TOTAL,
  type SplitInput,
  type SplitMethod,
  type SplitResult,
  splitExpense,
} from "@/lib/finance/split";
import type { QuickAddDraft } from "@/stores/quick-add";

export type SplitMember = { id: string; name: string; isMe: boolean };

/** The editor's state: one input per active member, by member id. */
export type SplitDraft = {
  method: SplitMethod;
  inputs: Record<string, number>;
};

/** Each method's starting inputs: everyone in, equal parts. */
export function defaultInputs(
  method: SplitMethod,
  members: readonly SplitMember[],
  totalCents: number | null,
): Record<string, number> {
  const ones = members.map(() => 1);
  if (members.length === 0) return {};
  const values =
    method === "percent"
      ? allocate(PERCENT_TOTAL, ones)
      : method === "amounts"
        ? totalCents && totalCents > 0
          ? allocate(totalCents, ones)
          : members.map(() => 0)
        : ones;
  return Object.fromEntries(
    members.map((member, index) => [member.id, values[index] ?? 0]),
  );
}

/** The group's default (members it does not know take the method's default). */
export function initialDraft(
  members: readonly SplitMember[],
  saved: { method: SplitMethod; inputs: Record<string, number> } | null,
  totalCents: number | null,
): SplitDraft {
  if (!saved || saved.method === "amounts") {
    return {
      method: "equal",
      inputs: defaultInputs("equal", members, totalCents),
    };
  }
  const base = defaultInputs(saved.method, members, totalCents);
  const known = members.every((member) => member.id in saved.inputs);
  return {
    method: saved.method,
    inputs: known
      ? Object.fromEntries(
          members.map((member) => [member.id, saved.inputs[member.id] ?? 0]),
        )
      : base,
  };
}

export function draftInputs(
  draft: SplitDraft,
  members: readonly SplitMember[],
): SplitInput[] {
  return members.map((member) => ({
    memberId: member.id,
    value: draft.inputs[member.id] ?? 0,
  }));
}

/** The split as the server will compute it, or null without a total yet. */
export function previewSplit(
  totalCents: number | null,
  draft: SplitDraft,
  members: readonly SplitMember[],
): SplitResult | null {
  if (totalCents === null || totalCents <= 0) return null;
  return splitExpense(totalCents, draft.method, draftInputs(draft, members));
}

/** Basis points as typed in the field: 6000 → 60; 3333 → 33,33. */
export const percentFromBasisPoints = (basisPoints: number) =>
  basisPoints / 100;

/** 33,33 → 3333 basis points (whole). */
export const basisPointsFromPercent = (percent: number) =>
  Math.round(percent * 100);

/** The keypad's expression for an amount: "120", "35,50" (no thousands separator). */
export function calculatorExpression(cents: number): string {
  const reais = Math.floor(cents / 100);
  const rest = cents % 100;
  return rest === 0
    ? String(reais)
    : `${reais},${String(rest).padStart(2, "0")}`;
}

/** "Lançar no meu extrato": a Nova transação filled in. */
export function quickAddPreset(input: {
  amountCents: number;
  description: string;
  date: string;
}): Partial<QuickAddDraft> {
  return {
    expression: calculatorExpression(input.amountCents),
    description: input.description,
    date: input.date,
  };
}
