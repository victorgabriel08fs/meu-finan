import type { NextRequest } from "next/server";
import { isoDate } from "@/lib/import/date";
import { transactionsCsv } from "@/lib/import/export";
import { getSession } from "@/server/dal";
import { getUserContext } from "@/server/domain/context";
import { listExportRows } from "@/server/domain/imports";

const NO_STORE = { "Cache-Control": "no-store" };

function failure(status: number, code: string, message: string): Response {
  return Response.json(
    { ok: false, error: { code, message } },
    { status, headers: NO_STORE },
  );
}

/** A `YYYY-MM-DD` that is a real date; undefined when absent, null when invalid. */
function dateParam(value: string | null): string | null | undefined {
  if (value === null || value === "") return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return isoDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

/**
 * "Exportar lançamentos (CSV)" (doc 02 §6.14, "Dados"): the owner's ledger
 * as a spreadsheet for the Brazilian Excel. Optional `?inicio=YYYY-MM-DD` and
 * `&fim=YYYY-MM-DD` (inclusive) narrow the period; without them, everything.
 * The session is checked here (the proxy only redirects optimistically) and
 * the user always comes from it, never from the query.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const session = await getSession();
  if (!session) return failure(401, "UNAUTHORIZED", "Sessão expirada.");

  const params = request.nextUrl.searchParams;
  const start = dateParam(params.get("inicio"));
  const end = dateParam(params.get("fim"));
  if (start === null || end === null || (start && end && start > end)) {
    return failure(400, "BAD_REQUEST", "Período inválido.");
  }

  try {
    const ctx = await getUserContext(session.user.id);
    const rows = await listExportRows(ctx, { start, end });
    return new Response(transactionsCsv(rows), {
      headers: {
        ...NO_STORE,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="meu-finan-lancamentos-${ctx.todayIso}.csv"`,
      },
    });
  } catch (error) {
    console.error(
      "[export] failed",
      error instanceof Error ? error.message : error,
    );
    return failure(500, "INTERNAL", "Não conseguimos gerar o arquivo.");
  }
}
