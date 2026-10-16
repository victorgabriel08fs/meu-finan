import type { Metadata } from "next";
import { Suspense } from "react";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/server/dal";
import { listAccounts } from "@/server/domain/accounts";
import { listCategories } from "@/server/domain/categories";
import { getUserContext } from "@/server/domain/context";

export const metadata: Metadata = { title: "Primeiros passos" };

/**
 * Onboarding in 4 steps (doc 02 §6.2): welcome, first account, categories and
 * the start day of the financial month. Reached after the first access and
 * from the Início while there is no account; "Pular" goes to the Início.
 */
export default function OnboardingPage() {
  return (
    <Suspense fallback={<OnboardingSkeleton />}>
      <Onboarding />
    </Suspense>
  );
}

async function Onboarding() {
  const user = await requireUser();
  const [ctx, accounts, categories] = await Promise.all([
    getUserContext(user.id),
    listAccounts(user.id),
    listCategories(user.id),
  ]);
  return (
    <OnboardingFlow
      firstName={user.name.split(" ")[0] ?? user.name}
      hasAccounts={accounts.length > 0}
      monthStartDay={ctx.monthStartDay}
      currentMonth={ctx.todayIso.slice(0, 7)}
      categories={categories
        .filter((category) => category.parentId === null)
        .map(({ id, name, kind, icon, color }) => ({
          id,
          name,
          kind,
          icon,
          color,
        }))}
    />
  );
}

function OnboardingSkeleton() {
  return (
    <LoadingRegion className="flex flex-1 flex-col gap-6 pt-2">
      <div className="flex items-center justify-between">
        <Skeleton className="h-2 w-20 rounded-full" />
        <Skeleton className="h-9 w-16 rounded-control" />
      </div>
      <Skeleton className="mt-6 size-14 rounded-[28%]" />
      <Skeleton className="h-9 w-4/5 rounded-chip" />
      <Skeleton className="h-40 rounded-card" />
      <Skeleton className="mt-auto h-13 rounded-control" />
    </LoadingRegion>
  );
}
