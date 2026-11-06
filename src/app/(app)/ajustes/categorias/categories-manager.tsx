"use client";

import {
  Archive,
  ArrowUpDown,
  ChevronRight,
  Merge,
  Plus,
  RotateCcw,
} from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { type FormEvent, useId, useState } from "react";
import { toast } from "sonner";
import { SectionHeader } from "@/components/app/section-header";
import { CategoryIcon } from "@/components/finance/category-icon";
import {
  CATEGORY_ICON_CHOICES,
  COLOR_CHOICES,
  ICON_NAMES,
} from "@/components/planning/form/icon-names";
import { NativeSelect } from "@/components/planning/form/native-select";
import { ColorPicker, IconPicker } from "@/components/planning/form/pickers";
import { useSheetTarget } from "@/components/planning/form/use-sheet";
import { categoryTree } from "@/components/transactions/statement-params";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { parentOptions } from "@/lib/categories/hierarchy";
import { cn } from "@/lib/utils";
import {
  createCategoryAction,
  setCategoryArchivedAction,
  updateCategoryAction,
} from "@/server/actions/categories";
import { ArchiveStep } from "./archive-step";
import { MergeStep } from "./merge-step";
import { createdMessage, restoredMessage } from "./messages";
import { OrderSheet } from "./order-sheet";
import type { CategoryKind, ManagedCategory } from "./types";

type ColorChoice = (typeof COLOR_CHOICES)[number];

export type { ManagedCategory };

type Target =
  | { mode: "new"; kind: CategoryKind }
  | { mode: "edit"; category: ManagedCategory };

const GROUPS: { kind: CategoryKind; title: string; id: string }[] = [
  { kind: "expense", title: "Despesas", id: "categorias-despesas" },
  { kind: "income", title: "Receitas", id: "categorias-receitas" },
];

const NETWORK_ERROR = "Não conseguimos salvar. Verifique a conexão.";

