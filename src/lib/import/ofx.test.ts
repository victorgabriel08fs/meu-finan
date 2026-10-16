import { describe, expect, it } from "vitest";
import {
  isOfx,
  parseOfx,
  parseOfxAmount,
  parseOfxDate,
  signOrientation,
} from "./ofx";

/** OFX 1.02 (SGML): leaf elements have no closing tag. */
const SGML = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<SIGNONMSGSRSV1>
<SONRS>
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<DTSERVER>20261015120000[-3:BRT]
<LANGUAGE>POR
</SONRS>
</SIGNONMSGSRSV1>
<BANKMSGSRSV1>
<STMTTRNRS>
<TRNUID>1001
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<STMTRS>
<CURDEF>BRL
<BANKACCTFROM>
<BANKID>0341
<ACCTID>12345-6
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20261001
<DTEND>20261015
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261014120000[-3:BRT]
<TRNAMT>-64.50
<FITID>20261014001
<CHECKNUM>001
<MEMO>COMPRA CARTAO PADARIA P&amp;Q
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261005
<TRNAMT>7800.00
<FITID>20261005001
<NAME>SALARIO
<MEMO>SALARIO EMPRESA X
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261003
<TRNAMT>-12,90
<FITID>20261003001
<NAME>TARIFA
<MEMO>PACOTE DE SERVICOS
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>8920.15
<DTASOF>20261015
</LEDGERBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`;

/** OFX 2.1 (XML), credit card. */
const XML = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<?OFX OFXHEADER="200" VERSION="211" SECURITY="NONE" OLDFILEUID="NONE" NEWFILEUID="NONE"?>
<OFX>
  <CREDITCARDMSGSRSV1>
    <CCSTMTTRNRS>
      <TRNUID>1</TRNUID>
      <CCSTMTRS>
        <CURDEF>BRL</CURDEF>
        <CCACCTFROM><ACCTID>4111********1111</ACCTID></CCACCTFROM>
        <BANKTRANLIST>
          <DTSTART>20261001000000[-3:BRT]</DTSTART>
          <DTEND>20261015000000[-3:BRT]</DTEND>
          <STMTTRN>
            <TRNTYPE>DEBIT</TRNTYPE>
            <DTPOSTED>20261014000000[-3:BRT]</DTPOSTED>
            <TRNAMT>-22.90</TRNAMT>
            <FITID>a1b2c3</FITID>
            <NAME>Corrida &#225; noite</NAME>
            <MEMO>Corrida á noite</MEMO>
          </STMTTRN>
          <STMTTRN>
            <TRNTYPE>CREDIT</TRNTYPE>
            <DTPOSTED>20261010000000[-3:BRT]</DTPOSTED>
            <TRNAMT>1380.42</TRNAMT>
            <FITID>d4e5f6</FITID>
            <PAYEE><NAME>Banco</NAME></PAYEE>
            <NAME>Pagamento recebido</NAME>
          </STMTTRN>
        </BANKTRANLIST>
      </CCSTMTRS>
    </CCSTMTTRNRS>
  </CREDITCARDMSGSRSV1>
</OFX>`;

describe("isOfx", () => {
  it("recognises both versions and rejects CSV", () => {
    expect(isOfx(SGML)).toBe(true);
    expect(isOfx(XML)).toBe(true);
    expect(isOfx("Data;Valor\n14/10/2026;-64,50")).toBe(false);
  });
});

describe("parseOfx (SGML 1.x)", () => {
  const statement = parseOfx(SGML);

  it("reads every transaction with its FITID, date and amount", () => {
    expect(statement.transactions).toEqual([
      {
        line: 39,
        occurredOn: "2026-10-14",
        amountCents: -6450,
        description: "COMPRA CARTAO PADARIA P&Q",
        fitId: "20261014001",
        type: "DEBIT",
      },
      {
        line: 47,
        occurredOn: "2026-10-05",
        amountCents: 780000,
        description: "SALARIO EMPRESA X",
        fitId: "20261005001",
        type: "CREDIT",
      },
      {
        line: 55,
        occurredOn: "2026-10-03",
        amountCents: -1290,
        description: "TARIFA - PACOTE DE SERVICOS",
        fitId: "20261003001",
        type: "DEBIT",
      },
    ]);
  });

  it("reports the account and currency", () => {
    expect(statement.accounts).toBe(1);
    expect(statement.currency).toBe("BRL");
    expect(statement.skipped).toEqual([]);
  });
});

describe("parseOfx (XML 2.x)", () => {
  it("reads a credit card statement, decoding entities", () => {
    const statement = parseOfx(XML);
    expect(statement.transactions).toEqual([
      {
        line: 13,
        occurredOn: "2026-10-14",
        amountCents: -2290,
        description: "Corrida á noite",
        fitId: "a1b2c3",
        type: "DEBIT",
      },
      {
        line: 21,
        occurredOn: "2026-10-10",
        amountCents: 138042,
        description: "Banco",
        fitId: "d4e5f6",
        type: "CREDIT",
      },
    ]);
    expect(statement.accounts).toBe(1);
  });
});

