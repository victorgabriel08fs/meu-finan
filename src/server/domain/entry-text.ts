// "Lançamento por texto" (doc 02 §6.5): reads a phrase like "café 12 no
// nubank ontem #viagem" against the person's own accounts, history and tags.
// Nothing is saved except tags the phrase names (created or restored, like
// the Enter of the tag picker); the form still saves the entry. The text is
// financial data: never logged.
import { type EntryTextAccount, parseEntryText } from "@/lib/entry-text/parse";
import {
  MAX_ACTIVE_TAGS,
  MAX_TAGS_PER_ENTRY,
  TAG_NAME_MAX,
} from "@/lib/tags/name";
import { listAccounts } from "./accounts";
import { loadCategorySuggester } from "./category-suggest";
import type { UserContext } from "./context";
import { DomainError } from "./errors";
import { ensureTag } from "./tags";

export const TEXT_ENTRY_OFF =
  "O lançamento por texto está desativado no momento.";

export type EntryTextKind = "expense" | "income";

export type EntryTextResult = {
  amountCents: number | null;
  /** `YYYY-MM-DD`. */
  occurredOn: string | null;
  accountId: string | null;
  categoryId: string | null;
  description: string;
  tags: { id: string; name: string }[];
  /** A term after "no/na/em" that matched no account (the form says which one it used). */
  unmatchedAccount: string | null;
  /** Ready-to-show pt-BR lines about what could not be filled. */
  warnings: string[];
  /** Some tag was created or restored: the pages' tag lists are stale. */
  tagsChanged: boolean;
};

export async function interpretEntryText(
  ctx: UserContext,
  input: { text: string; kind: EntryTextKind },
): Promise<EntryTextResult> {
  const accounts: EntryTextAccount[] = (await listAccounts(ctx.userId)).map(
    ({ id, name }) => ({ id, name }),
  );
  const parsed = parseEntryText(input.text, { today: ctx.today, accounts });
  const warnings: string[] = [];

  if (parsed.amountCents === null) {
    warnings.push("Não encontrei o valor: digite no teclado.");
  }
  if (parsed.ambiguousAccount !== null) {
    warnings.push(
      `Mais de uma conta combina com “${parsed.ambiguousAccount}”. Escolha a conta abaixo.`,
    );
  }
  if (parsed.droppedTags.tooMany > 0) {
    warnings.push(
      `Cabem ${MAX_TAGS_PER_ENTRY} etiquetas por lançamento; as outras ficaram de fora.`,
    );
  }
  for (const name of parsed.droppedTags.tooLong) {
    warnings.push(
      `“${name}” passa de ${TAG_NAME_MAX} caracteres e ficou de fora.`,
    );
  }

  let categoryId: string | null = null;
  if (parsed.description !== "") {
    const suggest = await loadCategorySuggester(ctx.userId, input.kind);
    categoryId =
      suggest(parsed.description, input.kind, parsed.accountId ?? "")
        ?.categoryId ?? null;
  }

  // One at a time: each `ensureTag` runs its own transaction.
  const tags: { id: string; name: string }[] = [];
  let tagsChanged = false;
  for (const name of parsed.tagNames) {
    try {
      const tag = await ensureTag(ctx.userId, name);
      tags.push({ id: tag.id, name: tag.name });
      if (tag.created || tag.restored) tagsChanged = true;
      if (tag.restored) {
        warnings.push(`A etiqueta “${tag.name}” estava arquivada e voltou.`);
      }
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      warnings.push(
        `Você chegou a ${MAX_ACTIVE_TAGS} etiquetas: “${name}” não foi criada. Arquive alguma em Ajustes › Etiquetas.`,
      );
    }
  }

  return {
    amountCents: parsed.amountCents,
    occurredOn: parsed.occurredOn,
    accountId: parsed.accountId,
    categoryId,
    description: parsed.description,
    tags,
    unmatchedAccount: parsed.unmatchedAccount,
    warnings,
    tagsChanged,
  };
}
