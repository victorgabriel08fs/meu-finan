import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";
import {
  applyMapping,
  type CsvMapping,
  detectMapping,
  headerLabel,
  mappingColumns,
  parseIndicator,
} from "./mapping";

const records = (lines: string[], delimiter: ";" | "," = ";") =>
  parseCsv(lines.join("\n"), delimiter);

describe("headerLabel", () => {
  it("normalises header cells", () => {
    expect(headerLabel("Valor (R$)")).toBe("valor");
    expect(headerLabel("Valor R$")).toBe("valor rs");
    expect(headerLabel("Data Lançamento")).toBe("data lancamento");
    expect(headerLabel("Deb/Cred")).toBe("deb cred");
    expect(headerLabel("Saldo do Dia(R$)")).toBe("saldo do dia");
  });
});

describe("parseIndicator", () => {
  it.each([
    ["D", "-"],
    ["Débito", "-"],
    ["saída", "-"],
    ["-", "-"],
    ["C", "+"],
    ["Crédito", "+"],
    ["ENTRADA", "+"],
    ["+", "+"],
    ["Pix", null],
    ["", null],
  ])("%s → %s", (text, sign) => {
    expect(parseIndicator(text)).toBe(sign);
  });
});

describe("detectMapping", () => {
  it("reads a signed amount column under a preamble", () => {
    const file = records([
      "Extrato de conta corrente",
      "Agência: 0001;Conta: 12345-6",
      "Data;Histórico;Documento;Valor (R$);Saldo (R$)",
      "01/10/2026;Saldo anterior;;;1.000,00",
      "02/10/2026;PIX ENVIADO Fulano;123;-150,00;850,00",
      "03/10/2026;TARIFA PACOTE;;-12,90;837,10",
      "05/10/2026;SALARIO EMPRESA;;7.800,00;8.637,10",
    ]);
    const detection = detectMapping(file);
    expect(detection.confident).toBe(true);
    expect(detection.columns).toEqual([
      "Data",
      "Histórico",
      "Documento",
      "Valor (R$)",
      "Saldo (R$)",
    ]);
    expect(detection.mapping).toEqual({
      headerRow: 2,
      date: 0,
      description: [1],
      amount: { mode: "signed", amount: 3, indicator: null },
      id: null,
      dateFormat: "dmy",
      decimal: ",",
    });
    const { rows, skipped } = applyMapping(
      file,
      detection.mapping as CsvMapping,
    );
    expect(rows.map((row) => [row.occurredOn, row.amountCents])).toEqual([
      ["2026-10-02", -15000],
      ["2026-10-03", -1290],
      ["2026-10-05", 780000],
    ]);
    expect(rows[0]?.line).toBe(5);
    // The balance line has no value in the amount column: left out quietly.
    expect(skipped).toEqual([]);
  });

  it("reads separate debit and credit columns", () => {
    const file = records([
      "Data;Histórico;Docto.;Crédito (R$);Débito (R$);Saldo (R$)",
      "02/10/2026;PIX RECEBIDO;1;500,00;;1.500,00",
      "03/10/2026;CONTA DE LUZ;2;;180,35;1.319,65",
      "04/10/2026;ESTORNO;3;10,00;;1.329,65",
    ]);
    const detection = detectMapping(file);
    expect(detection.confident).toBe(true);
    expect(detection.mapping?.amount).toEqual({
      mode: "split",
      debit: 4,
      credit: 3,
    });
    const { rows } = applyMapping(file, detection.mapping as CsvMapping);
    expect(rows.map((row) => row.amountCents)).toEqual([50000, -18035, 1000]);
  });

  it("joins two description columns and uses an id column", () => {
    const file = records(
      [
        "Data,Valor,Identificador,Descrição",
        "14/10/2026,-64.50,6716b9c0-aaaa-bbbb-cccc-000000000001,Compra no débito - Padaria",
        "15/10/2026,7800.00,6716b9c0-aaaa-bbbb-cccc-000000000002,Transferência recebida",
      ],
      ",",
    );
    const detection = detectMapping(file);
    expect(detection.confident).toBe(true);
    expect(detection.mapping).toMatchObject({
      date: 0,
      description: [3],
      amount: { mode: "signed", amount: 1, indicator: null },
      id: 2,
      decimal: ".",
    });
    const { rows } = applyMapping(file, detection.mapping as CsvMapping);
    expect(rows[0]).toEqual({
      line: 2,
      occurredOn: "2026-10-14",
      amountCents: -6450,
      description: "Compra no débito - Padaria",
      sourceId: "6716b9c0-aaaa-bbbb-cccc-000000000001",
    });

    const two = records([
      "Data;Lançamento;Detalhes;Nº documento;Valor;Tipo Lançamento",
      "02/10/2026;Pix - Enviado;02/10 15:31 Fulano de Tal;21031;150,00;Saída",
      "03/10/2026;Pix - Recebido;03/10 09:00 Ciclano;21032;80,00;Entrada",
    ]);
    const mapping = detectMapping(two).mapping as CsvMapping;
    expect(mapping.description).toEqual([1, 2]);
    expect(mapping.amount).toEqual({
      mode: "signed",
      amount: 4,
      indicator: 5,
    });
    const mapped = applyMapping(two, mapping).rows;
    expect(mapped.map((row) => [row.description, row.amountCents])).toEqual([
      ["Pix - Enviado - 02/10 15:31 Fulano de Tal", -15000],
      ["Pix - Recebido - 03/10 09:00 Ciclano", 8000],
    ]);
  });

  it("reads ISO dates and English headers", () => {
    const file = records(
      [
        "date,title,amount",
        "2026-10-14,Padaria,64.5",
        "2026-10-15,Pagamento recebido,-500",
      ],
      ",",
    );
    const detection = detectMapping(file);
    expect(detection.confident).toBe(true);
    expect(detection.mapping).toMatchObject({
      dateFormat: "ymd",
      decimal: ".",
    });
  });

  it("is not confident when the dates do not parse", () => {
    const file = records([
      "Data;Descrição;Valor",
      "ontem;Padaria;-10,00",
      "hoje;Mercado;-20,00",
    ]);
    const detection = detectMapping(file);
    expect(detection.mapping).not.toBeNull();
    expect(detection.confident).toBe(false);
  });

  it("guesses the columns of a file without a header", () => {
    const file = records([
      "14/10/2026;PADARIA PAO QUENTE;123456;-64,50;1.000,00",
      "15/10/2026;SUPERMERCADO;123457;-120,00;880,00",
      "16/10/2026;SALARIO;123458;3.000,00;3.880,00",
    ]);
    const detection = detectMapping(file);
    expect(detection.confident).toBe(false);
    expect(detection.columns).toEqual([
      "Coluna 1",
      "Coluna 2",
      "Coluna 3",
      "Coluna 4",
      "Coluna 5",
    ]);
    expect(detection.mapping).toMatchObject({
      headerRow: null,
      date: 0,
      description: [1],
      // The document number has no cents; the amount comes before the balance.
      amount: { mode: "signed", amount: 3, indicator: null },
    });
  });

  it("finds nothing in a file without dates or amounts", () => {
    const detection = detectMapping(records(["a;b", "c;d"]));
    expect(detection.mapping).toBeNull();
    expect(detection.confident).toBe(false);
  });
});

