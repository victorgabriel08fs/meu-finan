/**
 * "Lançamento por texto" (doc 02 §6.5): turns a phrase like
 * "café 12 no nubank ontem #viagem" into the parts of an entry. Pure: no I/O.
 * Each part is taken out of the text in a fixed order (tags, account, date,
 * amount) and what is left is the description. Nothing here guesses a
 * category: that comes from the person's history, on the server.
 */
import {
  addDays,
  addMonths,
  atDay,
  dayOfWeek,
  daysInMonth,
  iso,
  type LocalDate,
} from "@/lib/finance";
import { foldText } from "@/lib/format/search";
import { MAX_DESCRIPTION_LENGTH } from "@/lib/import/text";
import {
  MAX_TAGS_PER_ENTRY,
  normalizeTagName,
  TAG_NAME_MAX,
  tagKey,
} from "@/lib/tags/name";

export type EntryTextAccount = { id: string; name: string };

export type ParsedEntryText = {
  amountCents: number | null;
  /** `YYYY-MM-DD`. */
  occurredOn: string | null;
  accountId: string | null;
  /** The term after "no/na/em…" that matched more than one account. */
  ambiguousAccount: string | null;
  /** The word after "no/na/em…" when no account matched it (it stays in the description). */
  unmatchedAccount: string | null;
  /** "" when nothing is left. */
  description: string;
  /** Unique by `tagKey`, at most 10, 1–30 characters, without "#". */
  tagNames: string[];
  droppedTags: { tooMany: number; tooLong: string[] };
};

/** Same limit as `amountCents` in src/server/actions/schemas.ts. */
export const MAX_AMOUNT_CENTS = 99_999_999_999;

const ACCOUNT_PREPOSITIONS = new Set(["no", "na", "em", "pelo", "pela"]);
const DATE_PREPOSITIONS = new Set(["no", "na", "em"]);
const EDGE_WORDS = new Set([
  "no",
  "na",
  "em",
  "de",
  "do",
  "da",
  "pelo",
  "pela",
  "por",
  "com",
  "e",
]);
const MAX_ACCOUNT_WORDS = 4;

// 0 = Sunday … 6 = Saturday, like `dayOfWeek`.
const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
  "segunda-feira": 1,
  "terca-feira": 2,
  "quarta-feira": 3,
  "quinta-feira": 4,
  "sexta-feira": 5,
};

type Token = { raw: string; fold: string; used: boolean };