/** Ajustes › Categorias (doc 02 §6.14 "Organização"). */
export function CategoriesManager({
  categories,
}: {
  categories: ManagedCategory[];
}) {
  const sheet = useSheetTarget<Target>();
  const order = useSheetTarget<{ kind: CategoryKind }>();
  const names = new Map(
    categories.map((category) => [category.id, category.name]),
  );
  // Each subcategory right after its parent, in both lists.
  const tree = categoryTree(categories);
  const archived = tree.filter((category) => category.archived);
  const restore = useAction(setCategoryArchivedAction, {
    onSuccess: ({ data }) => {
      if (data) toast(restoredMessage(data));
    },
    onError: ({ error }) => toast(error.serverError ?? NETWORK_ERROR),
  });

  return (
    <>
      {GROUPS.map((group) => {
        const items = tree.filter(
          (category) => category.kind === group.kind && !category.archived,
        );
        return (
          <section key={group.kind} aria-labelledby={group.id}>
            <SectionHeader
              id={group.id}
              title={group.title}
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  className="-mr-2"
                  onClick={() => sheet.show({ mode: "new", kind: group.kind })}
                  aria-label={`Nova categoria de ${group.kind === "expense" ? "despesa" : "receita"}`}
                >
                  <Plus aria-hidden="true" />
                  Nova
                </Button>
              }
            />
            {items.length === 0 ? (
              <p className="rounded-2xl bg-surface px-4 py-5 text-callout text-fg-2 shadow-card">
                Nenhuma categoria ativa.
              </p>
            ) : (
              <ul
                aria-labelledby={group.id}
                className="overflow-hidden rounded-2xl bg-surface shadow-card [&>li+li]:border-t [&>li+li]:border-border"
              >
                {items.map((category) => (
                  <li key={category.id}>
                    <button
                      type="button"
                      onClick={() => sheet.show({ mode: "edit", category })}
                      className={cn(
                        "flex min-h-15 w-full items-center gap-3 py-2 pr-4 text-left -outline-offset-2 transition-colors duration-100 hover:bg-surface-2/60 active:bg-surface-2",
                        category.parentId ? "pl-10" : "pl-4",
                      )}
                    >
                      <CategoryIcon
                        icon={category.icon}
                        color={category.color}
                      />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-body font-semibold text-fg">
                          {category.name}
                        </span>
                        {category.parentId ? (
                          <span className="truncate text-caption text-fg-3">
                            em{" "}
                            {names.get(category.parentId) ?? "outra categoria"}
                          </span>
                        ) : null}
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
            {items.length > 1 ? (
              <Button
                variant="ghost"
                size="sm"
                className="mt-1 -ml-2 min-h-11"
                aria-haspopup="dialog"
                onClick={() => order.show({ kind: group.kind })}
              >
                <ArrowUpDown aria-hidden="true" />
                Mudar a ordem
              </Button>
            ) : null}
          </section>
        );
      })}

      {archived.length > 0 ? (
        <section aria-labelledby="categorias-arquivadas">
          <SectionHeader id="categorias-arquivadas" title="Arquivadas" />
          <ul
            aria-labelledby="categorias-arquivadas"
            className="overflow-hidden rounded-2xl bg-surface shadow-card [&>li+li]:border-t [&>li+li]:border-border"
          >
            {archived.map((category) => (
              <li
                key={category.id}
                className="flex min-h-15 items-center gap-3 px-4 py-2"
              >
                <CategoryIcon
                  icon={category.icon}
                  color={category.color}
                  dashed
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-body font-semibold text-fg-2">
                    {category.name}
                  </span>
                  <span className="text-caption text-fg-3">
                    {category.kind === "expense" ? "Despesa" : "Receita"}
                    {category.parentId
                      ? ` · em ${names.get(category.parentId) ?? "outra categoria"}`
                      : null}
                  </span>
                </span>
                <Button
                  variant="tonal"
                  size="sm"
                  loading={
                    restore.isPending && restore.input?.id === category.id
                  }
                  onClick={() =>
                    restore.execute({ id: category.id, archived: false })
                  }
                  aria-label={`Restaurar ${category.name}`}
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
          <CategorySheet
            key={sheet.key}
            target={sheet.target}
            categories={categories}
            onDone={sheet.close}
          />
        ) : null}
      </Sheet>
      <Sheet open={order.isOpen} onOpenChange={order.onOpenChange}>
        {order.target ? (
          <OrderSheet
            key={order.key}
            kind={order.target.kind}
            categories={categories}
            onDone={order.close}
          />
        ) : null}
      </Sheet>
    </>
  );
}

function CategorySheet({
  target,
  categories,
  onDone,
}: {
  target: Target;
  categories: ManagedCategory[];
  onDone: () => void;
}) {
  const formId = useId();
  const iconLabelId = useId();
  const colorLabelId = useId();
  const editing = target.mode === "edit" ? target.category : null;
  const [kind, setKind] = useState<CategoryKind>(
    editing?.kind ?? (target.mode === "new" ? target.kind : "expense"),
  );
  const [name, setName] = useState(editing?.name ?? "");
  /** "" = a main category. */
  const [parentId, setParentId] = useState(editing?.parentId ?? "");
  const [icon, setIcon] = useState(editing?.icon ?? "shopping-bag");
  const [color, setColor] = useState(editing?.color ?? "cat-1");
  const [error, setError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [step, setStep] = useState<"form" | "archive" | "merge">("form");

  const names = new Map(
    categories.map((category) => [category.id, category.name]),
  );
  // One level only: a category with subcategories (archived ones too) stays
  // a main category. The options are the active main categories of the type;
  // a current parent that is no longer one stays listed, so it shows.
  const children = editing
    ? categories.filter((category) => category.parentId === editing.id)
    : [];
  const hasChildren = children.length > 0;
  const options = parentOptions(categories, {
    id: editing?.id ?? null,
    kind,
  }).map((category) => ({ id: category.id, label: category.name }));
  const current = categories.find(
    (category) => category.id === editing?.parentId,
  );
  if (current && !options.some((option) => option.id === current.id)) {
    options.push({
      id: current.id,
      label: current.archived ? `${current.name} (arquivada)` : current.name,
    });
  }
  const parentName = parentId ? (names.get(parentId) ?? null) : null;

  const icons = CATEGORY_ICON_CHOICES.includes(
    icon as (typeof CATEGORY_ICON_CHOICES)[number],
  )
    ? CATEGORY_ICON_CHOICES
    : [icon, ...CATEGORY_ICON_CHOICES];

  const onError = ({
    error: failure,
  }: {
    error: {
      serverError?: string;
      validationErrors?: { fieldErrors?: Record<string, string[] | undefined> };
    };
  }) => {
    const fields = failure.validationErrors?.fieldErrors ?? {};
    setError(fields.name?.[0]);
    setFormError(
      failure.serverError ??
        (Object.keys(fields).length ? undefined : NETWORK_ERROR),
    );
  };
  const create = useAction(createCategoryAction, {
    onSuccess: () => {
      toast(createdMessage(name.trim(), parentName));
      onDone();
    },
    onError,
  });
  const update = useAction(updateCategoryAction, {
    onSuccess: () => {
      toast(`Categoria ${name.trim()} salva.`);
      onDone();
    },
    onError,
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === "") {
      setError("Dê um nome para a categoria.");
      return;
    }
    // Names are unique per level: checked against the chosen parent.
    const chosenParent = parentId || null;
    const clash = categories.find(
      (category) =>
        category.id !== editing?.id &&
        category.parentId === chosenParent &&
        category.name === trimmed,
    );
    if (clash) {
      setError(
        clash.archived
          ? "Já existe uma categoria arquivada com esse nome. Restaure-a na lista de arquivadas."
          : parentName
            ? `Já existe uma subcategoria com esse nome em ${parentName}.`
            : "Já existe uma categoria com esse nome.",
      );
      return;
    }
    setError(undefined);
    setFormError(undefined);
    const colorToken = color as ColorChoice;
    if (editing)
      update.execute({
        id: editing.id,
        name: trimmed,
        icon,
        color: colorToken,
        ...(chosenParent !== editing.parentId
          ? { parentId: chosenParent }
          : {}),
      });
    else
      create.execute({
        kind,
        name: trimmed,
        icon,
        color: colorToken,
        parentId: chosenParent,
      });
  }

  if (step === "archive" && editing) {
    return (
      <ArchiveStep
        category={editing}
        categories={categories}
        onBack={() => setStep("form")}
        onDone={onDone}
      />
    );
  }
  if (step === "merge" && editing) {
    return (
      <MergeStep
        category={editing}
        categories={categories}
        onBack={() => setStep("form")}
        onDone={onDone}
      />
    );
  }

  return (
    <SheetContent
      flowFooter
      title={editing ? "Editar categoria" : "Nova categoria"}
      footer={
        <Button
          type="submit"
          form={formId}
          size="lg"
          className="w-full"
          loading={create.isPending || update.isPending}
        >
          {editing ? "Salvar categoria" : "Criar categoria"}
        </Button>
      }
    >
      <form
        id={formId}
        onSubmit={submit}
        noValidate
        className="flex flex-col gap-6 pb-2"
      >
        {editing ? null : (
          <SegmentedControl
            ariaLabel="Tipo da categoria"
            options={[
              { value: "expense", label: "Despesa" },
              { value: "income", label: "Receita" },
            ]}
            value={kind}
            onValueChange={(value) => {
              setKind(value as CategoryKind);
              // A parent of the other type would not do.
              setParentId("");
            }}
          />
        )}
        <div className="flex items-end gap-3">
          <CategoryIcon icon={icon} color={color} size="lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Label htmlFor={`${formId}-name`}>Nome</Label>
            <Input
              id={`${formId}-name`}
              value={name}
              maxLength={40}
              autoComplete="off"
              enterKeyHint="done"
              placeholder={kind === "expense" ? "Academia" : "Aluguel recebido"}
              onChange={(event) => {
                setName(event.target.value);
                setError(undefined);
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${formId}-name-error` : undefined}
            />
          </div>
        </div>
        <FieldError id={`${formId}-name-error`} className="-mt-4">
          {error}
        </FieldError>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${formId}-parent`}>Subcategoria de</Label>
          <NativeSelect
            id={`${formId}-parent`}
            value={parentId}
            onChange={(event) => {
              setParentId(event.target.value);
              setError(undefined);
            }}
            disabled={hasChildren}
            aria-describedby={hasChildren ? `${formId}-parent-hint` : undefined}
          >
            <option value="">Nenhuma (categoria principal)</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
          {hasChildren ? (
            <p id={`${formId}-parent-hint`} className="text-caption text-fg-3">
              Tem subcategorias, por isso fica como categoria principal.
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <span id={iconLabelId} className="text-callout font-semibold text-fg">
            Ícone
          </span>
          <IconPicker
            icons={icons}
            value={icon}
            onChange={setIcon}
            color={color}
            labelledBy={iconLabelId}
            names={ICON_NAMES}
          />
        </div>
        <div className="flex flex-col gap-2">
          <span
            id={colorLabelId}
            className="text-callout font-semibold text-fg"
          >
            Cor
          </span>
          <ColorPicker
            colors={COLOR_CHOICES}
            value={color}
            onChange={setColor}
            labelledBy={colorLabelId}
          />
        </div>
        <FieldError id={`${formId}-form-error`}>{formError}</FieldError>
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
            className="w-full justify-start"
            onClick={() => setStep("merge")}
          >
            <Merge aria-hidden="true" />
            Mesclar com outra
          </Button>
          <Button
            variant="ghost"
            size="lg"
            className="w-full justify-start text-danger hover:bg-danger-soft/60 active:bg-danger-soft"
            onClick={() => setStep("archive")}
          >
            <Archive aria-hidden="true" />
            Arquivar categoria
          </Button>
        </section>
      ) : null}
    </SheetContent>
  );
}
