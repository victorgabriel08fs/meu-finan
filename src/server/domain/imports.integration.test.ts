// Statement imports and the CSV export against a real (in-memory) Postgres:
// review against the ledger, category suggestions, the import transaction
// (card invoices included), re-import, ownership checks, undo and export.
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.DATABASE_URL = "pglite:memory";

type Domain = {
  accounts: typeof import("./accounts");
  cards: typeof import("./cards");
  categories: typeof import("./categories");
  context: typeof import("./context");
  transactions: typeof import("./transactions");
  imports: typeof import("./imports");
  statement: typeof import("@/lib/import/statement");
  exporter: typeof import("@/lib/import/export");
};

let d: Domain;
let ctx: import("./context").UserContext;
let intruderCtx: import("./context").UserContext;
let db: typeof import("../db/client").db;
let schema: typeof import("../db/schema");
const ids = {} as Record<
  | "checking"
  | "card"
  | "groceries"
  | "transport"
  | "salary"
  | "restaurants"
  | "intruderAccount"
  | "intruderCategory",
  string
>;

// 14/out/2026, 12:00 in São Paulo.
const NOW = Date.UTC(2026, 9, 14, 15, 0, 0);
const utf8 = (text: string) => new TextEncoder().encode(text);

const ofx = (transactions: string) => `OFXHEADER:100
DATA:OFXSGML
VERSION:102
CHARSET:1252

<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL
<BANKACCTFROM><ACCTID>777</BANKACCTFROM>
<BANKTRANLIST>
${transactions}
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

const trn = (fitId: string, date: string, amount: string, memo: string) =>
  `<STMTTRN><TRNTYPE>OTHER<DTPOSTED>${date}<TRNAMT>${amount}<FITID>${fitId}<MEMO>${memo}</STMTTRN>`;

const CHECKING_FILE = ofx(
  [
    trn("F1", "20261014", "-64.50", "PADARIA PAO QUENTE"),
    trn("F2", "20261010", "-22.90", "UBER *TRIP 1234"),
    trn("F3", "20261005", "7800.00", "SALARIO EMPRESA X"),
    trn("F4", "20261020", "-100.00", "SEGURO DO CARRO"),
    trn("F5", "20261001", "1000.00", "SALDO ANTERIOR"),
  ].join("\n"),
);

function analyze(text: string, isCard = false) {
  const result = d.statement.analyzeStatement({
    bytes: utf8(text),
    today: ctx.todayIso,
    isCard,
  });
  if (!result.ok || result.stage !== "review") {
    throw new Error(`expected rows, got ${JSON.stringify(result)}`);
  }
  return result;
}

/** What the review screen sends by default: new rows, flags left out. */
function defaultSelection(rows: import("./imports").ReviewRow[]) {
  return rows
    .filter((row) => row.status === "new" && row.flag === null)
    .map((row) => ({
      occurredOn: row.occurredOn,
      amountCents: row.amountCents,
      description: row.description,
      externalId: row.externalId,
      categoryId: row.categoryId,
    }));
}

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  ({ db } = await import("../db/client"));
  await migrate(db as never, { migrationsFolder: "drizzle" });
  schema = await import("../db/schema");
  const { ensureOwnerDefaults } = await import("../db/seed-defaults");
  await db.insert(schema.user).values([
    { id: "owner", name: "Ana", email: "ana@exemplo.com" },
    { id: "intruder", name: "Outro", email: "outro@exemplo.com" },
  ]);
  await ensureOwnerDefaults("owner");
  await ensureOwnerDefaults("intruder");

  d = {
    accounts: await import("./accounts"),
    cards: await import("./cards"),
    categories: await import("./categories"),
    context: await import("./context"),
    transactions: await import("./transactions"),
    imports: await import("./imports"),
    statement: await import("@/lib/import/statement"),
    exporter: await import("@/lib/import/export"),
  };
  ctx = await d.context.getUserContext("owner", { now: NOW });
  intruderCtx = await d.context.getUserContext("intruder", { now: NOW });

  ids.checking = await d.accounts.createAccount("owner", {
    name: "Conta principal",
    type: "checking",
    initialBalanceCents: 0,
  });
  ids.card = await d.accounts.createAccount("owner", {
    name: "Cartão Principal",
    type: "credit_card",
    initialBalanceCents: 0,
    card: { limitCents: 550_000, closingDay: 17, dueDay: 25 },
  });
  ids.intruderAccount = await d.accounts.createAccount("intruder", {
    name: "Conta do outro",
    type: "checking",
    initialBalanceCents: 0,
  });

  const all = await d.categories.listCategories("owner");
  const find = (name: string) => {
    const found = all.find((category) => category.name === name);
    if (!found) throw new Error(`categoria ${name}`);
    return found.id;
  };
  ids.groceries = find("Mercado");
  ids.transport = find("Transporte");
  ids.salary = find("Salário");
  ids.restaurants = find("Restaurantes");
  const theirs = await d.categories.listCategories("intruder", "expense");
  ids.intruderCategory = theirs[0]?.id ?? "";

  // History that teaches categories, and an entry typed by hand.
  const t = d.transactions;
  await t.createTransaction(ctx, {
    kind: "expense",
    amountCents: 1_500,
    accountId: ids.card,
    categoryId: ids.transport,
    description: "UBER *TRIP 9999",
    occurredOn: "2026-09-20",
  });
  await t.createTransaction(ctx, {
    kind: "income",
    amountCents: 780_000,
    accountId: ids.checking,
    categoryId: ids.salary,
    description: "SALARIO EMPRESA X",
    occurredOn: "2026-09-05",
  });
  await t.createTransaction(ctx, {
    kind: "expense",
    amountCents: 6_450,
    accountId: ids.checking,
    categoryId: ids.groceries,
    description: "Padaria",
    occurredOn: "2026-10-13",
  });
}, 120_000);

describe("review", () => {
  it("compares the file with the ledger and suggests categories", async () => {
    const parsed = analyze(CHECKING_FILE);
    const rows = await d.imports.reviewImport(ctx, ids.checking, parsed.rows);
    const byId = new Map(rows.map((row) => [row.externalId, row]));

    // Typed by hand the day before, same amount.
    expect(byId.get("ofx:F1")).toMatchObject({
      kind: "expense",
      status: "maybe",
      match: { description: "Padaria", occurredOn: "2026-10-13" },
      categoryId: null,
    });
    // Learned from an entry in another account.
    expect(byId.get("ofx:F2")).toMatchObject({
      status: "new",
      categoryId: ids.transport,
      suggestion: "history",
    });
    expect(byId.get("ofx:F3")).toMatchObject({
      kind: "income",
      status: "new",
      categoryId: ids.salary,
    });
    expect(byId.get("ofx:F5")).toMatchObject({ flag: "balance" });
  });

  it("refuses an account of someone else", async () => {
    await expect(
      d.imports.reviewImport(
        ctx,
        ids.intruderAccount,
        analyze(CHECKING_FILE).rows,
      ),
    ).rejects.toThrow("Conta não encontrado(a).");
  });
});

describe("confirm", () => {
  let importId = "";

  it("imports into a checking account in one go", async () => {
    const parsed = analyze(CHECKING_FILE);
    const rows = await d.imports.reviewImport(ctx, ids.checking, parsed.rows);
    const selected = defaultSelection(rows);
    expect(selected.map((row) => row.externalId)).toEqual([
      "ofx:F2",
      "ofx:F3",
      "ofx:F4",
    ]);
    const result = await d.imports.confirmImport(ctx, {
      accountId: ids.checking,
      format: "ofx",
      rows: selected,
      fileRows: rows.length,
      duplicates: rows.filter((row) => row.status === "duplicate").length,
    });
    importId = result.importId;
    expect(result).toMatchObject({
      imported: 3,
      skipped: 0,
      start: "2026-10-05",
      end: "2026-10-20",
    });

    const { items } = await d.transactions.listTransactions(ctx, {
      start: "2026-10-01",
      end: "2026-10-31",
      accountId: ids.checking,
    });
    const imported = items.filter((item) =>
      ["UBER *TRIP 1234", "SALARIO EMPRESA X", "SEGURO DO CARRO"].includes(
        item.description,
      ),
    );
    expect(
      imported.map((item) => [
        item.description,
        item.kind,
        item.status,
        item.amountCents,
        item.categoryId,
      ]),
    ).toEqual([
      ["SEGURO DO CARRO", "expense", "pending", -10_000, null],
      ["UBER *TRIP 1234", "expense", "paid", -2_290, ids.transport],
      ["SALARIO EMPRESA X", "income", "paid", 780_000, ids.salary],
    ]);

    const [record] = await db
      .select()
      .from(schema.imports)
      .where((await import("drizzle-orm")).eq(schema.imports.id, importId));
    expect(record).toMatchObject({
      userId: "owner",
      accountId: ids.checking,
      format: "ofx",
      status: "done",
      blobPathname: null,
      stats: { rows: 5, duplicates: 0, imported: 3 },
    });
  });

  it("creates nothing new when the same file comes again", async () => {
    const parsed = analyze(CHECKING_FILE);
    const rows = await d.imports.reviewImport(ctx, ids.checking, parsed.rows);
    expect(
      rows
        .filter((row) => row.status === "duplicate")
        .map((row) => row.externalId),
    ).toEqual(["ofx:F2", "ofx:F3", "ofx:F4"]);
    // Even if the client sends them anyway, the unique index skips them.
    const again = await d.imports.confirmImport(ctx, {
      accountId: ids.checking,
      format: "ofx",
      rows: rows
        .filter((row) => row.status === "duplicate")
        .map((row) => ({
          occurredOn: row.occurredOn,
          amountCents: row.amountCents,
          description: row.description,
          externalId: row.externalId,
          categoryId: null,
        })),
      fileRows: rows.length,
      duplicates: 3,
    });
    expect(again).toMatchObject({ imported: 0, skipped: 3 });
    const accounts = await d.accounts.listAccounts("owner");
    expect(
      accounts.find((account) => account.id === ids.checking)?.balanceCents,
    ).toBe(780_000 - 6_450 - 2_290 + 780_000);
  });

  it("attaches card entries to the invoice of their date", async () => {
    const file = ofx(
      [
        trn("C1", "20261014", "-50.00", "LIVRARIA"),
        trn("C2", "20261018", "-30.00", "CINEMA"),
        trn("C3", "20261016", "12.00", "ESTORNO LIVRARIA"),
        trn("C4", "20261005", "200.00", "PAGAMENTO RECEBIDO"),
      ].join("\n"),
    );
    const parsed = analyze(file, true);
    expect(parsed.invertSign).toBe(false);
    const rows = await d.imports.reviewImport(ctx, ids.card, parsed.rows);
    expect(rows.find((row) => row.externalId === "ofx:C4")?.flag).toBe(
      "payment",
    );
    const result = await d.imports.confirmImport(ctx, {
      accountId: ids.card,
      format: "ofx",
      rows: defaultSelection(rows),
      fileRows: rows.length,
      duplicates: 0,
    });
    expect(result.imported).toBe(3);

    const invoices = await d.cards.listInvoices(ctx, ids.card);
    const byMonth = new Map(
      invoices.map((invoice) => [invoice.referenceMonth, invoice]),
    );
    // Closing on the 17th: 14 and 16/out fall in October's invoice (with the
    // 20/set ride typed before), 18/out in November's.
    expect(byMonth.get("2026-10")?.totalCents).toBe(1_500 + 5_000 - 1_200);
    expect(byMonth.get("2026-11")?.totalCents).toBe(3_000);
  });

  it("refuses accounts and categories of someone else, and the wrong kind", async () => {
    const row = {
      occurredOn: "2026-10-14",
      amountCents: -1_000,
      description: "Teste",
      externalId: "h:00000000000000000000000000000001",
      categoryId: null as string | null,
    };
    const base = {
      accountId: ids.checking,
      format: "csv" as const,
      fileRows: 1,
      duplicates: 0,
    };
    await expect(
      d.imports.confirmImport(ctx, {
        ...base,
        accountId: ids.intruderAccount,
        rows: [row],
      }),
    ).rejects.toThrow("Conta não encontrado(a).");
    await expect(
      d.imports.confirmImport(intruderCtx, { ...base, rows: [row] }),
    ).rejects.toThrow("Conta não encontrado(a).");
    await expect(
      d.imports.confirmImport(ctx, {
        ...base,
        rows: [{ ...row, categoryId: ids.intruderCategory }],
      }),
    ).rejects.toThrow("Categoria não encontrado(a).");
    await expect(
      d.imports.confirmImport(ctx, {
        ...base,
        rows: [{ ...row, categoryId: ids.salary }],
      }),
    ).rejects.toThrow("escolha uma categoria de despesa");
    // Nothing was written by the failed attempts.
    const { items } = await d.transactions.listTransactions(ctx, {
      start: "2026-10-14",
      end: "2026-10-14",
      accountId: ids.checking,
    });
    expect(items.some((item) => item.description === "Teste")).toBe(false);
  });

  it("re-checks every row", async () => {
    const row = {
      occurredOn: "2026-10-14",
      amountCents: -1_000,
      description: "Teste",
      externalId: "h:00000000000000000000000000000002",
      categoryId: null,
    };
    const confirm = (rows: (typeof row)[]) =>
      d.imports.confirmImport(ctx, {
        accountId: ids.checking,
        format: "csv",
        rows,
        fileRows: rows.length,
        duplicates: 0,
      });
    await expect(confirm([])).rejects.toThrow("ao menos um");
    await expect(confirm([{ ...row, amountCents: 0 }])).rejects.toThrow(
      "valor inválido",
    );
    await expect(
      confirm([{ ...row, occurredOn: "2026-02-30" }]),
    ).rejects.toThrow("data inválida");
    await expect(
      confirm([{ ...row, occurredOn: "2030-01-01" }]),
    ).rejects.toThrow("muito no futuro");
    await expect(confirm([{ ...row, description: " " }])).rejects.toThrow(
      "descrição inválida",
    );
    await expect(confirm([row, row])).rejects.toThrow("repetidos");
  });

  it("undoes an import within 24 hours and lets the file come in again", async () => {
    const before = await d.imports.listRecentImports(ctx);
    expect(before.find((item) => item.id === importId)).toMatchObject({
      accountName: "Conta principal",
      imported: 3,
      active: 3,
      start: "2026-10-05",
      end: "2026-10-20",
      undoable: true,
    });

    await expect(d.imports.undoImport(intruderCtx, importId)).rejects.toThrow(
      "Importação não encontrado(a).",
    );
    expect(await d.imports.undoImport(ctx, importId)).toEqual({ undone: 3 });

    const after = await d.imports.listRecentImports(ctx);
    expect(after.find((item) => item.id === importId)).toMatchObject({
      active: 0,
      undoable: false,
    });
    const { items } = await d.transactions.listTransactions(ctx, {
      start: "2026-10-01",
      end: "2026-10-31",
      accountId: ids.checking,
    });
    expect(items.some((item) => item.description === "SEGURO DO CARRO")).toBe(
      false,
    );

    // The external ids were released: the same rows are new again.
    const rows = await d.imports.reviewImport(
      ctx,
      ids.checking,
      analyze(CHECKING_FILE).rows,
    );
    expect(rows.find((row) => row.externalId === "ofx:F2")?.status).toBe("new");
    const redo = await d.imports.confirmImport(ctx, {
      accountId: ids.checking,
      format: "ofx",
      rows: defaultSelection(rows),
      fileRows: rows.length,
      duplicates: 0,
    });
    expect(redo.imported).toBe(3);

    // After 24 hours, no more undo.
    const later = Date.now() + d.imports.UNDO_WINDOW_MS + 60_000;
    await expect(
      d.imports.undoImport(ctx, redo.importId, later),
    ).rejects.toThrow("24 horas");
    const listed = await d.imports.listRecentImports(ctx, { now: later });
    expect(listed.find((item) => item.id === redo.importId)?.undoable).toBe(
      false,
    );
  });
});

describe("export", () => {
  it("lists the period's entries, transfers once per leg, deleted ones left out", async () => {
    const t = d.transactions;
    await t.createTransfer(ctx, {
      fromAccountId: ids.checking,
      toAccountId: ids.card,
      amountCents: 4_000,
      occurredOn: "2026-10-12",
      description: "Pagamento da fatura",
    });
    const gone = await t.createTransaction(ctx, {
      kind: "expense",
      amountCents: 999,
      accountId: ids.checking,
      categoryId: ids.restaurants,
      description: "Apagado",
      occurredOn: "2026-10-12",
    });
    await t.deleteTransaction(ctx, gone.ids[0] as string);
    await t.createTransaction(ctx, {
      kind: "expense",
      amountCents: 30_000,
      accountId: ids.card,
      categoryId: ids.groceries,
      description: "Geladeira",
      notes: "=presente",
      occurredOn: "2026-10-12",
      installments: 3,
    });

    const rows = await d.imports.listExportRows(ctx, {
      start: "2026-10-12",
      end: "2026-10-13",
    });
    expect(
      rows.map((row) => [
        row.occurredOn,
        row.description,
        row.accountName,
        row.kind,
        row.amountCents,
      ]),
    ).toEqual([
      [
        "2026-10-12",
        "Pagamento da fatura",
        "Conta principal",
        "transfer",
        -4_000,
      ],
      [
        "2026-10-12",
        "Pagamento da fatura",
        "Cartão Principal",
        "transfer",
        4_000,
      ],
      ["2026-10-12", "Geladeira", "Cartão Principal", "expense", -10_000],
      ["2026-10-13", "Padaria", "Conta principal", "expense", -6_450],
    ]);
    expect(rows[2]).toMatchObject({
      categoryName: "Mercado",
      installment: { number: 1, count: 3 },
      notes: "=presente",
      status: "paid",
    });

    const csv = d.exporter.transactionsCsv(rows);
    expect(csv).toContain(
      "12/10/2026;Geladeira;Mercado;Cartão Principal;Despesa;Pago;-100,00;1 de 3;'=presente\r\n",
    );

    const everything = await d.imports.listExportRows(ctx);
    expect(everything.length).toBeGreaterThan(rows.length);
    expect(everything.some((row) => row.description === "Apagado")).toBe(false);
    // Someone else's ledger is not part of it.
    expect(await d.imports.listExportRows(intruderCtx)).toEqual([]);
  });
});
