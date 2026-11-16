import { MAX_TAGS_PER_ENTRY } from "@/lib/tags/name";
import type { EntryTextResult } from "@/server/domain/entry-text";
import type { EntryKind, QuickAddDraft } from "@/stores/quick-add";
import { centsToExpression } from "./calculator";

/**
 * Pure rules of "Lançamento por texto" (doc 02 §6.5): how the server's reading
 * of a phrase merges into the draft, and what to tell the person.
 */

/** What of the form the phrase filled. */
export type Filled = {
  amount: boolean;
  description: boolean;
  account: boolean;
  date: boolean;
  category: boolean;
  tags: number;
};

export type AppliedText = {
  patch: Partial<QuickAddDraft>;
  filled: Filled;
  /** The result's own warnings plus the ones the merge adds. */
  warnings: string[];
};

type Choices = {
  /** Categories of the open type. */
  categoryIds: ReadonlySet<string>;
  accountIds: ReadonlySet<string>;
  /** The account the form will use when the text names none. */
  currentAccountName?: string;
};

const TAGS_OVERFLOW = `Cabem ${MAX_TAGS_PER_ENTRY} etiquetas por lançamento; as outras ficaram de fora.`;

/**
 * What was written wins over the draft; the category, which was inferred and
 * not typed, only fills an empty choice; tags join the ones already chosen.
 */
export function applyTextResult(
  draft: QuickAddDraft,
  result: EntryTextResult,
  kind: Exclude<EntryKind, "transfer">,
  { categoryIds, accountIds, currentAccountName }: Choices,
): AppliedText {
  const patch: Partial<QuickAddDraft> = {};
  const filled: Filled = {
    amount: false,
    description: false,
    account: false,
    date: false,
    category: false,
    tags: 0,
  };
  const warnings = [...result.warnings];

  if (result.amountCents !== null && result.amountCents > 0) {
    patch.expression = centsToExpression(result.amountCents);
    filled.amount = true;
  }
  if (result.description !== "") {
    patch.description = result.description;
    filled.description = true;
  }
  if (result.accountId !== null && accountIds.has(result.accountId)) {
    patch.accountId = result.accountId;
    filled.account = true;
  }
  if (result.unmatchedAccount !== null && !filled.account) {
    warnings.push(
      currentAccountName
        ? `Não achei a conta “${result.unmatchedAccount}”. Usei ${currentAccountName}.`
        : `Não achei a conta “${result.unmatchedAccount}”.`,
    );
  }
  if (result.occurredOn !== null) {
    patch.date = result.occurredOn;
    patch.paid = null;
    filled.date = true;
  }

  const current =
    kind === "income" ? draft.incomeCategoryId : draft.expenseCategoryId;
  if (
    current === null &&
    result.categoryId !== null &&
    categoryIds.has(result.categoryId)
  ) {
    if (kind === "income") {
      patch.incomeCategoryId = result.categoryId;
      patch.suggestedIncomeCategoryId = result.categoryId;
    } else {
      patch.expenseCategoryId = result.categoryId;
      patch.suggestedExpenseCategoryId = result.categoryId;
    }
    filled.category = true;
  }

  if (result.tags.length > 0) {
    const merged = [
      ...new Set([...draft.tagIds, ...result.tags.map((tag) => tag.id)]),
    ];
    patch.tagIds = merged.slice(0, MAX_TAGS_PER_ENTRY);
    if (merged.length > MAX_TAGS_PER_ENTRY) warnings.push(TAGS_OVERFLOW);
    const kept = new Set(patch.tagIds);
    filled.tags = result.tags.filter((tag) => kept.has(tag.id)).length;
  }

  return { patch, filled, warnings };
}

/** "a, b e c". */
function list(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

/** "Preenchido: valor, conta e 2 etiquetas. Confira antes de salvar." */
export function filledSummary(filled: Filled): string {
  const parts = [
    filled.amount ? "valor" : null,
    filled.description ? "descrição" : null,
    filled.account ? "conta" : null,
    filled.date ? "data" : null,
    filled.category ? "categoria" : null,
    filled.tags > 0
      ? `${filled.tags} ${filled.tags === 1 ? "etiqueta" : "etiquetas"}`
      : null,
  ].filter((part): part is string => part !== null);
  if (filled.description && parts.length === 1) {
    return "Só a descrição foi preenchida. Digite o valor.";
  }
  if (parts.length === 0) return "Não encontrei nada para preencher.";
  return `Preenchido: ${list(parts)}. Confira antes de salvar.`;
}
