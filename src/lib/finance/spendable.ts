/**
 * What counts as "dinheiro para gastar" (doc 03 §12): the Saldo em contas, its
 * change in the month, the forecast, the Fluxo de caixa and the daily notices
 * all read the same rule. Cards owe money, a caixinha sets it aside and a
 * benefício (vale-refeição, vale-alimentação) only pays for some things, so
 * none of them is spendable; the net worth counts cards and caixinhas, and a
 * benefício only when the person says so.
 */
export const NON_SPENDABLE_ACCOUNT_TYPES = [
  "credit_card",
  "savings_box",
  "benefit",
] as const;

type AccountFacts = {
  type: string;
  includeInNetWorth: boolean;
  archived: boolean;
};

export function isSpendableType(type: string): boolean {
  return !(NON_SPENDABLE_ACCOUNT_TYPES as readonly string[]).includes(type);
}

/** Spendable type, in the net worth and not archived. */
export function isSpendableAccount(account: AccountFacts): boolean {
  return (
    isSpendableType(account.type) &&
    account.includeInNetWorth &&
    !account.archived
  );
}

/** A caixinha that counts: in the net worth and not archived. */
export function isCountedSavingsBox(account: AccountFacts): boolean {
  return (
    account.type === "savings_box" &&
    account.includeInNetWorth &&
    !account.archived
  );
}

export function isBenefitType(type: string): boolean {
  return type === "benefit";
}

/**
 * A benefício with its own line in "Quanto dá para gastar por dia": not
 * archived, in the net worth or not (that switch only says whether it counts
 * as wealth).
 */
export function isBenefitAccount(account: AccountFacts): boolean {
  return isBenefitType(account.type) && !account.archived;
}

/** Whether an account of this type may pay a card's invoice: not a card, not a benefício. */
export function canPayInvoice(type: string): boolean {
  return type !== "credit_card" && !isBenefitType(type);
}

/**
 * Whether the Nova transação may open on an account of this type: not a
 * caixinha (money set aside) nor a benefício (it only pays for some things),
 * even when it was the last one used.
 */
export function isDefaultEntryType(type: string): boolean {
  return type !== "savings_box" && !isBenefitType(type);
}
