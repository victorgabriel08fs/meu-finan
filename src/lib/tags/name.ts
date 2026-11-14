/**
 * Tag names (task 18). Pure: no I/O. A name is free text up to 30 characters;
 * two names are the same tag when they match ignoring case and accents, like
 * the `tags_user_name_key` index (`f_unaccent(lower(name))`).
 */
import { foldText } from "@/lib/format/search";

export const TAG_NAME_MAX = 30;
export const MAX_TAGS_PER_ENTRY = 10;
export const MAX_ACTIVE_TAGS = 100;

/** Drops a leading `#`, trims and collapses repeated spaces; keeps the case typed. */
export function normalizeTagName(raw: string): string {
  return raw.trim().replace(/^#+/, "").replace(/\s+/g, " ").trim();
}

/** The comparison key: normalized, lowercase, without accents. */
export function tagKey(name: string): string {
  return foldText(normalizeTagName(name));
}

/** The tag whose name matches `name` ignoring case and accents. */
export function findByKey<T extends { name: string }>(
  tags: readonly T[],
  name: string,
): T | undefined {
  const key = tagKey(name);
  if (key === "") return undefined;
  return tags.find((tag) => tagKey(tag.name) === key);
}

/** Tags whose name contains the query, ignoring case and accents. */
export function filterTags<T extends { name: string }>(
  tags: readonly T[],
  query: string,
): T[] {
  const needle = tagKey(query);
  if (needle === "") return [...tags];
  return tags.filter((tag) => tagKey(tag.name).includes(needle));
}

/** Tags in name order (pt-BR, ignoring case and accents). */
export function sortTags<T extends { name: string }>(tags: readonly T[]): T[] {
  return [...tags].sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }),
  );
}
