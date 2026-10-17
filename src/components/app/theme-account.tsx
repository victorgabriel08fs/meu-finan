import { unstable_rethrow } from "next/navigation";
import type { ThemeChoice } from "@/lib/theme";
import { getSession } from "@/server/dal";
import { getThemePreference } from "@/server/domain/preferences";
import { ThemeAccountSync } from "./theme-sync";

/**
 * Server half of the theme sync: render it inside <Suspense fallback={null}>
 * in the signed-in layouts. Reads the session (nothing runs while
 * prerendering) and hands the account's theme to the client. Without a
 * session or on a failed read it renders nothing: the device keeps its own
 * theme, and the page itself handles the missing session.
 */
export async function ThemeAccount() {
  let saved: ThemeChoice;
  try {
    const session = await getSession();
    if (!session) return null;
    saved = await getThemePreference(session.user.id);
  } catch (error) {
    unstable_rethrow(error);
    console.error("[theme] could not load the account's theme", error);
    return null;
  }
  return <ThemeAccountSync saved={saved} />;
}
