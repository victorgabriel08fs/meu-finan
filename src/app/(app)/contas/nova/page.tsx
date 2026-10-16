import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountForm } from "@/components/accounts/account-form";
import { accountTypeFromParam } from "@/components/accounts/account-meta";
import { PageHeader } from "@/components/app/page-header";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/server/dal";

export const metadata: Metadata = { title: "Nova conta" };

/** Nova conta (doc 02 §6.7); `?tipo=cartao` (or another type) preselects it. */
export default function NovaContaPage({
  searchParams,
}: PageProps<"/contas/nova">) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Nova conta"
        back={{ href: "/contas", label: "Contas" }}
      />
      <div className="w-full max-w-xl">
        <Suspense fallback={<FormSkeleton />}>
          <NewAccount searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function NewAccount({
  searchParams,
}: {
  searchParams: PageProps<"/contas/nova">["searchParams"];
}) {
  await requireUser();
  const { tipo } = await searchParams;
  return <AccountForm initialType={accountTypeFromParam(tipo)} />;
}

function FormSkeleton() {
  return (
    <LoadingRegion className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-12 rounded-chip" />
        <div className="flex flex-wrap gap-2">
          {["w-38", "w-28", "w-27", "w-34", "w-42", "w-22"].map((width) => (
            <Skeleton key={width} className={`h-11 rounded-full ${width}`} />
          ))}
        </div>
      </div>
      {[0, 1].map((field) => (
        <div key={field} className="flex flex-col gap-2">
          <Skeleton className="h-5 w-24 rounded-chip" />
          <Skeleton className="h-13" />
        </div>
      ))}
      <Skeleton className="h-21 rounded-control" />
      <Skeleton className="h-13" />
    </LoadingRegion>
  );
}
