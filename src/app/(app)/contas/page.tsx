import { Landmark, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  AccountGroupList,
  AccountsSkeleton,
  ArchivedAccounts,
  NetWorthHero,
} from "@/components/accounts/account-list";
import {
  ACCOUNT_GROUPS,
  accountGroupOf,
} from "@/components/accounts/account-meta";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/server/dal";
import { listAccounts } from "@/server/domain/accounts";

export const metadata: Metadata = { title: "Contas" };

/**
 * Contas (doc 02 §6.7): net worth on top, accounts grouped as Disponível ·
 * Investimentos · Cartões de crédito with subtotals, archived ones collapsed.
 */
export default function ContasPage() {
  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        title="Contas"
        back={{ href: "/inicio", label: "Início" }}
        actions={
          <Button asChild variant="tonal" size="sm" className="mr-2">
            <Link href="/contas/nova">
              <Plus aria-hidden="true" />
              Nova conta
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<AccountsSkeleton />}>
        <Accounts />
      </Suspense>
    </div>
  );
}

async function Accounts() {
  const user = await requireUser();
  const accounts = await listAccounts(user.id, { includeArchived: true });
  const active = accounts.filter((account) => !account.archived);
  const archived = accounts.filter((account) => account.archived);

  if (active.length === 0) {
    return (
      <>
        <EmptyState
          icon={<Landmark />}
          title="Nenhuma conta ainda"
          description="Cadastre onde seu dinheiro está: conta corrente, poupança, carteira ou cartão de crédito."
          action={
            <Button asChild size="lg">
              <Link href="/contas/nova">Criar conta</Link>
            </Button>
          }
        />
        {archived.length > 0 ? <ArchivedAccounts accounts={archived} /> : null}
      </>
    );
  }

  return (
    <>
      <NetWorthHero accounts={active} />
      {ACCOUNT_GROUPS.map((group) => {
        const items = active.filter(
          (account) => accountGroupOf(account.type) === group.value,
        );
        return items.length > 0 ? (
          <AccountGroupList
            key={group.value}
            group={group.value}
            accounts={items}
          />
        ) : null;
      })}
      {archived.length > 0 ? <ArchivedAccounts accounts={archived} /> : null}
    </>
  );
}
