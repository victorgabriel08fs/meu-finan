import { Plus } from "lucide-react";
import Link from "next/link";
import { cardUsage } from "@/components/accounts/account-meta";
import { CategoryIcon } from "@/components/finance/category-icon";
import { Money } from "@/components/money/money";
import { cn } from "@/lib/utils";
import type { AccountListItem } from "@/server/domain/accounts";

const cardClass =
  "flex h-28 w-39 flex-col justify-between rounded-card p-3.5 transition-[scale,background-color] duration-100 ease-standard active:scale-97 focus-visible:-outline-offset-2";

/**
 * Accounts carousel of the Início (doc 02 §6.3): 156×112 cards with icon,
 * name and balance, snapping as they scroll; the next card peeks in to hint
 * at the scroll. Credit cards show what is owed and open their invoice. The
 * last card adds an account.
 */
export function AccountsCarousel({
  accounts,
}: {
  accounts: AccountListItem[];
}) {
  return (
    <ul
      aria-label="Suas contas"
      className={cn(
        "relative -mx-gutter flex snap-x snap-mandatory scroll-px-gutter gap-2.5 overflow-x-auto px-gutter py-1",
        "scrollbar-none [&::-webkit-scrollbar]:hidden",
        "md:mx-0 md:scroll-px-0 md:px-0",
      )}
    >
      {accounts.map((account) => {
        const isCard = account.type === "credit_card";
        return (
          <li key={account.id} className="shrink-0 snap-start">
            <Link
              href={isCard ? `/cartoes/${account.id}` : `/contas/${account.id}`}
              className={cn(
                cardClass,
                "bg-surface shadow-card active:bg-surface-2",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <CategoryIcon
                  icon={account.icon}
                  color={account.color}
                  size="sm"
                  shape="square"
                  className="size-8 rounded-chip"
                />
                {isCard ? (
                  <span className="rounded-badge bg-surface-2 px-1.5 py-0.5 text-micro font-bold text-fg-2">
                    Fatura atual
                  </span>
                ) : null}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-caption font-semibold text-fg-2">
                  {account.name}
                </span>
                <Money
                  cents={
                    isCard ? cardUsage(account).owedCents : account.balanceCents
                  }
                  variant="headline"
                  tone="neutral"
                  className="text-[1.0625rem] leading-5.5 font-bold"
                />
              </span>
            </Link>
          </li>
        );
      })}
      <li className="shrink-0 snap-start">
        <Link
          href="/contas/nova"
          className={cn(
            cardClass,
            "border-[1.5px] border-dashed border-border-strong/60 text-primary hover:bg-surface/60 active:bg-surface",
          )}
        >
          <span
            aria-hidden="true"
            className="flex size-8 items-center justify-center rounded-chip bg-primary-soft text-on-primary-soft"
          >
            <Plus className="size-5" />
          </span>
          <span className="text-callout font-bold">Adicionar conta</span>
        </Link>
      </li>
    </ul>
  );
}