describe("parseOfx edge cases", () => {
  const wrap = (transactions: string) =>
    `OFXHEADER:100\n\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL<BANKACCTFROM><ACCTID>1</BANKACCTFROM><BANKTRANLIST>${transactions}</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

  it("closes transactions whose </STMTTRN> is missing", () => {
    const statement = parseOfx(
      wrap(
        "<STMTTRN><DTPOSTED>20261001<TRNAMT>-1.00<FITID>1<MEMO>A" +
          "<STMTTRN><DTPOSTED>20261002<TRNAMT>-2.00<FITID>2<MEMO>B",
      ),
    );
    expect(
      statement.transactions.map((txn) => [txn.fitId, txn.amountCents]),
    ).toEqual([
      ["1", -100],
      ["2", -200],
    ]);
  });

  it("reports transactions without a usable date or amount", () => {
    const statement = parseOfx(
      wrap(
        "<STMTTRN><DTPOSTED>2026<TRNAMT>-1.00<FITID>1</STMTTRN>" +
          "<STMTTRN><DTPOSTED>20261001<TRNAMT>abc<FITID>2</STMTTRN>" +
          "<STMTTRN><DTPOSTED>20261001<TRNAMT>0.00<FITID>3</STMTTRN>" +
          "<STMTTRN><DTUSER>20261002<TRNAMT>-5.00<FITID>4</STMTTRN>",
      ),
    );
    expect(statement.skipped.map((line) => line.reason)).toEqual([
      "date",
      "amount",
      "zero",
    ]);
    // DTUSER stands in for a missing DTPOSTED.
    expect(statement.transactions).toHaveLength(1);
    expect(statement.transactions[0]?.occurredOn).toBe("2026-10-02");
  });

  it("takes the sign from TRNTYPE when every amount is positive", () => {
    const statement = parseOfx(
      wrap(
        "<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261001<TRNAMT>10.00<FITID>1</STMTTRN>" +
          "<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261001<TRNAMT>20.00<FITID>2</STMTTRN>" +
          "<STMTTRN><TRNTYPE>FEE<DTPOSTED>20261001<TRNAMT>1.50<FITID>3</STMTTRN>",
      ),
    );
    expect(statement.transactions.map((txn) => txn.amountCents)).toEqual([
      -1000, 2000, -150,
    ]);
  });

  it("keeps the amounts when the file already has negatives", () => {
    const statement = parseOfx(
      wrap(
        "<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261001<TRNAMT>10.00<FITID>1</STMTTRN>" +
          "<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261001<TRNAMT>-20.00<FITID>2</STMTTRN>",
      ),
    );
    expect(statement.transactions.map((txn) => txn.amountCents)).toEqual([
      1000, -2000,
    ]);
  });

  it("counts the accounts of a file with several statements", () => {
    const two = `<OFX><BANKMSGSRSV1>
      <STMTTRNRS><STMTRS><BANKACCTFROM><ACCTID>111</BANKACCTFROM><BANKTRANLIST>
      <STMTTRN><DTPOSTED>20261001<TRNAMT>-1<FITID>1</STMTTRN></BANKTRANLIST></STMTRS></STMTTRNRS>
      <STMTTRNRS><STMTRS><BANKACCTFROM><ACCTID>222</BANKACCTFROM><BANKTRANLIST>
      <STMTTRN><DTPOSTED>20261001<TRNAMT>-2<FITID>2</STMTTRN></BANKTRANLIST></STMTRS></STMTTRNRS>
      </BANKMSGSRSV1></OFX>`;
    const statement = parseOfx(two);
    expect(statement.accounts).toBe(2);
    expect(statement.transactions).toHaveLength(2);
  });

  it("returns nothing for a file without transactions", () => {
    expect(parseOfx("<OFX><SIGNONMSGSRSV1></SIGNONMSGSRSV1></OFX>")).toEqual({
      transactions: [],
      skipped: [],
      accounts: 0,
      currency: null,
    });
  });

  it("skips attributes and stays fast on a broken file", () => {
    const withNamespace = parseOfx(
      wrap(
        '<STMTTRN xmlns="http://ofx.net"><DTPOSTED>20261001<TRNAMT>-1.00<FITID>1</STMTTRN>',
      ),
    );
    expect(withNamespace.transactions).toHaveLength(1);
    // Many "<" without ">": every match must stay short.
    const started = performance.now();
    expect(parseOfx(`<OFX>${"<a ".repeat(200_000)}`).transactions).toEqual([]);
    expect(performance.now() - started).toBeLessThan(5_000);
  });
});

describe("signOrientation", () => {
  const txn = (type: string | null, amountCents: number) => ({
    line: 1,
    occurredOn: "2026-10-01",
    amountCents,
    description: "x",
    fitId: null,
    type,
  });

  it("follows the transaction types", () => {
    expect(signOrientation([txn("DEBIT", -100), txn("CREDIT", 50)])).toBe(
      "normal",
    );
    // Few purchases and some refunds: still a normal file.
    expect(
      signOrientation([
        txn("DEBIT", -100),
        txn("CREDIT", 50),
        txn("CREDIT", 60),
        txn("CREDIT", 70),
      ]),
    ).toBe("normal");
    expect(signOrientation([txn("DEBIT", 100), txn("PAYMENT", 30)])).toBe(
      "inverted",
    );
  });

  it("has no opinion without typed rows or on a tie", () => {
    expect(signOrientation([txn(null, -100), txn("OTHER", 50)])).toBeNull();
    expect(signOrientation([txn("DEBIT", -100), txn("DEBIT", 100)])).toBeNull();
    expect(signOrientation([])).toBeNull();
  });
});

describe("value parsers", () => {
  it("reads OFX dates with times and zones", () => {
    expect(parseOfxDate("20261014")).toBe("2026-10-14");
    expect(parseOfxDate("20261014120000.000[-03:EST]")).toBe("2026-10-14");
    expect(parseOfxDate("20261314")).toBeNull();
    expect(parseOfxDate("")).toBeNull();
  });

  it("reads OFX amounts with a point or a comma", () => {
    expect(parseOfxAmount("-64.50")).toBe(-6450);
    expect(parseOfxAmount("-64,50")).toBe(-6450);
    expect(parseOfxAmount("+1234.5")).toBe(123450);
    expect(parseOfxAmount("1.234,56")).toBe(123456);
    expect(parseOfxAmount("")).toBeNull();
  });
});
