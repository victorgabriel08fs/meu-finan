import { SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { BoxDetailView } from "@/components/sharing/box-detail";
import { Button } from "@/components/ui/button";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { toYearMonth } from "@/lib/finance";
import { requireUser } from "@/server/dal";
import { listAccounts } from "@/server/domain/accounts";
import { getUserContext } from "@/server/domain/context";
import { DomainError } from "@/server/domain/errors";
import { getBox } from "@/server/domain/sharing/boxes";
import { isFlagEnabled } from "@/server/flags";

export const metadata: Metadata = { title: "Caixinha" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A shared box (doc 02 §6.18). The box comes from the group (members only,
 * ADR-13); the accounts offered for "Lançar no meu extrato" are the viewer's
 * own, read with their own id.
 */
export default function CaixinhaPage({
  params,
}: PageProps<"/compartilhado/[grupo]/caixinhas/[caixinha]">) {
  return (
    <div className="flex flex-col gap-4">
      <Suspense fallback={<BoxSkeleton />}>
        <Box params={params} />
      </Suspense>
    </div>
  );
}

async function Box({
  params,
}: {
  params: PageProps<"/compartilhado/[grupo]/caixinhas/[caixinha]">["params"];
}) {
  const user = await requireUser();
  if (!(await isFlagEnabled("financas_compartilhadas", user.id))) notFound();
  const [{ grupo, caixinha }, ctx] = await Promise.all([
    params,
    getUserContext(user.id),
  ]);
  if (!UUID.test(grupo) || !UUID.test(caixinha)) return <Missing />;
  let box: Awaited<ReturnType<typeof getBox>>;
  try {
    box = await getBox(ctx, caixinha);
  } catch (error) {
    if (error instanceof DomainError) return <Missing />;
    throw error;
  }
  // The link carries the group: a box of another group reads as missing.
  if (box.groupId !== grupo) return <Missing />;
  const accounts = await listAccounts(user.id);
  return (
    <BoxDetailView
      box={box}
      accounts={accounts
        .filter(
          (account) => account.type !== "credit_card" && !account.archived,
        )
        .map((account) => ({
          id: account.id,
          name: account.name,
          isBox: account.type === "savings_box",
          balanceCents: account.balanceCents,
        }))}
      todayIso={ctx.todayIso}
      today={toYearMonth(ctx.today)}
    />
  );
}

function Missing() {
  return (
    <>
      <PageHeader
        title="Caixinha"
        back={{ href: "/compartilhado", label: "Compartilhado" }}
      />
      <EmptyState
        icon={<SearchX />}
        title="Caixinha não encontrada"
        description="Você pode ter saído do grupo, ou o link está incompleto."
        action={
          <Button asChild variant="tonal">
            <Link href="/compartilhado">Ver Compartilhado</Link>
          </Button>
        }
      />
    </>
  );
}

/** Header, the ring card, the people and the history (§5.17). */
function BoxSkeleton() {
  return (
    <LoadingRegion className="flex flex-col gap-4">
      <div className="flex flex-col pt-[env(safe-area-inset-top)]">
        <div className="flex h-13 items-center justify-between">
          <Skeleton className="h-6 w-28 rounded-chip" />
          <Skeleton className="size-11 rounded-full" />
        </div>
        <Skeleton className="h-8.5 w-48 rounded-chip" />
      </div>
      <Skeleton className="h-80 rounded-card" />
      <Skeleton className="h-4 w-28 rounded-badge" />
      <Skeleton className="h-32 rounded-card" />
      <Skeleton className="h-4 w-24 rounded-badge" />
      <Skeleton className="h-40 rounded-card" />
    </LoadingRegion>
  );
}
