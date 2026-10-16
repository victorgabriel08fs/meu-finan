import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CsvSetup } from "@/lib/import/statement";
import type { RecentImport, ReviewRow } from "@/server/domain/imports";
import { ExportListItem } from "./export-list-item";
import { FileStep } from "./file-step";
import { ImportFlow } from "./import-flow";
import { importedAtLabel, importPeriodLabel, recentImportView } from "./labels";
import { MappingStep } from "./mapping-step";
import { RecentImports } from "./recent-imports";
import { ReviewRowItem, ReviewStep } from "./review-step";
import { SummaryStep } from "./summary-step";
import type { ReviewStage } from "./types";

// Server Actions are not available outside Next.
vi.mock("@/server/actions/imports", () => ({
  analyzeImportAction: vi.fn(),
  confirmImportAction: vi.fn(),
  undoImportAction: vi.fn(),
}));

/** Visible text: no tags, no sr-only spoken amounts, no privacy masks. */
const text = (html: string) =>
  html
    .replace(/<span class="sr-only">.*?<\/span>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/ /g, " ")
    .replace(/R\$\s?••••/g, "");

const accounts = [
  {
    id: "a1",
    name: "Conta principal",
    type: "checking",
    icon: "landmark",
    color: "cat-1",
  },
  {
    id: "c1",
    name: "Cartão Principal",
    type: "credit_card",
    icon: "credit-card",
    color: "cat-7",
  },
];

const categories = [
  {
    id: "mercado",
    kind: "expense" as const,
    label: "Mercado",
    icon: "shopping-cart",
    color: "cat-3",
  },
  {
    id: "salario",
    kind: "income" as const,
    label: "Salário",
    icon: "briefcase",
    color: "cat-6",
  },
];

const row = (overrides: Partial<ReviewRow>): ReviewRow => ({
  line: 2,
  occurredOn: "2026-10-14",
  amountCents: -6_450,
  description: "PADARIA PAO QUENTE",
  externalId: "ofx:1",
  flag: null,
  kind: "expense",
  status: "new",
  match: null,
  categoryId: "mercado",
  suggestion: "history",
  ...overrides,
});

describe("labels", () => {
  it("formats the period and the moment of an import", () => {
    expect(importPeriodLabel("2026-10-01", "2026-10-14")).toBe(
      "1/out – 14/out",
    );
    expect(importPeriodLabel("2026-10-14", "2026-10-14")).toBe("14/out");
    expect(importPeriodLabel(null, null)).toBeNull();
    // 13:32 UTC is 10:32 in São Paulo.
    const at = new Date(Date.UTC(2026, 9, 14, 13, 32));
    expect(importedAtLabel(at, "America/Sao_Paulo", "2026-10-14")).toBe(
      "Hoje às 10:32",
    );
    expect(importedAtLabel(at, "America/Sao_Paulo", "2026-10-15")).toBe(
      "Ontem às 10:32",
    );
  });

  it("builds the recent import entry", () => {
    const item: RecentImport = {
      id: "i1",
      accountId: "a1",
      accountName: "Conta principal",
      format: "ofx",
      createdAt: new Date(Date.UTC(2026, 9, 14, 13, 32)),
      imported: 112,
      active: 112,
      start: "2026-10-01",
      end: "2026-10-14",
      month: "2026-10",
      undoable: true,
    };
    const context = { timeZone: "America/Sao_Paulo", todayIso: "2026-10-14" };
    expect(recentImportView(item, context)).toEqual({
      id: "i1",
      accountName: "Conta principal",
      summary: "112 lançamentos · 1/out – 14/out",
      when: "Hoje às 10:32",
      undoable: true,
      undone: false,
      href: "/extrato?conta=a1&mes=2026-10",
    });
    expect(
      recentImportView(
        { ...item, active: 0, undoable: false, imported: 1 },
        context,
      ),
    ).toMatchObject({
      summary: "1 lançamento · 1/out – 14/out",
      undone: true,
      href: null,
    });
  });
});

