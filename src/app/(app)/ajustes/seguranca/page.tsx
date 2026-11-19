import type { Metadata } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { GOOGLE_FLAG, socialLinkErrorMessage } from "@/lib/auth/social";
import { auth } from "@/server/auth";
import { enabledSocialProviders } from "@/server/auth-social";
import { getAdminAccess, getSession, requireUser } from "@/server/dal";
import { getFlags } from "@/server/flags";
import { describeDevice } from "./device";
import {
  type PasskeyItem,
  SecurityPanel,
  type SessionItem,
} from "./security-panel";
import type { SocialCardProps } from "./social-card";

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
  const user = await requireUser();
  const requestHeaders = await headers();
  const googleAvailable = enabledSocialProviders().includes("google");
  const [passkeys, sessions, current, params, adminAccess, accounts, flags] =
    await Promise.all([
      auth.api.listPasskeys({ headers: requestHeaders }),
      auth.api.listSessions({ headers: requestHeaders }),
      getSession(),
      searchParams,
      getAdminAccess(),
      googleAvailable
        ? auth.api.listUserAccounts({ headers: requestHeaders })
        : [],
      getFlags(user.id),
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

  const googleLink = accounts.find((item) => item.providerId === "google");
  const canLinkGoogle = flags[GOOGLE_FLAG];
  // Whoever already linked can always unlink, even with the flag off.
  const social: SocialCardProps | null =
    googleAvailable && (canLinkGoogle || googleLink)
      ? {
          email: user.email,
          canLink: canLinkGoogle,
          linked: googleLink
            ? {
                id: googleLink.id,
                createdAt: new Date(googleLink.createdAt).toISOString(),
              }
            : null,
          notice: params.vinculado === "google",
          error: socialLinkErrorMessage(
            typeof params.error === "string" ? params.error : undefined,
            user.email,
          ),
        }
      : null;

  return (
    <SecurityPanel
      social={social}
      passkeys={passkeyItems}
      sessions={sessionItems}
      firstAccess={params.primeiro === "1"}
      accessReset={params.redefinido === "1"}
      passkeyConfirmation={
        adminAccess?.secondFactor === "confirm" ? user.id : null
      }
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
