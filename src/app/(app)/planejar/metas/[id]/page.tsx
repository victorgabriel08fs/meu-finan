import { Archive, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { GoalDetailView } from "@/components/planning/goals/goal-detail";
import { GOALS_HREF } from "@/components/planning/goals/model";
import { Button } from "@/components/ui/button";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { toYearMonth } from "@/lib/finance";
import { requireUser } from "@/server/dal";
import { listAccounts } from "@/server/domain/accounts";
import { getUserContext } from "@/server/domain/context";
import { getGoal, goalContributions } from "@/server/domain/goals";
import { getMarketRates } from "@/server/domain/rates";

export const metadata: Metadata = { title: "Meta" };

const BACK = { href: GOALS_HREF, label: "Metas" };

/**
 * Planejar › Metas › meta (doc 02 §6.10): progress, projection chart with the
 * contributions made, the plan and "Aportar". Unknown, foreign or archived
 * goals get an empty state.
 */
export default function MetaPage({
  params,
}: PageProps<"/planejar/metas/[id]">) {
  return (
    <div className="flex flex-col gap-4">
      <Suspense fallback={<GoalSkeleton />}>
        <GoalDetail params={params} />
      </Suspense>
    </div>
  );
}

async function GoalDetail({
  params,
}: {
  params: PageProps<"/planejar/metas/[id]">["params"];
}) {
  const user = await requireUser();
  const [{ id }, ctx] = await Promise.all([params, getUserContext(user.id)]);
  const [goal, accounts, market] = await Promise.all([
    getGoal(ctx, id),
    listAccounts(user.id),
    getMarketRates(),
  ]);

  if (!goal) {
    return (
      <Missing
        title="Meta não encontrada"
        description="Ela pode ter sido removida, ou o link está incompleto."
      />
    );
  }
  if (goal.archived) {
    return (
      <Missing
        title={`${goal.name} está arquivada`}
        description="Metas arquivadas saem da lista. O dinheiro e os lançamentos continuam onde estão."
        archived
      />
    );
  }

  const history = await goalContributions(ctx, goal);
  // Money kept aside for a goal never sits on a credit card.
  const regular = accounts.filter((account) => account.type !== "credit_card");

  return (
    <GoalDetailView
      goal={{
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
        monthlyRate: goal.monthlyRate,
        linked: goal.linked,
      }}
      history={history}
      accounts={regular.map((account) => ({
        id: account.id,
        name: account.name,
        balanceCents: account.balanceCents,
      }))}
      sources={regular
        .filter((account) => account.id !== goal.accountId)
        .map((account) => ({
          id: account.id,
          name: account.name,
          icon: account.icon,
          color: account.color,
          balanceCents: account.balanceCents,
        }))}
      market={market}
      today={toYearMonth(ctx.today)}
      todayIso={ctx.todayIso}
    />
  );
}

function Missing({
  title,
  description,
  archived = false,
}: {
  title: string;
  description: string;
  archived?: boolean;
}) {
  return (
    <>
      <PageHeader title="Meta" back={BACK} />
      <EmptyState
        icon={archived ? <Archive /> : <SearchX />}
        title={title}
        description={description}
        action={
          <Button asChild variant="tonal">
            <Link href={GOALS_HREF}>Ver metas</Link>
          </Button>
        }
      />
    </>
  );
}

/** Same shape as the detail: header, then hero + plan beside the chart on wide screens. */
function GoalSkeleton() {
  return (
    <LoadingRegion className="flex flex-col gap-4">
      <div className="flex flex-col pt-[env(safe-area-inset-top)]">
        <div className="flex h-13 items-center justify-between">
          <Skeleton className="h-6 w-20 rounded-chip" />
          <div className="flex gap-2">
            <Skeleton className="size-9 rounded-full" />
            <Skeleton className="size-9 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-8.5 w-56 rounded-chip" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
        <div className="flex flex-col gap-4 rounded-card bg-surface p-5 shadow-card lg:col-start-1">
          <div className="flex items-center gap-4">
            <Skeleton className="size-30 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-16 rounded-chip" />
              <Skeleton className="h-7 w-32 rounded-chip" />
              <Skeleton className="h-4 w-24 rounded-chip" />
              <Skeleton className="mt-1 h-6.5 w-24 rounded-full" />
            </div>
          </div>
          <Skeleton className="h-11 rounded-chip" />
          <Skeleton className="h-13" />
        </div>
        <Skeleton className="h-112 rounded-card lg:col-start-2 lg:row-span-2 lg:row-start-1" />
        <Skeleton className="h-96 rounded-card lg:col-start-1" />
      </div>
    </LoadingRegion>
  );
}
