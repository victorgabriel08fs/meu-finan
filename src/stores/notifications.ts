import { create } from "zustand";
import { actionErrorMessage } from "@/components/transactions/action-result";
import type { NoticeItem, NoticesResponse } from "@/lib/notifications/kinds";
import {
  dismissNotificationAction,
  markNotificationsReadAction,
  restoreNotificationAction,
} from "@/server/actions/notifications";

/**
 * The notification center of the signed-in person (the bell, doc 02 §6.15).
 * The app layout hands over the server's unread count once per page load
 * (NotificationsHost → `hydrate`); the list is fetched when the sheet opens
 * (GET /api/notificacoes) and the browser's truth from then on: reading and
 * dismissing apply here at once and reach the server in the background.
 * One account per page load (signing in and out reload the page), and a
 * different `userId` starts the store over, so nothing carries over.
 */
type NotificationsState = {
  userId: string | null;
  /** central_notificacoes is on for the person. */
  enabled: boolean;
  unread: number;
  /** null until the first page arrives. */
  items: NoticeItem[] | null;
  /** Cursor of the next page; null on the last. */
  next: string | null;
  open: boolean;
  status: "idle" | "loading" | "error";
  /** This device receives the person's push (the icon number follows). */
  pushOn: boolean;
  hydrate: (input: {
    userId: string;
    enabled: boolean;
    unread: number;
  }) => void;
  setOpen: (open: boolean) => void;
  setPushOn: (on: boolean) => void;
  /** First page, again (opening the sheet, "Tentar de novo"). */
  load: () => Promise<void>;
  loadMore: () => Promise<void>;
  /** Only the count (coming back to the app). */
  refreshCount: () => Promise<void>;
  markRead: (ids: readonly string[]) => Promise<void>;
  markAllRead: () => Promise<void>;
  /** Resolves false when the server refused (the item is back on the list). */
  dismiss: (id: string) => Promise<boolean>;
  restore: (item: NoticeItem) => Promise<void>;
};

async function fetchNotices(query: string): Promise<NoticesResponse> {
  const response = await fetch(`/api/notificacoes${query}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`notices ${response.status}`);
  return (await response.json()) as NoticesResponse;
}

const newestFirst = (a: NoticeItem, b: NoticeItem) =>
  b.createdAt.localeCompare(a.createdAt);

export const useNotificationsStore = create<NotificationsState>()(
  (set, get) => ({
    userId: null,
    enabled: false,
    unread: 0,
    items: null,
    next: null,
    open: false,
    status: "idle",
    pushOn: false,

    hydrate: ({ userId, enabled, unread }) =>
      set((state) =>
        state.userId === userId
          ? { enabled, unread }
          : {
              userId,
              enabled,
              unread,
              items: null,
              next: null,
              open: false,
              status: "idle",
              pushOn: false,
            },
      ),

    setOpen: (open) => set({ open }),
    setPushOn: (pushOn) => set({ pushOn }),

    load: async () => {
      const userId = get().userId;
      if (get().items === null) set({ status: "loading" });
      try {
        const page = await fetchNotices("");
        if (get().userId !== userId) return;
        set({
          items: page.items,
          next: page.next,
          unread: page.unread,
          status: "idle",
        });
      } catch {
        // A list already on screen stays; an empty one shows the error.
        set((state) => (state.items === null ? { status: "error" } : {}));
      }
    },

    loadMore: async () => {
      const { next, items, userId } = get();
      if (!next || !items) return;
      try {
        const page = await fetchNotices(`?antes=${encodeURIComponent(next)}`);
        if (get().userId !== userId) return;
        set((state) => {
          const seen = new Set((state.items ?? []).map((item) => item.id));
          return {
            items: [
              ...(state.items ?? []),
              ...page.items.filter((item) => !seen.has(item.id)),
            ],
            next: page.next,
            unread: page.unread,
          };
        });
      } catch {
        set({ status: "error" });
      }
    },

    refreshCount: async () => {
      const userId = get().userId;
      try {
        const { unread } = await fetchNotices("?limite=0");
        if (get().userId === userId) set({ unread });
      } catch {
        // Offline: the number stays as it was.
      }
    },

    markRead: async (ids) => {
      const target = new Set(ids);
      set((state) => {
        const fresh =
          state.items?.filter((item) => target.has(item.id) && !item.read)
            .length ?? 0;
        return {
          items:
            state.items?.map((item) =>
              target.has(item.id) ? { ...item, read: true } : item,
            ) ?? null,
          unread: Math.max(0, state.unread - fresh),
        };
      });
      const result = await markNotificationsReadAction({ ids: [...ids] });
      if (result?.data) set({ unread: result.data.unread });
    },

    markAllRead: async () => {
      const newest = get().items?.[0];
      if (!newest) return;
      set((state) => ({
        items: state.items?.map((item) => ({ ...item, read: true })) ?? null,
        unread: 0,
      }));
      const result = await markNotificationsReadAction({
        until: newest.createdAt,
      });
      if (result?.data) set({ unread: result.data.unread });
    },

    dismiss: async (id) => {
      const before = get().items;
      const item = before?.find((candidate) => candidate.id === id);
      if (!before || !item) return false;
      set((state) => ({
        items: state.items?.filter((candidate) => candidate.id !== id) ?? null,
        unread: item.read ? state.unread : Math.max(0, state.unread - 1),
      }));
      const result = await dismissNotificationAction({ id });
      if (actionErrorMessage(result) !== null) {
        set((state) => ({
          items: [...(state.items ?? []), item].sort(newestFirst),
          unread: item.read ? state.unread : state.unread + 1,
        }));
        return false;
      }
      if (result?.data) set({ unread: result.data.unread });
      return true;
    },

    restore: async (item) => {
      set((state) => ({
        items: [
          ...(state.items ?? []).filter(
            (candidate) => candidate.id !== item.id,
          ),
          { ...item, read: true },
        ].sort(newestFirst),
      }));
      const result = await restoreNotificationAction({ id: item.id });
      if (result?.data) set({ unread: result.data.unread });
    },
  }),
);
