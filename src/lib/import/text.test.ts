import { describe, expect, it } from "vitest";
import {
  cleanDescription,
  decodeText,
  descriptionKey,
  detectBinary,
  isBalanceLine,
  isCardPaymentLine,
  MAX_DESCRIPTION_LENGTH,
  normalizeText,
} from "./text";

const bytes = (...values: number[]) => new Uint8Array(values);
const utf8 = (text: string) => new TextEncoder().encode(text);

describe("decodeText", () => {
  it("reads UTF-8 and strips its byte order mark", () => {
    expect(decodeText(utf8("Pão de açúcar"))).toEqual({
      text: "Pão de açúcar",
      encoding: "utf-8",
    });
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8("Água")]);
    expect(decodeText(withBom)).toEqual({ text: "Água", encoding: "utf-8" });
  });

  it("falls back to windows-1252 when the bytes are not valid UTF-8", () => {
    // "Padaria São João" in windows-1252: ã = E3, ã = E3, o = 6F.
    const latin = bytes(
      0x50,
      0x61,
      0x64,
      0x61,
      0x72,
      0x69,
      0x61,
      0x20,
      0x53,
      0xe3,
      0x6f,
      0x20,
      0x4a,
      0x6f,
      0xe3,
      0x6f,
    );
    expect(decodeText(latin)).toEqual({
      text: "Padaria São João",
      encoding: "windows-1252",
    });
    // 0x80 is € and 0x93/0x94 are curly quotes in 1252 (not C1 controls).
    expect(decodeText(bytes(0x80, 0x20, 0x93, 0x41, 0x94)).text).toBe("€ “A”");
  });

  it("ignores a lying header: UTF-8 bytes win over CHARSET:1252", () => {
    const text = "OFXHEADER:100\nCHARSET:1252\n<MEMO>Crédito";
    expect(decodeText(utf8(text))).toEqual({ text, encoding: "utf-8" });
  });

  it("reads UTF-16 with a byte order mark", () => {
    expect(decodeText(bytes(0xff, 0xfe, 0x41, 0x00, 0xe7, 0x00))).toEqual({
      text: "Aç",
      encoding: "utf-16le",
    });
    expect(decodeText(bytes(0xfe, 0xff, 0x00, 0x41, 0x00, 0xe7))).toEqual({
      text: "Aç",
      encoding: "utf-16be",
    });
  });
});

describe("detectBinary", () => {
  it("recognises spreadsheets, PDFs and other binaries", () => {
    expect(detectBinary(bytes(0x50, 0x4b, 0x03, 0x04, 0x14))).toBe(
      "spreadsheet",
    );
    expect(
      detectBinary(bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)),
    ).toBe("spreadsheet");
    expect(detectBinary(utf8("%PDF-1.7\n"))).toBe("pdf");
    expect(detectBinary(bytes(0x41, 0x00, 0x42))).toBe("binary");
  });

  it("accepts text, including UTF-16 with its zero bytes", () => {
    expect(detectBinary(utf8("data;valor\n"))).toBeNull();
    expect(detectBinary(bytes(0xff, 0xfe, 0x41, 0x00))).toBeNull();
  });
});

describe("normalizeText and descriptionKey", () => {
  it("lowercases, drops accents and collapses spaces", () => {
    expect(normalizeText("  PÃO   de Açúcar\t")).toBe("pao de acucar");
  });

  it("keeps the merchant and drops codes, dates and punctuation", () => {
    expect(descriptionKey("UBER *TRIP 12/10 SAO PAULO")).toBe(
      "uber trip sao paulo",
    );
    expect(descriptionKey("IFOOD*IFD123 PARC 02/06")).toBe("ifood parc");
    expect(descriptionKey("Pão de Açúcar - Loja 12")).toBe(
      "pao de acucar loja",
    );
    expect(descriptionKey("12/10 1234")).toBe("");
  });
});

describe("cleanDescription", () => {
  it("removes control characters and extra spaces", () => {
    expect(cleanDescription(" PIX\u0000 ENVIADO \r\n Fulano ")).toBe(
      "PIX ENVIADO Fulano",
    );
  });

  it("cuts at 120 code points with an ellipsis", () => {
    const long = "a".repeat(200);
    const clean = cleanDescription(long);
    expect(Array.from(clean)).toHaveLength(MAX_DESCRIPTION_LENGTH);
    expect(clean.endsWith("…")).toBe(true);
    // Emoji are one character for Postgres' char_length.
    const emoji = "😀".repeat(130);
    expect(Array.from(cleanDescription(emoji))).toHaveLength(120);
    expect(cleanDescription("a".repeat(120))).toBe("a".repeat(120));
  });
});

describe("line flags", () => {
  it("spots balance lines", () => {
    expect(isBalanceLine("SALDO ANTERIOR")).toBe(true);
    expect(isBalanceLine("S A L D O")).toBe(true);
    expect(isBalanceLine("Saldo do dia")).toBe(true);
    expect(isBalanceLine("Padaria Saldanha")).toBe(false);
    expect(isBalanceLine("Pagamento saldo devedor")).toBe(false);
  });

  it("spots invoice payments", () => {
    expect(isCardPaymentLine("Pagamento recebido")).toBe(true);
    expect(isCardPaymentLine("PGTO FATURA")).toBe(true);
    expect(isCardPaymentLine("Estorno Loja X")).toBe(false);
  });
});
