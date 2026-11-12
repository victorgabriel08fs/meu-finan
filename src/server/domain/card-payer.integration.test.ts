// "Conta que paga a fatura" (doc 02 §6.8) against a real (in-memory)
// Postgres: the card's chosen account (credit_card_details.payment_account_id),
// its checks, and the account of the latest paid invoice payment, which Quanto
// dá para gastar uses when the card names none.
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.DATABASE_URL = "pglite:memory";

type Domain = {
  accounts: typeof import("./accounts");
  cards: typeof import("./cards");
  context: typeof import("./context");
  requestReads: typeof import("./request-reads");
  transactions: typeof import("./transactions");
};

let d: Domain;
let db: typeof import("../db/client").db;
let schema: typeof import("../db/schema");
const ids = {} as Record<
  "checking" | "wallet" | "box" | "archived" | "card" | "otherCard" | "theirs",
  string
>;

// 14/out/2026, 12:00 in São Paulo.
const NOW = Date.UTC(2026, 9, 14, 15, 0, 0);

const cardDetails = async (cardId: string) =>
  (await d.accounts.listAccounts("owner")).find((item) => item.id === cardId)
    ?.card;

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  ({ db } = await import("../db/client"));
  await migrate(db as never, { migrationsFolder: "drizzle" });
  schema = await import("../db/schema");
  const { ensureOwnerDefaults } = await import("../db/seed-defaults");
  await db.insert(schema.user).values([
    { id: "owner", name: "Ana", email: "ana@exemplo.com" },
    { id: "outro", name: "Outro", email: "outro@exemplo.com" },
  ]);
  await ensureOwnerDefaults("owner");
  await ensureOwnerDefaults("outro");
  d = {
    accounts: await import("./accounts"),
    cards: await import("./cards"),
    context: await import("./context"),
    requestReads: await import("./request-reads"),
    transactions: await import("./transactions"),
  };
  const create = (
    userId: string,
    name: string,
    type: "checking" | "cash" | "savings_box" | "credit_card",
    paymentAccountId?: string,
  ) =>
    d.accounts.createAccount(userId, {
      name,
      type,
      initialBalanceCents: type === "credit_card" ? 0 : 100_000,
      card:
        type === "credit_card"
          ? {
              limitCents: 500_000,
              closingDay: 17,
              dueDay: 25,
              paymentAccountId,
            }
          : null,
    });
  ids.checking = await create("owner", "Conta principal", "checking");
  ids.wallet = await create("owner", "Carteira", "cash");
  ids.box = await create("owner", "Caixinha", "savings_box");
  ids.archived = await create("owner", "Antiga", "checking");
  await d.accounts.archiveAccount("owner", ids.archived);
  ids.card = await create("owner", "Cartão", "credit_card", ids.checking);
  ids.otherCard = await create("owner", "Outro cartão", "credit_card");
  ids.theirs = await create("outro", "Do outro", "checking");
}, 60_000);

