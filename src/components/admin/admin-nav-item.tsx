import { AdminSideNavLink } from "@/components/app/side-nav";
import { getAdminAccess } from "@/server/dal";

/**
 * "Administração" in the desktop sidebar, only for administrators (confirmed
 * with a passkey or not: the pages send an unconfirmed session to the
 * confirmation). Reads the session, so the app shell renders it inside
 * <Suspense>.
 */
export async function AdminNavItem() {
  const access = await getAdminAccess();
  return access ? <AdminSideNavLink /> : null;
}
