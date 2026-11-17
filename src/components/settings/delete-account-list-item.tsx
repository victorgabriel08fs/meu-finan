"use client";

import { Download, KeyRound, Trash2, UserX } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import { simulatorStorageKey } from "@/components/planning/simulator/storage";
import { currentSubscription } from "@/components/push/device";
import { actionErrorMessage } from "@/components/transactions/action-result";
import { Button } from "@/components/ui/button";
import { CLAMP_TEXT, CLAMP_TITLE } from "@/components/ui/clamp";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  SELF_DELETE_LAST_ADMIN_MESSAGE,
  SELF_DELETE_OWNER_MESSAGE,
} from "@/lib/admin/guards";
import { authClient } from "@/lib/auth-client";
import { RECENT_SIGN_IN_REQUIRED } from "@/lib/security/recent-sign-in";
import { cn } from "@/lib/utils";
import { deleteOwnAccountAction } from "@/server/actions/account";
import { RecentSignInContent } from "./recent-sign-in-sheet";
import { useDataExport } from "./use-data-export";

type Step = "confirm" | "reauth" | "blocked";

/** Where the person lands once the account is gone (/entrar shows a notice). */
const DELETED_PATH = "/entrar?excluida=1";

const OFFLINE_MESSAGE =
  "Não conseguimos excluir agora. Verifique a conexão e tente de novo.";

/** The row's short reason; the sheet shows the whole sentence. */
const SHORT_BLOCKERS: Record<string, string> = {
  [SELF_DELETE_OWNER_MESSAGE]: "Conta do dono do app",
  [SELF_DELETE_LAST_ADMIN_MESSAGE]: "Único administrador ativo",
};

/** At most `ms`, so leaving never waits long on a slow network. */
const withinMs = (task: Promise<unknown>, ms: number) =>
  Promise.race([
    task.catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, ms)),
  ]);

/**
 * What this device keeps of the person, cleared before leaving: the push
 * subscription (in the browser only: the server's row went with the
 * account), the simulator's inputs and the session cookie (Better Auth's
 * sign-out clears it even though the session is gone; the cookie opens
 * nothing anyway). Best effort and quick.
 */
async function forgetThisDevice(userId: string) {
  await withinMs(
    currentSubscription().then((subscription) => subscription?.unsubscribe()),
    2000,
  );
  try {
    localStorage.removeItem(simulatorStorageKey(userId));
  } catch {
    // Storage blocked: nothing was saved.
  }
  await withinMs(authClient.signOut(), 3000);
}

/**
 * "Excluir minha conta", the last row of Dados (doc 02 §6.14, danger zone):
 * opens a sheet that explains what goes and asks for the e-mail. The owner's
 * account and the last active administrator see why they cannot instead; a
 * sign-in older than a few minutes leads to "Entre de novo para continuar".
 * The server applies the same rules again.
 */