function words(text: string): string[] {
  return foldText(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function sameWords(a: readonly string[], b: readonly string[], at = 0) {
  return b.length > 0 && b.every((word, index) => a[at + index] === word);
}

// ---------------------------------------------------------------- tags

function takeTags(tokens: Token[]) {
  const names: string[] = [];
  const keys = new Set<string>();
  const dropped = { tooMany: 0, tooLong: [] as string[] };
  for (const token of tokens) {
    if (!token.raw.startsWith("#")) continue;
    token.used = true;
    const name = normalizeTagName(
      token.raw.replace(/^#+/, "").replace(/[-_]+/g, " "),
    );
    if (name === "") continue;
    if ([...name].length > TAG_NAME_MAX) {
      if (!dropped.tooLong.includes(name)) dropped.tooLong.push(name);
      continue;
    }
    const key = tagKey(name);
    if (keys.has(key)) continue;
    if (names.length >= MAX_TAGS_PER_ENTRY) {
      dropped.tooMany += 1;
      keys.add(key);
      continue;
    }
    keys.add(key);
    names.push(name);
  }
  return { names, dropped };
}

// ------------------------------------------------------------- account

type AccountMatch = {
  accountId: string | null;
  ambiguous: string | null;
  start: number;
  length: number;
};

function matchAccount(
  tokens: Token[],
  accounts: readonly EntryTextAccount[],
): AccountMatch | null {
  const named = accounts.map((account) => ({
    id: account.id,
    words: words(account.name),
  }));
  for (let i = 0; i < tokens.length; i++) {
    const preposition = tokens[i];
    if (!preposition || preposition.used) continue;
    if (!ACCOUNT_PREPOSITIONS.has(preposition.fold)) continue;
    for (let size = MAX_ACCOUNT_WORDS; size >= 1; size--) {
      const slice = tokens.slice(i + 1, i + 1 + size);
      if (slice.length < size || slice.some((token) => token.used)) continue;
      const term = slice.flatMap((token) => words(token.raw));
      if (term.length === 0) continue;
      const levels = [
        named.filter(
          (a) => sameWords(a.words, term) && a.words.length === term.length,
        ),
        named.filter((a) => sameWords(a.words, term)),
        named.filter((a) =>
          a.words.some((_, at) => sameWords(a.words, term, at)),
        ),
      ];
      const found = levels.find((level) => level.length > 0);
      if (!found) continue;
      const only = found.length === 1 ? found[0] : undefined;
      return {
        accountId: only?.id ?? null,
        ambiguous: only ? null : slice.map((token) => token.raw).join(" "),
        start: i,
        length: size + 1,
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------- date

type DateMatch = { date: LocalDate; start: number; length: number };

function previousOrSameWeekday(
  today: LocalDate,
  target: number,
  strict: boolean,
) {
  let back = (dayOfWeek(today) - target + 7) % 7;
  if (strict && back === 0) back = 7;
  return addDays(today, -back);
}

function dayOfMonth(today: LocalDate, day: number): LocalDate | null {
  if (day < 1 || day > 31) return null;
  const month =
    day <= today.day
      ? { year: today.year, month: today.month }
      : addMonths(today, -1);
  if (day > daysInMonth(month.year, month.month)) return null;
  return atDay(month.year, month.month, day);
}

function explicitDate(token: string, today: LocalDate): LocalDate | null {
  const match = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}|\d{2}))?$/.exec(token);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = match[3]
    ? match[3].length === 2
      ? 2000 + Number(match[3])
      : Number(match[3])
    : today.year;
  if (month < 1 || month > 12 || year < 1900 || year > 2200) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

function dateAt(
  tokens: Token[],
  i: number,
  today: LocalDate,
): DateMatch | null {
  const token = tokens[i];
  const next = tokens[i + 1];
  const free = (candidate: Token | undefined): candidate is Token =>
    candidate !== undefined && !candidate.used;
  if (!token || token.used) return null;
  const fold = token.fold;
  if (fold === "hoje") return { date: today, start: i, length: 1 };
  if (fold === "ontem")
    return { date: addDays(today, -1), start: i, length: 1 };
  if (fold === "anteontem") {
    return { date: addDays(today, -2), start: i, length: 1 };
  }
  if (fold === "dia" && free(next) && /^\d{1,2}$/.test(next.fold)) {
    const date = dayOfMonth(today, Number(next.fold));
    return date ? { date, start: i, length: 2 } : null;
  }
  const explicit = explicitDate(fold, today);
  if (explicit) return { date: explicit, start: i, length: 1 };
  const weekday = Object.hasOwn(WEEKDAYS, fold) ? WEEKDAYS[fold] : undefined;
  if (weekday !== undefined) {
    let length = 1;
    if (!fold.endsWith("-feira") && free(next) && next.fold === "feira") {
      length += 1;
    }
    const after = tokens[i + length];
    const past =
      free(after) && (after.fold === "passada" || after.fold === "passado");
    if (past) length += 1;
    return {
      date: previousOrSameWeekday(today, weekday, past),
      start: i,
      length,
    };
  }
  return null;
}

function matchDate(tokens: Token[], today: LocalDate): DateMatch | null {
  for (let i = 0; i < tokens.length; i++) {
    const found = dateAt(tokens, i, today);
    if (!found) continue;
    const before = tokens[i - 1];
    if (before && !before.used && DATE_PREPOSITIONS.has(before.fold)) {
      return { ...found, start: i - 1, length: found.length + 1 };
    }
    return found;
  }
  return null;
}

// -------------------------------------------------------------- amount

type AmountCandidate = {
  index: number;
  length: number;
  cents: number | null;
  rank: number;
};

/** Cents of a plain number token, or null when it is not an amount. */
export function parseAmountToken(text: string): {
  cents: number | null;
  decimal: boolean;
} | null {
  const grouped = /^(\d{1,3}(?:\.\d{3})+)(?:,(\d{1,2}))?$/.exec(text);
  const plain = grouped ? null : /^(\d+)(?:[,.](\d{1,2}))?$/.exec(text);
  const match = grouped ?? plain;
  if (!match) return null;
  let integer = (match[1] ?? "").replaceAll(".", "");
  const fraction = match[2] ?? "";
  const decimal = fraction !== "";
  integer = integer.replace(/^0+(?=\d)/, "");
  if (integer.length > 12) return { cents: null, decimal };
  const cents = Number(integer) * 100 + Number(fraction.padEnd(2, "0"));
  if (cents < 1 || cents > MAX_AMOUNT_CENTS) return { cents: null, decimal };
  return { cents, decimal };
}

function matchAmount(tokens: Token[]): AmountCandidate | null {
  const candidates: AmountCandidate[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token || token.used) continue;
    let text = token.fold;
    let length = 1;
    let marked = false;
    if (text.startsWith("r$")) {
      marked = true;
      text = text.slice(2);
      if (text === "") {
        const next = tokens[i + 1];
        if (!next || next.used) continue;
        text = next.fold;
        length = 2;
      }
    }
    const parsed = parseAmountToken(text);
    if (!parsed) continue;
    if (!marked) {
      const after = tokens[i + length];
      if (
        after &&
        !after.used &&
        (after.fold === "reais" || after.fold === "real")
      ) {
        marked = true;
        length += 1;
      }
    }
    candidates.push({
      index: i,
      length,
      cents: parsed.cents,
      rank: marked ? 2 : parsed.decimal ? 1 : 0,
    });
  }
  let best: AmountCandidate | null = null;
  for (const candidate of candidates) {
    if (!best || candidate.rank >= best.rank) best = candidate;
  }
  return best;
}

// ------------------------------------------------------------ the rest

function consume(tokens: Token[], start: number, length: number) {
  for (let i = start; i < start + length; i++) {
    const token = tokens[i];
    if (token) token.used = true;
  }
}

function buildDescription(tokens: Token[]): string {
  const rest = tokens.filter((token) => !token.used);
  while (rest[0] && EDGE_WORDS.has(rest[0].fold)) rest.shift();
  while (rest.length > 0 && EDGE_WORDS.has(rest[rest.length - 1]?.fold ?? "")) {
    rest.pop();
  }
  const text = rest.map((token) => token.raw).join(" ");
  return [...text].slice(0, MAX_DESCRIPTION_LENGTH).join("").trim();
}

/** What follows the first loose "no/na/em…" left over after everything else was read. */
/**
 * Words that name a way to pay: after "no/na/em…" they are meant as an
 * account even when none matches, so the person hears about it. Anything
 * else ("na praia", "no shopping") is just part of the description.
 */
const PAYMENT_WORDS = new Set([
  "banco",
  "bb",
  "bradesco",
  "c6",
  "caixa",
  "carteira",
  "cartao",
  "conta",
  "credito",
  "debito",
  "dinheiro",
  "inter",
  "itau",
  "mercadopago",
  "neon",
  "next",
  "nubank",
  "nu",
  "pagbank",
  "pagseguro",
  "picpay",
  "pix",
  "poupanca",
  "santander",
  "sicoob",
  "sicredi",
  "vale",
  "xp",
]);

/** At most one letter added, removed or changed ("nubnak" is not, "nubak" is). */
function nearlyEqual(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length
    ? a.slice(i + 1) === b.slice(i)
    : a.slice(i) === b.slice(i + 1);
}

/** The term reads like an account: a way to pay or a near miss of an account's word. */
function looksLikeAccount(
  term: string,
  accounts: readonly EntryTextAccount[],
): boolean {
  if (PAYMENT_WORDS.has(term)) return true;
  if (term.length < 4) return false;
  return accounts.some((account) =>
    words(account.name).some(
      (word) => word.length >= 4 && nearlyEqual(word, term),
    ),
  );
}

function unmatchedTerm(
  tokens: Token[],
  accounts: readonly EntryTextAccount[],
): string | null {
  for (let i = 0; i < tokens.length - 1; i++) {
    const token = tokens[i];
    const next = tokens[i + 1];
    if (!token || token.used || !ACCOUNT_PREPOSITIONS.has(token.fold)) continue;
    if (!next || next.used) continue;
    const term = words(next.raw).join("");
    if (term !== "" && looksLikeAccount(term, accounts))
      return next.raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  }
  return null;
}

export function parseEntryText(
  text: string,
  context: { today: LocalDate; accounts: readonly EntryTextAccount[] },
): ParsedEntryText {
  const tokens: Token[] = text
    .split(/\s+/)
    .filter(Boolean)
    .map((raw) => ({ raw, fold: foldText(raw), used: false }));

  const tags = takeTags(tokens);

  let accountId: string | null = null;
  let ambiguousAccount: string | null = null;
  const account = matchAccount(tokens, context.accounts);
  if (account) {
    accountId = account.accountId;
    ambiguousAccount = account.ambiguous;
    consume(tokens, account.start, account.length);
  }

  let occurredOn: string | null = null;
  const date = matchDate(tokens, context.today);
  if (date) {
    occurredOn = iso(date.date);
    consume(tokens, date.start, date.length);
  }

  let amountCents: number | null = null;
  const amount = matchAmount(tokens);
  if (amount?.cents != null) {
    amountCents = amount.cents;
    consume(tokens, amount.index, amount.length);
  }

  const unmatchedAccount = account
    ? null
    : unmatchedTerm(tokens, context.accounts);

  return {
    amountCents,
    occurredOn,
    accountId,
    ambiguousAccount,
    unmatchedAccount,
    description: buildDescription(tokens),
    tagNames: tags.names,
    droppedTags: tags.dropped,
  };
}
