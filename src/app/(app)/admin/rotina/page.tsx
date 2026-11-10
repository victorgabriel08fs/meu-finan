import type { Metadata } from "next";
import { Suspense } from "react";
import { RoutineView } from "@/components/admin/routine-view";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { requireAdmin } from "@/server/dal";
import { listDailyRuns, routineConfig } from "@/server/domain/job-runs";

export const metadata: Metadata = { title: "Rotina diária" };

// "Rodar agora" is a Server Action of this page: it gets this limit (the job
// stops starting steps after 240 s, see DAILY_TIME_BUDGET_MS).
export const maxDuration = 300;

/**
 * Administração › Rotina diária (doc 02 §6.17): is the cron alive, how the
 * daily job is set up, its latest runs and "Rodar agora". 404 for anyone but
 * an administrator.
 */
export default function RotinaPage() {
  return (
    <Suspense fallback={<RoutineSkeleton />}>
      <Routine />
    </Suspense>
  );
}

async function Routine() {
  await requireAdmin();
  const [runs, config] = await Promise.all([listDailyRuns(), routineConfig()]);
  return (
    <RoutineView runs={runs} config={config} now={new Date().toISOString()} />
  );
}

function RoutineSkeleton() {
  return (
    <LoadingRegion className="flex flex-col gap-5">
      <Skeleton className="h-16 rounded-2xl" />
      <Skeleton className="h-[168px] rounded-2xl" />
      <Skeleton className="h-14 rounded-control" />
      <Skeleton className="h-[204px] rounded-2xl" />
    </LoadingRegion>
  );
}
