import type { Metadata } from "next";
import { Suspense } from "react";
import { FlagsManager } from "@/components/admin/flags-manager";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { requireAdmin } from "@/server/dal";
import { listFlagsForAdmin } from "@/server/domain/flag-admin";
import { listUserNames } from "@/server/domain/users";

export const metadata: Metadata = { title: "Flags" };

/**
 * Administração › Flags (doc 02 §6.17); 404 for anyone but an administrator.
 * The intro is static copy, so it renders with the shell at its real height
 * and the cards stream in below it without a jump.
 */
export default function FlagsPage() {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-callout text-fg-2">
        Ligue ou desligue funcionalidades para todo mundo ou só para algumas
        pessoas. A mudança vale a partir da próxima tela que cada pessoa abrir.
      </p>
      <Suspense fallback={<FlagsSkeleton />}>
        <Flags />
      </Suspense>
    </div>
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
      <Skeleton className="h-[430px] rounded-card" />
    </LoadingRegion>
  );
}
