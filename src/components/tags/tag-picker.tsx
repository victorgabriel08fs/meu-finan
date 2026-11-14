"use client";

import { Plus } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { type KeyboardEvent, useId, useState } from "react";
import { ChoiceChip } from "@/components/quick-add/choice-chip";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import {
  filterTags,
  findByKey,
  MAX_TAGS_PER_ENTRY,
  normalizeTagName,
  sortTags,
  TAG_NAME_MAX,
} from "@/lib/tags/name";
import { createTagAction } from "@/server/actions/tags";

export type PickerTag = { id: string; name: string; archived?: boolean };

/** Above this many active tags the field also filters the chips. */
const FILTER_THRESHOLD = 8;
const NETWORK_ERROR = "Não conseguimos salvar. Verifique a conexão.";

type TagPickerProps = {
  /** The active tags, plus archived ones already on the entry. */
  tags: readonly PickerTag[];
  selected: readonly string[];
  onChange: (ids: string[]) => void;
};

/**
 * "Etiquetas" of an entry (task 18; doc 02 §6.5, §6.6): toggle chips, up to ten. The field searches and creates a tag on
 * the spot (an existing name, archived or not, is reused).
 */
export function TagPicker({ tags, selected, onChange }: TagPickerProps) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string>();
  // Tags created here, until the refreshed list brings them.
  const [created, setCreated] = useState<PickerTag[]>([]);
  const all = [
    ...tags,
    ...created.filter((tag) => !tags.some((item) => item.id === tag.id)),
  ];
  const selectedSet = new Set(selected);
  const atLimit = selected.length >= MAX_TAGS_PER_ENTRY;
  // An archived tag only shows while the entry still has it.
  const visible = sortTags(
    all.filter((tag) => !tag.archived || selectedSet.has(tag.id)),
  );
  const activeCount = all.filter((tag) => !tag.archived).length;
  const filtering = activeCount > FILTER_THRESHOLD && query.trim() !== "";
  // A stable order: selecting a chip does not move it. While filtering, the
  // selected ones stay in view next to the matches.
  const matches = filtering
    ? new Set(filterTags(visible, query).map((tag) => tag.id))
    : null;
  const chips = visible.filter(
    (tag) => !matches || matches.has(tag.id) || selectedSet.has(tag.id),
  );
  const typed = normalizeTagName(query);
  const exact = typed === "" ? undefined : findByKey(all, typed);
  const canCreate = typed !== "" && !exact && !atLimit;

  const create = useAction(createTagAction, {
    onSuccess: ({ data }) => {
      if (!data) return;
      setCreated((current) => [...current, { id: data.id, name: data.name }]);
      if (!selectedSet.has(data.id)) onChange([...selected, data.id]);
      setQuery("");
      setError(undefined);
    },
    onError: ({ error: failure }) =>
      setError(
        failure.validationErrors?.fieldErrors?.name?.[0] ??
          failure.serverError ??
          NETWORK_ERROR,
      ),
  });

  function toggle(tagId: string) {
    if (selectedSet.has(tagId)) {
      onChange(selected.filter((item) => item !== tagId));
    } else if (!atLimit) {
      onChange([...selected, tagId]);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (exact) {
      toggle(exact.id);
      setQuery("");
    } else if (canCreate && !create.isPending) {
      create.execute({ name: typed, reuse: true });
    }
  }

  const limitId = `${id}-limit`;
  const errorId = `${id}-error`;
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 text-callout font-semibold text-fg">
        Etiquetas
      </legend>
      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {chips.map((tag) => {
            const on = selectedSet.has(tag.id);
            return (
              <ChoiceChip
                key={tag.id}
                selected={on}
                aria-pressed={on}
                disabled={!on && atLimit}
                aria-describedby={!on && atLimit ? limitId : undefined}
                className="min-h-11"
                onClick={() => toggle(tag.id)}
              >
                {tag.archived ? `${tag.name} (arquivada)` : tag.name}
              </ChoiceChip>
            );
          })}
        </div>
      ) : null}
      {/* A live region always in the DOM, so screen readers hear it fill;
          empty, it takes back the gap above it. */}
      <output className="block text-caption text-fg-3 empty:-mt-2">
        {filtering && chips.length === selected.length && !canCreate
          ? `Nenhuma etiqueta com “${query.trim()}”.`
          : null}
      </output>
      {activeCount === 0 && created.length === 0 ? (
        <p className="text-caption text-fg-3">
          Junte lançamentos de categorias diferentes, como os de uma viagem.
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-field`} className="sr-only">
          Buscar ou criar etiqueta
        </label>
        <Input
          id={`${id}-field`}
          value={query}
          maxLength={TAG_NAME_MAX}
          autoComplete="off"
          enterKeyHint="done"
          placeholder="Buscar ou criar etiqueta"
          className="h-11"
          onChange={(event) => {
            setQuery(event.target.value);
            setError(undefined);
          }}
          onKeyDown={onKeyDown}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        {canCreate ? (
          <Button
            variant="tonal"
            size="sm"
            className="self-start"
            loading={create.isPending}
            onClick={() => create.execute({ name: typed, reuse: true })}
          >
            <Plus aria-hidden="true" />
            Criar “{typed}”
          </Button>
        ) : null}
        <FieldError id={errorId}>{error}</FieldError>
      </div>
      {atLimit ? (
        <p id={limitId} className="text-caption text-fg-3">
          Até {MAX_TAGS_PER_ENTRY} etiquetas por lançamento.
        </p>
      ) : null}
    </fieldset>
  );
}
