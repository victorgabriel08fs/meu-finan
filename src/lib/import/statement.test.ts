import { describe, expect, it } from "vitest";
import { checkFile, MAX_FILE_BYTES, MAX_IMPORT_ROWS } from "./files";
import {
  type AnalysisResult,
  analyzeStatement,
  DEFAULT_DESCRIPTION,
} from "./statement";

const TODAY = "2026-10-15";
const utf8 = (text: string) => new TextEncoder().encode(text);

/** windows-1252 bytes for text made of Latin-1 characters. */
const latin1 = (text: string) =>
  new Uint8Array(Array.from(text, (char) => char.charCodeAt(0) & 0xff));

function review(result: AnalysisResult) {
  if (!result.ok || result.stage !== "review") {
    throw new Error(`expected a review, got ${JSON.stringify(result)}`);
  }
  return result;
}

const OFX = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
ENCODING:USASCII
CHARSET:1252

<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL
<BANKACCTFROM><ACCTID>123</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261014<TRNAMT>-64.50<FITID>A1<MEMO>PADARIA SÃO JOÃO</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261005<TRNAMT>7800.00<FITID>A2<MEMO>SALARIO</STMTTRN>
<STMTTRN><TRNTYPE>OTHER<DTPOSTED>20261001<TRNAMT>1000.00<FITID>A3<MEMO>SALDO ANTERIOR</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261013<TRNAMT>-10.00<FITID>A4<MEMO></STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

describe("checkFile", () => {
  it("accepts statements and refuses the rest", () => {
    const file = { name: "extrato.OFX", type: "", size: 1000 };
    expect(checkFile(file)).toBeNull();
    expect(checkFile({ ...file, name: "a.csv", type: "text/csv" })).toBeNull();
    expect(
      checkFile({ ...file, name: "a.csv", type: "application/vnd.ms-excel" }),
    ).toBeNull();
    expect(
      checkFile({ ...file, name: "a.txt", type: "text/plain; charset=utf-8" }),
    ).toBeNull();
    expect(checkFile({ ...file, size: 0 })).toBe("O arquivo está vazio.");
    expect(checkFile({ ...file, size: MAX_FILE_BYTES + 1 })).toMatch(/2 MB/);
    expect(checkFile({ ...file, name: "extrato.pdf" })).toMatch(/OFX ou CSV/);
    expect(checkFile({ ...file, name: "a.csv", type: "text/html" })).toMatch(
      /OFX ou CSV/,
    );
  });
});

