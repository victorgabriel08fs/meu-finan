import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";
import {
  csvAmount,
  csvCell,
  csvDate,
  type ExportRow,
  toCsv,
  transactionsCsv,
} from "./export";

describe("csvCell", () => {
  it("quotes cells with the delimiter, quotes or line breaks", () => {
    expect(csvCell("Padaria")).toBe("Padaria");
    expect(csvCell("Pão; leite")).toBe('"Pão; leite"');
    expect(csvCell('Loja "Boa"')).toBe('"Loja ""Boa"""');
    expect(csvCell("linha 1\nlinha 2")).toBe('"linha 1\nlinha 2"');
    expect(csvCell("a\rb")).toBe('"a\rb"');
    expect(csvCell("a,b")).toBe("a,b");
    expect(csvCell("a,b", ",")).toBe('"a,b"');
  });

  it("neutralises formulas", () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(
      '"\'=HYPERLINK(""http://x"")"',
    );
    expect(csvCell("+55 11 99999")).toBe("'+55 11 99999");
    expect(csvCell("-2+3+cmd|' /C calc'!A0")).toBe("'-2+3+cmd|' /C calc'!A0");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("\tx")).toBe("'\tx");
    expect(csvCell("＝1+1")).toBe("'＝1+1");
  });

  it("leaves plain numbers alone", () => {
    expect(csvCell("-64,50")).toBe("-64,50");
    expect(csvCell("+10")).toBe("+10");
    expect(csvCell("-1.5")).toBe("-1.5");
    expect(csvCell("-")).toBe("'-");
  });
});

describe("formatting", () => {
  it("writes amounts with a decimal comma and no grouping", () => {
    expect(csvAmount(-6450)).toBe("-64,50");
    expect(csvAmount(123456789)).toBe("1234567,89");
    expect(csvAmount(5)).toBe("0,05");
    expect(csvAmount(0)).toBe("0,00");
    expect(() => csvAmount(1.5)).toThrow(RangeError);
  });

  it("writes dates as dd/mm/yyyy", () => {
    expect(csvDate("2026-10-14")).toBe("14/10/2026");
  });

  it("starts with a BOM and ends every row with CRLF", () => {
    expect(
      toCsv([
        ["a", "b"],
        ["c", "d"],
      ]),
    ).toBe("﻿a;b\r\nc;d\r\n");
  });
});

describe("transactionsCsv", () => {
  const rows: ExportRow[] = [
    {
      occurredOn: "2026-10-14",
      description: "Supermercado; filial",
      categoryName: "Mercado",
      accountName: "Conta principal",
      kind: "expense",
      status: "paid",
      amountCents: -6450,
      installment: null,
      notes: null,
    },
    {
      occurredOn: "2026-10-03",
      description: "Tênis de corrida",
      categoryName: "Compras",
      accountName: "Cartão Principal",
      kind: "expense",
      status: "pending",
      amountCents: -9998,
      installment: { number: 2, count: 6 },
      notes: "=presente",
    },
    {
      occurredOn: "2026-10-07",
      description: "Para Reserva",
      categoryName: null,
      accountName: "Conta principal",
      kind: "transfer",
      status: "paid",
      amountCents: -100000,
      installment: null,
      notes: null,
    },
  ];

  it("writes the header and one line per row, readable back", () => {
    const csv = transactionsCsv(rows);
    expect(
      csv.startsWith(
        "﻿Data;Descrição;Categoria;Conta;Tipo;Status;Valor;Parcela;Observação\r\n",
      ),
    ).toBe(true);
    const back = parseCsv(csv, ";").map((record) => record.cells);
    expect(back).toEqual([
      [
        "Data",
        "Descrição",
        "Categoria",
        "Conta",
        "Tipo",
        "Status",
        "Valor",
        "Parcela",
        "Observação",
      ],
      [
        "14/10/2026",
        "Supermercado; filial",
        "Mercado",
        "Conta principal",
        "Despesa",
        "Pago",
        "-64,50",
        "",
        "",
      ],
      [
        "03/10/2026",
        "Tênis de corrida",
        "Compras",
        "Cartão Principal",
        "Despesa",
        "Pendente",
        "-99,98",
        "2 de 6",
        "'=presente",
      ],
      [
        "07/10/2026",
        "Para Reserva",
        "",
        "Conta principal",
        "Transferência",
        "Pago",
        "-1000,00",
        "",
        "",
      ],
    ]);
  });

  it("writes only the header when there is nothing to export", () => {
    expect(transactionsCsv([])).toBe(
      "﻿Data;Descrição;Categoria;Conta;Tipo;Status;Valor;Parcela;Observação\r\n",
    );
  });
});
