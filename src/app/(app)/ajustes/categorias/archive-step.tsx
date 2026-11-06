"use client";

import { useAction } from "next-safe-action/hooks";
import { useId, useState } from "react";
import { toast } from "sonner";
import { NativeSelect } from "@/components/planning/form/native-select";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Label } from "@/components/ui/label";
import { SheetContent } from "@/components/ui/sheet";
import { toastWithUndo } from "@/components/ui/toast";
import { moveTargets } from "@/lib/categories/hierarchy";
import { cn } from "@/lib/utils";
import { setCategoryArchivedAction } from "@/server/actions/categories";
import {
  archiveAndMoveLabel,
  archiveDescription,
  archivedMessage,
  archiveMoveSummary,
  archiveQuestion,
  budgetMergeNote,
  restoredMessage,
} from "./messages";
import { type ManagedCategory, rootName } from "./types";

const NETWORK_ERROR = "Não conseguimos salvar. Verifique a conexão.";

const CHOICES = [
  { value: "keep", label: "Não, deixar com ela" },
  { value: "move", label: "Sim, escolher outra categoria" },
] as const;

/**
 * "Arquivar {Nome}?" (doc 02 §6.14): with entries to lose track of and
 * somewhere to send them, asks whether to pass them to another category.
 * Without moving, they stay (and Desfazer restores the category); moving
 * cannot be undone, so the summary says what will happen before the button.
 */
export function ArchiveStep({
  category,
  categories,
  onBack,
  onDone,
}: {
  category: ManagedCategory;
  categories: ManagedCategory[];
  onBack: () => void;
  onDone: () => void;
}) {
  const id = useId();
  const [choice, setChoice] = useState<"keep" | "move">("keep");
  const [targetId, setTargetId] = useState("");
  const [error, setError] = useState<string>();

  // What goes along: the category and its active subcategories.
  const along = categories.filter(
    (item) => item.parentId === category.id && !item.archived,
  );
  const entries =
    category.entries + along.reduce((sum, item) => sum + item.entries, 0);
  const hasBudget =
    category.upcomingBudget || along.some((item) => item.upcomingBudget);
  const targets = moveTargets(categories, {
    kind: category.kind,
    excluded: [category.id, ...along.map((item) => item.id)],
    mainOnly: false,
  });
  const asks = entries > 0 && targets.length > 0;
  const moving = asks && choice === "move";
  const target = targets.find((item) => item.id === targetId);

  const archive = useAction(setCategoryArchivedAction, {
    onSuccess: ({ data, input }) => {
      onDone();
      if (!data) return;
      const message = archivedMessage(data, category.kind);
      if (input.moveTo) {
        // Nothing to undo: the entries are in the other category now.
        toast(message);
        return;
      }
      // Desfazer restores the subcategories that went along, no others.
      toastWithUndo(message, () => {
        void setCategoryArchivedAction({
          id: category.id,
          archived: false,
        }).then((result) => {
          if (result?.serverError) toast(result.serverError);
          else if (result?.data) toast(restoredMessage(result.data));
        });
      });
    },
    onError: ({ error: failure }) =>
      setError(failure.serverError ?? NETWORK_ERROR),
  });

  function confirm() {
    if (moving && !target) {
      setError("Escolha a categoria que vai receber os lançamentos.");
      return;
    }
    setError(undefined);
    archive.execute({
      id: category.id,
      archived: true,
      ...(moving && target ? { moveTo: target.id } : {}),
    });
  }

  return (
    <SheetContent
      flowFooter
      focusTitle
      title={`Arquivar ${category.name}?`}
      description={archiveDescription(
        along.map((item) => item.name),
        moving,
      )}
      footer={
        <>
          <Button
            variant="destructive"
            size="lg"
            className="w-full"
            loading={archive.isPending}
            onClick={confirm}
          >
            {moving ? archiveAndMoveLabel(category.kind) : "Arquivar categoria"}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            onClick={onBack}
          >
            Cancelar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5 pb-2">
        {asks ? (
          <fieldset className="min-w-0">
            <legend className="mb-2 text-callout font-semibold text-fg">
              {archiveQuestion(category.kind, along.length > 0)}
            </legend>
            <div className="overflow-hidden rounded-control border border-border-strong/40 [&>label+label]:border-t [&>label+label]:border-border">
              {CHOICES.map((item) => (
                <label
                  key={item.value}
                  className="flex min-h-14 cursor-pointer items-center gap-3 px-3 py-2 transition-colors duration-100 has-checked:bg-primary-soft/60 has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-focus"
                >
                  <input
                    type="radio"
                    name={`${id}-choice`}
                    value={item.value}
                    checked={choice === item.value}
                    onChange={() => {
                      setChoice(item.value);
                      setError(undefined);
                    }}
                    className="sr-only"
                  />
                  <span className="min-w-0 flex-1 text-body font-semibold text-fg">
                    {item.label}
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex size-5.5 shrink-0 items-center justify-center rounded-full border-2",
                      choice === item.value
                        ? "border-primary"
                        : "border-border-strong",
                    )}
                  >
                    {choice === item.value ? (
                      <span className="size-2.5 rounded-full bg-primary" />
                    ) : null}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        {moving ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-target`}>Passar para</Label>
            <NativeSelect
              id={`${id}-target`}
              value={targetId}
              onChange={(event) => {
                setTargetId(event.target.value);
                setError(undefined);
              }}
              aria-describedby={`${id}-summary`}
            >
              <option value="">Escolha uma categoria</option>
              {targets.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </NativeSelect>
            <div
              id={`${id}-summary`}
              aria-live="polite"
              className="flex flex-col gap-1 text-callout text-fg-2"
            >
              {target ? (
                <>
                  <p>
                    {archiveMoveSummary({
                      kind: category.kind,
                      entries,
                      to: target.label,
                      name: category.name,
                    })}
                  </p>
                  {hasBudget ? (
                    <p>
                      {budgetMergeNote(
                        category.name,
                        rootName(target, categories),
                      )}
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        ) : null}
        <FieldError id={`${id}-error`}>{error}</FieldError>
      </div>
    </SheetContent>
  );
}