describe("analyzeStatement: OFX", () => {
  it("reads a windows-1252 file into rows with FITID ids and flags", () => {
    const result = review(
      analyzeStatement({ bytes: latin1(OFX), today: TODAY, isCard: false }),
    );
    expect(result.format).toBe("ofx");
    expect(result.rows).toEqual([
      {
        line: 10,
        occurredOn: "2026-10-14",
        amountCents: -6450,
        description: "PADARIA SÃO JOÃO",
        externalId: "ofx:A1",
        flag: null,
      },
      {
        line: 11,
        occurredOn: "2026-10-05",
        amountCents: 780000,
        description: "SALARIO",
        externalId: "ofx:A2",
        flag: null,
      },
      {
        line: 12,
        occurredOn: "2026-10-01",
        amountCents: 100000,
        description: "SALDO ANTERIOR",
        externalId: "ofx:A3",
        flag: "balance",
      },
      {
        line: 13,
        occurredOn: "2026-10-13",
        amountCents: -1000,
        description: DEFAULT_DESCRIPTION,
        externalId: "ofx:A4",
        flag: null,
      },
    ]);
    expect(result.invertSign).toBe(false);
    expect(result.signNotice).toBeNull();
    expect(result.csv).toBeNull();
  });

  it("flips a card file whose purchases came positive, keeping the ids", () => {
    const card = OFX.replace("-64.50", "64.50")
      .replace("-10.00", "10.00")
      .replace("7800.00", "-7800.00");
    const auto = review(
      analyzeStatement({ bytes: utf8(card), today: TODAY, isCard: true }),
    );
    expect(auto.invertSign).toBe(true);
    expect(auto.signNotice).toBe("inverted");
    expect(auto.rows.map((row) => row.amountCents)).toEqual([
      -6450, 780000, -100000, -1000,
    ]);
    expect(auto.rows[1]?.externalId).toBe("ofx:A2");

    const asIs = review(
      analyzeStatement({
        bytes: utf8(card),
        today: TODAY,
        isCard: true,
        options: { invertSign: false },
      }),
    );
    expect(asIs.signNotice).toBe("mostly-positive");
    expect(asIs.rows[0]?.amountCents).toBe(6450);
  });

  it("keeps a normal card file with more credits than purchases", () => {
    const refunds = OFX.replace(
      "<TRNTYPE>DEBIT<DTPOSTED>20261013<TRNAMT>-10.00",
      "<TRNTYPE>CREDIT<DTPOSTED>20261013<TRNAMT>10.00",
    );
    const result = review(
      analyzeStatement({ bytes: utf8(refunds), today: TODAY, isCard: true }),
    );
    // 3 of 4 rows are positive, but the types say the signs are standard.
    expect(result.invertSign).toBe(false);
    expect(result.signNotice).toBeNull();
    expect(result.rows[0]?.amountCents).toBe(-6450);
  });

  it("flags invoice payments on cards", () => {
    const text = OFX.replace("SALARIO", "PAGAMENTO RECEBIDO");
    const result = review(
      analyzeStatement({
        bytes: utf8(text),
        today: TODAY,
        isCard: true,
        options: { invertSign: false },
      }),
    );
    expect(result.rows[1]?.flag).toBe("payment");
  });

  it("warns about several accounts and other currencies", () => {
    const text = OFX.replace("<CURDEF>BRL", "<CURDEF>USD").replace(
      "<BANKTRANLIST>",
      "<CCACCTFROM><ACCTID>999</CCACCTFROM><BANKTRANLIST>",
    );
    const result = review(
      analyzeStatement({ bytes: utf8(text), today: TODAY, isCard: false }),
    );
    expect(result.warnings).toEqual([
      "O arquivo tem extratos de 2 contas. Todos os lançamentos vão para a conta escolhida.",
      "Os valores do arquivo estão em USD e entram como reais.",
    ]);
  });

  it("refuses an OFX without transactions", () => {
    expect(
      analyzeStatement({
        bytes: utf8("OFXHEADER:100\n<OFX></OFX>"),
        today: TODAY,
        isCard: false,
      }),
    ).toEqual({
      ok: false,
      error: "Não encontramos lançamentos neste arquivo OFX.",
    });
  });
});

const CSV = [
  "Data;Descrição;Valor",
  "14/10/2026;Padaria;-64,50",
  "14/10/2026;Padaria;-64,50",
  "05/10/2026;Salário;7.800,00",
].join("\r\n");

