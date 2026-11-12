import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SharingOverview } from "@/components/sharing/sharing-overview";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/server/dal";
import { getUserContext } from "@/server/domain/context";
import { listMyGroups } from "@/server/domain/sharing/groups";
import { isFlagEnabled } from "@/server/flags";

export const metadata: Metadata = { title: "Compartilhado" };

/**
 * Compartilhado (doc 02 §6.18, ADR-13): the person's groups and the invites
 * waiting for them. Behind financas_compartilhadas: with the flag off the
 * page does not exist.
 */
export default function CompartilhadoPage() {
  return (
    <div className="flex flex-col gap-7">
      <Suspense fallback={<SharingSkeleton />}>
        <Sharing />
      </Suspense>
    </div>
  );
}

async function Sharing() {
  const user = await requireUser();
  if (!(await isFlagEnabled("financas_compartilhadas", user.id))) notFound();
  const ctx = await getUserContext(user.id);
  const { groups, invites } = await listMyGroups(ctx);
  return <SharingOverview groups={groups} invites={invites} />;
}

/** Header, one invite and two groups (§5.17). */
function SharingSkeleton() {
  return (
    <LoadingRegion className="flex flex-col gap-7">
      <div className="flex flex-col pt-[env(safe-area-inset-top)]">
        <div className="flex h-13 items-center justify-end">
          <Skeleton className="h-9 w-32 rounded-control" />
        </div>
        <Skeleton className="h-8.5 w-48 rounded-chip" />
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-36 rounded-badge" />
        <Skeleton className="h-28 rounded-card" />
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-20 rounded-badge" />
        <Skeleton className="h-45 rounded-2xl" />
      </div>
    </LoadingRegion>
  );
}
