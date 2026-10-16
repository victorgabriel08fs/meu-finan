import { create } from "zustand";

/**
 * "Nova transação" (doc 02 §6.5): whether the global quick-add sheet is open,
 * and the draft it edits. Any "+" (tab bar, sidebar, empty states) opens it
 * through `openQuickAdd`; the sheet itself mounts once its data has loaded and
 * reads `open` from here, so a tap before that still opens it.
 *
 * The draft outlives the sheet: closing with content keeps it for 10 minutes
 * and the next opening shows "Rascunho restaurado · Limpar".
 */

export type EntryKind = "expense" | "income" | "transfer";
export type RepeatFrequency = "never" | "weekly" | "monthly" | "yearly";

export type QuickAddDraft = {
  kind: EntryKind;
  /** Calculator expression, e.g. "120+35,5" (see quick-add/calculator). */
  expression: string;
  description: string;
  /** Chosen per kind, so switching Despesa ⇄ Receita keeps each choice. */
  expenseCategoryId: string | null;
  incomeCategoryId: string | null;
  /** Account (or "De" of a transfer); null = the default account. */
  accountId: string | null;
  /** "Para" of a transfer. */
  toAccountId: string | null;
  /** `YYYY-MM-DD`; null = today. */
  date: string | null;
  /** null = automatic: paid up to today, scheduled after it. */
  paid: boolean | null;
  /** 1 = à vista; 2–72 = parcelado (expenses only). */
  installments: number;
  repeat: RepeatFrequency;
  repeatEndOn: string | null;
  notes: string;
  /**
   * Idempotency key (UUIDv7) of the next save. Kept across failed attempts so
   * a retry cannot create the entry twice; any edit to the draft drops it.
   */
  requestId: string | null;
};

/** Drafts closed with content are kept this long (doc 02 §6.5 "Fechar"). */
export const DRAFT_TTL_MS = 10 * 60 * 1000;

export function emptyDraft(kind: EntryKind = "expense"): QuickAddDraft {
  return {
    kind,
    expression: "",
    description: "",
    expenseCategoryId: null,
    incomeCategoryId: null,
    accountId: null,
    toAccountId: null,
    date: null,
    paid: null,
    installments: 1,
    repeat: "never",
    repeatEndOn: null,
    notes: "",
    requestId: null,
  };
}

/** Something the user would miss: an amount, a description or a note. */
export function draftHasContent(draft: QuickAddDraft): boolean {
  return (
    draft.expression !== "" ||
    draft.description.trim() !== "" ||
    draft.notes.trim() !== ""
  );
}

type QuickAddState = {
  open: boolean;
  draft: QuickAddDraft;
  /** When the sheet last opened (ms); "today" is derived from it. */
  openedAt: number | null;
  /** When the sheet was closed with content; null when there is no draft. */
  closedAt: number | null;
  /** The open sheet carries a restored draft ("Rascunho restaurado"). */
  restored: boolean;
  /** "Adicionar outra em seguida", remembered on this device. */
  keepAdding: boolean;
  /** Element focused before opening, to return focus to on close. */
  returnFocus: HTMLElement | null;
  /** Opens the sheet; `kind` presets the type (an empty draft starts as Despesa). */
  openQuickAdd: (kind?: EntryKind) => void;
  /**
   * Closes the sheet. The draft stays on screen during the exit animation;
   * with `discard` (after a save) the next opening starts a fresh one.
   */
  closeQuickAdd: (options?: { discard?: boolean }) => void;
  /** Merges into the draft; edits invalidate the pending idempotency key. */
  updateDraft: (patch: Partial<QuickAddDraft>) => void;
  /** Starts a new draft, optionally keeping some fields (date, account…). */
  resetDraft: (keep?: Partial<QuickAddDraft>) => void;
  /** Puts a saved-then-undone entry back in the sheet and reopens it. */
  reopenWith: (draft: QuickAddDraft) => void;
  dismissRestored: () => void;
  setKeepAdding: (keepAdding: boolean) => void;
  /** Reads the remembered preferences; call once on the client after mount. */
  loadPreferences: () => void;
};

const KEEP_ADDING_KEY = "meu-finan:quick-add:keep-adding";

// Plain reads and writes (no `persist` middleware: it writes on every `set`,
// which would overwrite the saved choice if "+" is tapped before it loads).
function readKeepAdding(): boolean {
  try {
    return window.localStorage.getItem(KEEP_ADDING_KEY) === "1";
  } catch {
    return false;
  }
}

function writeKeepAdding(value: boolean): void {
  try {
    if (value) window.localStorage.setItem(KEEP_ADDING_KEY, "1");
    else window.localStorage.removeItem(KEEP_ADDING_KEY);
  } catch {
    // Storage unavailable (private mode, quota): the choice lasts this visit.
  }
}

function focusedElement(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const active = document.activeElement;
  return active instanceof HTMLElement && active !== document.body
    ? active
    : null;
}

export const useQuickAddStore = create<QuickAddState>()((set) => ({
  open: false,
  draft: emptyDraft(),
  openedAt: null,
  closedAt: null,
  restored: false,
  keepAdding: false,
  returnFocus: null,

  openQuickAdd: (kind) =>
    set((state) => {
      if (state.open) {
        return kind ? { draft: { ...state.draft, kind } } : {};
      }
      const now = Date.now();
      const expired =
        state.closedAt === null || now - state.closedAt > DRAFT_TTL_MS;
      const keep = !expired && draftHasContent(state.draft);
      const base = keep ? state.draft : emptyDraft();
      return {
        open: true,
        openedAt: now,
        closedAt: null,
        restored: keep,
        returnFocus: focusedElement(),
        draft: kind ? { ...base, kind } : base,
      };
    }),

  closeQuickAdd: (options) =>
    set((state) => ({
      open: false,
      restored: false,
      // No timestamp = nothing to restore: the next opening starts empty.
      closedAt:
        !options?.discard && draftHasContent(state.draft) ? Date.now() : null,
    })),

  updateDraft: (patch) =>
    set((state) => ({
      draft: {
        ...state.draft,
        ...patch,
        requestId: "requestId" in patch ? (patch.requestId ?? null) : null,
      },
    })),

  resetDraft: (keep) =>
    set((state) => ({
      restored: false,
      draft: { ...emptyDraft(state.draft.kind), ...keep, requestId: null },
    })),

  reopenWith: (draft) =>
    set({
      open: true,
      openedAt: Date.now(),
      closedAt: null,
      restored: false,
      returnFocus: focusedElement(),
      draft: { ...draft, requestId: null },
    }),

  dismissRestored: () => set({ restored: false }),

  setKeepAdding: (keepAdding) => {
    writeKeepAdding(keepAdding);
    set({ keepAdding });
  },

  loadPreferences: () => set({ keepAdding: readKeepAdding() }),
}));
