// Optimistic gate: without a session cookie, pages redirect to /entrar and API
// routes answer 401. It never decides access on its own — the DAL
// (src/server/dal.ts) validates the session on every page, action and route.
import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
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
  if (pathname !== "/")
    login.searchParams.set("voltar", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except the public auth pages, Better Auth's own endpoints, the
  // cron route (Bearer CRON_SECRET), Next internals and public assets.
  matcher: [
    "/((?!entrar|primeiro-acesso|recuperar|api/auth|api/cron|_next/|favicon\\.ico|icon|apple-icon|manifest\\.webmanifest|robots\\.txt).*)",
  ],
};
