import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NewsList } from "@/app/(app)/ajustes/novidades/news-list";
import { TIPS, type TipsSnapshot } from "@/lib/tips";
import { useTipsStore } from "@/stores/tips";
import { tipLabel } from "./coach-mark";
import { NewsBadge, NewsDot } from "./news";
import { TipsPreferences } from "./tips-preferences";

// Server Actions are not importable outside Next; nothing is saved here.
vi.mock("@/server/actions/tips", () => ({
  markTipsSeenAction: vi.fn(),
  setTipsOffAction: vi.fn(),
  resetTipsAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

/** Visible text, without tags. */
const text = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const snapshot = (patch: Partial<TipsSnapshot> = {}): TipsSnapshot => ({
  seen: [],
  off: false,
  createdOn: "2026-01-01",
  context: { hasAccounts: true, hasPasskey: false, role: null, flags: [] },
  ...patch,
});

beforeEach(() => {
  useTipsStore.setState(useTipsStore.getInitialState(), true);
});

describe("tipLabel", () => {
  const basic = TIPS.find((tip) => tip.kind === "primeiros-passos");
  const news = TIPS.find((tip) => tip.kind === "novidade");

  it("counts the steps of a sequence and names a novidade", () => {
    if (!basic || !news) throw new Error("registro sem dicas");
    expect(tipLabel(basic, 1, 3)).toBe("Dica 1 de 3");
    expect(tipLabel(basic, 1, 1)).toBe("Dica");
    expect(tipLabel(news, 1, 1)).toBe("Novidade");
    expect(tipLabel(news, 2, 2)).toBe("Novidade 2 de 2");
  });
});

// The server renders stores in their initial state (useSyncExternalStore's
// server snapshot): before the tips load in the browser, nothing shows.
describe("unread novidades", () => {
  it("shows no dot or count in the server render", () => {
    useTipsStore.getState().hydrate(snapshot());
    expect(renderToStaticMarkup(<NewsDot />)).toBe("");
    expect(renderToStaticMarkup(<NewsBadge />)).toBe("");
  });
});

describe("NewsList", () => {
  it("groups by day and marks what is new", () => {
    const html = renderToStaticMarkup(
      <NewsList
        entries={[
          {
            id: "a",
            title: "Três relatórios novos",
            body: "Fluxo, Patrimônio e Calendário.",
            since: "2026-10-16",
            icon: "chart",
            link: { href: "/relatorios/fluxo", label: "Ver relatórios" },
            unread: true,
          },
          {
            id: "b",
            title: "Atalhos no ícone do app",
            body: "Toque e segure o ícone.",
            since: "2026-10-16",
            icon: "smartphone",
            link: null,
            unread: false,
          },
        ]}
        today="2026-10-18"
      />,
    );
    const visible = text(html);
    // The statement's day header, as in Administração › Atividade.
    expect(visible).toContain("sex, 16 out");
    expect(visible.match(/Nova/g)).toHaveLength(1);
    expect(html).toContain('href="/relatorios/fluxo"');
    expect(html.match(/<section/g)).toHaveLength(1);
    expect(visible).toContain("Preferências");
  });

  it("says so when there is nothing yet", () => {
    expect(
      text(renderToStaticMarkup(<NewsList entries={[]} today="2026-10-18" />)),
    ).toContain("Nada de novo por aqui");
  });
});

describe("TipsPreferences", () => {
  it("renders the server's choice before the tips load", () => {
    const off = renderToStaticMarkup(<TipsPreferences initiallyOff />);
    expect(off).toContain('role="switch"');
    expect(off).toContain('aria-checked="false"');
    expect(text(off)).toContain("Mostrar dicas nas telas");
    expect(text(off)).toContain("Rever dicas");
    expect(
      renderToStaticMarkup(<TipsPreferences initiallyOff={false} />),
    ).toContain('aria-checked="true"');
  });
});
