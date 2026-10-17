import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { FlagsManager } from "@/components/admin/flags-manager";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { requireAdmin } from "@/server/dal";
import { listFlagsForAdmin } from "@/server/domain/flag-admin";
import { listUserNames } from "@/server/domain/users";

export const metadata: Metadata = { title: "Flags" };

// Blocking route: a real 404 for anyone but an administrator.
export const instant = false;

export default async function FlagsPage() {
  await connection();
  await requireAdmin();
  return (
    <Suspense fallback={<FlagsSkeleton />}>
      <Flags />
    </Suspense>
  );
}

async function Flags() {
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
