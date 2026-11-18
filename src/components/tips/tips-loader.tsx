import { unstable_rethrow } from "next/navigation";
import type { TipsSnapshot } from "@/lib/tips";
import { getSession, requireUser } from "@/server/dal";
import { getTipsSnapshot } from "@/server/domain/tips";
import { getFlags } from "@/server/flags";
import { TipsHost } from "./tips-host";

/**
 * Server half of the tips (doc 02 §6.16): render it inside <Suspense> in the
 * app layout. Checks the session (nothing runs while prerendering), reads
 * what the user has seen and hands it to the browser once per page load,
 * with the role and feature flags that tip conditions read. Tips are a
 * nicety: a failed read shows none instead of breaking the shell.
 */
export async function TipsLoader() {
  const user = await requireUser();
  let snapshot: TipsSnapshot;
  try {
    const [flags, session] = await Promise.all([
      getFlags(user.id),
      getSession(),
    ]);
    snapshot = await getTipsSnapshot(
      user.id,
      { role: user.role, flags },
      // The session (deduplicated per request) already has the user row.
      {
        ownerCreatedAt: session ? new Date(session.user.createdAt) : undefined,
      },
    );
  } catch (error) {
    unstable_rethrow(error);
    console.error("[tips] could not load the user's tips", error);
    return null;
  }
  return <TipsHost snapshot={snapshot} />;
}
