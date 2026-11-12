import { SharedSideNavLink } from "@/components/app/side-nav";
import { getSession } from "@/server/dal";
import { isFlagEnabled } from "@/server/flags";

/**
 * "Compartilhado" in the desktop sidebar, only with financas_compartilhadas.
 * Reads the session, so the app shell renders it inside <Suspense>.
 */
export async function SharedNavItem() {
  const session = await getSession();
  if (!session) return null;
  const enabled = await isFlagEnabled(
    "financas_compartilhadas",
    session.user.id,
  );
  return enabled ? <SharedSideNavLink /> : null;
}
