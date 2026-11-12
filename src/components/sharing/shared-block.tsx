import { ChevronRight, UserPlus } from "lucide-react";
import Link from "next/link";
import { BlockLink } from "@/components/dashboard/block-link";
import { Card } from "@/components/ui/card";
import type { GroupSummary, InviteForMe } from "@/server/domain/sharing/groups";
import { BalanceText } from "./balance-text";

/** Groups shown in the block; the rest are a tap away in "Ver tudo". */
export const SHARED_BLOCK_GROUPS = 3;

/**
 * The "Compartilhado" block of the Início (doc 02 §6.3, §6.18): up to three
 * groups with the sentence of the balance, an open invite and "Ver tudo".
 */
export function SharedBlock({
  groups,
  invites,
}: {
  groups: readonly GroupSummary[];
  invites: readonly InviteForMe[];
}) {
  const [invite] = invites;
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <h2 className="text-headline text-fg">Compartilhado</h2>
        <BlockLink href="/compartilhado">Ver tudo</BlockLink>
      </div>
      {invite ? (
        <Link
          href="/compartilhado"
          className="-mx-2 flex items-center gap-3 rounded-control bg-primary-soft/60 px-2 py-2 transition-colors duration-100 hover:bg-primary-soft"
        >
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-on-primary-soft [&_svg]:size-5"
          >
            <UserPlus />
          </span>
          <span className="min-w-0 flex-1 text-callout text-fg">
            {invites.length === 1
              ? `${invite.inviterName} convidou você para o grupo ${invite.groupName}.`
              : `${invites.length} convites para você.`}
          </span>
          <ChevronRight
            aria-hidden="true"
            className="size-5 shrink-0 text-fg-3"
          />
        </Link>
      ) : null}
      {groups.length > 0 ? (
        <ul className="-mx-2 flex flex-col">
          {groups.slice(0, SHARED_BLOCK_GROUPS).map((group) => (
            <li key={group.id}>
              <Link
                href={`/compartilhado/${group.id}`}
                className="flex min-h-13 items-center gap-3 rounded-control px-2 py-2 transition-colors duration-100 hover:bg-surface-2/60 active:bg-surface-2"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-body font-semibold text-fg">
                    {group.name}
                  </span>
                  <BalanceText transfers={group.transfers} />
                </span>
                <ChevronRight
                  aria-hidden="true"
                  className="size-5 shrink-0 text-fg-3"
                />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
