import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { AdminPasskeyGate } from "@/components/admin/admin-passkey-gate";
import { PageHeader } from "@/components/app/page-header";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { parseAdminReturnPath } from "@/lib/admin/second-factor";
import { getAdminAccess, requireUser } from "@/server/dal";

export const metadata: Metadata = { title: "Confirmar acesso" };

/**
 * Confirmation of Administração (doc 02 §6.17, doc 01 §11.9): an
 * administrator whose session was not opened with a passkey lands here from
 * any /admin page. 404 for anyone but an administrator; a confirmed session
 * goes straight back to `?voltar=` (only a section of Administração).
 */
export default function AdminGatePage({
  searchParams,
}: PageProps<"/ajustes/seguranca/admin">) {
  return (
    <div className="flex max-w-prose flex-col gap-6">
      <PageHeader
        title="Administração"
        back={{ href: "/ajustes", label: "Ajustes" }}
      />
      <Suspense fallback={<GateSkeleton />}>
        <Gate searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Gate({
  searchParams,
}: {
  searchParams: PageProps<"/ajustes/seguranca/admin">["searchParams"];
}) {
  await requireUser();
  const [access, params] = await Promise.all([getAdminAccess(), searchParams]);
  if (!access) notFound();
  const returnTo = parseAdminReturnPath(params.voltar);
  if (access.secondFactor === "ok") redirect(returnTo);
  return (
    <AdminPasskeyGate
      state={access.secondFactor}
      userId={access.user.id}
      returnTo={returnTo}
    />
  );
}

function GateSkeleton() {
  return (
    <LoadingRegion>
      <Skeleton className="h-80 rounded-card" />
    </LoadingRegion>
  );
}
