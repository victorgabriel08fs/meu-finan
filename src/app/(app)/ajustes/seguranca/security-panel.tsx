"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export type PasskeyItem = {
  id: string;
  name: string;
  createdAt: string | null;
  synced: boolean;
};
export type SessionItem = {
  token: string;
  device: string;
  lastActiveAt: string;
  current: boolean;
};

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
});
const dateTimeFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

type AuthError = { status?: number; code?: string; message?: string } | null;

/** Sensitive operations need a recent sign-in (Better Auth freshAge). */
function errorMessage(error: AuthError, fallback: string): string {
  if (!error) return fallback;
  if (error.code === "SESSION_NOT_FRESH" || error.status === 403) {
    return "Por segurança, saia e entre de novo para fazer isso.";
  }
  if (error.status === 429) return "Muitas tentativas. Espere alguns minutos.";
  if (error.code === "INVALID_PASSWORD") return "A senha atual está incorreta.";
  return fallback;
}

export function SecurityPanel({
  passkeys,
  sessions,
  firstAccess,
}: {
  passkeys: PasskeyItem[];
  sessions: SessionItem[];
  firstAccess: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, task: () => Promise<void>) => {
    setBusy(key);
    try {
      await task();
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {firstAccess && passkeys.length === 0 ? (
        <output
          aria-live="polite"
          className="rounded-card bg-primary-soft px-5 py-4 text-[15px] text-on-primary-soft leading-[22px]"
        >
          Acesso criado. Agora cadastre uma passkey para entrar com Face ID,
          digital ou o PIN do aparelho — é mais rápido e mais seguro que a
          senha.
        </output>
      ) : null}

      <PasskeysCard passkeys={passkeys} busy={busy} run={run} />

      {firstAccess ? (
        <Button asChild size="lg" className="w-full">
          <Link href="/onboarding">
            {passkeys.length > 0
              ? "Continuar: primeiros passos"
              : "Pular e continuar"}
          </Link>
        </Button>
      ) : null}

      <PasswordCard />
      <SessionsCard sessions={sessions} busy={busy} run={run} />

      <Button
        variant="secondary"
        size="lg"
        className="w-full"
        loading={busy === "sign-out"}
        onClick={() =>
          run("sign-out", async () => {
            await authClient.signOut();
            router.replace("/entrar");
          })
        }
      >
        Sair deste aparelho
      </Button>
    </div>
  );
}

type RunFn = (key: string, task: () => Promise<void>) => Promise<void>;

function PasskeysCard({
  passkeys,
  busy,
  run,
}: {
  passkeys: PasskeyItem[];
  busy: string | null;
  run: RunFn;
}) {
  const [name, setName] = useState("");

  const add = () =>
    run("add-passkey", async () => {
      const result = await authClient.passkey.addPasskey({
        name: name.trim() || "Meu aparelho",
      });
      if (result?.error) {
        toast.error(
          errorMessage(
            result.error,
            "Não foi possível cadastrar a passkey. Tente de novo.",
          ),
        );
        return;
      }
      setName("");
      toast.success("Passkey cadastrada.");
    });

  const remove = (id: string) =>
    run(`remove-${id}`, async () => {
      const result = await authClient.passkey.deletePasskey({ id });
      if (result?.error) {
        toast.error(
          errorMessage(result.error, "Não foi possível remover a passkey."),
        );
        return;
      }
      toast.success("Passkey removida.");
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Passkeys</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-[14px] text-fg-2 leading-5">
          Entre com Face ID, digital ou o PIN do aparelho. Cadastre em mais de
          um aparelho para não depender de um só.
        </p>
        {passkeys.length === 0 ? (
          <p className="text-[14px] text-fg-3">Nenhuma passkey cadastrada.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {passkeys.map((item) => (
              <li
                key={item.id}
                className="flex min-h-14 items-center gap-3 py-2"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold text-[15px] text-fg">
                    {item.name}
                  </span>
                  <span className="text-[13px] text-fg-3">
                    {item.createdAt
                      ? `Criada em ${dateFormat.format(new Date(item.createdAt))}`
                      : "Data desconhecida"}
                    {item.synced ? " · sincronizada" : ""}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-danger"
                  loading={busy === `remove-${item.id}`}
                  disabled={busy !== null}
                  onClick={() => remove(item.id)}
                  aria-label={`Remover a passkey ${item.name}`}
                >
                  Remover
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-col gap-2">
          <Label htmlFor="passkey-name">Nome do aparelho</Label>
          <Input
            id="passkey-name"
            placeholder="Ex.: iPhone"
            value={name}
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <Button
          size="lg"
          className="w-full"
          loading={busy === "add-passkey"}
          disabled={busy !== null}
          onClick={add}
        >
          Cadastrar passkey neste aparelho
        </Button>
      </CardContent>
    </Card>
  );
}

function PasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (next.length < 12) {
      setError("A nova senha precisa de pelo menos 12 caracteres.");
      return;
    }
    if (next !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }
    setPending(true);
    try {
      const result = await authClient.changePassword({
        currentPassword: current,
        newPassword: next,
        revokeOtherSessions: true,
      });
      if (result.error) {
        setError(
          errorMessage(result.error, "Não foi possível trocar a senha."),
        );
        return;
      }
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success("Senha alterada. As outras sessões foram encerradas.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Senha</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="current-password">Senha atual</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-password">Nova senha</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(event) => setNext(event.target.value)}
              aria-describedby="new-password-hint"
            />
            <p
              id="new-password-hint"
              className="text-[13px] text-fg-3 leading-[18px]"
            >
              Pelo menos 12 caracteres.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm-password">Confirme a nova senha</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </div>
          <FieldError id="password-error">{error}</FieldError>
          <Button
            type="submit"
            variant="secondary"
            size="lg"
            className="w-full"
            loading={pending}
            disabled={!current || !next || !confirm}
          >
            Trocar senha
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function SessionsCard({
  sessions,
  busy,
  run,
}: {
  sessions: SessionItem[];
  busy: string | null;
  run: RunFn;
}) {
  const others = sessions.filter((item) => !item.current);

  const revokeOne = (token: string) =>
    run(`revoke-${token}`, async () => {
      const result = await authClient.revokeSession({ token });
      if (result.error) {
        toast.error(
          errorMessage(result.error, "Não foi possível encerrar a sessão."),
        );
        return;
      }
      toast.success("Sessão encerrada.");
    });

  const revokeOthers = () =>
    run("revoke-others", async () => {
      const result = await authClient.revokeOtherSessions();
      if (result.error) {
        toast.error(
          errorMessage(result.error, "Não foi possível encerrar as sessões."),
        );
        return;
      }
      toast.success("Outras sessões encerradas.");
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sessões ativas</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="flex flex-col divide-y divide-border">
          {sessions.map((item) => (
            <li
              key={item.token}
              className="flex min-h-14 items-center gap-3 py-2"
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-semibold text-[15px] text-fg">
                  {item.device}
                </span>
                <span className="text-[13px] text-fg-3">
                  {item.current
                    ? "Este aparelho"
                    : `Último uso ${dateTimeFormat.format(new Date(item.lastActiveAt))}`}
                </span>
              </div>
              {item.current ? null : (
                <Button
                  variant="ghost"
                  size="sm"
                  loading={busy === `revoke-${item.token}`}
                  disabled={busy !== null}
                  onClick={() => revokeOne(item.token)}
                  aria-label={`Encerrar a sessão em ${item.device}`}
                >
                  Encerrar
                </Button>
              )}
            </li>
          ))}
        </ul>
        {others.length > 0 ? (
          <Button
            variant="tonal"
            size="lg"
            className="w-full"
            loading={busy === "revoke-others"}
            disabled={busy !== null}
            onClick={revokeOthers}
          >
            Encerrar as outras sessões
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
