import { EXPORT_FETCH_HEADER, MAX_ARCHIVE_BYTES } from "@/lib/export/archive";
import { RECENT_SIGN_IN_REQUIRED } from "@/lib/security/recent-sign-in";
import { getRecentSignIn } from "@/server/dal";
import { db } from "@/server/db/client";
import { recordAudit } from "@/server/domain/audit";
import { getUserContext } from "@/server/domain/context";
import { buildAccountDataArchive } from "@/server/domain/data-export";
import { throttle } from "@/server/security/throttle";

const NO_STORE = { "Cache-Control": "no-store" };

function failure(
  status: number,
  code: string,
  message: string,
  headers: Record<string, string> = {},
): Response {
  return Response.json(
    { ok: false, error: { code, message } },
    { status, headers: { ...NO_STORE, ...headers } },
  );
}

/**
 * "Exportar todos os dados" (doc 02 §6.14, "Dados"): a ZIP with everything
 * of the signed-in person, built here and sent in the response, never
 * stored. Needs a recent sign-in (403 REAUTH_REQUIRED otherwise), at most 3
 * exports in 10 minutes, and the app's fetch header (no export from a
 * prefetch or a cross-site image). Recorded in the audit trail, without any
 * content.
 */
export async function GET(request: Request): Promise<Response> {
  const signIn = await getRecentSignIn();
  if (!signIn) return failure(401, "UNAUTHORIZED", "Sessão expirada.");
  if (!signIn.recent) {
    return failure(403, "REAUTH_REQUIRED", RECENT_SIGN_IN_REQUIRED);
  }
  if (
    request.headers.get(EXPORT_FETCH_HEADER.name) !== EXPORT_FETCH_HEADER.value
  ) {
    return failure(400, "BAD_REQUEST", "Pedido inválido.");
  }
  const { user } = signIn;

  const limit = await throttle(`data-export:${user.id}`, {
    windowSeconds: 600,
    max: 3,
  });
  if (!limit.ok) {
    return failure(
      429,
      "RATE_LIMITED",
      "Você exportou há pouco. Espere alguns minutos e tente de novo.",
      { "Retry-After": String(limit.retryAfterSeconds) },
    );
  }

  try {
    const now = new Date();
    const ctx = await getUserContext(user.id);
    const { bytes, filename } = await buildAccountDataArchive(ctx, now);
    if (bytes.byteLength > MAX_ARCHIVE_BYTES) {
      console.error("[export-data] too large", bytes.byteLength);
      return failure(
        413,
        "TOO_LARGE",
        "Seus dados passaram do tamanho que dá para baixar de uma vez. Use Exportar lançamentos (CSV) e fale com o administrador.",
      );
    }
    await recordAudit(db, {
      action: "data.exported",
      actor: { id: user.id, name: user.name },
      target: null,
      metadata: {},
    });
    return new Response(bytes as Uint8Array<ArrayBuffer>, {
      headers: {
        ...NO_STORE,
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error(
      "[export-data] failed",
      error instanceof Error ? error.message : error,
    );
    return failure(500, "INTERNAL", "Não conseguimos gerar o arquivo.");
  }
}
