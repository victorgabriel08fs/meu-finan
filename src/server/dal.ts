// Data Access Layer: the real authorization check (doc 01 §11.5). Every page,
// Server Action and Route Handler that touches user data goes through here;
// src/proxy.ts only redirects optimistically.
//
// Reads request headers, so call it only inside <Suspense> (Cache Components).
import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/server/auth";

export type CurrentUser = { id: string; name: string; email: string };

/** The current session, or null when signed out. Deduplicated per request. */
export const getSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
);

/** The signed-in owner; redirects to /entrar when there is no valid session. */
export async function requireUser(): Promise<CurrentUser> {
  const session = await getSession();
  if (!session) redirect("/entrar");
  const { id, name, email } = session.user;
  return { id, name, email };
}
