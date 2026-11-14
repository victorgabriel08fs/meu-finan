import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/server/dal";
import { listTagsWithUsage } from "@/server/domain/tags";
import { TagsManager } from "./tags-manager";

export const metadata: Metadata = { title: "Etiquetas" };

export default function EtiquetasPage() {
  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        title="Etiquetas"
        back={{ href: "/ajustes", label: "Ajustes" }}
      />
      <Suspense fallback={<TagsSkeleton />}>
        <Tags />
      </Suspense>
    </div>
  );
}

async function Tags() {
  const user = await requireUser();
  const tags = await listTagsWithUsage(user.id);
  return <TagsManager tags={tags} />;
}

function TagsSkeleton() {
  return (
    <LoadingRegion className="flex flex-col gap-7">
      <Skeleton className="h-11 rounded-2xl" />
      <Skeleton className="h-75 rounded-2xl" />
    </LoadingRegion>
  );
}