describe("applyMapping", () => {
  const mapping: CsvMapping = {
    headerRow: 0,
    date: 0,
    description: [1],
    amount: { mode: "signed", amount: 2, indicator: null },
    id: null,
    dateFormat: "dmy",
    decimal: ",",
  };

  it("reports bad lines and drops blank and footer ones", () => {
    const file = records([
      "Data;Descrição;Valor",
      "14/10/2026;Padaria;-64,50",
      "31/02/2026;Data impossível;-1,00",
      "15/10/2026;Valor estranho;abc",
      "16/10/2026;Zerado;0,00",
      ";Total;",
      "17/10/2026;;-5,00",
    ]);
    const { rows, skipped } = applyMapping(file, mapping);
    expect(rows.map((row) => row.description)).toEqual(["Padaria", ""]);
    expect(skipped).toEqual([
      { line: 3, reason: "date" },
      { line: 4, reason: "amount" },
      { line: 5, reason: "zero" },
    ]);
  });

  it("lists the columns a mapping uses", () => {
    expect(mappingColumns(mapping)).toEqual([0, 1, 2]);
    expect(
      mappingColumns({
        ...mapping,
        description: [1, 4],
        amount: { mode: "split", debit: 2, credit: 3 },
        id: 5,
      }),
    ).toEqual([0, 1, 4, 2, 3, 5]);
  });
});
