"use client";

import { CircleAlert, WalletCards } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  type FocusEvent,
  type KeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { toastWithUndo } from "@/components/ui/toast";
import {
  createEntryAction,
  discardCreatedAction,
} from "@/server/actions/transactions";
import {
  draftHasContent,
  type EntryKind,
  type QuickAddDraft,
  useQuickAddStore,
} from "@/stores/quick-add";
import {
  actionErrorMessage,
  NETWORK_ERROR,
} from "../transactions/action-result";
import { AccountSheet } from "./account-picker";
import { AmountDisplay } from "./amount-display";
import {
  type CalcKey,
  centsToExpression,
  evaluate,
  keyFromKeyboard,
  press,
} from "./calculator";
import { CategoryChips } from "./category-picker";
import {
  DescriptionField,
  type DescriptionSuggestion,
} from "./description-field";
import {
  AMOUNT_MESSAGES,
  type BuildResult,
  buildEntry,
  effectivePaid,
  invoiceHint,
  localDays,
  SAVE_LABEL,
  savedMessage,
  statusLabel,
} from "./entry";
import {
  AccountChip,
  DateChips,
  PaidSwitch,
  TransferAccountChips,
} from "./entry-chips";
import { HAPTIC, vibrate } from "./haptics";
import { Keypad } from "./keypad";
import { MoreOptions } from "./more-options";
import type { QuickAddAccount, QuickAddSheetData } from "./types";

const KIND_OPTIONS = [
  { value: "expense", label: "Despesa" },
  { value: "income", label: "Receita" },
  { value: "transfer", label: "Transferência" },
] satisfies { value: EntryKind; label: string }[];

const KIND_LABEL: Record<EntryKind, string> = {
  expense: "despesa",
  income: "receita",
  transfer: "transferência",
};

/** Values of `?novo=` (doc 02 §4.1). */
const NOVO_PARAM: Record<string, EntryKind | undefined> = {
  despesa: "expense",
  receita: "income",
  transferencia: "transfer",
};

/** Desktop shortcuts (doc 02 §4.5): N nova despesa, R receita, T transferência. */
const SHORTCUTS: Record<string, EntryKind> = {
  n: "expense",
  r: "income",
  t: "transfer",
};

/** Mouse or trackpad: the on-screen keypad is hidden and Enter saves. */
const FINE_POINTER = "(pointer: fine)";

/** Fields that take typed keys themselves (digits must not go to the amount). */
const TEXT_FIELDS =
  "input:not([type='checkbox']):not([type='radio']), textarea, select, [contenteditable='true']";
/** Fields that bring up the system keyboard (the on-screen keypad steps aside). */
const KEYBOARD_FIELDS =
  "input:not([type='checkbox']):not([type='radio']):not([type='date']), textarea, [contenteditable='true']";

function isEntryKind(value: string): value is EntryKind {
  return value === "expense" || value === "income" || value === "transfer";
}

/**
 * The global "Nova transação" sheet (doc 02 §6.5). Mounted once by the app
 * layout when its data has loaded; opened from any "+" through the
 * quick-add store, which also keeps the draft between openings.
 */
export function QuickAddSheet({ data }: { data: QuickAddSheetData }) {
  const open = useQuickAddStore((state) => state.open);
  const openQuickAdd = useQuickAddStore((state) => state.openQuickAdd);
  const closeQuickAdd = useQuickAddStore((state) => state.closeQuickAdd);
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const requested = NOVO_PARAM[useSearchParams().get("novo") ?? ""];

  useEffect(() => {
    useQuickAddStore.getState().loadPreferences();
  }, []);

  // The sheet lives in the layout, so a navigation from inside it ("Criar
  // conta") would leave it open over the new page. Closing once the URL has
  // changed also keeps useBackToClose from stepping back over the navigation.
  // (Declared before the `?novo=` effect: a navigation to `?novo=` reopens.)
  useEffect(() => {
    if (pathname === pathnameRef.current) return;
    pathnameRef.current = pathname;
    const store = useQuickAddStore.getState();
    if (store.open) store.closeQuickAdd();
  }, [pathname]);

  // `?novo=despesa|receita|transferencia` on any route opens the sheet (doc
  // 02 §4.1; the manifest shortcuts use it). The parameter is dropped right
  // away, so reloading the page does not open the sheet again.
  useEffect(() => {
    if (!requested) return;
    openQuickAdd(requested);
    const url = new URL(window.location.href);
    url.searchParams.delete("novo");
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [requested, openQuickAdd]);

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        useQuickAddStore.getState().open
      ) {
        return;
      }
      const kind = SHORTCUTS[event.key.toLowerCase()];
      if (!kind) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(TEXT_FIELDS)) return;
      // A tip balloon is a dialog too, but N while it shows is the tip's point.
      if (document.querySelector("[role='dialog']:not([data-coach-mark] *)"))
        return;
      event.preventDefault();
      openQuickAdd(kind);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openQuickAdd]);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) closeQuickAdd();
      }}
    >
      <QuickAddContent data={data} />
    </Sheet>
  );
}

