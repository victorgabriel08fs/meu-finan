"use client";

import { ChevronRight, ShieldCheck, UserPlus, UsersRound } from "lucide-react";
import { SectionHeader } from "@/components/app/section-header";
import { useSheetTarget } from "@/components/planning/form/use-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { relativeDayLabel, shortDateLabel } from "@/lib/format/date";
import {
  deadlineLabel,
  localDayOf,
  pastMomentLabel,
} from "@/lib/format/datetime";
import type { AdminUserItem } from "@/server/domain/users";
import { InviteSheetContent } from "./invite-sheet";
import { plural, STATUS_BADGES } from "./labels";
import { UserAvatar } from "./user-avatar";
import { UserSheetContent } from "./user-sheet";

/**
 * Administração › Usuários (doc 02 §6.17): every account with its role,
 * status, last access and creation date; a tap opens the account over the
 * list. "Convidar pessoa" creates an account and its invite link.
 */
export function UsersManager({
  users,
  now,
}: {
  users: AdminUserItem[];
  /** ISO time of the server render, so labels match on the client. */
  now: string;
}) {
  const nowMs = new Date(now).getTime();
  const today = localDayOf(now);
  const invite = useSheetTarget<true>();
  const detail = useSheetTarget<AdminUserItem>();
  // Fresh after every refresh; the snapshot from the tap keeps the sheet on
  // screen while it closes, even once the account is deleted.
  const selected =
    users.find((user) => user.id === detail.target?.id) ?? detail.target;

  const pending = users.filter((user) => user.status === "invite_pending");
  const onlyYou = users.length === 1 && users[0]?.isSelf;

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-callout text-fg-2">
          {plural(users.length, "conta", "contas")}
          {pending.length > 0
            ? ` · ${plural(pending.length, "convite pendente", "convites pendentes")}`
            : ""}
        </p>
        <Button className="w-full sm:w-auto" onClick={() => invite.show(true)}>
          <UserPlus aria-hidden="true" />
          Convidar pessoa
        </Button>
      </div>

      <section aria-labelledby="admin-contas">
        <SectionHeader id="admin-contas" title="Contas" />
        <ul
          aria-labelledby="admin-contas"
          className="overflow-hidden rounded-2xl bg-surface shadow-card [&>li+li]:border-t [&>li+li]:border-border"
        >
          {users.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              now={nowMs}
              today={today}
              onOpen={() => detail.show(user)}
            />
          ))}
        </ul>
        {onlyYou ? (
          <div className="mt-6 flex flex-col items-center px-6 text-center">
            <span
              aria-hidden="true"
              className="flex size-16 items-center justify-center rounded-full bg-surface-2 text-fg-2 [&_svg]:size-8 [&_svg]:stroke-[1.5]"
            >
              <UsersRound />
            </span>
            <h2 className="mt-4 text-title-3 text-fg">Só você por aqui</h2>
            <p className="mt-2 max-w-sm text-body text-fg-2">
              Convide alguém para ter a própria conta, com as finanças separadas
              das suas.
            </p>
          </div>
        ) : null}
        <p className="mt-3 px-1 text-caption text-fg-3">
          Quem administra cuida das contas, dos convites e das flags, e nunca vê
          as finanças de outra pessoa.
        </p>
      </section>

      <Sheet open={invite.isOpen} onOpenChange={invite.onOpenChange}>
        {invite.target ? (
          <InviteSheetContent key={invite.key} onDone={invite.close} />
        ) : null}
      </Sheet>
      <Sheet open={detail.isOpen} onOpenChange={detail.onOpenChange}>
        {selected ? (
          <UserSheetContent
            key={detail.key}
            user={selected}
            now={nowMs}
            onClose={detail.close}
          />
        ) : null}
      </Sheet>
    </>
  );
}

function UserRow({
  user,
  now,
  today,
  onOpen,
}: {
  user: AdminUserItem;
  now: number;
  today: string;
  onOpen: () => void;
}) {
  const status = STATUS_BADGES[user.status];
  const createdDay = localDayOf(user.createdAt);
  const created = `criada em ${
    createdDay.slice(0, 4) === today.slice(0, 4)
      ? shortDateLabel(createdDay)
      : relativeDayLabel(createdDay, today)
  }`;
  const link = user.openLink;
  const hint =
    user.status === "active"
      ? [
          user.lastActiveAt
            ? `acesso ${pastMomentLabel(user.lastActiveAt, now)}`
            : "sem sessão aberta",
          created,
        ].join(" · ")
      : user.status === "invite_pending" && link
        ? `vale até ${deadlineLabel(link.expiresAt, now)}`
        : user.status === "invite_expired"
          ? link
            ? `expirou ${deadlineLabel(link.expiresAt, now)}`
            : "link invalidado"
          : created;

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-19 w-full items-center gap-3 px-4 py-3 text-left -outline-offset-2 transition-colors duration-100 hover:bg-surface-2/60 active:bg-surface-2"
      >
        <UserAvatar name={user.name} muted={user.banned} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-body font-semibold text-fg">
              {user.name}
            </span>
            {user.isSelf ? (
              <span className="shrink-0 text-caption text-fg-3">(você)</span>
            ) : null}
            {user.role === "admin" ? (
              <Badge tone="transfer" className="shrink-0">
                <ShieldCheck aria-hidden="true" />
                Admin
              </Badge>
            ) : null}
          </span>
          <span className="truncate text-caption text-fg-3">{user.email}</span>
          <span className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <Badge tone={status.tone}>{status.label}</Badge>
            <span className="text-caption text-fg-3">{hint}</span>
          </span>
        </span>
        <span className="sr-only">Abrir</span>
        <ChevronRight
          aria-hidden="true"
          className="size-5 shrink-0 text-fg-3"
        />
      </button>
    </li>
  );
}
