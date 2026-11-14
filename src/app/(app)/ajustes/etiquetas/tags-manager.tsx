"use client";

import { Archive, ChevronRight, Plus, RotateCcw, Tag } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { type FormEvent, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/app/empty-state";
import { SectionHeader } from "@/components/app/section-header";
import { useSheetTarget } from "@/components/planning/form/use-sheet";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { toastWithUndo } from "@/components/ui/toast";
import { normalizeTagName, TAG_NAME_MAX } from "@/lib/tags/name";
import {
  createTagAction,
  renameTagAction,
  setTagArchivedAction,
} from "@/server/actions/tags";
import type { TagWithUsage } from "@/server/domain/tags";
import {
  archivedMessage,
  createdMessage,
  entriesLabel,
  restoredMessage,
} from "./messages";

type Target = { mode: "new" } | { mode: "edit"; tag: TagWithUsage };

const NETWORK_ERROR = "Não conseguimos salvar. Verifique a conexão.";

const LIST =
  "overflow-hidden rounded-2xl bg-surface shadow-card [&>li+li]:border-t [&>li+li]:border-border";

function TagGlyph() {
  return (
    <span
      aria-hidden="true"
      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-2"
    >
      <Tag className="size-5" />
    </span>
  );
}

/** Ajustes › Etiquetas (doc 02 §6.14 "Organização"). */
export function TagsManager({ tags }: { tags: TagWithUsage[] }) {
  const sheet = useSheetTarget<Target>();
  const active = tags.filter((tag) => !tag.archived);
  const archived = tags.filter((tag) => tag.archived);
  const restore = useAction(setTagArchivedAction, {
    onSuccess: ({ data }) => {
      if (data) toast(restoredMessage(data.name));
    },
    onError: ({ error }) => toast(error.serverError ?? NETWORK_ERROR),
  });

  return (
    <>
      <p className="text-callout text-fg-2">
        Etiquetas juntam lançamentos de categorias diferentes, como os gastos de
        uma viagem. Um lançamento pode ter várias.
      </p>

      <section aria-labelledby="etiquetas-ativas">
        <SectionHeader
          id="etiquetas-ativas"
          title="Etiquetas"
          action={
            <Button
              variant="ghost"
              size="sm"
              className="-mr-2"
              onClick={() => sheet.show({ mode: "new" })}
              aria-label="Nova etiqueta"
            >
              <Plus aria-hidden="true" />
              Nova
            </Button>
          }
        />
        {active.length === 0 ? (
          <EmptyState
            className="rounded-2xl bg-surface shadow-card"
            icon={<Tag />}
            title="Nenhuma etiqueta ainda"
            description="Crie uma para juntar lançamentos, como os de uma viagem."
            action={
              <Button onClick={() => sheet.show({ mode: "new" })}>
                <Plus aria-hidden="true" />
                Criar etiqueta
              </Button>
            }
          />
        ) : (
          <ul aria-labelledby="etiquetas-ativas" className={LIST}>
            {active.map((tag) => (
              <li key={tag.id}>
                <button
                  type="button"
                  onClick={() => sheet.show({ mode: "edit", tag })}
                  className="flex min-h-15 w-full items-center gap-3 px-4 py-2 text-left -outline-offset-2 transition-colors duration-100 hover:bg-surface-2/60 active:bg-surface-2"
                >
                  <TagGlyph />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-body font-semibold text-fg">
                      {tag.name}
                    </span>
                    <span className="text-caption text-fg-3">
                      {entriesLabel(tag.entries)}
                    </span>
                  </span>
                  <span className="sr-only">Editar</span>
                  <ChevronRight
                    aria-hidden="true"
                    className="size-5 shrink-0 text-fg-3"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {archived.length > 0 ? (
        <section aria-labelledby="etiquetas-arquivadas">
          <SectionHeader id="etiquetas-arquivadas" title="Arquivadas" />
          <ul aria-labelledby="etiquetas-arquivadas" className={LIST}>
            {archived.map((tag) => (
              <li
                key={tag.id}
                className="flex min-h-15 items-center gap-3 px-4 py-2"
              >
                <TagGlyph />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-body font-semibold text-fg-2">
                    {tag.name}
                  </span>
                  <span className="truncate text-caption text-fg-3">
                    {entriesLabel(tag.entries)}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  loading={restore.isPending && restore.input?.id === tag.id}
                  onClick={() =>
                    restore.execute({ id: tag.id, archived: false })
                  }
                  aria-label={`Restaurar ${tag.name}`}
                >
                  <RotateCcw aria-hidden="true" />
                  Restaurar
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Sheet open={sheet.isOpen} onOpenChange={sheet.onOpenChange}>
        {sheet.target ? (
          <TagSheet
            key={sheet.key}
            target={sheet.target}
            onDone={sheet.close}
          />
        ) : null}
      </Sheet>
    </>
  );
}

function TagSheet({ target, onDone }: { target: Target; onDone: () => void }) {
  const formId = useId();
  const editing = target.mode === "edit" ? target.tag : null;
  const [name, setName] = useState(editing?.name ?? "");
  const [error, setError] = useState<string>();
  // An earlier toast would cover the sheet's actions.
  useEffect(() => {
    toast.dismiss();
  }, []);

  const onError = ({
    error: failure,
  }: {
    error: {
      serverError?: string;
      validationErrors?: { fieldErrors?: Record<string, string[] | undefined> };
    };
  }) => {
    const fields = failure.validationErrors?.fieldErrors ?? {};
    const message = fields.name?.[0] ?? failure.serverError;
    if (message) setError(message);
    else toast(NETWORK_ERROR);
  };
  const create = useAction(createTagAction, {
    onSuccess: ({ data }) => {
      if (data) toast(createdMessage(data));
      onDone();
    },
    onError,
  });
  const rename = useAction(renameTagAction, {
    onSuccess: () => {
      toast("Etiqueta salva.");
      onDone();
    },
    onError,
  });
  const archive = useAction(setTagArchivedAction, {
    onError: ({ error: failure }) =>
      toast(failure.serverError ?? NETWORK_ERROR),
  });
  const undo = useAction(setTagArchivedAction, {
    onSuccess: ({ data }) => {
      if (data) toast(restoredMessage(data.name));
    },
    onError: ({ error: failure }) =>
      toast(failure.serverError ?? NETWORK_ERROR),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeTagName(name);
    if (normalized === "") {
      setError("Informe um nome.");
      return;
    }
    setError(undefined);
    if (editing) rename.execute({ id: editing.id, name: normalized });
    else create.execute({ name: normalized });
  }

  async function archiveTag() {
    if (!editing) return;
    const result = await archive.executeAsync({
      id: editing.id,
      archived: true,
    });
    if (!result?.data) return;
    onDone();
    const { id } = editing;
    toastWithUndo(archivedMessage(result.data.name), () =>
      undo.execute({ id, archived: false }),
    );
  }

  const errorId = `${formId}-name-error`;
  const hintId = `${formId}-name-hint`;
  return (
    <SheetContent
      flowFooter
      title={editing ? "Editar etiqueta" : "Nova etiqueta"}
      footer={
        <Button
          type="submit"
          form={formId}
          size="lg"
          className="w-full"
          loading={create.isPending || rename.isPending}
        >
          {editing ? "Salvar etiqueta" : "Criar etiqueta"}
        </Button>
      }
    >
      <form
        id={formId}
        onSubmit={submit}
        noValidate
        className="flex flex-col gap-2 pb-2"
      >
        <Label htmlFor={`${formId}-name`}>Nome</Label>
        <Input
          id={`${formId}-name`}
          value={name}
          maxLength={TAG_NAME_MAX}
          autoFocus={!editing}
          autoComplete="off"
          enterKeyHint="done"
          placeholder="Ex.: viagem"
          onChange={(event) => {
            setName(event.target.value);
            setError(undefined);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${errorId} ${hintId}` : hintId}
        />
        <p id={hintId} className="text-caption text-fg-3">
          Até {TAG_NAME_MAX} caracteres.
        </p>
        <FieldError id={errorId}>{error}</FieldError>
      </form>
      {editing ? (
        <section
          aria-labelledby={`${formId}-more`}
          className="mt-4 flex flex-col gap-1 border-t border-border pt-4 pb-2"
        >
          <h3
            id={`${formId}-more`}
            className="text-callout font-semibold text-fg"
          >
            Mais ações
          </h3>
          <Button
            variant="ghost"
            size="lg"
            className="w-full justify-start text-danger hover:bg-danger-soft/60 active:bg-danger-soft"
            loading={archive.isPending}
            onClick={() => void archiveTag()}
            aria-describedby={`${formId}-archive-hint`}
          >
            <Archive aria-hidden="true" />
            Arquivar etiqueta
          </Button>
          <p
            id={`${formId}-archive-hint`}
            className="px-1 text-caption text-fg-3"
          >
            Ela sai das listas de escolha. Os lançamentos continuam com ela, e
            dá para restaurar quando quiser.
          </p>
        </section>
      ) : null}
    </SheetContent>
  );
}
