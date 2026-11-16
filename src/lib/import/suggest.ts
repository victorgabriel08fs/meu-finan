/**
 * Suggested category for an imported row, learned from the owner's own
 * entries: a rule for exactly this merchant first, then entries with the same
 * description key, then a rule contained in the description, then the most
 * similar description. A short learned rule ("uber") so never overrides the
 * history of a longer description ("uber eats").
 */
import { descriptionKey } from "./text";

export type EntryKind = "income" | "expense";

/** Past entries grouped by description and category. */
export type HistoryEntry = {
  description: string;
  kind: EntryKind;
  categoryId: string;
  /** How many entries used this description with this category. */
  uses: number;
  /** Most recent date (ISO) among them. */
  lastUsedOn: string;
};

/** A row of categorization_rules (pattern: lowercase, without accents). */
export type CategoryRule = {
  pattern: string;
  kind: EntryKind;
  categoryId: string;
  /** Only for this account, when set. */
  accountId: string | null;
  hits: number;
};

export type Suggestion = {
  categoryId: string;
  source: "rule" | "history" | "similar";
};

export type CategorySuggester = (
  description: string,
  kind: EntryKind,
  accountId: string,
) => Suggestion | null;

/** Words that say how the money moved, not to whom. */
const STOP_WORDS = new Set([
  "compra",
  "compras",
  "pagamento",
  "pagto",
  "pgto",
  "pag",
  "pix",
  "ted",
  "doc",
  "tev",
  "transf",
  "transferencia",
  "enviado",
  "enviada",
  "recebido",
  "recebida",
  "cartao",
  "credito",
  "debito",
  "deb",
  "cred",
  "visa",
  "master",
  "mastercard",
  "elo",
  "electron",
  "maestro",
  "nacional",
  "internacional",
  "parcela",
  "parc",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "para",
  "em",
  "no",
  "na",
  "com",
  "br",
  "bra",
  "brasil",
  "sao",
  "paulo",
  "rio",
  "janeiro",
  "ltda",
  "me",
  "sa",
  "eireli",
  "epp",
  "www",
]);

/** Minimum similarity for a "similar" suggestion (Dice + first-word bonus). */
const SIMILARITY_THRESHOLD = 0.65;
const FIRST_WORD_BONUS = 0.1;

const significantTokens = (key: string) =>
  key.split(" ").filter((token) => token !== "" && !STOP_WORDS.has(token));

/**
 * What identifies the merchant: the description key without stop words
 * ("UBER *TRIP 12/10 SAO PAULO" → "uber trip"), or the whole key when only
 * stop words are left ("PAGAMENTO").
 */
export function merchantKey(description: string): string {
  const key = descriptionKey(description);
  const tokens = significantTokens(key);
  return tokens.length > 0 ? tokens.join(" ") : key;
}

/** Shortest description key a learned rule may have. */
export const MIN_PATTERN_LENGTH = 3;

/**
 * The pattern a rule learned from this description would have: its whole key
 * (rules match whole words of the full key, so stop words in the middle stay),
 * or null when it is too short or only says how the money moved ("pix",
 * "pagamento"), which would catch unrelated rows.
 */
export function learnablePattern(description: string): string | null {
  const key = descriptionKey(description);
  if (key.length < MIN_PATTERN_LENGTH) return null;
  return significantTokens(key).length > 0 ? key : null;
}

/** "replace": the person picked another category; "confirm": kept it. */
export type RuleLearning = { pattern: string; mode: "replace" | "confirm" };

/**
 * What saving an entry teaches, given the category the form filled in by
 * itself: nothing without a suggestion, a category or a learnable description.
 */
export function ruleLearning(input: {
  description: string | undefined;
  categoryId: string | null;
  suggestedCategoryId: string | null | undefined;
}): RuleLearning | null {
  const description = input.description?.trim();
  if (!description || !input.categoryId || !input.suggestedCategoryId) {
    return null;
  }
  const pattern = learnablePattern(description);
  if (!pattern) return null;
  return {
    pattern,
    mode:
      input.categoryId === input.suggestedCategoryId ? "confirm" : "replace",
  };
}

type Choice = { categoryId: string; uses: number; lastUsedOn: string };

const better = (a: Choice, b: Choice) =>
  a.uses !== b.uses ? a.uses > b.uses : a.lastUsedOn > b.lastUsedOn;

type Known = { kind: EntryKind; tokens: string[]; choice: Choice };