describe("FileStep", () => {
  it("groups accounts and cards and offers the file area and the help", () => {
    const html = renderToStaticMarkup(
      <FileStep
        accounts={accounts}
        accountId="a1"
        onAccountChange={() => {}}
        onFile={() => {}}
        reading={null}
        error="Envie um arquivo OFX ou CSV."
      />,
    );
    expect(html).toContain('<optgroup label="Contas">');
    expect(html).toContain('<optgroup label="Cartões de crédito">');
    expect(html).toContain('type="file"');
    expect(html).toContain('accept=".ofx,.qfx,.csv,.txt');
    const visible = text(html);
    expect(visible).toContain("Escolher arquivo OFX ou CSV");
    expect(visible).toContain("até 2 MB");
    expect(visible).toContain("Onde baixo meu extrato?");
    expect(visible).toContain("Envie um arquivo OFX ou CSV.");
  });

  it("shows the file being read", () => {
    const html = renderToStaticMarkup(
      <FileStep
        accounts={accounts}
        accountId="a1"
        onAccountChange={() => {}}
        onFile={() => {}}
        reading="extrato.ofx"
        error={null}
      />,
    );
    expect(text(html)).toContain("Lendo extrato.ofx…");
    expect(html).toContain('aria-busy="true"');
  });
});

describe("ImportFlow", () => {
  it("starts on the file step with the recent imports below", () => {
    const html = renderToStaticMarkup(
      <ImportFlow
        accounts={accounts}
        categories={categories}
        defaultAccountId="c1"
        today="2026-10-14"
        recent={[
          {
            id: "i1",
            accountName: "Conta principal",
            summary: "112 lançamentos · 1/out – 14/out",
            when: "Hoje às 10:32",
            undoable: true,
            undone: false,
            href: "/extrato?conta=a1&mes=2026-10",
          },
        ]}
      />,
    );
    const visible = text(html);
    expect(visible).toContain("Arquivo");
    expect(visible).toContain("Revisão");
    expect(visible).not.toContain("Colunas");
    expect(html).toMatch(/<option value="c1" selected="">/);
    expect(visible).toContain("Importações recentes");
    expect(visible).toContain("Desfazer");
  });
});

describe("ReviewRowItem", () => {
  const render = (item: ReviewRow) =>
    renderToStaticMarkup(
      <ul>
        <ReviewRowItem
          id="r"
          index={0}
          row={item}
          today="2026-10-14"
          checked={item.status === "new"}
          onCheckedChange={() => {}}
          categoryId={item.categoryId}
          options={categories.filter((category) => category.kind === item.kind)}
          category={categories.find(
            (category) => category.id === item.categoryId,
          )}
          onCategoryChange={() => {}}
        />
      </ul>,
    );

  it("shows the description, amount and the suggested category", () => {
    const html = render(row({}));
    const visible = text(html);
    expect(visible).toContain("PADARIA PAO QUENTE");
    expect(visible).toContain("−R$ 64,50");
    expect(html).toContain(
      '<option value="mercado" selected="">Mercado</option>',
    );
    expect(html).not.toContain("Salário");
    expect(html).toContain('aria-label="Categoria de PADARIA PAO QUENTE"');
  });

  it("locks exact duplicates", () => {
    const html = render(row({ status: "duplicate", categoryId: null }));
    expect(text(html)).toContain("Já existe");
    expect(html).toMatch(/type="checkbox"[^>]*disabled=""/);
  });

  it("explains look-alikes, flags and scheduled entries", () => {
    const maybe = text(
      render(
        row({
          status: "maybe",
          match: { description: "Padaria", occurredOn: "2026-10-13" },
        }),
      ),
    );
    expect(maybe).toContain("Talvez já exista");
    expect(maybe).toContain("Parece com “Padaria”, 13/out");
    expect(text(render(row({ flag: "balance" })))).toContain("Linha de saldo");
    expect(
      text(
        render(
          row({
            flag: "payment",
            amountCents: 138_042,
            kind: "income",
            categoryId: null,
          }),
        ),
      ),
    ).toContain("Pagamento da fatura");
    expect(text(render(row({ occurredOn: "2026-10-20" })))).toContain(
      "Agendado",
    );
  });
});

describe("ReviewStep", () => {
  const data: ReviewStage = {
    ok: true,
    stage: "review",
    format: "ofx",
    rows: [
      row({}),
      row({ externalId: "ofx:2", status: "duplicate", categoryId: null }),
      row({
        externalId: "ofx:3",
        status: "maybe",
        match: { description: "Padaria", occurredOn: "2026-10-13" },
      }),
      row({
        externalId: "ofx:4",
        description: "SALARIO",
        amountCents: 780_000,
        kind: "income",
        categoryId: "salario",
        occurredOn: "2026-10-05",
      }),
    ],
    skipped: [{ line: 9, reason: "date" }],
    skippedCount: 1,
    warnings: [],
    csv: null,
    invertSign: true,
    signNotice: "inverted",
    fileName: "extrato.ofx",
    accountId: "a1",
  };

  it("shows the counters, notices and the import button", () => {
    const html = renderToStaticMarkup(
      <ReviewStep
        data={data}
        account={accounts[0] as (typeof accounts)[number]}
        categories={categories}
        today="2026-10-14"
        confirming={false}
        rereading={false}
        error={null}
        onConfirm={() => {}}
        onInvert={() => {}}
        onAdjustColumns={null}
        onCancel={() => {}}
      />,
    );
    const visible = text(html);
    expect(visible).toContain("2 novos · 1 já existe · 1 talvez já exista");
    expect(visible).toContain("Invertemos os sinais");
    expect(visible).toContain("Manter como no arquivo");
    expect(visible).toContain("1 linha do arquivo ficou de fora");
    expect(visible).toContain("Linha 9: data não reconhecida");
    expect(visible).toContain("2 de 3 selecionados");
    expect(visible).toContain("Importar 2 lançamentos");
    expect(visible).toContain("Hoje · qua, 14 out");
    expect(visible).not.toContain("Ajustar colunas");
  });
});

