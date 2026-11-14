import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { RecapFrame } from "./recap-frame";

/** The frame of the Retrospectiva while the month loads. */
export function RecapSkeleton() {
  return (
    <LoadingRegion>
      <RecapFrame kicker="Retrospectiva" closeHref="/inicio">
        <div className="flex flex-1 flex-col items-center justify-center gap-5 py-6">
          <Skeleton className="size-20 rounded-full" />
          <Skeleton className="h-11 w-3/4" />
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </RecapFrame>
    </LoadingRegion>
  );
}
