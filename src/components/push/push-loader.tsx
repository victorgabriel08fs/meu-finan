import { unstable_rethrow } from "next/navigation";
import { getSession } from "@/server/dal";
import { isFlagEnabled } from "@/server/flags";
import { PushSync } from "./push-sync";

/**
 * Server half of the device sync (doc 01 §10): render it inside
 * <Suspense fallback={null}> in the app layout. With the notificacoes_push
 * flag off the service worker is not even registered, and the sync only
 * clears a number left on the icon from when it was on. A failed read
 * renders nothing, like the theme sync.
 */
export async function PushLoader() {
  let enabled: boolean;
  try {
    const session = await getSession();
    if (!session) return null;
    enabled = await isFlagEnabled("notificacoes_push", session.user.id);
  } catch (error) {
    unstable_rethrow(error);
    console.error("[push] could not check the notifications flag", error);
    return null;
  }
  return <PushSync enabled={enabled} />;
}
