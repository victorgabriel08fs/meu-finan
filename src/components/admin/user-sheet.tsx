"use client";

import {
  KeyRound,
  Link2,
  LoaderCircle,
  LogOut,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserCheck,
  UserX,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, useId, useState } from "react";
import { toast } from "sonner";
import { describeDevice } from "@/app/(app)/ajustes/seguranca/device";
import {
  type ActionResultLike,
  actionErrorMessage,
  NETWORK_ERROR,
} from "@/components/transactions/action-result";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SheetContent } from "@/components/ui/sheet";
import { toastWithUndo } from "@/components/ui/toast";
import { OWNER_DELETE_MESSAGE, OWNER_LINK_MESSAGE } from "@/lib/admin/guards";
import { fullDateLabel } from "@/lib/format/date";
import {
  deadlineLabel,
  localDayOf,
  pastMomentLabel,
} from "@/lib/format/datetime";
import { cn } from "@/lib/utils";
import {
  createAccessLinkAction,
  deleteUserAction,
  revokeAccessLinkAction,
  revokeUserSessionsAction,
  setUserBannedAction,
  setUserRoleAction,
} from "@/server/actions/admin";
import type { AdminUserItem } from "@/server/domain/users";
import { plural, ROLE_LABELS, STATUS_BADGES } from "./labels";
import { type IssuedLink, LinkSheetContent } from "./link-sheet";
import { UserAvatar } from "./user-avatar";

type View =
  | { name: "details" }
  | { name: "delete" }
  | { name: "link"; link: IssuedLink };

/**
 * One account in Administração › Usuários (doc 02 §6.17): what the panel
 * knows about it (never its money) and what an administrator can do. Opens
 * over the list; reversible actions run at once with "Desfazer", deleting
 * asks for the e-mail. The server applies the same rules again.
 */
export function UserSheetContent({
  user,
  now,
  onClose,
}: {
  user: AdminUserItem;
  /** Server time of the list, for "há 2 h". */
  now: number;
  onClose: () => void;
}) {
  const [view, setView] = useState<View>({ name: "details" });
  if (view.name === "link") {
    return (
      <LinkSheetContent link={view.link} name={user.name} onDone={onClose} />
    );
  }
  if (view.name === "delete") {
    return (
      <DeleteContent
        user={user}
        onCancel={() => setView({ name: "details" })}
        onDeleted={onClose}
      />
    );
  }
  return (
    <DetailsContent
      user={user}
      now={now}
      onLink={(link) => setView({ name: "link", link })}
      onDelete={() => setView({ name: "delete" })}
    />
  );
}

type Busy = "link" | "revoke-link" | "sessions" | "role" | "ban" | null;

