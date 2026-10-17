import { AdminSideNavLink } from "@/components/app/side-nav";
import { getAdmin } from "@/server/dal";

/**
 * "Administração" in the desktop sidebar, only for administrators. Reads the
 * session, so the app shell renders it inside <Suspense>.
 */
export async function AdminNavItem() {
  const admin = await getAdmin();
  return admin ? <AdminSideNavLink /> : null;
}
