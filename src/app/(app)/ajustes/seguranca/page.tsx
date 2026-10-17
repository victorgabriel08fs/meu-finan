import type { Metadata } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { auth } from "@/server/auth";
import { getSession, requireUser } from "@/server/dal";
import { describeDevice } from "./device";
import {
  type PasskeyItem,
  SecurityPanel,
  type SessionItem,
} from "./security-panel";

export const metadata: Metadata = { title: "Segurança" };

export default function SecurityPage({
  searchParams,
}: PageProps<"/ajustes/seguranca">) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Segurança"
        back={{ href: "/ajustes", label: "Ajustes" }}
      />
      <Suspense fallback={<SecuritySkeleton />}>
        <SecurityContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function SecurityContent({
  searchParams,
}: {
  searchParams: PageProps<"/ajustes/seguranca">["searchParams"];
}) {
  await requireUser();
  const requestHeaders = await headers();
  const [passkeys, sessions, current, params] = await Promise.all([
    auth.api.listPasskeys({ headers: requestHeaders }),
    auth.api.listSessions({ headers: requestHeaders }),
    getSession(),
    searchParams,
  ]);

  const passkeyItems: PasskeyItem[] = passkeys.map((item) => ({
    id: item.id,
    name: item.name ?? "Passkey",
    createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
    synced: item.backedUp,
  }));
  const sessionItems: SessionItem[] = sessions
    .map((item) => ({
      token: item.token,
      device: describeDevice(item.userAgent),
      lastActiveAt: new Date(item.updatedAt).toISOString(),
      current: item.token === current?.session.token,
    }))
    .sort((a, b) => Number(b.current) - Number(a.current));

  return (
    <SecurityPanel
      passkeys={passkeyItems}
      sessions={sessionItems}
      firstAccess={params.primeiro === "1"}
      accessReset={params.redefinido === "1"}
    />
  );
}

function SecuritySkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <Skeleton className="h-40 rounded-card" />
      <Skeleton className="h-56 rounded-card" />
      <Skeleton className="h-40 rounded-card" />
    </div>
  );
}
