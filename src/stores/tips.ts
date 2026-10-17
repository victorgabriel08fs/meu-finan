import { create } from "zustand";
import { actionErrorMessage } from "@/components/transactions/action-result";
import { NOVIDADE_IDS, type TipContext, type TipsSnapshot } from "@/lib/tips";
import {
  markTipsSeenAction,
  resetTipsAction,
  setTipsOffAction,
} from "@/server/actions/tips";

/**
 * Tips and novidades of the signed-in user (doc 02 §6.16). The layout hands
 * over the server's snapshot once per load (TipsHost → `hydrate`); from then
 * on this store is the browser's truth. Marking seen and turning tips off
 * apply here at once and reach the database in the background, so a balloon
 * never waits for the network nor comes back while the request is on its way.
 */
type TipsState = {
  /** The snapshot arrived; nothing shows before it. */
  loaded: boolean;
  seen: ReadonlySet<string>;
  /** "Não mostrar mais dicas". */
  off: boolean;
  createdOn: string | null;
  context: TipContext;
  /** Merges a snapshot from the server (each page load or refresh). */
  hydrate: (snapshot: TipsSnapshot) => void;
  /** Optimistic; the write is retried a few times if it fails. */
  markSeen: (ids: readonly string[]) => void;
  /** Optimistic; reverts and resolves false when the server refuses. */
  setOff: (off: boolean) => Promise<boolean>;
  /** "Rever dicas": waits for the server, then shows the basics again. */
  reset: () => Promise<boolean>;
};

const EMPTY_CONTEXT: TipContext = {
  hasAccounts: false,
  hasPasskey: false,
  role: null,
  flags: [],
};

// Seen ids not saved yet, sent in one request at a time (Server Actions run
// one after the other anyway). A failed write is retried a few times.
const unsynced = new Set<string>();
let syncing = false;
let retries = 0;
const RETRY_DELAYS_MS = [3_000, 15_000, 60_000];

async function flushSeen(): Promise<void> {
  if (syncing || unsynced.size === 0) return;
  syncing = true;
  const ids = [...unsynced];
  let retry = false;
  try {
    const result = await markTipsSeenAction({ ids });
    if (result?.validationErrors) {
      // Ids this server does not know (a newer or older deploy): drop them.
      for (const id of ids) unsynced.delete(id);
    } else if (actionErrorMessage(result)) {
      retry = true;
    } else {
      for (const id of ids) unsynced.delete(id);
      retries = 0;
    }
  } catch {
    retry = true;
  } finally {
    syncing = false;
  }
  if (retry) {
    const delay = RETRY_DELAYS_MS[retries];
    retries += 1;
    // Out of retries: the tip is gone for this visit and may return on the
    // next one, which beats a toast about something this small.
    if (delay !== undefined) setTimeout(() => void flushSeen(), delay);
    return;
  }
  void flushSeen();
}

/** Writes of "off" on their way: a snapshot does not undo them meanwhile. */
let pendingOff = 0;

export const useTipsStore = create<TipsState>()((set, get) => ({
  loaded: false,
  seen: new Set(),
  off: false,
  createdOn: null,
  context: EMPTY_CONTEXT,

  hydrate: (snapshot) =>
    set((state) => ({
      loaded: true,
      seen: new Set([...snapshot.seen, ...state.seen]),
      off: pendingOff > 0 ? state.off : snapshot.off,
      createdOn: snapshot.createdOn,
      context: snapshot.context,
    })),

  markSeen: (ids) => {
    const fresh = ids.filter((id) => !get().seen.has(id));
    if (fresh.length === 0) return;
    set((state) => ({ seen: new Set([...state.seen, ...fresh]) }));
    for (const id of fresh) unsynced.add(id);
    retries = 0;
    void flushSeen();
  },

  setOff: async (off) => {
    const previous = get().off;
    pendingOff += 1;
    set({ off });
    try {
      const result = await setTipsOffAction({ off });
      if (!actionErrorMessage(result)) return true;
    } catch {
      // Network: revert below.
    } finally {
      pendingOff -= 1;
    }
    set({ off: previous });
    return false;
  },

  reset: async () => {
    try {
      if (actionErrorMessage(await resetTipsAction())) return false;
    } catch {
      return false;
    }
    const kept = (id: string) => NOVIDADE_IDS.includes(id);
    for (const id of unsynced) if (!kept(id)) unsynced.delete(id);
    set((state) => ({
      off: false,
      seen: new Set([...state.seen].filter(kept)),
    }));
    return true;
  },
}));
