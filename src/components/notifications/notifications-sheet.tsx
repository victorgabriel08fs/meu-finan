"use client";

import { BellOff, X } from "lucide-react";
import { motion, type PanInfo } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/app/empty-state";
import {
  actionErrorMessage,
  NETWORK_ERROR,
} from "@/components/transactions/action-result";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { toastWithUndo } from "@/components/ui/toast";
import { afterSheetsClose } from "@/components/ui/use-back-to-close";
import {
  groupNotifications,
  noticeTimeLabel,
  SECTION_LABELS,
} from "@/lib/notifications/center";
import {
  DISCREET_BODY,
  type NoticeAction,
  type NoticeItem,
} from "@/lib/notifications/kinds";
import { cn } from "@/lib/utils";
import { setPaidAction } from "@/server/actions/transactions";
import { useNotificationsStore } from "@/stores/notifications";
import { usePrivacyStore } from "@/stores/privacy";
import { NoticeIcon } from "./notice-icon";

/** Dragged this far to the left (or flicked), a notice is dismissed. */
const DISMISS_DISTANCE = 96;
const DISMISS_VELOCITY = 500;

/**
 * Where a tapped notice points, pushed once the sheet is closed and its
 * history entry is gone: pushed earlier, the sheet's step back would undo it
 * (useBackToClose).
 */
let pendingHref: string | null = null;

/**
 * The notification center (doc 02 §6.15): a sheet (a dialog from md) with the
 * notices grouped in Hoje, Esta semana and Antes. Tapping a notice reads it
 * and goes where it points; each one may carry buttons (the kind decides),
 * can be read, and can be dismissed by dragging it to the left or with its X,
 * with "Desfazer". Opened by the bell and the sidebar through the store.
 */
export function NotificationsSheet({ timeZone }: { timeZone: string }) {
  const open = useNotificationsStore((state) => state.open);
  const setOpen = useNotificationsStore((state) => state.setOpen);
  const items = useNotificationsStore((state) => state.items);
  const unread = useNotificationsStore((state) => state.unread);
  const status = useNotificationsStore((state) => state.status);
  const next = useNotificationsStore((state) => state.next);
  const load = useNotificationsStore((state) => state.load);
  const loadMore = useNotificationsStore((state) => state.loadMore);
  const router = useRouter();
  const markAllRead = useNotificationsStore((state) => state.markAllRead);

  // A fresh list each time the sheet opens; what is already there stays on
  // screen meanwhile.
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => {
    if (open || pendingHref === null) return;
    const href = pendingHref;
    pendingHref = null;
    afterSheetsClose(() => router.push(href));
  }, [open, router]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent title="Notificações" bodyClassName="px-0">
        <NoticeList
          items={items}
          status={status}
          hasMore={next !== null}
          unread={unread}
          timeZone={timeZone}
          onRetry={() => void load()}
          onMore={() => void loadMore()}
          onReadAll={() => void markAllRead()}
        />
      </SheetContent>
    </Sheet>
  );
}

type NoticeListProps = {
  items: NoticeItem[] | null;
  status: "idle" | "loading" | "error";
  hasMore: boolean;
  unread: number;
  timeZone: string;
  onRetry: () => void;
  onMore: () => void;
  onReadAll: () => void;
};

export function NoticeList({
  items,
  status,
  hasMore,
  unread,
  timeZone,
  onRetry,
  onMore,
  onReadAll,
}: NoticeListProps) {
  // The day sections follow the moment the list arrived, not each render.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `items` is the trigger
  const now = useMemo(() => Date.now(), [items]);

  if (items === null) {
    if (status === "error") {
      return (
        <div
          role="alert"
          className="flex flex-col items-center gap-3 px-5 py-10 text-center"
        >
          <p className="text-body text-fg-2">
            Não deu para carregar as notificações.
          </p>
          <Button variant="tonal" onClick={onRetry}>
            Tentar de novo
          </Button>
        </div>
      );
    }
    return (
      <LoadingRegion
        label="Carregando notificações…"
        className="flex flex-col gap-3 px-5"
      >
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className="h-19 w-full" />
        ))}
      </LoadingRegion>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<BellOff />}
        title="Nada por aqui"
        description="Avisos e convites aparecem aqui."
      />
    );
  }

  const sections = groupNotifications(items, now, timeZone);
  return (
    <div className="flex flex-col gap-4">
      {unread > 0 ? (
        <div className="flex min-w-0 justify-end px-3">
          <Button
            variant="ghost"
            size="sm"
            className="max-w-full shrink"
            onClick={onReadAll}
          >
            Marcar todas como lidas
          </Button>
        </div>
      ) : null}
      {sections.map(({ section, items: group }) => (
        <section key={section} aria-labelledby={`notices-${section}`}>
          <h3
            id={`notices-${section}`}
            className="px-5 pb-1 text-overline text-fg-3 uppercase"
          >
            {SECTION_LABELS[section]}
          </h3>
          <ul className="flex flex-col">
            {group.map((item) => (
              <NoticeRow
                key={item.id}
                item={item}
                now={now}
                timeZone={timeZone}
              />
            ))}
          </ul>
        </section>
      ))}
      {hasMore ? (
        <div className="flex justify-center px-5">
          <Button variant="ghost" onClick={onMore}>
            Ver anteriores
          </Button>
        </div>
      ) : null}
      {status === "error" ? (
        <p role="alert" className="px-5 text-center text-callout text-fg-3">
          Não deu para carregar as notificações.
        </p>
      ) : null}
    </div>
  );
}