export function DeleteAccountListItem({
  userId,
  email,
  name,
  blocker,
  inGroups,
}: {
  userId: string;
  email: string;
  name: string;
  /** Why the account cannot be deleted (owner, last administrator), or null. */
  blocker: string | null;
  /** Member of a group of Compartilhado (the history stays there). */
  inGroups: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("confirm");
  const [opening, setOpening] = useState(0);
  // The first step slides in; the next ones replace it in place.
  const [swap, setSwap] = useState(false);
  const go = useCallback((next: Step) => {
    setSwap(true);
    setStep(next);
  }, []);

  function show() {
    setStep(blocker ? "blocked" : "confirm");
    setSwap(false);
    setOpening((count) => count + 1);
    setOpen(true);
  }
  const close = () => setOpen(false);

  return (
    <li>
      <button
        type="button"
        onClick={show}
        className="flex min-h-16 w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-left -outline-offset-2 transition-colors duration-100 hover:bg-surface-2/60 active:bg-surface-2"
      >
        <span className="flex min-w-0 flex-[1_1_10rem] items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-[min(2rem,40px)] shrink-0 items-center justify-center rounded-chip bg-surface-2 text-danger [&_svg]:size-[min(1.25rem,24px)]"
          >
            <UserX />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span
              className={cn("text-body font-semibold text-danger", CLAMP_TITLE)}
            >
              Excluir minha conta
            </span>
            <span className={cn("text-caption text-fg-3", CLAMP_TEXT)}>
              {blocker
                ? (SHORT_BLOCKERS[blocker] ?? "Não dá para excluir")
                : "Apaga o seu acesso e todos os seus dados"}
            </span>
          </span>
        </span>
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        {step === "blocked" ? (
          <BlockedContent blocker={blocker ?? ""} onClose={close} />
        ) : step === "reauth" ? (
          <RecentSignInContent swap={swap} onCancel={close} />
        ) : (
          <ConfirmContent
            key={opening}
            userId={userId}
            email={email}
            name={name}
            inGroups={inGroups}
            swap={swap}
            onReauth={() => go("reauth")}
            onCancel={close}
          />
        )}
      </Sheet>
    </li>
  );
}

function BlockedContent({
  blocker,
  onClose,
}: {
  blocker: string;
  onClose: () => void;
}) {
  return (
    <SheetContent
      title="Não dá para excluir esta conta"
      description={blocker}
      footer={
        <Button size="lg" className="w-full" onClick={onClose}>
          Entendi
        </Button>
      }
    />
  );
}

function ConfirmContent({
  userId,
  email,
  name,
  inGroups,
  swap,
  onReauth,
  onCancel,
}: {
  userId: string;
  email: string;
  name: string;
  inGroups: boolean;
  swap: boolean;
  onReauth: () => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const matches = typed.trim().toLowerCase() === email.toLowerCase();
  const exporter = useDataExport(onReauth);
  // The error sits under the field, low in the sheet: bring it above the
  // sticky footer (and the keyboard) when it appears.
  useEffect(() => {
    if (!error) return;
    document
      .getElementById(`${id}-error`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [error, id]);

  async function remove() {
    setPending(true);
    setError(undefined);
    try {
      const result = await deleteOwnAccountAction({ confirmEmail: typed });
      const message = actionErrorMessage(result);
      if (message === RECENT_SIGN_IN_REQUIRED) {
        setPending(false);
        onReauth();
        return;
      }
      if (message) {
        setError(message);
        setPending(false);
        return;
      }
    } catch {
      setError(OFFLINE_MESSAGE);
      setPending(false);
      return;
    }
    // Gone: the button keeps loading while the page unloads. A full page
    // load, so nothing of this account stays in memory.
    await forgetThisDevice(userId);
    window.location.replace(DELETED_PATH);
  }

  return (
    <SheetContent
      swap={swap}
      title="Excluir a sua conta?"
      description="Apaga o seu acesso (senha, passkeys e sessões) e todos os seus dados: contas, cartões, lançamentos, orçamentos, metas, etiquetas e ajustes. Não dá para desfazer."
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
            Excluir minha conta
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
      <div className="flex flex-col gap-4 pb-4">
        {inGroups ? (
          <p className="text-body text-fg-2">
            Você sai dos grupos do Compartilhado. Lá, as despesas e os acertos
            continuam para as outras pessoas, com o seu nome como “{name} (conta
            excluída)”.
          </p>
        ) : null}
        <div className="flex flex-col items-start gap-1">
          <p className="text-body text-fg-2">
            Quer guardar uma cópia antes? Use Exportar todos os dados.
          </p>
          <Button
            variant="ghost"
            loading={exporter.busy}
            onClick={exporter.start}
          >
            <Download aria-hidden="true" />
            Exportar todos os dados
          </Button>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-confirm`}>
            Para confirmar, digite{" "}
            <span className="break-all font-bold">{email}</span>
          </Label>
          <Input
            id={`${id}-confirm`}
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={typed}
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
              As cópias de segurança do banco guardam os dados por alguns dias,
              até saírem da janela de retenção.
            </span>
          </p>
          <FieldError id={`${id}-error`}>{error}</FieldError>
        </div>
      </div>
    </SheetContent>
  );
}