function firstNameOf(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

function DetailsContent({
  user,
  now,
  onLink,
  onDelete,
}: {
  user: AdminUserItem;
  now: number;
  onLink: (link: IssuedLink) => void;
  onDelete: () => void;
}) {
  const [busy, setBusy] = useState<Busy>(null);
  const firstName = firstNameOf(user.name);
  const status = STATUS_BADGES[user.status];
  const isInvite =
    user.status === "invite_pending" || user.status === "invite_expired";

  async function run<T extends ActionResultLike>(
    key: Exclude<Busy, null>,
    call: () => Promise<T>,
    onDone: (result: T) => void,
  ) {
    setBusy(key);
    try {
      const result = await call();
      const error = actionErrorMessage(result);
      if (error) toast.error(error);
      else onDone(result);
    } catch {
      toast.error(NETWORK_ERROR);
    } finally {
      setBusy(null);
    }
  }

  const undo = (call: () => Promise<ActionResultLike>) => () => {
    void call()
      .then((result) => {
        const error = actionErrorMessage(result);
        if (error) toast.error(error);
      })
      .catch(() => toast.error(NETWORK_ERROR));
  };

  const makeLink = () =>
    run(
      "link",
      () => createAccessLinkAction({ userId: user.id }),
      (result) => {
        if (result?.data) onLink(result.data);
      },
    );
  const revokeLink = () =>
    run(
      "revoke-link",
      () => revokeAccessLinkAction({ userId: user.id }),
      () => toast("Link invalidado. Ele não funciona mais."),
    );
  const endSessions = () =>
    run(
      "sessions",
      () => revokeUserSessionsAction({ userId: user.id }),
      (result) => {
        const count = result?.data?.sessions ?? 0;
        toast(
          count === 0
            ? `${firstName} não tinha sessões abertas.`
            : `${plural(count, "sessão encerrada", "sessões encerradas")}: ${firstName} precisa entrar de novo.`,
        );
      },
    );
  const toggleRole = () => {
    const role = user.role === "admin" ? "user" : "admin";
    return run(
      "role",
      () => setUserRoleAction({ userId: user.id, role }),
      () =>
        toastWithUndo(
          role === "admin"
            ? `${firstName} agora tem acesso de administrador.`
            : `${firstName} não tem mais acesso de administrador.`,
          undo(() => setUserRoleAction({ userId: user.id, role: user.role })),
        ),
    );
  };
  const toggleBan = () => {
    const banned = !user.banned;
    return run(
      "ban",
      () => setUserBannedAction({ userId: user.id, banned }),
      () =>
        toastWithUndo(
          banned
            ? `Acesso de ${firstName} desativado, em todos os aparelhos.`
            : `Acesso de ${firstName} reativado.`,
          undo(() =>
            setUserBannedAction({ userId: user.id, banned: user.banned }),
          ),
        ),
    );
  };

  const lastSeen = user.lastActiveAt
    ? [
        pastMomentLabel(user.lastActiveAt, now),
        user.lastUserAgent ? describeDevice(user.lastUserAgent) : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "Nenhuma sessão aberta";
  const access = [
    user.hasPassword ? "Senha" : null,
    user.passkeys > 0 ? plural(user.passkeys, "passkey", "passkeys") : null,
  ].filter(Boolean);
  const link = user.openLink;
  const linkExpired = link ? new Date(link.expiresAt).getTime() <= now : false;

  return (
    <SheetContent title={user.name} description={user.email}>
      {/* A plain block inside the scrolling body: as flex items of the body
          itself, the cards would shrink and clip instead of scrolling. */}
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <UserAvatar name={user.name} size="lg" muted={user.banned} />
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <Badge tone={status.tone}>{status.label}</Badge>
            <Badge tone={user.role === "admin" ? "transfer" : "neutral"}>
              {user.role === "admin" ? (
                <ShieldCheck aria-hidden="true" />
              ) : null}
              {ROLE_LABELS[user.role]}
            </Badge>
            {user.isSelf ? <Badge>Você</Badge> : null}
          </div>
        </div>

        <dl className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
          <Detail term="Conta criada">
            {fullDateLabel(localDayOf(user.createdAt))}
          </Detail>
          <Detail term="Último acesso">{lastSeen}</Detail>
          <Detail term="Sessões abertas">
            {user.sessions === 0 ? "Nenhuma" : user.sessions}
          </Detail>
          <Detail term="Entra com">
            {access.length > 0 ? access.join(" e ") : "Ainda não criou a senha"}
          </Detail>
          {link ? (
            <Detail
              term={
                link.purpose === "invite" ? "Convite" : "Link de redefinição"
              }
              action={
                linkExpired || user.isSelf ? null : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-mr-2 text-danger hover:bg-danger-soft/60 active:bg-danger-soft"
                    loading={busy === "revoke-link"}
                    disabled={busy !== null}
                    onClick={revokeLink}
                  >
                    Invalidar
                  </Button>
                )
              }
            >
              {linkExpired
                ? `Expirou ${deadlineLabel(link.expiresAt, now)}`
                : `Vale até ${deadlineLabel(link.expiresAt, now)}`}
            </Detail>
          ) : null}
        </dl>

        {user.isSelf ? (
          <section className="flex flex-col gap-3 pb-2">
            <p className="rounded-control bg-surface-2 px-4 py-3 text-callout text-fg-2">
              Esta é a sua conta. Para mudar a senha, as passkeys ou encerrar as
              suas sessões, use Ajustes › Segurança.
            </p>
            <Button asChild variant="tonal" size="lg" className="w-full">
              <Link href="/ajustes/seguranca">Abrir Segurança</Link>
            </Button>
          </section>
        ) : (
          <>
            <section
              aria-labelledby="user-actions"
              className="flex flex-col gap-3"
            >
              <h3
                id="user-actions"
                className="text-overline text-fg-3 uppercase"
              >
                Ações
              </h3>
              <ul className="overflow-hidden rounded-2xl border border-border [&>li+li]:border-t [&>li+li]:border-border">
                <ActionRow
                  icon={<Link2 />}
                  label={
                    isInvite
                      ? "Gerar novo convite"
                      : "Gerar link de redefinição"
                  }
                  description={
                    user.isOwner
                      ? OWNER_LINK_MESSAGE
                      : user.banned
                        ? "Reative a conta antes de gerar um link."
                        : link && !linkExpired
                          ? "O link atual deixa de funcionar na hora."
                          : isInvite
                            ? "Para a pessoa criar a senha. Vale por 72 horas."
                            : "Para quem perdeu o acesso: senha nova e sessões encerradas."
                  }
                  busy={busy === "link"}
                  disabled={busy !== null || user.isOwner || user.banned}
                  onClick={makeLink}
                />
                {user.sessions > 0 ? (
                  <ActionRow
                    icon={<LogOut />}
                    label="Encerrar sessões"
                    description={`${plural(user.sessions, "sessão aberta", "sessões abertas")}. A pessoa precisa entrar de novo.`}
                    busy={busy === "sessions"}
                    disabled={busy !== null}
                    onClick={endSessions}
                  />
                ) : null}
                <ActionRow
                  icon={user.role === "admin" ? <ShieldOff /> : <ShieldCheck />}
                  label={
                    user.role === "admin"
                      ? "Remover administrador"
                      : "Tornar administrador"
                  }
                  description={
                    user.role === "admin"
                      ? "Volta a ser usuário: só as próprias finanças."
                      : user.banned
                        ? "Reative a conta antes de mudar o papel."
                        : "Poderá convidar pessoas e gerenciar contas e flags."
                  }
                  busy={busy === "role"}
                  disabled={
                    busy !== null || (user.banned && user.role !== "admin")
                  }
                  onClick={toggleRole}
                />
                <ActionRow
                  icon={user.banned ? <UserCheck /> : <UserX />}
                  label={user.banned ? "Reativar acesso" : "Desativar acesso"}
                  description={
                    user.banned
                      ? "Volta a entrar com a mesma senha e passkeys."
                      : "Encerra as sessões e impede o login. Os dados ficam guardados."
                  }
                  busy={busy === "ban"}
                  disabled={busy !== null}
                  onClick={toggleBan}
                />
              </ul>
            </section>

            <section
              aria-labelledby="user-danger"
              className="flex flex-col gap-3 pb-2"
            >
              <h3
                id="user-danger"
                className="text-overline text-fg-3 uppercase"
              >
                Zona de perigo
              </h3>
              <ul className="overflow-hidden rounded-2xl border border-border">
                <ActionRow
                  icon={<Trash2 />}
                  label="Excluir conta"
                  description={
                    user.isOwner
                      ? OWNER_DELETE_MESSAGE
                      : "Apaga a conta e todas as finanças dela. Não dá para desfazer."
                  }
                  danger
                  disabled={busy !== null || user.isOwner}
                  onClick={onDelete}
                />
              </ul>
            </section>
          </>
        )}
      </div>
    </SheetContent>
  );
}

function Detail({
  term,
  children,
  action,
}: {
  term: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-13 items-center gap-3 px-4 py-2.5">
      <dt className="w-32 shrink-0 text-callout text-fg-2">{term}</dt>
      <dd className="min-w-0 flex-1 text-callout font-semibold text-fg">
        {children}
      </dd>
      {action}
    </div>
  );
}

function ActionRow({
  icon,
  label,
  description,
  onClick,
  busy = false,
  disabled = false,
  danger = false,
}: {
  icon: ReactNode;
  label: string;
  description: string;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  danger?: boolean;
}) {
  // Only the icon and the title dim: the description is the reason a
  // disabled row gives (doc 02 §6.17), so it stays readable.
  const dimmed = disabled && !busy;
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-busy={busy || undefined}
        className={cn(
          "flex min-h-16 w-full items-center gap-3 px-4 py-2.5 text-left -outline-offset-2",
          "transition-colors duration-100 hover:bg-surface-2/60 active:bg-surface-2",
          "disabled:cursor-not-allowed disabled:hover:bg-transparent",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full [&_svg]:size-5",
            danger ? "bg-danger-soft text-danger" : "bg-surface-2 text-fg-2",
            dimmed && "opacity-50",
          )}
        >
          {busy ? <LoaderCircle className="animate-spin" /> : icon}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span
            className={cn(
              "text-body font-semibold",
              danger ? "text-danger" : "text-fg",
              dimmed && "opacity-50",
            )}
          >
            {label}
          </span>
          <span className="text-caption text-fg-3">{description}</span>
        </span>
      </button>
    </li>
  );
}

