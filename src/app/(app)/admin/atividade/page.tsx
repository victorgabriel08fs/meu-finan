import { History } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ActivityList } from "@/components/admin/activity-list";
import { EmptyState } from "@/components/app/empty-state";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { requireAdmin } from "@/server/dal";
import { listAuditLog } from "@/server/domain/audit";

export const metadata: Metadata = { title: "Atividade" };

const CURSOR =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Administração › Atividade (doc 02 §6.16); 404 for anyone but an
 * administrator. `?antes=<id>` pages back from that entry (ids are
 * time-ordered).
 */
export default function AtividadePage({
  searchParams,
}: PageProps<"/admin/atividade">) {
  return (
    <Suspense fallback={<ActivitySkeleton />}>
      <Activity searchParams={searchParams} />
    </Suspense>
  );
}

async function Activity({
  searchParams,
}: {
  searchParams: PageProps<"/admin/atividade">["searchParams"];
}) {
  const { id: viewerId } = await requireAdmin();
  const params = await searchParams;
  const before =
    typeof params.antes === "string" && CURSOR.test(params.antes)
      ? params.antes
      : null;
  const { items, nextCursor } = await listAuditLog({ before });

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<History />}
        title="Nenhuma ação ainda"
        description="Convites, mudanças de acesso e de flags aparecem aqui, com quem fez e quando."
      />
    );
  }
  return (
    <ActivityList
      items={items}
      viewerId={viewerId}
      now={new Date().toISOString()}
      nextHref={nextCursor ? `/admin/atividade?antes=${nextCursor}` : null}
      firstPageHref={before ? "/admin/atividade" : null}
    />
  );
}

function ActivitySkeleton() {
  return (
    <LoadingRegion className="flex flex-col gap-2">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-[204px] rounded-2xl" />
      <Skeleton className="mt-2 h-10 w-40" />
      <Skeleton className="h-[136px] rounded-2xl" />
    </LoadingRegion>
  );
}
