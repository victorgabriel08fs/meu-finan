import { unstable_rethrow } from "next/navigation";
import type { ThemeChoice } from "@/lib/theme";
import { getSession } from "@/server/dal";
import { getThemePreference } from "@/server/domain/preferences";
import { ThemeAccountSync } from "./theme-sync";

/**
 * Server half of the theme sync: render it inside <Suspense fallback={null}>
 * in the signed-in layouts. Reads the session (nothing runs while
 * prerendering) and hands the account's id and theme to the client; the id
 * only marks whose theme the device synced (THEME_SYNCED_KEY) and is never
 * read back. Without a session or on a failed read it renders nothing: the
 * device keeps its own theme, and the page itself handles the missing session.
 */
export async function ThemeAccount() {
  let userId: string;
  let saved: ThemeChoice;
  try {
    const session = await getSession();
    if (!session) return null;
    userId = session.user.id;
    saved = await getThemePreference(userId);
  } catch (error) {
    unstable_rethrow(error);
    console.error("[theme] could not load the account's theme", error);
    return null;
  }
  return <ThemeAccountSync userId={userId} saved={saved} />;
}
