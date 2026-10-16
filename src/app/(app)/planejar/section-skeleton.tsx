import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";

/** Fallback while a Planejar section checks the session and loads. */
export function SectionSkeleton() {
  return (
    <LoadingRegion className="flex flex-col gap-3">
      <Skeleton className="h-80 rounded-card" />
    </LoadingRegion>
  );
}
