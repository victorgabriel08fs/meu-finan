import type { Metadata } from "next";
import { NotFoundMessage } from "@/components/app/not-found-message";

export const metadata: Metadata = { title: "Página não encontrada" };

/**
 * 404 of the public pages: an unknown or mangled invite link, or
 * /primeiro-acesso once the first account exists. The (auth) layout already
 * draws the <main>, the brand and the centred column, so this is only the
 * message. The way out is the login, as on the invite's other problem
 * screens; /entrar sends a signed-in person on to Início.
 */
export default function AuthNotFound() {
  return <NotFoundMessage href="/entrar" label="Ir para o login" />;
}
