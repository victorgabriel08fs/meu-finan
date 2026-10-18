import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { newsFeed } from "@/lib/tips";
import { requireUser } from "@/server/dal";
import { getTipsSnapshot } from "@/server/domain/tips";
import { getFlags } from "@/server/flags";
import { type NewsEntry, NewsList } from "./news-list";

export const metadata: Metadata = { title: "Novidades" };

/**
 * Ajustes › Novidades (doc 02 §6.16): what reached the app, newest first,
 * marked "Nova" until seen here. The tips' switch lives in Preferências.
 */
export default function NovidadesPage() {
  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        title="Novidades"
        back={{ href: "/ajustes", label: "Ajustes" }}
      />
      <Suspense fallback={<NewsSkeleton />}>
        <News />
      </Suspense>
    </div>
  );
}

async function News() {
  const user = await requireUser();
  // The same role and flags as the tips in the layout: a novidade about a
  // feature that is off for this person is not listed.
  const snapshot = await getTipsSnapshot(user.id, {
    role: user.role,
    flags: await getFlags(user.id),
  });
  const entries: NewsEntry[] = newsFeed({
    seen: new Set(snapshot.seen),
    createdOn: snapshot.createdOn,
    context: snapshot.context,
  }).map(({ tip, unread }) => ({
    id: tip.id,
    title: tip.title,
    body: tip.body,
    since: tip.since,
    icon: tip.icon ?? "sparkles",
    link: tip.link ?? null,
    unread,
  }));
  return <NewsList entries={entries} />;
}

function NewsSkeleton() {
  return (
    <LoadingRegion className="flex flex-col gap-3">
      <Skeleton className="h-4 w-44 rounded-chip" />
      <Skeleton className="h-128 rounded-2xl" />
    </LoadingRegion>
  );
}
