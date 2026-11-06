/**
 * What counts as "dinheiro para gastar" (doc 03 §12): the Saldo em contas, its
 * change in the month, the forecast, the Fluxo de caixa and the daily notices
 * all read the same rule. Cards owe money and a caixinha sets it aside, so
 * neither is spendable; the net worth counts both.
 */
export const NON_SPENDABLE_ACCOUNT_TYPES = [
  "credit_card",
  "savings_box",
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
