"use client";

import { useAction } from "next-safe-action/hooks";
import { useId, useState } from "react";
import { toast } from "sonner";
import { NativeSelect } from "@/components/planning/form/native-select";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Label } from "@/components/ui/label";
import { SheetContent } from "@/components/ui/sheet";
import { moveTargets } from "@/lib/categories/hierarchy";
import { mergeCategoriesAction } from "@/server/actions/categories";
import {
  budgetMergeNote,
  mergeDescription,
  mergedMessage,
  mergeSummary,
  noMergeTarget,
} from "./messages";
import { type ManagedCategory, rootName } from "./types";

const NETWORK_ERROR = "Não conseguimos salvar. Verifique a conexão.";

/**
 * "Mesclar {Nome}" (doc 02 §6.14): everything of the category goes into the
 * chosen one and the category stays archived, empty. A category with
 * subcategories can only go into a main category (they move inside it). No
 * Desfazer: the summary says what will happen before the button.
 */
export function MergeStep({
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
  const [targetId, setTargetId] = useState("");
  const [error, setError] = useState<string>();

  const children = categories.filter((item) => item.parentId === category.id);
  const targets = moveTargets(categories, {
    kind: category.kind,
    excluded: [category.id],
    mainOnly: children.length > 0,
  });
  const target = targets.find((item) => item.id === targetId);
  const hasBudget =
    category.upcomingBudget ||
    children.some((item) => !item.archived && item.upcomingBudget);

  const merge = useAction(mergeCategoriesAction, {
    onSuccess: ({ data }) => {
      onDone();
      if (data) toast(mergedMessage(data.name, data.into));
    },
    onError: ({ error: failure }) =>
      setError(failure.serverError ?? NETWORK_ERROR),
  });

  function confirm() {
    if (!target) {
      setError("Escolha a categoria para mesclar.");
      return;
    }
    setError(undefined);
    merge.execute({ id: category.id, into: target.id });
  }

  return (
    <SheetContent
      flowFooter
      focusTitle
      title={`Mesclar ${category.name}`}
      description={mergeDescription(
        category.name,
        children.filter((item) => !item.archived).map((item) => item.name),
      )}
      footer={
        <>
          <Button
            variant="destructive"
            size="lg"
            className="w-full"
            disabled={targets.length === 0}
            loading={merge.isPending}
            onClick={confirm}
          >
            Mesclar categorias
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
      <div className="flex flex-col gap-2 pb-2">
        {targets.length === 0 ? (
          <p className="text-callout text-fg-2">
            {noMergeTarget(category.kind)}
          </p>
        ) : (
          <>
            <Label htmlFor={`${id}-target`}>Mesclar com</Label>
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
                    {mergeSummary(
                      category.kind,
                      category.entries,
                      target.label,
                      category.name,
                    )}
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
          </>
        )}
        <FieldError id={`${id}-error`}>{error}</FieldError>
      </div>
    </SheetContent>
  );
}
