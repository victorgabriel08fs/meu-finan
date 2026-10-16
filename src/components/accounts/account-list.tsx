import { ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { CategoryIcon } from "@/components/finance/category-icon";
import { Money } from "@/components/money/money";
import { Card } from "@/components/ui/card";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { AccountListItem } from "@/server/domain/accounts";
import {
  ACCOUNT_GROUPS,
  type AccountGroup,
  accountGroupOf,
  accountHref,
  accountTypeLabel,
  cardUsage,
} from "./account-meta";

const sum = (accounts: AccountListItem[]) =>
  accounts.reduce((total, account) => total + account.balanceCents, 0);

/**
 * "Patrimônio líquido" (doc 02 §6.7): Σ of the accounts counted in it, cards
 * as liabilities, with a per-group breakdown.
 */
export function NetWorthHero({ accounts }: { accounts: AccountListItem[] }) {
  const counted = accounts.filter(
    (account) => account.includeInNetWorth && !account.archived,
  );
  const groups = ACCOUNT_GROUPS.map((group) => ({
    ...group,
    accounts: counted.filter(
      (account) => accountGroupOf(account.type) === group.value,
    ),
  })).filter((group) => group.accounts.length > 0);

  return (
    <Card className="p-5">
      <h2 className="text-overline uppercase text-fg-3">Patrimônio líquido</h2>
      <Money
        cents={sum(counted)}
        variant="display"
        tone="neutral"
        className="mt-1.5 block"
      />
      <p className="mt-1 text-caption text-fg-3">
        Soma das contas incluídas no patrimônio, com cartões como dívida.
      </p>
      {groups.length > 1 ? (
        <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-border pt-4 sm:grid-cols-3">
          {groups.map((group) => (
            <div key={group.value} className="flex min-w-0 flex-col gap-0.5">
              <dt className="truncate text-caption text-fg-3">{group.label}</dt>
              <dd>
                <Money
                  cents={sum(group.accounts)}
                  variant="callout"
                  tone="neutral"
                  className="font-bold"
                />
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </Card>
  );
}

type AccountGroupListProps = {
  group: AccountGroup;
  accounts: AccountListItem[];
};

/** One group of the Contas screen, with its subtotal. */
export function AccountGroupList({ group, accounts }: AccountGroupListProps) {
  const label =
    ACCOUNT_GROUPS.find((item) => item.value === group)?.label ?? "Contas";
  const id = `grupo-${group}`;
  return (
    <section aria-labelledby={id}>
      <div className="mb-3 flex min-h-6 items-center justify-between gap-3">
        <h2 id={id} className="text-overline uppercase text-fg-3">
          {label}
        </h2>
        <Money
          cents={sum(accounts)}
          variant="caption"
          tone="neutral"
          className="font-semibold text-fg-2"
        />
      </div>
      <AccountRows accounts={accounts} />
    </section>
  );
}

/** Archived accounts, collapsed by default (native <details>). */
export function ArchivedAccounts({
  accounts,
}: {
  accounts: AccountListItem[];
}) {
  return (
    <details className="group">
      <summary className="-mx-2 mb-1 flex h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-control px-2 hover:bg-surface-2/60 [&::-webkit-details-marker]:hidden">
        <h2 className="text-overline uppercase text-fg-3">
          Arquivadas ({accounts.length})
        </h2>
        <ChevronDown
          aria-hidden="true"
          className="size-5 text-fg-3 transition-transform duration-150 group-open:rotate-180"
        />
      </summary>
      <AccountRows accounts={accounts} muted />
    </details>
  );
}

function AccountRows({
  accounts,
  muted = false,
}: {
  accounts: AccountListItem[];
  muted?: boolean;
}) {
  return (
    <ul className="overflow-hidden rounded-card bg-surface shadow-card [&>li+li]:border-t [&>li+li]:border-border">
      {accounts.map((account) => (
        <li key={account.id}>
          <AccountRow account={account} muted={muted} />
        </li>
      ))}
    </ul>
  );
}

function AccountRow({
  account,
  muted,
}: {
  account: AccountListItem;
  muted: boolean;
}) {
  const isCard = account.type === "credit_card";
  const usage = isCard ? cardUsage(account) : null;

  return (
    <Link
      href={accountHref(account)}
      className="flex min-h-16 items-center gap-3 px-4 py-3 -outline-offset-2 transition-colors duration-100 hover:bg-surface-2/60 active:bg-surface-2"
    >
      <CategoryIcon
        icon={account.icon}
        color={account.color}
        shape="square"
        className={cn(muted && "opacity-60")}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={cn(
            "truncate text-headline",
            muted ? "text-fg-2" : "text-fg",
          )}
        >
          {account.name}
        </span>
        <span className="truncate text-caption text-fg-3">
          {usage && account.card ? (
            <>
              Disponível{" "}
              <Money
                cents={usage.availableCents}
                variant="caption"
                tone="neutral"
                className="text-inherit"
              />{" "}
              de{" "}
              <Money
                cents={usage.limitCents}
                variant="caption"
                tone="neutral"
                className="text-inherit"
              />
            </>
          ) : (
            <>
              {accountTypeLabel(account.type)}
              {account.includeInNetWorth ? "" : " · fora do patrimônio"}
            </>
          )}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        <Money
          cents={account.balanceCents}
          variant="headline"
          tone="neutral"
          className={cn(muted && "text-fg-2")}
        />
        {isCard ? (
          <span className="text-micro text-fg-3">
            {account.balanceCents < 0 ? "em aberto" : "sem dívida"}
          </span>
        ) : account.pendingCents !== 0 ? (
          <span className="text-micro text-fg-3">
            <Money
              cents={account.pendingCents}
              variant="caption"
              sign="always"
              tone="neutral"
              className="text-micro text-inherit"
            />{" "}
            agendado
          </span>
        ) : null}
      </span>
      <ChevronRight
        aria-hidden="true"
        className="-mr-1 size-5 shrink-0 text-fg-3"
      />
    </Link>
  );
}

/** Same shapes as the loaded Contas screen. */
export function AccountsSkeleton() {
  return (
    <LoadingRegion
      label="Carregando as contas…"
      className="flex flex-col gap-7"
    >
      <Skeleton className="h-44 rounded-card" />
      {[2, 1].map((rows) => (
        <div key={rows} className="flex flex-col gap-3">
          <Skeleton className="h-4 w-28 rounded-chip" />
          <Skeleton
            className="rounded-card"
            style={{ height: `${rows * 4}rem` }}
          />
        </div>
      ))}
    </LoadingRegion>
  );
}
