import { SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { MonthSwitcher, shiftMonth } from "@/components/app/month-switcher";
import { PageHeader } from "@/components/app/page-header";
import { GroupView } from "@/components/sharing/group-view";
import { Button } from "@/components/ui/button";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { monthNameLabel } from "@/lib/format/date";
import { requireUser } from "@/server/dal";
import { listCategories } from "@/server/domain/categories";
import { getUserContext, resolvePeriod } from "@/server/domain/context";
import { DomainError } from "@/server/domain/errors";
import {
  groupMonthSummary,
  listGroupActivity,
} from "@/server/domain/sharing/expenses";
import { getGroup } from "@/server/domain/sharing/groups";
import { isFlagEnabled } from "@/server/flags";

export const metadata: Metadata = { title: "Grupo" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A group (doc 02 §6.18): the balance with "Marcar como acertado", the month
 * (`?mes=`) with what each one paid and owes, and the expenses and
 * settlements by day. Only for its active members (ADR-13); anyone else gets
 * the same "Grupo não encontrado" as a link that leads nowhere.
 */
export default function GrupoPage({
  params,
  searchParams,
}: PageProps<"/compartilhado/[grupo]">) {
  return (
    <div className="flex flex-col gap-4">
      <Suspense fallback={<GroupSkeleton />}>
        <Group params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Group({
  params,
  searchParams,
}: {
  params: PageProps<"/compartilhado/[grupo]">["params"];
  searchParams: PageProps<"/compartilhado/[grupo]">["searchParams"];
}) {
  const user = await requireUser();
  if (!(await isFlagEnabled("financas_compartilhadas", user.id))) notFound();
  const [{ grupo }, query, ctx] = await Promise.all([
    params,
    searchParams,
    getUserContext(user.id),
  ]);
  if (!UUID.test(grupo)) return <Missing />;
  const range = resolvePeriod(
    ctx,
    typeof query.mes === "string" ? query.mes : null,
  );
  const current = resolvePeriod(ctx, null);
  const previous = resolvePeriod(ctx, shiftMonth(current.month, -1));

  let group: Awaited<ReturnType<typeof getGroup>>;
  try {
    group = await getGroup(ctx, grupo);
  } catch (error) {
    if (error instanceof DomainError) return <Missing />;
    throw error;
  }
  const [activity, categories] = await Promise.all([
    listGroupActivity(ctx, grupo, range),
    listCategories(user.id, "expense"),
  ]);
  const summary = groupMonthSummary(
    activity,
    group.members.map((member) => member.id),
  );
  const hrefFor = (month: string) =>
    month === current.month
      ? `/compartilhado/${grupo}`
      : `/compartilhado/${grupo}?mes=${month}`;

  return (
    <GroupView
      group={group}
      activity={activity}
      summary={summary}
      monthName={monthNameLabel(range.month)}
      todayIso={ctx.todayIso}
      periods={{
        current: { start: current.start, end: current.end },
        previous: { start: previous.start, end: previous.end },
      }}
      categories={categories.map((category) => ({
        id: category.id,
        name: category.name,
        parentId: category.parentId,
      }))}
      monthSwitcher={
        <MonthSwitcher
          month={range.month}
          currentMonth={current.month}
          hrefFor={hrefFor}
        />
      }
    />
  );
}

function Missing() {
  return (
    <>
      <PageHeader
        title="Grupo"
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

/** Header, balance, month and a day of expenses (§5.17). */
function GroupSkeleton() {
  return (
    <LoadingRegion className="flex flex-col gap-4">
      <div className="flex flex-col pt-[env(safe-area-inset-top)]">
        <div className="flex h-13 items-center justify-between">
          <Skeleton className="h-6 w-28 rounded-chip" />
          <div className="flex gap-2">
            <Skeleton className="size-11 rounded-full" />
            <Skeleton className="h-9 w-40 rounded-control" />
          </div>
        </div>
        <Skeleton className="h-8.5 w-40 rounded-chip" />
      </div>
      <Skeleton className="h-32 rounded-card" />
      <Skeleton className="mx-auto h-11 w-64 rounded-full" />
      <Skeleton className="h-36 rounded-card" />
      <Skeleton className="h-4 w-36 rounded-badge" />
      <Skeleton className="h-40 rounded-card" />
    </LoadingRegion>
  );
}
