import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FlagsProvider } from "@/components/flags/flags-provider";
import { FLAGS, type Flags } from "@/lib/flags/registry";
import type { NoticeItem } from "@/lib/notifications/kinds";
import { useNotificationsStore } from "@/stores/notifications";
import { usePrivacyStore } from "@/stores/privacy";
import { NotificationBell } from "./notification-bell";
import { NotificationsNavItem } from "./notifications-nav-item";
import { NoticeList } from "./notifications-sheet";

// Server Actions and the router are not available outside Next.
vi.mock("@/server/actions/notifications", () => ({
  markNotificationsReadAction: vi.fn(),
  dismissNotificationAction: vi.fn(),
  restoreNotificationAction: vi.fn(),
}));
vi.mock("@/server/actions/transactions", () => ({ setPaidAction: vi.fn() }));
vi.mock("@/server/actions/sharing", () => ({ respondToInviteAction: vi.fn() }));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const flags = (central: boolean): Flags => ({
  ...(Object.fromEntries(
    Object.entries(FLAGS).map(([key, def]) => [key, def.defaultValue]),
  ) as Flags),
  central_notificacoes: central,
});

const withFlag = (central: boolean, node: React.ReactNode) =>
  renderToStaticMarkup(
    <FlagsProvider flags={flags(central)}>{node}</FlagsProvider>,
  );

// A server render reads each store's initial state, so that is what changes.
const setUnread = (unread: number) =>
  Object.assign(useNotificationsStore.getInitialState(), { unread });
const setHidden = (hidden: boolean) =>
  Object.assign(usePrivacyStore.getInitialState(), { hidden });

beforeEach(() => {
  setUnread(0);
  setHidden(false);
});

describe("NotificationBell", () => {
  it("names the button and shows no badge without unread notices", () => {
    const html = withFlag(true, <NotificationBell />);
    expect(html).toContain('aria-label="Notificações"');
    expect(html).toContain('data-tip="sino"');
    expect(html).not.toContain("bg-danger");
  });

  it("counts the unread ones in the name and the badge, 9+ above nine", () => {
    setUnread(3);
    let html = withFlag(true, <NotificationBell />);
    expect(html).toContain('aria-label="Notificações, 3 não lidas"');
    expect(html).toContain(">3<");
    setUnread(1);
    html = withFlag(true, <NotificationBell />);
    expect(html).toContain('aria-label="Notificações, 1 não lida"');
    setUnread(25);
    expect(withFlag(true, <NotificationBell />)).toContain(">9+<");
  });

  it("is absent with the flag off", () => {
    expect(withFlag(false, <NotificationBell />)).not.toContain("<button");
  });
});

describe("NotificationsNavItem", () => {
  it("is a button with the count on the right", () => {
    setUnread(2);
    const html = withFlag(true, <NotificationsNavItem />);
    expect(html).toContain("<button");
    expect(html).toContain('aria-label="Notificações, 2 não lidas"');
    expect(html).toContain("Notificações");
    expect(html).toContain(">2<");
  });

  it("is absent with the flag off", () => {
    expect(withFlag(false, <NotificationsNavItem />)).toBe("");
  });
});

const item = (over: Partial<NoticeItem> = {}): NoticeItem => ({
  id: "n1",
  type: "bills_due",
  icon: "receipt",
  tone: "primary",
  createdAt: new Date().toISOString(),
  read: false,
  title: "Contas a vencer",
  body: "Condomínio (R$ 680,00)",
  hasAmounts: true,
  href: "/extrato",
  actions: [{ id: "open", label: "Ver contas" }],
  ...over,
});

const list = (over: Partial<Parameters<typeof NoticeList>[0]> = {}) =>
  renderToStaticMarkup(
    <NoticeList
      items={[item()]}
      status="idle"
      hasMore={false}
      unread={1}
      timeZone="America/Sao_Paulo"
      onRetry={() => {}}
      onMore={() => {}}
      onReadAll={() => {}}
      {...over}
    />,
  );

describe("NoticeList", () => {
  it("loads with a skeleton", () => {
    expect(list({ items: null })).toContain("Carregando notificações");
  });

  it("offers a retry on error", () => {
    const html = list({ items: null, status: "error" });
    expect(html).toContain("Não deu para carregar as notificações.");
    expect(html).toContain("Tentar de novo");
  });

  it("explains the empty list", () => {
    const html = list({ items: [], unread: 0 });
    expect(html).toContain("Nada por aqui");
    expect(html).toContain("Avisos e convites aparecem aqui.");
  });

  it("groups by day, marks the unread and offers each notice's actions", () => {
    const html = list();
    expect(html).toContain("Hoje");
    expect(html).toContain("Marcar todas como lidas");
    expect(html).toContain("Não lida: ");
    expect(html).toContain("Ver contas");
    expect(html).toContain('aria-label="Dispensar"');
  });

  it("hides 'Marcar todas' and the unread mark when all is read", () => {
    const html = list({ items: [item({ read: true })], unread: 0 });
    expect(html).not.toContain("Marcar todas como lidas");
    expect(html).not.toContain("Não lida: ");
  });

  it("hides amounts in the privacy mode", () => {
    setHidden(true);
    const html = list();
    expect(html).not.toContain("680,00");
    expect(html).toContain("Valores ocultos");
  });

  it("keeps a body without amounts in the privacy mode", () => {
    setHidden(true);
    expect(
      list({ items: [item({ hasAmounts: false, body: "Sua semana" })] }),
    ).toContain("Sua semana");
  });

  it("shows 'Ver anteriores' only with a next page", () => {
    expect(list({ hasMore: true })).toContain("Ver anteriores");
    expect(list()).not.toContain("Ver anteriores");
  });
});