function NoticeRow({
  item,
  now,
  timeZone,
}: {
  item: NoticeItem;
  now: number;
  timeZone: string;
}) {
  const setOpen = useNotificationsStore((state) => state.setOpen);
  const markRead = useNotificationsStore((state) => state.markRead);
  const dismiss = useNotificationsStore((state) => state.dismiss);
  const restore = useNotificationsStore((state) => state.restore);
  const discreet = usePrivacyStore((state) => state.hidden);
  const [busy, setBusy] = useState<string | null>(null);
  // A drag ends in a click on whatever is under the finger: ignore that one.
  const dragged = useRef(false);

  const body = discreet && item.hasAmounts ? DISCREET_BODY : item.body;

  function open() {
    if (dragged.current) return;
    if (!item.read) void markRead([item.id]);
    pendingHref = item.href;
    setOpen(false);
  }

  async function dismissItem() {
    const done = await dismiss(item.id);
    if (!done) {
      toast.error("Não deu para dispensar. Tente de novo.");
      return;
    }
    toastWithUndo("Notificação dispensada", () => void restore(item));
  }

  function endDrag(_event: unknown, info: PanInfo) {
    setTimeout(() => {
      dragged.current = false;
    }, 60);
    if (
      info.offset.x < -DISMISS_DISTANCE ||
      info.velocity.x < -DISMISS_VELOCITY
    ) {
      void dismissItem();
    }
  }

  async function run(action: NoticeAction) {
    if (action.id === "open") {
      open();
      return;
    }
    if (action.id === "mark_paid" && item.transactionId) {
      setBusy(action.id);
      try {
        const result = await setPaidAction({
          id: item.transactionId,
          paid: true,
        });
        const error = actionErrorMessage(result);
        if (error) {
          toast.error(error);
          return;
        }
        toast("Conta marcada como paga.");
        useNotificationsStore.setState((state) => ({
          items:
            state.items?.map((candidate) =>
              candidate.id === item.id
                ? {
                    ...candidate,
                    actions: candidate.actions.filter(
                      (entry) => entry.id !== "mark_paid",
                    ),
                  }
                : candidate,
            ) ?? null,
        }));
        if (!item.read) void markRead([item.id]);
      } catch {
        toast.error(NETWORK_ERROR);
      } finally {
        setBusy(null);
      }
    }
  }

  const actions = item.actions.filter(
    (action) => action.id === "open" || action.id === "mark_paid",
  );

  return (
    <li className="relative overflow-hidden">
      <span
        aria-hidden="true"
        className="absolute inset-y-0 right-0 flex w-32 items-center justify-end bg-surface-2 pr-5 text-callout text-fg-3"
      >
        Dispensar
      </span>
      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.5, right: 0 }}
        dragSnapToOrigin
        onDragStart={() => {
          dragged.current = true;
        }}
        onDragEnd={endDrag}
        className="relative flex min-w-0 flex-wrap items-start gap-x-3 gap-y-1 bg-surface py-3 pr-1 pl-5"
      >
        <NoticeIcon icon={item.icon} tone={item.tone} />
        <div className="flex min-w-0 flex-[1_1_10rem] flex-col gap-2">
          <button
            type="button"
            onClick={open}
            className="flex min-w-0 flex-col gap-0.5 rounded-control text-left"
          >
            <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
              <span
                className={cn(
                  "min-w-0 flex-[1_1_8rem] text-headline wrap-anywhere text-fg",
                  !item.read && "font-semibold",
                )}
              >
                {item.read ? null : (
                  <>
                    <span
                      aria-hidden="true"
                      className="mr-2 inline-block size-2 rounded-full bg-primary align-middle"
                    />
                    <span className="sr-only">Não lida: </span>
                  </>
                )}
                {item.title}
              </span>
              <span className="shrink-0 text-caption text-fg-3">
                {noticeTimeLabel(item.createdAt, now, timeZone)}
              </span>
            </span>
            <span className="line-clamp-3 min-w-0 text-callout wrap-anywhere text-fg-2">
              {body}
            </span>
          </button>
          {actions.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {actions.map((action) => (
                <Button
                  key={action.id}
                  size="sm"
                  variant={action.id === "mark_paid" ? "tonal" : "secondary"}
                  loading={busy === action.id}
                  onClick={() => void run(action)}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
        <IconButton label="Dispensar" onClick={() => void dismissItem()}>
          <X />
        </IconButton>
      </motion.div>
    </li>
  );
}
