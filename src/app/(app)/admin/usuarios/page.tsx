import type { Metadata } from "next";
import { Suspense } from "react";
import { UsersManager } from "@/components/admin/users-manager";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { requireAdmin } from "@/server/dal";
import { listUsersForAdmin } from "@/server/domain/users";

export const metadata: Metadata = { title: "Usuários" };

/**
 * Administração › Usuários (doc 02 §6.17). The role is checked before any
 * data is read: anyone but an administrator gets the 404 page.
 */
export default function UsuariosPage() {
  return (
    <Suspense fallback={<UsersSkeleton />}>
      <Users />
    </Suspense>
  );
}

async function Users() {
  const admin = await requireAdmin();
  const now = new Date();
  const users = await listUsersForAdmin(admin.id, now);
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
