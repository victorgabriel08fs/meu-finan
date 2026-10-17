import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { readServerEnv } from "@/server/env";
import { RecoverForm } from "./recover-form";

export const metadata: Metadata = { title: "Recuperar acesso" };

// Blocking route: without RECOVERY_TOKEN the page answers a real 404.
export const instant = false;

export default async function RecoverPage() {
  await connection();
  if (!readServerEnv("RECOVERY_TOKEN")) notFound();

  return (
    <>
      <h1 className="font-bold text-[28px] text-fg leading-[34px] tracking-[-0.02em]">
        Recuperar acesso
      </h1>
      <p className="mt-2 text-[15px] text-fg-2 leading-[22px]">
        Defina uma nova senha para a conta do dono do app (a do OWNER_EMAIL) com
        o código de recuperação. Todas as sessões abertas serão encerradas, e a
        conta volta a ser administradora.
      </p>
      <p
        role="note"
        className="mt-4 rounded-control bg-warning-soft px-4 py-3 text-[14px] text-warning leading-5"
      >
        Depois de recuperar, apague a variável RECOVERY_TOKEN na Vercel e faça
        um novo deploy: assim esta tela volta a ficar fechada.
      </p>
      <RecoverForm />
    </>
  );
}
