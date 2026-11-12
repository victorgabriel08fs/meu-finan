// Limits of the shared finances (ADR-13, doc 01 §11.11), shared by the
// Server Actions, the domain and the screens.

/** People in a group, counting the active ones and the pending invites. */
export const MAX_GROUP_MEMBERS = 6;

/** An invite can be answered for this many days. */
export const INVITE_TTL_DAYS = 14;

/** Expenses added in one go ("Adicionar 12 despesas"). */
export const MAX_EXPENSES_PER_ADD = 100;

export const GROUP_NAME_MAX = 40;

export const EXPENSE_DESCRIPTION_MAX = 80;

/** E-mails one person can invite per day (any group). */
export const INVITES_PER_DAY = 20;

/** Invites to the same e-mail by the same person in 30 days. */
export const INVITES_PER_PAIR = 3;
export const INVITE_PAIR_WINDOW_DAYS = 30;

/** The weight of one person in "Cotas": 1 to 9. */
export const MAX_SPLIT_WEIGHT = 9;
