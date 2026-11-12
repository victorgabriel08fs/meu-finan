import type { Metadata } from "next";
import { Suspense } from "react";
import { GoalsView } from "@/components/planning/goals/goals-view";
import { SharedBoxesSection } from "@/components/sharing/shared-boxes-section";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { toYearMonth } from "@/lib/finance";
import { requireUser } from "@/server/dal";
import { listAccounts } from "@/server/domain/accounts";
import { getUserContext } from "@/server/domain/context";
import { listGoals } from "@/server/domain/goals";
import { getMarketRates } from "@/server/domain/rates";
import { listMyBoxes } from "@/server/domain/sharing/boxes";
import { isFlagEnabled } from "@/server/flags";

export const metadata: Metadata = { title: "Metas" };

export default function MetasPage() {
  return (
    <Suspense fallback={<GoalsSkeleton />}>
      <Goals />
    </Suspense>
  );
}

async function Goals() {
  const user = await requireUser();
  const ctx = await getUserContext(user.id);
  const [goals, accounts, market, sharedBoxes] = await Promise.all([
    listGoals(ctx),
    listAccounts(user.id),
    getMarketRates(),
    // The group's boxes only exist for people with the flag (ADR-13).
    isFlagEnabled("financas_compartilhadas", user.id).then((on) =>
      on ? listMyBoxes(ctx) : [],
    ),
  ]);

  return (
    <>
      <GoalsView
        goals={goals.map((goal) => ({
          id: goal.id,
          name: goal.name,
          icon: goal.icon,
          color: goal.color,
          targetCents: goal.targetCents,
          currentCents: goal.currentCents,
          progress: goal.progress,
          targetDate: goal.targetDate,
          monthlyPlanCents: goal.monthlyPlanCents,
          expectedRate: goal.expectedRate,
          rateLabel: goal.rateLabel,
          accountId: goal.accountId,
          accountName: goal.accountName,
          projection: goal.projection,
        }))}
        // A goal is money kept aside: credit cards cannot hold it.
        accounts={accounts
          .filter(
            (account) => account.type !== "credit_card" && !account.archived,
          )
          .map((account) => ({
            id: account.id,
            name: account.name,
            balanceCents: account.balanceCents,
          }))}
        market={market}
        today={toYearMonth(ctx.today)}
        hasSharedBoxes={sharedBoxes.length > 0}
      />
      <SharedBoxesSection boxes={sharedBoxes} />
    </>
  );
}

function GoalsSkeleton() {
  return (
    <LoadingRegion className="flex flex-col gap-3">
      <Skeleton className="h-28 rounded-card" />
      <Skeleton className="mt-4 h-9 w-full rounded-chip" />
      <Skeleton className="h-44 rounded-card" />
      <Skeleton className="h-44 rounded-card" />
    </LoadingRegion>
  );
}
