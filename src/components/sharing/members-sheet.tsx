"use client";

import { LogOut, UserMinus } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { type FormEvent, useId, useState } from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/admin/user-avatar";
import { Money } from "@/components/money/money";
import {
  actionErrorMessage,
  NETWORK_ERROR,
} from "@/components/transactions/action-result";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { SheetContent } from "@/components/ui/sheet";
import { memberStatusLabel } from "@/lib/sharing/labels";
import { MAX_GROUP_MEMBERS } from "@/lib/sharing/limits";
import {
  inviteToGroupAction,
  leaveGroupAction,
  removeMemberAction,
} from "@/server/actions/sharing";
import type { GroupDetail, MemberView } from "@/server/domain/sharing/groups";
import { checkEmails, InviteFields } from "./invite-fields";

/**
 * "Pessoas" of a group (doc 02 §6.18): everyone with their status, "Convidar
 * pessoa", "Tirar do grupo" for the owner and "Sair do grupo", confirmed
 * with what is still open.
 */
export function MembersSheet({
  group,
  todayIso,
  onLeft,
}: {
  group: GroupDetail;
  todayIso: string;
  /** Closes the sheet and leaves for the list. */
  onLeft: () => void;
}) {
  const id = useId();
  const [leaving, setLeaving] = useState(false);
  const [emails, setEmails] = useState<string[]>([""]);
  const [errors, setErrors] = useState<{
    invite?: string;
    invalid?: number[];
    form?: string;
  }>({});
  const invite = useAction(inviteToGroupAction);
  const remove = useAction(removeMemberAction);
  const leave = useAction(leaveGroupAction);
  const owner = group.me.role === "owner";
  // Departed people stay in the history, not in this list.
  const people = group.members.filter(
    (member) =>
      member.status === "active" ||
      member.status === "invited" ||
      member.status === "declined",
  );
  const counted = group.members.filter(
    (member) => member.status === "active" || member.pending,
  ).length;
  const open = group.transfers.reduce(
    (sum, item) => sum + Math.abs(item.amountCents),
    0,
  );

  async function sendInvite(list: string[]) {
    const result = await invite
      .executeAsync({ groupId: group.id, emails: list })
      .catch(() => undefined);
    const message = result ? actionErrorMessage(result) : NETWORK_ERROR;
    if (message) {
      setErrors({ invite: message });
      return false;
    }
    toast(list.length === 1 ? "Convite enviado." : "Convites enviados.");
    return true;
  }

  async function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { list, invalid, message } = checkEmails(emails);
    if (list.length === 0 || message) {
      setErrors({
        invite: message ?? "Confira o e-mail.",
        invalid: message ? invalid : undefined,
      });
      return;
    }
    setErrors({});
    if (await sendInvite(list)) setEmails([""]);
  }

  async function takeOut(member: MemberView) {
    const result = await remove
      .executeAsync({ groupId: group.id, memberId: member.id })
      .catch(() => undefined);
    const message = result ? actionErrorMessage(result) : NETWORK_ERROR;
    if (message) {
      setErrors({ form: message });
      return;
    }
    toast(
      member.status === "invited"
        ? "Convite cancelado."
        : `${member.name} saiu do grupo.`,
    );
  }

  async function confirmLeave() {
    const result = await leave
      .executeAsync({ groupId: group.id })
      .catch(() => undefined);
    const message = result ? actionErrorMessage(result) : NETWORK_ERROR;
    if (message) {
      setErrors({ form: message });
      return;
    }
    onLeft();
    toast(`Você saiu de ${group.name}.`);
  }

  if (leaving) {
    return (
      <SheetContent
        title={`Sair de ${group.name}?`}
        footer={
          <>
            <FieldError id={`${id}-leave-error`}>{errors.form}</FieldError>
            <Button
              variant="destructive"
              size="lg"
              className="w-full"
              loading={leave.isPending}
              onClick={() => void confirmLeave()}
            >
              Sair do grupo
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => setLeaving(false)}
            >
              Cancelar
            </Button>
          </>
        }
      >
        <p className="pb-2 text-body text-fg-2">
          Você deixa de ver as despesas deste grupo.
          {open > 0 ? (
            <>
              {" "}
              Vocês ainda têm{" "}
              <Money
                cents={open}
                variant="headline"
                tone="neutral"
                sign="never"
                className="text-body font-semibold"
              />{" "}
              em aberto: o histórico fica para quem continua.
            </>
          ) : null}
        </p>
      </SheetContent>
    );
  }

  return (
    <SheetContent
      title="Pessoas"
      description={group.name}
      footer={
        <>
          <FieldError id={`${id}-form-error`}>{errors.form}</FieldError>
          <Button
            variant="ghost"
            className="w-full text-danger hover:bg-danger-soft active:bg-danger-soft"
            onClick={() => setLeaving(true)}
          >
            <LogOut aria-hidden="true" />
            Sair do grupo
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6 pb-2">
        <ul className="overflow-hidden rounded-card bg-surface-2/60 [&>li+li]:border-t [&>li+li]:border-border">
          {people.map((member) => {
            const status = memberStatusLabel({
              status: member.status,
              role: member.role,
              isMe: member.isMe,
              deleted: member.deleted,
              todayIso,
              expiresOn: member.expiresOn,
            });
            const expired = member.status === "invited" && !member.pending;
            const canRemove =
              owner &&
              !member.isMe &&
              (member.status === "active" || member.status === "invited");
            return (
              <li
                key={member.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
              >
                <UserAvatar
                  name={member.name}
                  muted={member.status !== "active"}
                />
                <span className="flex min-w-0 flex-[1_1_9rem] flex-col">
                  <span className="truncate text-body font-semibold text-fg">
                    {member.name}
                  </span>
                  {member.status !== "active" || member.isMe ? null : (
                    <span className="truncate text-caption text-fg-3">
                      {member.email}
                    </span>
                  )}
                  <span className="text-caption text-fg-3">{status}</span>
                </span>
                <span className="ml-auto flex shrink-0 flex-wrap gap-1">
                  {(expired || member.status === "declined") &&
                  counted < MAX_GROUP_MEMBERS ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={invite.isPending}
                      onClick={() => void sendInvite([member.email])}
                    >
                      Convidar de novo
                    </Button>
                  ) : null}
                  {canRemove ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-danger hover:bg-danger-soft active:bg-danger-soft"
                      loading={remove.isPending}
                      onClick={() => void takeOut(member)}
                    >
                      <UserMinus aria-hidden="true" />
                      {member.status === "invited"
                        ? "Cancelar convite"
                        : "Tirar do grupo"}
                    </Button>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>

        {counted < MAX_GROUP_MEMBERS ? (
          <form
            noValidate
            onSubmit={submitInvite}
            className="flex flex-col gap-3"
          >
            <InviteFields
              id={`${id}-invite`}
              label="Convidar pessoa"
              emails={emails}
              onChange={(next) => {
                setEmails(next);
                setErrors((current) => ({ ...current, invite: undefined }));
              }}
              max={MAX_GROUP_MEMBERS - counted}
              error={errors.invite}
              invalid={errors.invalid}
            />
            <Button
              type="submit"
              variant="tonal"
              loading={invite.isPending}
              className="self-start"
            >
              Enviar convite
            </Button>
          </form>
        ) : (
          <p className="text-callout text-fg-3">
            O grupo já tem {MAX_GROUP_MEMBERS} pessoas, contando os convites
            pendentes.
          </p>
        )}
      </div>
    </SheetContent>
  );
}