export function createCategorySuggester(
  history: readonly HistoryEntry[],
  rules: readonly CategoryRule[] = [],
): CategorySuggester {
  // kind|key → category → uses: one description may have had several.
  const groups = new Map<string, Map<string, Choice>>();
  for (const entry of history) {
    const key = merchantKey(entry.description);
    if (key === "") continue;
    const groupKey = `${entry.kind}|${key}`;
    const byCategory = groups.get(groupKey) ?? new Map<string, Choice>();
    const current = byCategory.get(entry.categoryId);
    byCategory.set(entry.categoryId, {
      categoryId: entry.categoryId,
      uses: (current?.uses ?? 0) + entry.uses,
      lastUsedOn:
        current && current.lastUsedOn > entry.lastUsedOn
          ? current.lastUsedOn
          : entry.lastUsedOn,
    });
    groups.set(groupKey, byCategory);
  }

  const exact = new Map<string, Choice>();
  const known: Known[] = [];
  const byToken = new Map<string, number[]>();
  for (const [groupKey, byCategory] of groups) {
    let choice: Choice | null = null;
    for (const candidate of byCategory.values()) {
      if (!choice || better(candidate, choice)) choice = candidate;
    }
    if (!choice) continue;
    exact.set(groupKey, choice);
    const [kind, key = ""] = groupKey.split("|") as [EntryKind, string];
    const tokens = significantTokens(key);
    if (tokens.length === 0) continue;
    const index = known.push({ kind, tokens, choice }) - 1;
    for (const token of new Set(tokens)) {
      const list = byToken.get(`${kind}|${token}`) ?? [];
      list.push(index);
      byToken.set(`${kind}|${token}`, list);
    }
  }

  const ruleKeys = rules
    .map((rule) => ({
      ...rule,
      key: descriptionKey(rule.pattern),
      merchant: merchantKey(rule.pattern),
    }))
    .filter((rule) => rule.key !== "");

  type RuleKey = (typeof ruleKeys)[number];
  const applies = (rule: RuleKey, kind: EntryKind, accountId: string) =>
    rule.kind === kind &&
    (rule.accountId === null || rule.accountId === accountId);

  return (description, kind, accountId) => {
    const full = descriptionKey(description);
    if (full === "") return null;
    const key = merchantKey(description);

    // 1. A rule for exactly this merchant: this account's, then most used.
    let exactRule: RuleKey | null = null;
    for (const candidate of ruleKeys) {
      if (!applies(candidate, kind, accountId) || candidate.merchant !== key) {
        continue;
      }
      const specific = candidate.accountId !== null;
      const current = exactRule?.accountId != null;
      if (
        !exactRule ||
        (specific && !current) ||
        (specific === current && candidate.hits > exactRule.hits)
      ) {
        exactRule = candidate;
      }
    }
    if (exactRule) return { categoryId: exactRule.categoryId, source: "rule" };

    // 2. The same description in the history.
    const same = exact.get(`${kind}|${key}`);
    if (same) return { categoryId: same.categoryId, source: "history" };

    // 3. A rule contained in the description, matching whole words of the
    // full key ("pix enviado joao" has "pix"): the longest, then most used.
    const padded = ` ${full} `;
    let rule: RuleKey | null = null;
    for (const candidate of ruleKeys) {
      if (!applies(candidate, kind, accountId)) continue;
      if (!padded.includes(` ${candidate.key} `)) continue;
      if (
        !rule ||
        candidate.key.length > rule.key.length ||
        (candidate.key.length === rule.key.length && candidate.hits > rule.hits)
      ) {
        rule = candidate;
      }
    }
    if (rule) return { categoryId: rule.categoryId, source: "rule" };

    // 4. The most similar description.
    const tokens = significantTokens(key);
    if (tokens.length === 0) return null;
    const own = new Set(tokens);
    const seen = new Set<number>();
    let best: { score: number; choice: Choice } | null = null;
    for (const token of own) {
      for (const index of byToken.get(`${kind}|${token}`) ?? []) {
        if (seen.has(index)) continue;
        seen.add(index);
        const other = known[index];
        if (!other) continue;
        const theirs = new Set(other.tokens);
        let shared = 0;
        for (const item of own) if (theirs.has(item)) shared += 1;
        const score =
          (2 * shared) / (own.size + theirs.size) +
          (other.tokens[0] === tokens[0] ? FIRST_WORD_BONUS : 0);
        if (
          score >= SIMILARITY_THRESHOLD &&
          (!best ||
            score > best.score ||
            (score === best.score && better(other.choice, best.choice)))
        ) {
          best = { score, choice: other.choice };
        }
      }
    }
    return best
      ? { categoryId: best.choice.categoryId, source: "similar" }
      : null;
  };
}
