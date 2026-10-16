import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExportRow } from "@/lib/import/export";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUserContext: vi.fn(),
  listExportRows: vi.fn(),
}));

vi.mock("@/server/dal", () => ({ getSession: mocks.getSession }));
vi.mock("@/server/domain/context", () => ({
  getUserContext: mocks.getUserContext,
}));
vi.mock("@/server/domain/imports", () => ({
  listExportRows: mocks.listExportRows,
}));

const { GET } = await import("./route");

const request = (query = "") =>
  ({
    nextUrl: new URL(`http://localhost/api/export/transactions${query}`),
  }) as unknown as NextRequest;

const ROW: ExportRow = {
  occurredOn: "2026-10-14",
  description: "Supermercado",
  categoryName: "Mercado",
  accountName: "Conta principal",
  kind: "expense",
  status: "paid",
  amountCents: -6_450,
  installment: null,
  notes: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "owner" } });
  mocks.getUserContext.mockImplementation(async (userId: string) => ({
    userId,
    todayIso: "2026-10-15",
  }));
  mocks.listExportRows.mockResolvedValue([ROW]);
});

describe("GET /api/export/transactions", () => {
  it("answers 401 without a session and reads nothing", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Sessão expirada." },
    });
    expect(mocks.listExportRows).not.toHaveBeenCalled();
  });

  it.each([
    "?inicio=2026-13-01",
    "?fim=2026-02-30",
    "?inicio=ontem",
    "?inicio=2026-10-15&fim=2026-10-01",
  ])("refuses the period %s", async (query) => {
    const response = await GET(request(query));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("BAD_REQUEST");
    expect(mocks.listExportRows).not.toHaveBeenCalled();
  });

  it("downloads the CSV of the session's owner, never of the query", async () => {
    const response = await GET(
      request("?inicio=2026-10-01&fim=2026-10-31&userId=intruder"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/csv; charset=utf-8",
    );
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="meu-finan-lancamentos-2026-10-15.csv"',
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.getUserContext).toHaveBeenCalledWith("owner");
    expect(mocks.listExportRows).toHaveBeenCalledWith(
      { userId: "owner", todayIso: "2026-10-15" },
      { start: "2026-10-01", end: "2026-10-31" },
    );
    // Read the raw bytes: Response.text() would drop the BOM.
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes.slice(3))).toBe(
      "Data;Descrição;Categoria;Conta;Tipo;Status;Valor;Parcela;Observação\r\n" +
        "14/10/2026;Supermercado;Mercado;Conta principal;Despesa;Pago;-64,50;;\r\n",
    );
  });

  it("exports everything without a period", async () => {
    await GET(request());
    expect(mocks.listExportRows).toHaveBeenCalledWith(expect.anything(), {
      start: undefined,
      end: undefined,
    });
  });

  it("answers 500 when the export fails", async () => {
    mocks.listExportRows.mockRejectedValue(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe("INTERNAL");
    spy.mockRestore();
  });
});
