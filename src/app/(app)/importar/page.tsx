import { Landmark } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { ImportFlow } from "@/components/imports/import-flow";
import { recentImportView } from "@/components/imports/labels";
import type { ImportCategoryOption } from "@/components/imports/types";
import { Button } from "@/components/ui/button";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/server/dal";
import { listAccounts } from "@/server/domain/accounts";
import { listCategories } from "@/server/domain/categories";
import { getUserContext } from "@/server/domain/context";
import { listRecentImports } from "@/server/domain/imports";
import { isFlagEnabled } from "@/server/flags";

export const metadata: Metadata = { title: "Importar extrato" };

/**
 * Importar extrato (doc 02 §6.13), reached from Ajustes › Dados.
 * `?conta=<id>` preselects an account. The title prerenders; the flow streams
 * in once the session is checked.
 */
export default function ImportarPage({ searchParams }: PageProps<"/importar">) {
  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        title="Importar extrato"
        back={{ href: "/ajustes", label: "Ajustes" }}
      />
      <Suspense fallback={<ImportSkeleton />}>
        <ImportScreen searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ImportScreen({
  searchParams,
}: {
  searchParams: PageProps<"/importar">["searchParams"];
}) {
  const user = await requireUser();
  // Behind the importar_extrato flag (doc 01 §11.10); the actions check it too.
  if (!(await isFlagEnabled("importar_extrato", user.id))) notFound();
  const ctx = await getUserContext(user.id);
  const [accounts, categories, recent, params] = await Promise.all([
    listAccounts(user.id),
    listCategories(user.id),
    listRecentImports(ctx),
    searchParams,
  ]);

  if (accounts.length === 0) {
    return (
      <EmptyState
        icon={<Landmark />}
        title="Cadastre uma conta primeiro"
        description="Os lançamentos do extrato entram numa conta ou num cartão de crédito."
        action={
          <Button asChild>
            <Link href="/contas/nova">Adicionar conta</Link>
          </Button>
        }
      />
    );
  }

  // Only an id of the user's own (active) accounts is honoured.
  const requested = typeof params.conta === "string" ? params.conta : null;
  const defaultAccount =
    accounts.find((account) => account.id === requested) ??
    accounts.find((account) => account.type !== "credit_card") ??
    accounts[0];
  const names = new Map(categories.map((category) => [category.id, category]));
  const categoryOptions: ImportCategoryOption[] = categories.map((category) => {
    const parent = category.parentId ? names.get(category.parentId) : null;
    return {
      id: category.id,
      kind: category.kind,
      label: parent ? `${parent.name} › ${category.name}` : category.name,
      icon: category.icon,
      color: category.color,
    };
  });

  return (
    <ImportFlow
      accounts={accounts.map(({ id, name, type, icon, color }) => ({
        id,
        name,
        type,
        icon,
        color,
      }))}
      categories={categoryOptions}
      defaultAccountId={defaultAccount?.id ?? ""}
      today={ctx.todayIso}
      recent={recent.map((item) => recentImportView(item, ctx))}
    />
  );
}

function ImportSkeleton() {
  return (
    <LoadingRegion className="flex max-w-2xl flex-col gap-6">
      <Skeleton className="h-5 w-56" />
      <Skeleton className="h-130 rounded-card" />
    </LoadingRegion>
  );
}
