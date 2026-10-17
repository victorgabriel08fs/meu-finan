import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { UsersManager } from "@/components/admin/users-manager";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { requireAdmin } from "@/server/dal";
import { listUsersForAdmin } from "@/server/domain/users";

export const metadata: Metadata = { title: "Usuários" };

// Blocking route: anyone but an administrator gets a real 404 before
// anything renders (requireAdmin at the top); the list then streams in.
export const instant = false;

export default async function UsuariosPage() {
  await connection();
  const admin = await requireAdmin();
  return (
    <Suspense fallback={<UsersSkeleton />}>
      <Users adminId={admin.id} />
    </Suspense>
  );
}

async function Users({ adminId }: { adminId: string }) {
  const now = new Date();
  const users = await listUsersForAdmin(adminId, now);
  return <UsersManager users={users} now={now.toISOString()} />;
}

function UsersSkeleton() {
  return (
    <LoadingRegion className="flex flex-col gap-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-11 w-full sm:w-44" />
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-[234px] rounded-2xl" />
      </div>
    </LoadingRegion>
  );
}