describe("MappingStep", () => {
  const csv: CsvSetup = {
    delimiter: ";",
    columns: ["Coluna 1", "Coluna 2", "Coluna 3"],
    sample: [
      { line: 1, cells: ["14/10/2026", "PADARIA", "64,50"] },
      { line: 2, cells: ["ontem", "MERCADO", "10,00"] },
    ],
    mapping: {
      headerRow: null,
      date: 0,
      description: [1],
      amount: { mode: "signed", amount: 2, indicator: null },
      id: null,
      dateFormat: "dmy",
      decimal: ",",
    },
    confident: false,
  };

  it("previews the rows with the chosen columns and signs", () => {
    const html = renderToStaticMarkup(
      <MappingStep
        csv={csv}
        invertSign
        fileName="extrato.csv"
        problem={null}
        error={null}
        pending={false}
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    );
    const visible = text(html);
    expect(visible).toContain("Confira as colunas");
    expect(visible).toContain("Coluna 1 · ex.: 14/10/2026");
    expect(visible).toContain("1 de 2 linhas reconhecidas");
    expect(visible).toContain("PADARIA");
    // Inverted: a purchase written as 64,50 becomes money out.
    expect(visible).toContain("−R$ 64,50");
    expect(visible).toContain("Data não reconhecida");
    expect(html).toContain('role="switch" aria-checked="true"');
  });
});

describe("SummaryStep", () => {
  const result = {
    importId: "i1",
    imported: 112,
    skipped: 3,
    start: "2026-10-01",
    end: "2026-10-14",
    month: "2026-10",
  };

  it("tells what came in and links to the statement", () => {
    const html = renderToStaticMarkup(
      <SummaryStep
        result={result}
        accountId="a1"
        accountName="Conta principal"
        undoing={false}
        undone={false}
        onUndo={() => {}}
        onAnother={() => {}}
      />,
    );
    const visible = text(html);
    expect(visible).toContain("112 lançamentos importados");
    expect(visible).toContain("Em Conta principal, de 1/out – 14/out.");
    expect(visible).toContain("3 já existiam e ficaram de fora.");
    expect(visible).toContain("Desfazer importação");
    expect(html).toContain('href="/extrato?conta=a1&amp;mes=2026-10"');
  });

  it("confirms an undo", () => {
    const visible = text(
      renderToStaticMarkup(
        <SummaryStep
          result={result}
          accountId="a1"
          accountName="Conta principal"
          undoing={false}
          undone
          onUndo={() => {}}
          onAnother={() => {}}
        />,
      ),
    );
    expect(visible).toContain("Importação desfeita");
    expect(visible).not.toContain("Desfazer importação");
  });
});

describe("RecentImports", () => {
  it("renders nothing without imports", () => {
    expect(renderToStaticMarkup(<RecentImports items={[]} />)).toBe("");
  });

  it("marks undone imports", () => {
    const visible = text(
      renderToStaticMarkup(
        <RecentImports
          items={[
            {
              id: "i2",
              accountName: "Cartão Principal",
              summary: "5 lançamentos · 1/out – 3/out",
              when: "Ontem às 18:05",
              undoable: false,
              undone: true,
              href: null,
            },
          ]}
        />,
      ),
    );
    expect(visible).toContain("Cartão Principal");
    expect(visible).toContain("Desfeita");
    expect(visible).not.toContain("Desfazer");
  });
});

describe("ExportListItem", () => {
  it("is a plain download link to the export route", () => {
    const html = renderToStaticMarkup(
      <ul>
        <ExportListItem />
      </ul>,
    );
    expect(html).toContain('href="/api/export/transactions"');
    expect(html).toContain("download");
    expect(text(html)).toContain("Exportar lançamentos (CSV)");
  });
});
