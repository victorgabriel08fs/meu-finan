import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SpendablePerDay } from "@/server/domain/dashboard";
import {
  persistDailySpendAccounts,
  SpendableAccountsButton,
  SpendableAccountsList,
} from "./spendable-accounts-sheet";

// "Contas no bloco" of Quanto dá para gastar por dia (doc 02 §6.3): a switch
// per account, saved on the account.

const mocks = vi.hoisted(() => ({ save: vi.fn(), toast: vi.fn() }));
// Server Actions are not available outside Next.
vi.mock("@/server/actions/preferences", () => ({
  saveDailySpendAccountsAction: mocks.save,
}));
vi.mock("sonner", () => ({ toast: mocks.toast }));

beforeEach(() => {
  vi.clearAllMocks();
});

const accounts: SpendablePerDay["accounts"] = [
  {
    id: "checking",
    name: "Conta principal",
    color: "cat-1",
    icon: "landmark",
    type: "checking",
    shown: true,
  },
  {
    id: "reserve",
    name: "Reserva",
    color: "cat-3",
    icon: "trending-up",
    type: "investment",
    shown: false,
  },
];

/** The <li> of one account in the list's markup. */
const row = (html: string, id: string) =>
  new RegExp(`<li[^>]*data-account="${id}"[^>]*>(.*?)</li>`).exec(html)?.[1] ??
  "";

const list = (shown: Record<string, boolean>) =>
  renderToStaticMarkup(
    <SpendableAccountsList
      accounts={accounts}
      shown={shown}
      onChange={vi.fn()}
    />,
  );

describe("SpendableAccountsList", () => {
  it("gives each account a switch named by it and described by its type", () => {
    const html = list({ checking: true, reserve: false });
    expect(html.match(/role="switch"/g)).toHaveLength(2);
    const checking = row(html, "checking");
    expect(checking).toContain('aria-checked="true"');
    const labelledBy = /aria-labelledby="([^"]+)"/.exec(checking)?.[1];
    const describedBy = /aria-describedby="([^"]+)"/.exec(checking)?.[1];
    expect(checking).toMatch(
      new RegExp(`id="${labelledBy}"[^>]*>Conta principal<`),
    );
    expect(checking).toMatch(
      new RegExp(`id="${describedBy}"[^>]*>Conta corrente<`),
    );
    expect(row(html, "reserve")).toContain('aria-checked="false"');
    expect(row(html, "reserve")).toContain(">Investimento<");
    // The account's color as a dot, out of the accessibility tree.
    expect(checking).toContain(
      'aria-hidden="true" class="size-2 shrink-0 rounded-full bg-cat-1-fg"',
    );
  });

  it("says that with nothing on each day shows only the total", () => {
    expect(list({ checking: true })).not.toContain("Sem contas marcadas");
    expect(list({ checking: false, reserve: false })).toContain(
      "Sem contas marcadas, cada dia mostra só o total.",
    );
  });
});

describe("SpendableAccountsButton", () => {
  it("opens a dialog and can shrink with large text", () => {
    const html = renderToStaticMarkup(
      <SpendableAccountsButton accounts={accounts} />,
    );
    expect(html).toContain("Escolher contas");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain("max-w-full shrink");
    expect(html).toContain("min-h-11");
  });
});

describe("persistDailySpendAccounts", () => {
  it("sends the hidden accounts and resolves true when saved", async () => {
    mocks.save.mockResolvedValue({});
    expect(await persistDailySpendAccounts(["reserve"])).toBe(true);
    expect(mocks.save).toHaveBeenCalledWith({ hiddenAccountIds: ["reserve"] });
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("shows the server's message and resolves false", async () => {
    mocks.save.mockResolvedValue({
      serverError: "Personalizar o Início não está disponível na sua conta.",
    });
    expect(await persistDailySpendAccounts([])).toBe(false);
    expect(mocks.toast).toHaveBeenCalledWith(
      "Personalizar o Início não está disponível na sua conta.",
    );
  });

  it("explains a network failure", async () => {
    mocks.save.mockRejectedValue(new Error("offline"));
    expect(await persistDailySpendAccounts([])).toBe(false);
    expect(mocks.toast).toHaveBeenCalledWith(
      "Não conseguimos salvar. Verifique a conexão.",
    );
  });
});
