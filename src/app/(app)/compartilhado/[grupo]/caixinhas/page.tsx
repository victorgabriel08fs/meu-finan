import { SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { BoxesView } from "@/components/sharing/boxes-view";
import { Button } from "@/components/ui/button";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { toYearMonth } from "@/lib/finance";
import { requireUser } from "@/server/dal";
import { getUserContext } from "@/server/domain/context";
import { DomainError } from "@/server/domain/errors";
import { listGroupBoxes } from "@/server/domain/sharing/boxes";
import { getGroup } from "@/server/domain/sharing/groups";
import { isFlagEnabled } from "@/server/flags";

export const metadata: Metadata = { title: "Caixinhas" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A group's shared boxes (doc 02 §6.18): one card per box with its ring and
 * projection, and "Nova caixinha". Only for the group's active members
 * (ADR-13); anyone else gets "Grupo não encontrado".
 */
export default function CaixinhasPage({
  params,
}: PageProps<"/compartilhado/[grupo]/caixinhas">) {
  return (
    <div className="flex flex-col gap-4">
      <Suspense fallback={<BoxesSkeleton />}>
        <Boxes params={params} />
      </Suspense>
    </div>
  );
}

async function Boxes({
  params,
}: {
  params: PageProps<"/compartilhado/[grupo]/caixinhas">["params"];
}) {
  const user = await requireUser();
  if (!(await isFlagEnabled("financas_compartilhadas", user.id))) notFound();
  const [{ grupo }, ctx] = await Promise.all([params, getUserContext(user.id)]);
  if (!UUID.test(grupo)) return <Missing />;
  let data: [
    Awaited<ReturnType<typeof getGroup>>,
    Awaited<ReturnType<typeof listGroupBoxes>>,
  ];
  try {
    data = await Promise.all([
      getGroup(ctx, grupo),
      listGroupBoxes(ctx, grupo),
    ]);
  } catch (error) {
    if (error instanceof DomainError) return <Missing />;
    throw error;
  }
  const [group, boxes] = data;
  return (
    <BoxesView
      groupId={group.id}
      groupName={group.name}
      boxes={boxes}
      today={toYearMonth(ctx.today)}
    />
  );
}

function Missing() {
  return (
    <>
      <PageHeader
        title="Caixinhas"
        back={{ href: "/compartilhado", label: "Compartilhado" }}
      />
      <EmptyState
        icon={<SearchX />}
        title="Grupo não encontrado"
        description="Você pode ter saído dele, ou o link está incompleto."
        action={
          <Button asChild variant="tonal">
            <Link href="/compartilhado">Ver Compartilhado</Link>
          </Button>
        }
      />
    </>
  );
}

/** Header, tabs and two box cards (§5.17). */
function BoxesSkeleton() {
  return (
    <LoadingRegion className="flex flex-col gap-4">
      <div className="flex flex-col pt-[env(safe-area-inset-top)]">
        <div className="flex h-13 items-center justify-between">
          <Skeleton className="h-6 w-28 rounded-chip" />
          <Skeleton className="h-9 w-36 rounded-control" />
        </div>
        <Skeleton className="h-8.5 w-40 rounded-chip" />
      </div>
      <Skeleton className="h-10 rounded-xl" />
      <Skeleton className="h-36 rounded-card" />
      <Skeleton className="h-36 rounded-card" />
    </LoadingRegion>
  );
}