describe("Conta que paga a fatura", () => {
  it("keeps the account chosen for a new card", async () => {
    expect(await cardDetails(ids.card)).toMatchObject({
      limitCents: 500_000,
      paymentAccountId: ids.checking,
    });
    expect((await cardDetails(ids.otherCard))?.paymentAccountId).toBeNull();
  });

  it("refuses someone else's account, a card and an archived account", async () => {
    const card = (paymentAccountId: string) =>
      d.accounts.createAccount("owner", {
        name: "Novo",
        type: "credit_card",
        initialBalanceCents: 0,
        card: {
          limitCents: 1_000,
          closingDay: 5,
          dueDay: 12,
          paymentAccountId,
        },
      });
    await expect(card(ids.theirs)).rejects.toThrow("Conta não encontrado(a).");
    await expect(card(ids.otherCard)).rejects.toThrow(
      "Escolha uma conta, não um cartão.",
    );
    await expect(card(ids.archived)).rejects.toThrow(
      "Esta conta está arquivada.",
    );
    // Nothing was created: the check runs in the same transaction.
    const names = (await d.accounts.listAccounts("owner")).map(
      (item) => item.name,
    );
    expect(names).not.toContain("Novo");
  });

  it("changes, keeps and clears it when the card is edited", async () => {
    const cycle = { limitCents: 600_000, closingDay: 17, dueDay: 25 };
    await d.accounts.updateAccount("owner", ids.card, {
      card: { ...cycle, paymentAccountId: ids.wallet },
    });
    expect((await cardDetails(ids.card))?.paymentAccountId).toBe(ids.wallet);
    // Left out, it stays: editing the limit does not clear it.
    await d.accounts.updateAccount("owner", ids.card, {
      card: { ...cycle, limitCents: 700_000 },
    });
    expect(await cardDetails(ids.card)).toMatchObject({
      limitCents: 700_000,
      paymentAccountId: ids.wallet,
    });
    await d.accounts.updateAccount("owner", ids.card, {
      card: { ...cycle, paymentAccountId: null },
    });
    expect((await cardDetails(ids.card))?.paymentAccountId).toBeNull();
    await d.accounts.updateAccount("owner", ids.card, {
      card: { ...cycle, paymentAccountId: ids.checking },
    });
  });

  it("refuses someone else's account or a card on edit, changing nothing", async () => {
    const cycle = { limitCents: 1, closingDay: 17, dueDay: 25 };
    await expect(
      d.accounts.updateAccount("owner", ids.card, {
        name: "Mudou",
        card: { ...cycle, paymentAccountId: ids.theirs },
      }),
    ).rejects.toThrow("Conta não encontrado(a).");
    await expect(
      d.accounts.updateAccount("owner", ids.card, {
        card: { ...cycle, paymentAccountId: ids.card },
      }),
    ).rejects.toThrow("Escolha uma conta, não um cartão.");
    const card = (await d.accounts.listAccounts("owner")).find(
      (item) => item.id === ids.card,
    );
    expect(card?.name).toBe("Cartão");
    expect(card?.card).toMatchObject({
      limitCents: 600_000,
      paymentAccountId: ids.checking,
    });
  });

  it("goes back to none when the paying account is deleted", async () => {
    const doomed = await d.accounts.createAccount("owner", {
      name: "Temporária",
      type: "checking",
      initialBalanceCents: 0,
    });
    const card = await d.accounts.createAccount("owner", {
      name: "Cartão da temporária",
      type: "credit_card",
      initialBalanceCents: 0,
      card: {
        limitCents: 1_000,
        closingDay: 5,
        dueDay: 12,
        paymentAccountId: doomed,
      },
    });
    await db
      .delete(schema.finAccounts)
      .where(eq(schema.finAccounts.id, doomed));
    expect((await cardDetails(card))?.paymentAccountId).toBeNull();
  });
});

describe("invoicePayersOf", () => {
  it("is empty without cards", async () => {
    const ctx = await d.context.getUserContext("outro", { now: NOW });
    expect(await d.requestReads.invoicePayersOf(ctx)).toEqual(new Map());
  });

  it("names the account of each card's latest paid payment, never a scheduled one", async () => {
    const ctx = await d.context.getUserContext("owner", { now: NOW });
    await d.transactions.createTransaction(ctx, {
      kind: "expense",
      amountCents: 30_000,
      accountId: ids.card,
      categoryId: null,
      description: "Mercado",
      occurredOn: "2026-09-10",
    });
    const [invoice] = await d.cards.listInvoices(ctx, ids.card);
    if (!invoice) throw new Error("fatura");
    const pay = (fromAccountId: string, occurredOn: string) =>
      d.cards.payInvoice(ctx, {
        invoiceId: invoice.id,
        fromAccountId,
        amountCents: 5_000,
        occurredOn,
      });
    expect(await d.requestReads.invoicePayersOf(ctx)).toEqual(new Map());
    await pay(ids.wallet, "2026-10-01");
    // Dated earlier, made later: the date decides.
    await pay(ids.checking, "2026-09-20");
    // Scheduled (ahead of today): not a payment yet.
    await pay(ids.box, "2026-10-20");
    const payers = await d.requestReads.invoicePayersOf(ctx);
    expect(payers).toEqual(new Map([[ids.card, ids.wallet]]));
  });
});