function DeleteContent({
  user,
  onCancel,
  onDeleted,
}: {
  user: AdminUserItem;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const id = useId();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const firstName = firstNameOf(user.name);
  const matches = typed.trim().toLowerCase() === user.email.toLowerCase();

  async function remove() {
    setPending(true);
    setError(undefined);
    try {
      const result = await deleteUserAction({
        userId: user.id,
        confirmEmail: typed,
      });
      const message = actionErrorMessage(result);
      if (message) {
        setError(message);
        return;
      }
      toast(`Conta de ${firstName} excluída, com todas as finanças.`);
      onDeleted();
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setPending(false);
    }
  }

  return (
    <SheetContent
      title={`Excluir a conta de ${firstName}?`}
      description="Apaga a conta e tudo o que há nela: contas, cartões, lançamentos, metas, orçamentos e importações. Não dá para desfazer."
      footer={
        <>
          <Button
            variant="destructive"
            size="lg"
            className="w-full"
            disabled={!matches}
            loading={pending}
            onClick={remove}
          >
            <Trash2 aria-hidden="true" />
            Excluir conta
          </Button>
          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            onClick={onCancel}
          >
            Cancelar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2 pb-2">
        <Label htmlFor={`${id}-confirm`}>
          Para confirmar, digite{" "}
          <span className="break-all font-bold">{user.email}</span>
        </Label>
        <Input
          id={`${id}-confirm`}
          type="email"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={typed}
          placeholder={user.email}
          onChange={(event) => {
            setTyped(event.target.value);
            setError(undefined);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
        />
        <p
          id={`${id}-hint`}
          className="flex items-start gap-2 text-caption text-fg-3"
        >
          <KeyRound aria-hidden="true" className="mt-px size-4 shrink-0" />
          <span>
            O botão libera quando o e-mail confere. As suas finanças não são
            afetadas.
          </span>
        </p>
        <FieldError id={`${id}-error`}>{error}</FieldError>
      </div>
    </SheetContent>
  );
}