describe("analyzeStatement: CSV", () => {
  it("goes straight to review when the header is clear", () => {
    const result = review(
      analyzeStatement({ bytes: utf8(CSV), today: TODAY, isCard: false }),
    );
    expect(result.format).toBe("csv");
    expect(result.rows.map((row) => [row.line, row.amountCents])).toEqual([
      [2, -6450],
      [3, -6450],
      [4, 780000],
    ]);
    const [first, second] = result.rows;
    expect(first?.externalId).toMatch(/^h:/);
    expect(first?.externalId).not.toBe(second?.externalId);
    expect(result.csv).toMatchObject({
      delimiter: ";",
      columns: ["Data", "Descrição", "Valor"],
      confident: true,
    });
    expect(result.csv?.sample).toHaveLength(3);
  });

  it("asks for the columns when the header is not clear", () => {
    const text = "14/10/2026;PADARIA;-64,50\n15/10/2026;MERCADO;-10,00\n";
    const result = analyzeStatement({
      bytes: utf8(text),
      today: TODAY,
      isCard: false,
    });
    expect(result).toMatchObject({
      ok: true,
      stage: "mapping",
      format: "csv",
      invertSign: false,
      problem: null,
    });
    if (!result.ok || result.stage !== "mapping") return;
    expect(result.csv.columns).toEqual(["Coluna 1", "Coluna 2", "Coluna 3"]);
    expect(result.csv.mapping?.amount).toEqual({
      mode: "signed",
      amount: 2,
      indicator: null,
    });

    // With the mapping confirmed, it goes on to the review.
    const confirmed = review(
      analyzeStatement({
        bytes: utf8(text),
        today: TODAY,
        isCard: false,
        options: { mapping: result.csv.mapping },
      }),
    );
    expect(confirmed.rows).toHaveLength(2);
  });

  it("suggests flipping signs for a card CSV with positive purchases", () => {
    const text =
      "data;lançamento;valor\n14/10/2026;LOJA;64,50\n15/10/2026;BAR;10,00";
    const result = analyzeStatement({
      bytes: utf8(text),
      today: TODAY,
      isCard: true,
    });
    // The header is clear, so it is a review with the signs flipped.
    expect(review(result).rows.map((row) => row.amountCents)).toEqual([
      -6450, -1000,
    ]);
  });

  it("explains a mapping that reads nothing", () => {
    const first = review(
      analyzeStatement({ bytes: utf8(CSV), today: TODAY, isCard: false }),
    );
    const mapping = first.csv?.mapping;
    if (!mapping) throw new Error("mapping");
    const wrong = analyzeStatement({
      bytes: utf8(CSV),
      today: TODAY,
      isCard: false,
      options: { mapping: { ...mapping, dateFormat: "ymd" } },
    });
    expect(wrong).toMatchObject({
      ok: true,
      stage: "mapping",
      problem:
        "Nenhuma linha foi reconhecida com essas colunas. Confira a data, o valor e os formatos.",
    });
    const outside = analyzeStatement({
      bytes: utf8(CSV),
      today: TODAY,
      isCard: false,
      options: { mapping: { ...mapping, date: 9 } },
    });
    expect(outside).toMatchObject({
      stage: "mapping",
      problem: "Confira as colunas escolhidas.",
    });
  });

  it("leaves out entries dated more than a year ahead", () => {
    const text = `${CSV}\r\n01/01/2030;Futuro;-1,00`;
    const result = review(
      analyzeStatement({ bytes: utf8(text), today: TODAY, isCard: false }),
    );
    expect(result.rows).toHaveLength(3);
    expect(result.skipped).toEqual([{ line: 5, reason: "future" }]);
    expect(result.skippedCount).toBe(1);
  });

  it("refuses files with more rows than one import takes", () => {
    const lines = ["Data;Descrição;Valor"];
    for (let index = 0; index <= MAX_IMPORT_ROWS; index += 1) {
      lines.push(`14/10/2026;Linha ${index};-1,00`);
    }
    expect(
      analyzeStatement({
        bytes: utf8(lines.join("\n")),
        today: TODAY,
        isCard: false,
      }),
    ).toEqual({
      ok: false,
      error:
        "Este arquivo tem 2.001 lançamentos. Importe até 2.000 por vez: baixe um período menor no seu banco.",
    });
  });
});

describe("analyzeStatement: files that are not statements", () => {
  it.each([
    [new Uint8Array([0x50, 0x4b, 0x03, 0x04]), /planilha do Excel/],
    [utf8("%PDF-1.4"), /PDF/],
    [new Uint8Array([0x01, 0x00, 0x02]), /Não conseguimos ler/],
    [utf8("   \n "), /vazio/],
    [utf8("só uma coluna\noutra"), /Não reconhecemos as colunas/],
  ])("%#", (bytes, message) => {
    const result = analyzeStatement({ bytes, today: TODAY, isCard: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(message);
  });
});
