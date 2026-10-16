import { redirect } from "next/navigation";

/** Relatórios opens on the overview. */
export default function RelatoriosPage() {
  redirect("/relatorios/visao-geral");
}