/** Stand-in when the sheet's data failed to load: a tap explains instead of doing nothing. */
export function QuickAddUnavailable() {
  const open = useQuickAddStore((state) => state.open);
  useEffect(() => {
    if (!open) return;
    toast.error("Não deu para abrir o formulário agora. Recarregue a página.");
    useQuickAddStore.getState().closeQuickAdd();
  }, [open]);
  return null;
}

function defaultAccountFor(
  kind: EntryKind,
  accounts: QuickAddAccount[],
  lastAccountId: string | null,
): string | null {
  const last = accounts.find((account) => account.id === lastAccountId);
  if (kind !== "transfer") return last?.id ?? accounts[0]?.id ?? null;
  // A transfer usually leaves a bank account, not a card.
  if (last && last.type !== "credit_card") return last.id;
  return (
    accounts.find((account) => account.type !== "credit_card")?.id ??
    accounts[0]?.id ??
    null
  );
}

type PickerTarget = "account" | "from" | "to";

function QuickAddContent({ data }: { data: QuickAddSheetData }) {
  const draft = useQuickAddStore((state) => state.draft);
  const openedAt = useQuickAddStore((state) => state.openedAt);
  const restored = useQuickAddStore((state) => state.restored);
  const keepAdding = useQuickAddStore((state) => state.keepAdding);
  const updateDraft = useQuickAddStore((state) => state.updateDraft);
  const resetDraft = useQuickAddStore((state) => state.resetDraft);
  const closeQuickAdd = useQuickAddStore((state) => state.closeQuickAdd);
  const reopenWith = useQuickAddStore((state) => state.reopenWith);
  const dismissRestored = useQuickAddStore((state) => state.dismissRestored);
  const setKeepAdding = useQuickAddStore((state) => state.setKeepAdding);

  const [keypadVisible, setKeypadVisible] = useState(true);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [formError, setFormError] = useState<{
    message: string;
    field: BuildResultField;
  } | null>(null);
  const [shakeSignal, setShakeSignal] = useState(0);
  const [saving, setSaving] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>("account");
  const amountRef = useRef<HTMLDivElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const listOpen = useRef(false);
  const savingRef = useRef(false);
  const amountMessageId = useId();
  const keepAddingId = useId();

  // Each opening starts with the keypad up and no stale messages.
  useEffect(() => {
    if (openedAt === null) return;
    const current = useQuickAddStore.getState().draft;
    setKeypadVisible(true);
    setAmountError(null);
    setFormError(null);
    setPickerOpen(false);
    setMoreOpen(
      current.installments > 1 ||
        current.repeat !== "never" ||
        current.notes.trim() !== "",
    );
  }, [openedAt]);

  const { today, yesterday } = useMemo(
    () => localDays(openedAt ?? 0, data.timeZone),
    [openedAt, data.timeZone],
  );

  const { accounts } = data;
  const kind = draft.kind;
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const defaultAccountId = defaultAccountFor(
    kind,
    accounts,
    data.lastAccountId,
  );
  const accountId =
    draft.accountId && accountById.has(draft.accountId)
      ? draft.accountId
      : defaultAccountId;
  const account = accountId ? accountById.get(accountId) : undefined;
  const toAccount = draft.toAccountId
    ? accountById.get(draft.toAccountId)
    : undefined;
  const date = draft.date ?? today;
  const paid = effectivePaid(draft.paid, date, today);
  const amountCents = evaluate(draft.expression);
  const nothingTyped = amountCents === null || amountCents === 0;
  const categories =
    kind === "income" ? data.incomeCategories : data.expenseCategories;
  const categoryId =
    kind === "income" ? draft.incomeCategoryId : draft.expenseCategoryId;
  const cardHint =
    kind !== "transfer" && account?.card
      ? invoiceHint(date, account.card)
      : null;
  const noAccounts = accounts.length === 0;

  function edit(patch: Partial<QuickAddDraft>) {
    updateDraft(patch);
    if (formError) setFormError(null);
  }

  function failAmount(message: string) {
    setAmountError(message);
    setShakeSignal((signal) => signal + 1);
    vibrate(HAPTIC.error);
  }

  function pressKey(key: CalcKey) {
    const current = useQuickAddStore.getState().draft.expression;
    const result = press(current, key);
    if (result.error) {
      failAmount(AMOUNT_MESSAGES[result.error]);
      return;
    }
    setAmountError(null);
    if (result.expression !== current) edit({ expression: result.expression });
  }

  function onSheetKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    )
      return;
    const target = event.target as HTMLElement;
    // Keys typed in a nested picker (portaled elsewhere) are not for the amount.
    if (!event.currentTarget.contains(target)) return;
    if (target.closest(TEXT_FIELDS)) return;
    if (event.key === "Enter") {
      if (target.closest("button, a, [role='switch']")) return;
      event.preventDefault();
      void save();
      return;
    }
    const key = keyFromKeyboard(event.key);
    if (!key) return;
    event.preventDefault();
    pressKey(key);
  }

  function onSheetFocus(event: FocusEvent<HTMLDivElement>) {
    // The system keyboard takes over while a text field has the focus.
    const target = event.target as HTMLElement;
    if (
      event.currentTarget.contains(target) &&
      target.matches(KEYBOARD_FIELDS)
    ) {
      setKeypadVisible(false);
    }
  }

  function activateAmount() {
    setKeypadVisible(true);
  }

  function pickSuggestion(suggestion: DescriptionSuggestion) {
    const patch: Partial<QuickAddDraft> = {
      description: suggestion.description,
    };
    if (
      suggestion.categoryId &&
      categories.some((category) => category.id === suggestion.categoryId)
    ) {
      if (kind === "income") patch.incomeCategoryId = suggestion.categoryId;
      else patch.expenseCategoryId = suggestion.categoryId;
    }
    if (accountById.has(suggestion.accountId)) {
      patch.accountId = suggestion.accountId;
    }
    if (
      useQuickAddStore.getState().draft.expression === "" &&
      suggestion.amountCents > 0
    ) {
      patch.expression = centsToExpression(suggestion.amountCents);
    }
    edit(patch);
    setKeypadVisible(true);
    amountRef.current?.focus({ preventScroll: true });
  }

  /**
   * Enter in the description: saves on desktop (§6.5 "Enter salva"); on a
   * phone, "Concluído" only puts the keypad back, so the entry is not saved
   * before the category is chosen.
   */
  function submitFromDescription() {
    if (window.matchMedia(FINE_POINTER).matches) {
      void save();
      return;
    }
    descriptionRef.current?.blur();
    setKeypadVisible(true);
  }

  function openPicker(target: PickerTarget) {
    setPickerTarget(target);
    setPickerOpen(true);
  }

  async function save() {
    // A ref, not the state: a double tap lands before the re-render.
    if (savingRef.current) return;
    const current = useQuickAddStore.getState().draft;
    const requestId = current.requestId ?? uuidv7();
    const built = buildEntry(current, { today, defaultAccountId, requestId });
    if (!built.ok) {
      if (built.field === "amount") {
        failAmount(built.message);
        amountRef.current?.focus({ preventScroll: true });
      } else {
        setFormError({ message: built.message, field: built.field });
        vibrate(HAPTIC.error);
        if (built.field === "options") setMoreOpen(true);
      }
      return;
    }
    if (current.requestId !== requestId) updateDraft({ requestId });
    savingRef.current = true;
    setSaving(true);
    setFormError(null);
    try {
      const result = await createEntryAction(built.payload);
      if (result?.data) {
        onSaved(current, built, result.data);
      } else {
        setFormError({
          message: actionErrorMessage(result) ?? NETWORK_ERROR,
          field: "server",
        });
        vibrate(HAPTIC.error);
      }
    } catch {
      setFormError({ message: NETWORK_ERROR, field: "server" });
      vibrate(HAPTIC.error);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function onSaved(
    saved: QuickAddDraft,
    built: Extract<BuildResult, { ok: true }>,
    created: { ids: string[]; transferId: string | null },
  ) {
    vibrate(HAPTIC.success);
    if (useQuickAddStore.getState().keepAdding) {
      // "Adicionar outra em seguida": clear amount and description, keep the rest.
      resetDraft({
        kind: saved.kind,
        date: saved.date,
        paid: saved.paid,
        accountId: saved.accountId,
        toAccountId: saved.toAccountId,
      });
      setAmountError(null);
      setKeypadVisible(true);
      amountRef.current?.focus({ preventScroll: true });
    } else {
      closeQuickAdd({ discard: true });
    }
    const installments =
      built.payload.kind === "transfer"
        ? undefined
        : (built.payload.installments ?? undefined);
    toastWithUndo(
      savedMessage(saved.kind, built.amountCents, {
        installments,
        scheduled: built.scheduled,
      }),
      () => void undo(saved, created),
    );
  }

  async function undo(
    saved: QuickAddDraft,
    created: { ids: string[]; transferId: string | null },
  ) {
    try {
      const result = await discardCreatedAction(
        created.transferId
          ? { transferId: created.transferId }
          : { ids: created.ids },
      );
      const message = actionErrorMessage(result);
      if (message) {
        toast.error(message);
        return;
      }
      const state = useQuickAddStore.getState();
      // Put the entry back in the sheet to fix it, unless another one is under way.
      if (!state.open || !draftHasContent(state.draft)) reopenWith(saved);
      else toast("Lançamento desfeito");
    } catch {
      toast.error("Não deu para desfazer. Verifique a conexão.");
    }
  }

  const amountMessage =
    amountError ?? (nothingTyped ? "Digite um valor" : null);

  const footer = (
    <>
      {keypadVisible && !noAccounts ? (
        <Keypad onKey={pressKey} className="pointer-fine:hidden" />
      ) : null}
      {formError ? (
        <p
          role="alert"
          className="flex items-start gap-1.5 text-caption font-semibold text-danger"
        >
          <CircleAlert aria-hidden="true" className="mt-px size-4 shrink-0" />
          <span>{formError.message}</span>
        </p>
      ) : null}
      <Button
        size="lg"
        className="w-full"
        loading={saving}
        disabled={nothingTyped || noAccounts}
        aria-describedby={nothingTyped ? amountMessageId : undefined}
        onClick={() => void save()}
      >
        {SAVE_LABEL[kind]}
      </Button>
    </>
  );

  return (
    <SheetContent
      title="Nova transação"
      className="h-[calc(100dvh-max(2rem,env(safe-area-inset-top)+0.5rem))] max-h-none md:h-fit md:max-h-[min(92dvh,54rem)] md:max-w-120"
      bodyClassName="flex flex-col gap-4"
      footer={footer}
      onKeyDown={onSheetKeyDown}
      onFocus={onSheetFocus}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        amountRef.current?.focus({ preventScroll: true });
      }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        const target = useQuickAddStore.getState().returnFocus;
        if (target?.isConnected) target.focus({ preventScroll: true });
      }}
      onEscapeKeyDown={(event) => {
        // Esc first closes the suggestion list of the description.
        if (listOpen.current) event.preventDefault();
      }}
    >
      {restored ? (
        <div className="flex items-center justify-between gap-3 rounded-control bg-surface-2 py-1 pr-1 pl-3.5">
          <p className="text-callout font-semibold text-fg-2">
            Rascunho restaurado
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              resetDraft();
              dismissRestored();
              amountRef.current?.focus({ preventScroll: true });
            }}
          >
            Limpar
          </Button>
        </div>
      ) : null}

      <SegmentedControl
        options={KIND_OPTIONS}
        value={kind}
        ariaLabel="Tipo de lançamento"
        onValueChange={(value) => {
          if (isEntryKind(value)) edit({ kind: value });
        }}
      />

      <AmountDisplay
        ref={amountRef}
        expression={draft.expression}
        kind={kind}
        message={amountMessage}
        messageTone={amountError ? "error" : "hint"}
        messageId={amountMessageId}
        shakeSignal={shakeSignal}
        active={keypadVisible}
        onActivate={activateAmount}
      />

      {noAccounts ? (
        <NoAccounts />
      ) : (
        <>
          <DescriptionField
            ref={descriptionRef}
            kind={kind}
            value={draft.description}
            onChange={(description) => edit({ description })}
            onPick={pickSuggestion}
            onSubmit={submitFromDescription}
            onListOpenChange={(isOpen) => {
              listOpen.current = isOpen;
            }}
            categories={categories}
          />

          {kind === "transfer" ? (
            <TransferAccountChips
              from={account}
              to={toAccount}
              invalid={
                formError?.field === "account"
                  ? "from"
                  : formError?.field === "toAccount"
                    ? "to"
                    : null
              }
              onPickFrom={() => openPicker("from")}
              onPickTo={() => openPicker("to")}
            />
          ) : (
            <CategoryChips
              categories={categories}
              selectedId={categoryId}
              kindLabel={KIND_LABEL[kind]}
              onSelect={(id) =>
                edit(
                  kind === "income"
                    ? { incomeCategoryId: id }
                    : { expenseCategoryId: id },
                )
              }
            />
          )}

          <div className="flex flex-col gap-2">
            <DateChips
              date={date}
              today={today}
              yesterday={yesterday}
              onChange={(next) => edit({ date: next, paid: null })}
            />
            <div className="flex flex-wrap items-center gap-2">
              {kind === "transfer" ? null : (
                <AccountChip
                  account={account}
                  invalid={formError?.field === "account"}
                  onClick={() => openPicker("account")}
                />
              )}
              <PaidSwitch
                paid={paid}
                label={statusLabel(paid, date, today)}
                onChange={(next) => edit({ paid: next })}
              />
            </div>
            {cardHint || (date > today && !paid) ? (
              <p className="text-caption text-fg-3">
                {[
                  cardHint,
                  date > today && !paid
                    ? "Data futura: fica agendado até ser pago."
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : null}
          </div>

          {kind === "transfer" ? null : (
            <MoreOptions
              draft={draft}
              date={date}
              amountCents={amountCents}
              open={moreOpen}
              onOpenChange={setMoreOpen}
              onChange={edit}
            />
          )}

          <label
            htmlFor={keepAddingId}
            className="-mt-1 flex min-h-11 cursor-pointer items-center gap-3 self-start text-callout text-fg-2"
          >
            <input
              id={keepAddingId}
              type="checkbox"
              checked={keepAdding}
              onChange={(event) => setKeepAdding(event.target.checked)}
              className="size-5 shrink-0 accent-primary"
            />
            Adicionar outra em seguida
          </label>

          <AccountSheet
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            title={
              pickerTarget === "from"
                ? "De qual conta?"
                : pickerTarget === "to"
                  ? "Para qual conta?"
                  : "Conta"
            }
            accounts={accounts}
            selectedId={
              pickerTarget === "to" ? (draft.toAccountId ?? null) : accountId
            }
            excludeId={
              pickerTarget === "to"
                ? accountId
                : pickerTarget === "from"
                  ? draft.toAccountId
                  : null
            }
            onSelect={(id) => {
              edit(
                pickerTarget === "to" ? { toAccountId: id } : { accountId: id },
              );
              setPickerOpen(false);
            }}
          />
        </>
      )}
    </SheetContent>
  );
}

type BuildResultField = Extract<BuildResult, { ok: false }>["field"] | "server";

function NoAccounts() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card bg-surface-2 px-5 py-6 text-center">
      <WalletCards aria-hidden="true" className="size-8 text-fg-2" />
      <p className="text-body text-fg-2">
        Crie uma conta primeiro: é nela que os lançamentos entram.
      </p>
      <Button asChild variant="tonal">
        <Link href="/contas/nova">Criar conta</Link>
      </Button>
    </div>
  );
}
