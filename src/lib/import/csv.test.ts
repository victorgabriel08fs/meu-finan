import { describe, expect, it } from "vitest";
import { detectDelimiter, parseCsv } from "./csv";

const cells = (text: string, delimiter: ";" | "," | "\t" | "|" = ";") =>
  parseCsv(text, delimiter).map((record) => record.cells);

describe("parseCsv", () => {
  it("splits records and trims cells", () => {
    expect(cells("Data;Valor\n14/10/2026 ; -64,50 \n")).toEqual([
      ["Data", "Valor"],
      ["14/10/2026", "-64,50"],
    ]);
  });

  it("handles quotes, escaped quotes, delimiters and line breaks inside them", () => {
    const text =
      'Data,Descrição,Valor\r\n14/10/2026,"Loja ""Boa"", Centro","-1,234.56"\r\n15/10/2026,"Linha 1\nLinha 2",10\r\n';
    expect(cells(text, ",")).toEqual([
      ["Data", "Descrição", "Valor"],
      ["14/10/2026", 'Loja "Boa", Centro', "-1,234.56"],
      ["15/10/2026", "Linha 1\nLinha 2", "10"],
    ]);
  });

  it("numbers records by the line where they start", () => {
    const records = parseCsv('a;b\n\n"x\ny";z\nw;v', ";");
    expect(records.map((record) => record.line)).toEqual([1, 3, 5]);
  });

  it("drops blank lines and rows of empty cells, and a leading BOM", () => {
    expect(cells("﻿Data;Valor\n;;\n\n14/10/2026;1\n")).toEqual([
      ["Data", "Valor"],
      ["14/10/2026", "1"],
    ]);
  });

  it("accepts CR-only line ends and a last line without one", () => {
    expect(cells("a;b\rc;d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("keeps quotes in the middle of an unquoted cell and text after a closing quote", () => {
    expect(cells('Loja 5" TV;"abc"def')).toEqual([['Loja 5" TV', "abcdef"]]);
  });

  it("stops at the limit", () => {
    expect(parseCsv("1\n2\n3\n4", ";", 2)).toHaveLength(2);
  });

  it("closes an unterminated quote at the end of the text", () => {
    expect(cells('a;"b\nc')).toEqual([["a", "b\nc"]]);
  });
});

describe("detectDelimiter", () => {
  it("prefers ; for pt-BR files even with decimal commas", () => {
    const text = [
      "Data;Descrição;Valor",
      "14/10/2026;PADARIA;-64,50",
      "15/10/2026;SALARIO;7.800,00",
      "16/10/2026;MERCADO;-120,99",
    ].join("\n");
    expect(detectDelimiter(text)).toBe(";");
  });

  it("finds commas, tabs and pipes", () => {
    expect(
      detectDelimiter('date,title,amount\n2026-10-14,"Padaria, centro",64.5'),
    ).toBe(",");
    expect(detectDelimiter("Data\tValor\n14/10/2026\t-64,50")).toBe("\t");
    expect(detectDelimiter("Data|Valor|Saldo\n14/10/2026|-64,50|10")).toBe("|");
  });

  it("survives a preamble above the header", () => {
    const text = [
      "Extrato de conta corrente",
      "Período: 01/10/2026 a 15/10/2026",
      "",
      "Data;Histórico;Documento;Valor;Saldo",
      "01/10/2026;Saldo anterior;;;1.000,00",
      "02/10/2026;PIX ENVIADO;123;-150,00;850,00",
      "03/10/2026;TARIFA;;-12,90;837,10",
    ].join("\n");
    expect(detectDelimiter(text)).toBe(";");
  });

  it("returns null for text without columns", () => {
    expect(
      detectDelimiter("apenas uma linha de texto\noutra linha"),
    ).toBeNull();
    expect(detectDelimiter("")).toBeNull();
  });
});
