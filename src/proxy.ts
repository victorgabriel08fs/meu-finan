// Optimistic gate: without a session cookie, pages redirect to /entrar and API
// routes answer 401. It never decides access on its own — the DAL
// (src/server/dal.ts) validates the session on every page, action and route.
import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

/** Public pages that only exist while their token is configured (fail closed). */
const TOKEN_GATED: Record<string, "SETUP_TOKEN" | "RECOVERY_TOKEN"> = {
  "/primeiro-acesso": "SETUP_TOKEN",
  "/recuperar": "RECOVERY_TOKEN",
};

/**
 * Invite and reset links (/convite/<token>): public, gated by the link's own
 * token, which the page checks (rate-limited, constant-time comparison).
 */
const ACCESS_LINK_PREFIX = "/convite/";

/**
 * Deliberately matches no route: rewriting a request here makes Next render
 * app/not-found.tsx (the app's theme, in pt-BR) with a 404 status.
 */
const NOT_FOUND_PATH = "/nao-encontrada";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const gate = TOKEN_GATED[pathname];
  if (gate) {
    // Without its token the page answers a real 404 and never renders; with
    // it, the page itself checks the rest.
    return process.env[gate]?.trim()
      ? NextResponse.next()
      : NextResponse.rewrite(new URL(NOT_FOUND_PATH, request.url));
  }

  if (pathname.startsWith(ACCESS_LINK_PREFIX)) return NextResponse.next();

  if (getSessionCookie(request)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "UNAUTHORIZED", message: "Sessão expirada." },
      },
      { status: 401 },
    );
  }

  const login = request.nextUrl.clone();
  login.pathname = "/entrar";
  login.search = "";
  if (pathname !== "/") {
    login.searchParams.set("voltar", `${pathname}${search}`);
  }
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except the login page, Better Auth's own endpoints, the cron
  // route (Bearer CRON_SECRET), Next internals and public assets.
  matcher: [
    "/((?!entrar|api/auth|api/cron|_next/|favicon\\.ico|icon|apple-icon|manifest\\.webmanifest|robots\\.txt).*)",
  ],
};
