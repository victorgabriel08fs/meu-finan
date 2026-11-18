import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { readServerEnvSafe } from "@/server/env";
import { RecoverForm } from "./recover-form";

export const metadata: Metadata = { title: "Recuperar acesso" };

// Blocking route: without RECOVERY_TOKEN the page answers a real 404.
export const instant = false;

export default async function RecoverPage() {
  await connection();
  // Fail closed: an unset or invalid token is a 404, never a public warning.
  const token = readServerEnvSafe("RECOVERY_TOKEN");
  if (token.status === "invalid") console.error(token.problem);
  if (token.status !== "ok") notFound();

  return (
    <>
      <h1 className="text-title-1 text-fg">Recuperar acesso</h1>
      <p className="mt-2 text-body text-fg-2">
        Defina uma nova senha para a conta do dono do app (a do OWNER_EMAIL) com
        o código de recuperação. Todas as sessões abertas serão encerradas, e a
        conta volta a ser administradora.
      </p>
      <p
        role="note"
        className="mt-4 rounded-control bg-warning-soft px-4 py-3 text-callout text-warning"
      >
        Depois de recuperar, apague a variável RECOVERY_TOKEN na Vercel e faça
        um novo deploy: assim esta tela volta a ficar fechada.
      </p>
      <RecoverForm />
    </>
  );
}
