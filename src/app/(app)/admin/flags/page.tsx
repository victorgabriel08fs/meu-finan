import type { Metadata } from "next";
import { Suspense } from "react";
import { FlagsManager } from "@/components/admin/flags-manager";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { requireAdmin } from "@/server/dal";
import { listFlagsForAdmin } from "@/server/domain/flag-admin";
import { listUserNames } from "@/server/domain/users";

export const metadata: Metadata = { title: "Flags" };

/** Administração › Flags (doc 02 §6.16); 404 for anyone but an administrator. */
export default function FlagsPage() {
  return (
    <Suspense fallback={<FlagsSkeleton />}>
      <Flags />
    </Suspense>
  );
}

async function Flags() {
  await requireAdmin();
  const [flags, people] = await Promise.all([
    listFlagsForAdmin(),
    listUserNames(),
  ]);
  return (
    <div className="flex flex-col gap-4">
      <FlagsManager flags={flags} people={people} />
    </div>
  );
}

function FlagsSkeleton() {
  return (
    <LoadingRegion className="flex flex-col gap-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-[430px] rounded-card" />
    </LoadingRegion>
  );
}
