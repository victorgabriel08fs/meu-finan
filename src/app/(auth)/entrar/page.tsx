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
      : undefined;

  return (
    <>
      <h1 className="font-bold text-[28px] text-fg leading-[34px] tracking-[-0.02em]">
        Entrar
      </h1>
      <p className="mt-2 text-[15px] text-fg-2 leading-[22px]">
        Seu dinheiro, claro como deveria ser.
      </p>
      <LoginForm redirectTo={target} notice={notice} />
    </>
  );
}
