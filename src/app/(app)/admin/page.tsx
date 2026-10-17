import { redirect } from "next/navigation";

/** /admin opens on Usuários, which checks the role. */
export default function AdminPage() {
  redirect("/admin/usuarios");
}
