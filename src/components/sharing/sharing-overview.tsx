"use client";

import { ChevronRight, Plus, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { type FormEvent, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { SectionHeader } from "@/components/app/section-header";
import {
  actionErrorMessage,
  NETWORK_ERROR,
} from "@/components/transactions/action-result";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { afterSheetsClose } from "@/components/ui/use-back-to-close";
import { membersLine } from "@/lib/sharing/labels";
import { GROUP_NAME_MAX, MAX_GROUP_MEMBERS } from "@/lib/sharing/limits";
import {
  createGroupAction,
  respondToInviteAction,
} from "@/server/actions/sharing";
import type { GroupSummary, InviteForMe } from "@/server/domain/sharing/groups";
import { AvatarStack, BalanceText } from "./balance-text";
import { checkEmails, InviteFields } from "./invite-fields";

/**
 * Compartilhado (doc 02 §6.18): the invites waiting for the person, their
 * groups with what each one owes, and "Novo grupo".
 */
export function SharingOverview({
  groups,
  invites,
}: {
  groups: GroupSummary[];
  invites: InviteForMe[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [goTo, setGoTo] = useState<string | null>(null);
  // The sheet gives its history entry back while it unmounts, in this same
  // commit's cleanup; only then can the push stick.
  useEffect(() => {
    if (goTo && !creating) afterSheetsClose(() => router.push(goTo));
  }, [goTo, creating, router]);
  // A fresh form on every opening; the old one stays while the sheet leaves.
  const [sheetKey, setSheetKey] = useState(0);
  const create = () => {
    setSheetKey((key) => key + 1);
    setCreating(true);
  };
  const newGroup = (
    <Button variant="tonal" size="sm" onClick={create}>
      <Plus aria-hidden="true" />
      Novo grupo
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Compartilhado"
        actions={groups.length > 0 ? newGroup : undefined}
      />

      {invites.length > 0 ? (
        <section aria-labelledby="compartilhado-convites">
          <SectionHeader
            id="compartilhado-convites"
            title="Convites para você"
          />
          <ul className="flex flex-col gap-3">
            {invites.map((invite) => (
              <li key={invite.memberId}>
                <InviteCard invite={invite} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {groups.length > 0 ? (
        <section aria-labelledby="compartilhado-grupos">
          <SectionHeader id="compartilhado-grupos" title="Grupos" />
          <ul className="@container overflow-hidden rounded-2xl bg-surface shadow-card [&>li+li]:border-t [&>li+li]:border-border">
            {groups.map((group) => (
              <li key={group.id}>
                <GroupLink group={group} />
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <EmptyState
          icon={<Users />}
          title="Divida despesas com quem mora com você"
          description="Crie um grupo, convide a pessoa pelo e-mail e escolham como dividir."
          action={
            <Button onClick={create}>
              <Plus aria-hidden="true" />
              Criar grupo
            </Button>
          }
        />
      )}

      <Sheet open={creating} onOpenChange={setCreating}>
        <NewGroupSheet
          key={sheetKey}
          onDone={(groupId) => {
            setGoTo(`/compartilhado/${groupId}`);
            setCreating(false);
          }}
        />
      </Sheet>
    </>
  );
}

function GroupLink({ group }: { group: GroupSummary }) {
  const names = ["Você", ...group.others.map((other) => other.name)];
  return (
    <Link
      href={`/compartilhado/${group.id}`}
      className="flex min-h-18 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 -outline-offset-2 transition-colors duration-100 hover:bg-surface-2/60 active:bg-surface-2"
    >
      <AvatarStack names={names} />
      <span className="flex min-w-0 flex-[1_1_10rem] flex-col">
        <span className="truncate text-headline text-fg">{group.name}</span>
        <span className="truncate text-caption text-fg-3">
          {membersLine(group.others.map((other) => other.name))}
          {group.pendingInvites > 0
            ? ` · ${group.pendingInvites} ${group.pendingInvites === 1 ? "convite" : "convites"}`
            : ""}
        </span>
        <BalanceText transfers={group.transfers} className="mt-0.5" />
      </span>
      <ChevronRight
        aria-hidden="true"
        className="ml-auto size-5 shrink-0 text-fg-3"
      />
    </Link>
  );
}

/** An invite for the person: who, from which group, Aceitar or Recusar. */
export function InviteCard({ invite }: { invite: InviteForMe }) {
  const router = useRouter();
  const { executeAsync } = useAction(respondToInviteAction);
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);

  async function answer(choice: "accept" | "decline") {
    setBusy(choice);
    try {
      const result = await executeAsync({
        memberId: invite.memberId,
        answer: choice,
      });
      const error = actionErrorMessage(result);
      if (error) {
        toast.error(error);
        return;
      }
      if (choice === "accept" && result?.data) {
        toast(`Você entrou no grupo ${result.data.groupName}.`);
        router.push(`/compartilhado/${result.data.groupId}`);
      } else {
        toast("Convite recusado.");
      }
    } catch {
      toast.error(NETWORK_ERROR);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <p className="text-body text-fg">
        <strong className="font-semibold">{invite.inviterName}</strong>
        {invite.inviterEmail ? (
          <span className="wrap-anywhere text-fg-2">
            {" "}
            ({invite.inviterEmail})
          </span>
        ) : null}{" "}
        convidou você para o grupo{" "}
        <strong className="font-semibold">{invite.groupName}</strong>.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          loading={busy === "accept"}
          disabled={busy !== null}
          onClick={() => void answer("accept")}
        >
          Aceitar
        </Button>
        <Button
          variant="ghost"
          loading={busy === "decline"}
          disabled={busy !== null}
          onClick={() => void answer("decline")}
        >
          Recusar
        </Button>
      </div>
    </Card>
  );
}

function NewGroupSheet({ onDone }: { onDone: (groupId: string) => void }) {
  const id = useId();
  const [groupId] = useState(() => uuidv7());
  const [name, setName] = useState("");
  const [emails, setEmails] = useState<string[]>([""]);
  const [errors, setErrors] = useState<{
    name?: string;
    emails?: string;
    invalid?: number[];
    form?: string;
  }>({});
  const { executeAsync, isPending } = useAction(createGroupAction);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { list, invalid, message } = checkEmails(emails);
    const found = {
      name: name.trim() ? undefined : "Dê um nome ao grupo.",
      emails: message,
      invalid,
    };
    setErrors(found);
    if (found.name || found.emails) return;
    const result = await executeAsync({
      id: groupId,
      name: name.trim(),
      emails: list,
    }).catch(() => undefined);
    if (result?.data) {
      onDone(result.data.groupId);
      toast(
        list.length > 0 ? "Grupo criado. Convite enviado." : "Grupo criado.",
      );
      return;
    }
    setErrors({
      form: result ? (actionErrorMessage(result) ?? undefined) : NETWORK_ERROR,
    });
  }

  return (
    <SheetContent
      title="Novo grupo"
      footer={
        <>
          <FieldError id={`${id}-form-error`}>{errors.form}</FieldError>
          <Button
            type="submit"
            form={`${id}-form`}
            size="lg"
            className="w-full"
            loading={isPending}
          >
            Criar grupo
          </Button>
        </>
      }
    >
      <form
        id={`${id}-form`}
        noValidate
        onSubmit={submit}
        className="flex flex-col gap-6 pb-2"
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-name`}>Nome do grupo</Label>
          <Input
            id={`${id}-name`}
            value={name}
            maxLength={GROUP_NAME_MAX}
            placeholder="Casa, Viagem…"
            onChange={(event) => setName(event.target.value)}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? `${id}-name-error` : undefined}
          />
          <FieldError id={`${id}-name-error`}>{errors.name}</FieldError>
        </div>
        <InviteFields
          id={id}
          emails={emails}
          onChange={(next) => {
            setEmails(next);
            setErrors((current) => ({ ...current, emails: undefined }));
          }}
          max={MAX_GROUP_MEMBERS - 1}
          error={errors.emails}
          invalid={errors.invalid}
        />
      </form>
    </SheetContent>
  );
}
