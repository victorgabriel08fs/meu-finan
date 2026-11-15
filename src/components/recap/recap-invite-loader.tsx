import { monthName } from "@/components/dashboard/labels";
import { recapHref } from "@/components/reports/views";
import type { UserContext } from "@/server/domain/context";
import { recapInvite } from "@/server/domain/month-recap";
import { RecapInvite } from "./recap-invite";

/**
 * Server half of the Retrospectiva invite on the Início: asks the domain
 * whether the first days of the month are on and something was paid in the
 * month that closed. Render inside <Suspense fallback={null}>.
 */
export async function RecapInviteLoader({ ctx }: { ctx: UserContext }) {
  const invite = await recapInvite(ctx);
  if (!invite) return null;
  return (
    <RecapInvite
      userId={ctx.userId}
      month={invite.month}
      monthName={monthName(invite.month)}
      href={recapHref(invite.month)}
    />
  );
}
