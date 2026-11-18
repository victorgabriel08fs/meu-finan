import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/server/dal";
import { safeRedirectPath } from "@/server/security/guards";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

// Blocking route: a signed-in owner is redirected before anything renders.
export const instant = false;

export default async function LoginPage({
  searchParams,
}: PageProps<"/entrar">) {
  const params = await searchParams;
  const target = safeRedirectPath(
    typeof params.voltar === "string" ? params.voltar : null,
  );
  if (await getSession()) redirect(target);

  const notice =
    params.recuperado === "1"
      ? "Acesso recuperado. Entre com a nova senha e cadastre uma passkey de novo, se removeu as antigas."
      : params.excluida === "1"
        ? "Sua conta foi excluída, com todos os dados."
        : undefined;

  return (
    <>
      <h1 className="text-title-1 text-fg">Entrar</h1>
      <p className="mt-2 text-body text-fg-2">Seu dinheiro no prumo.</p>
      <LoginForm redirectTo={target} notice={notice} />
    </>
  );
}
