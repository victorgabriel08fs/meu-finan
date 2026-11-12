// What the notification center (the bell, doc 02 §6.15) knows about each
// kind of notice: its icon, the flag it needs, the push tag and how a stored
// payload turns into what the person reads. Kinds are looked up by
// `notifications.type`, so a new feature (a sharing invite, say) only adds an
// entry here and its payload shape in src/server/db/schema/types.ts. Pure: the
// route handler renders on the server, the sheet only draws the result.
import type { FlagKey, Flags } from "@/lib/flags/registry";
import type {
  NotificationType,
  ReminderNotificationType,
} from "@/server/db/schema/enums";
import type { NotificationPayload } from "@/server/db/schema/types";
import { isReminderEvent } from "./events";

/** Icons the sheet can draw (it maps each name to a Lucide icon). */
export const NOTICE_ICONS = [
  "sun",
  "receipt",
  "calendar-clock",
  "banknote",
  "calendar-days",
  "chart",
  "bell",
] as const;
export type NoticeIconName = (typeof NOTICE_ICONS)[number];

/** Background and icon colour of the circle, from the tokens of doc 02 §3.1. */
export type NoticeTone = "primary" | `cat-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`;

/** What a button on a notice does; the sheet decides how to run each one. */
export const NOTICE_ACTION_IDS = [
  "open",
  "mark_paid",
  "accept_share",
  "decline_share",
  "record_settlement",
] as const;
export type NoticeActionId = (typeof NOTICE_ACTION_IDS)[number];
export type NoticeAction = { id: NoticeActionId; label: string };

export type RenderedNotice = {
  title: string;
  body: string;
  /** A path in the app: where a tap on the notice goes. */
  href: string;
  actions: NoticeAction[];
};

export type RenderOptions = {
  /** The person's privacy mode (a device choice): amounts stay hidden. */
  discreet: boolean;
};

export type NoticeKind = {
  icon: NoticeIconName;
  tone: NoticeTone;
  /** The notice only exists for people with this flag. */
  flag?: FlagKey;
  /** Pushes with the same tag replace each other on the device. */
  pushTag: string;
  render: (
    payload: NotificationPayload,
    options: RenderOptions,
  ) => RenderedNotice;
};

/** One notice of the bell, already rendered by its kind by `GET /api/notificacoes`. */
export type NoticeItem = {
  id: string;
  type: string;
  icon: NoticeIconName;
  tone: NoticeTone;
  /** ISO instant. */
  createdAt: string;
  read: boolean;
  title: string;
  body: string;
  /** The body carries amounts: the sheet hides it in the privacy mode. */
  hasAmounts: boolean;
  href: string;
  actions: NoticeAction[];
  /** With a "mark_paid" action: the entry it pays. */
  transactionId?: string;
};

export type NoticesResponse = {
  unread: number;
  items: NoticeItem[];
  /** Cursor (\`antes\`) of the next page; null on the last one. */
  next: string | null;
};

/** Shown instead of the body of a notice that carries amounts. */
export const DISCREET_BODY = "Valores ocultos. Toque para abrir.";

/** Whether the payload's title or body may carry money (old rows: yes). */
export function payloadHasAmounts(payload: NotificationPayload): boolean {
  return "amounts" in payload ? payload.amounts !== false : true;
}

type ReminderPayload = Extract<
  NotificationPayload,
  { type: ReminderNotificationType }
>;

function isReminderPayload(
  payload: NotificationPayload,
): payload is ReminderPayload {
  return isReminderEvent(payload.type);
}

/** The notices of the daily job: they store the texts as they were sent. */
function reminderKind(
  icon: NoticeIconName,
  tone: NoticeTone,
  pushTag: string,
  actionLabel: string,
): NoticeKind {
  return {
    icon,
    tone,
    pushTag,
    render: (payload, { discreet }) => {
      if (!isReminderPayload(payload)) {
        throw new Error(`Not a reminder payload: ${payload.type}`);
      }
      return {
        title: payload.title,
        body:
          discreet && payloadHasAmounts(payload) ? DISCREET_BODY : payload.body,
        href: payload.url,
        actions: [{ id: "open", label: actionLabel }],
      };
    },
  };
}

/** Kinds by `notifications.type`; a type without an entry is never listed. */
export const NOTICE_KINDS: Partial<Record<NotificationType, NoticeKind>> = {
  daily_summary: reminderKind("sun", "primary", "resumo-dia", "Ver resumo"),
  bills_due: reminderKind("receipt", "cat-2", "contas", "Ver contas"),
  non_business_due: reminderKind(
    "calendar-clock",
    "cat-4",
    "dia-nao-util",
    "Ver contas",
  ),
  income_countdown: reminderKind("banknote", "cat-3", "receita", "Ver resumo"),
  weekly_summary: reminderKind(
    "calendar-days",
    "cat-1",
    "resumo-semana",
    "Ver relatório",
  ),
  monthly_summary: reminderKind(
    "chart",
    "cat-7",
    "resumo-mes",
    "Ver relatório",
  ),
};

/** A notice as the sheet and the route see it, rendered by its kind. */
export function renderNotice(
  payload: NotificationPayload,
  options: RenderOptions,
): (RenderedNotice & { icon: NoticeIconName; tone: NoticeTone }) | null {
  const kind = NOTICE_KINDS[payload.type];
  if (!kind) return null;
  return {
    icon: kind.icon,
    tone: kind.tone,
    ...kind.render(payload, options),
  };
}

/** The types the person can see in the bell and count on the icon. */
export function visibleNotificationTypes(
  flags: Pick<Flags, FlagKey> | Partial<Record<FlagKey, boolean>>,
): NotificationType[] {
  return (Object.keys(NOTICE_KINDS) as NotificationType[]).filter((type) => {
    const flag = NOTICE_KINDS[type]?.flag;
    return !flag || flags[flag] === true;
  });
}

/** The push tag of a type, when it has one. */
export function pushTagOf(type: NotificationType): string | undefined {
  return NOTICE_KINDS[type]?.pushTag;
}
