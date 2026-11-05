"use client";

import { Bell, BellRing, LoaderCircle, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { SectionHeader } from "@/components/app/section-header";
import { Switch } from "@/components/planning/form/switch";
import {
  actionErrorMessage,
  NETWORK_ERROR,
} from "@/components/transactions/action-result";
import type { PushSubscriptionInput } from "@/lib/push/subscription";
import { previewRemindersAction } from "@/server/actions/notifications";
import {
  sendTestPushAction,
  subscribePushAction,
  syncPushDeviceAction,
  unsubscribePushAction,
} from "@/server/actions/push";
import {
  currentSubscription,
  type PushSupport,
  pushSupport,
  setAppBadge,
  subscribeDevice,
} from "./device";

const iconClass =
  "flex size-8 shrink-0 items-center justify-center rounded-chip bg-surface-2 text-fg-2 [&_svg]:size-5";
const actionRowClass =
  "flex min-h-16 w-full items-center gap-3 border-t border-border px-4 py-2 text-left -outline-offset-2 transition-colors duration-100 hover:bg-surface-2/60 active:bg-surface-2 disabled:cursor-progress";

/** Why the switch cannot be used here, in the person's words. */
const BLOCKED: Record<Exclude<PushSupport, "ready">, string> = {
  install:
    "No iPhone e no iPad, as notificações chegam pelo app na Tela de Início. No Safari, toque em Compartilhar › Adicionar à Tela de Início, abra o Meu Finan pelo ícone e volte aqui.",
  denied:
    "As notificações do Meu Finan estão bloqueadas neste aparelho. No iPhone, libere em Ajustes › Notificações › Meu Finan e volte aqui.",
  unsupported:
    "Este navegador não recebe notificações. No iPhone, use o app da Tela de Início (iOS 16.4 ou mais recente).",
};

type DeviceState = "checking" | "on" | "off";

/** The toast after "Enviar prévia dos avisos". */
export function previewMessage(sent: number): string {
  if (sent === 0) return "Nada para mostrar hoje nos avisos ligados.";
  return sent === 1
    ? "Enviamos 1 prévia para este aparelho."
    : `Enviamos ${sent} prévias para este aparelho.`;
}

/**
 * Ajustes › Notificações › Neste aparelho: the switch that asks for
 * permission and subscribes this device, and the test notification. The
 * state comes from the browser (its subscription) checked against the
 * server, so it only shows once the page is running.
 */
export function PushSettings({
  publicKey,
  isAdmin,
}: {
  /** The VAPID public key, or null while the keys are not configured. */
  publicKey: string | null;
  isAdmin: boolean;
}) {
  const ids = useId();
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [state, setState] = useState<DeviceState>("checking");
  const router = useRouter();
  const [busy, setBusy] = useState<"toggle" | "test" | "preview" | null>(null);

  useEffect(() => {
    let cancelled = false;
    const found = pushSupport();
    setSupport(found);
    if (found !== "ready") return;
    (async () => {
      try {
        const subscription = await currentSubscription();
        const result = subscription
          ? await syncPushDeviceAction({ endpoint: subscription.endpoint })
          : null;
        if (!cancelled) setState(result?.data?.on ? "on" : "off");
      } catch {
        if (!cancelled) setState("off");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function turnOn(key: string) {
    // First thing in the tap: iOS only asks for permission on a gesture.
    const subscription = await subscribeDevice(key);
    if (!subscription) {
      if (Notification.permission === "denied") setSupport("denied");
      else toast("Sem a permissão, as notificações ficam desligadas.");
      return;
    }
    const result = await subscribePushAction({
      subscription: subscription.toJSON() as PushSubscriptionInput,
    });
    const error = actionErrorMessage(result);
    if (error) {
      toast.error(error);
      return;
    }
    setState("on");
    toast("Notificações ativadas neste aparelho.");
    // The count of devices under Avisos comes from the server.
    router.refresh();
  }

  async function turnOff() {
    const subscription = await currentSubscription();
    if (subscription) {
      const result = await unsubscribePushAction({
        endpoint: subscription.endpoint,
      });
      const error = actionErrorMessage(result);
      if (error) {
        toast.error(error);
        return;
      }
      await subscription.unsubscribe();
    }
    await setAppBadge(0);
    setState("off");
    toast("Notificações desativadas neste aparelho.");
    router.refresh();
  }

  async function toggle(on: boolean) {
    if (!publicKey && on) return;
    setBusy("toggle");
    try {
      if (on && publicKey) await turnOn(publicKey);
      else await turnOff();
    } catch {
      toast.error(NETWORK_ERROR);
    } finally {
      setBusy(null);
    }
  }

  async function sendTest() {
    setBusy("test");
    try {
      const subscription = await currentSubscription();
      if (!subscription) {
        setState("off");
        return;
      }
      const result = await sendTestPushAction({
        endpoint: subscription.endpoint,
      });
      const error = actionErrorMessage(result);
      if (error) toast.error(error);
      else toast("Notificação enviada. Ela chega em alguns segundos.");
    } catch {
      toast.error(NETWORK_ERROR);
    } finally {
      setBusy(null);
    }
  }

  async function sendPreview() {
    setBusy("preview");
    try {
      const subscription = await currentSubscription();
      if (!subscription) {
        setState("off");
        return;
      }
      const result = await previewRemindersAction({
        endpoint: subscription.endpoint,
      });
      const error = actionErrorMessage(result);
      if (error) toast.error(error);
      else toast(previewMessage(result?.data?.sent ?? 0));
    } catch {
      toast.error(NETWORK_ERROR);
    } finally {
      setBusy(null);
    }
  }

  const blocked = support && support !== "ready" ? BLOCKED[support] : null;
  // Null, not false, when configured: `??` only falls back on null.
  const unconfigured = publicKey
    ? null
    : isAdmin
      ? "O envio ainda não está configurado: defina VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY na Vercel e faça um novo deploy."
      : "As notificações ainda não estão disponíveis.";
  const note = blocked ?? unconfigured;
  const on = state === "on";

  return (
    <section aria-labelledby="notificacoes-aparelho">
      <SectionHeader id="notificacoes-aparelho" title="Neste aparelho" />
      <div className="overflow-hidden rounded-2xl bg-surface shadow-card">
        <div className="flex min-h-16 items-center gap-3 py-2 pr-2 pl-4">
          <span aria-hidden="true" className={iconClass}>
            <Bell />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span
              id={`${ids}-label`}
              className="text-body font-semibold text-fg"
            >
              Receber notificações
            </span>
            <span id={`${ids}-hint`} className="text-caption text-fg-3">
              Avisos no aparelho e o número dos não lidos no ícone do app.
            </span>
          </span>
          {busy === "toggle" ||
          support === null ||
          (support === "ready" && state === "checking") ? (
            <span className="flex h-11 w-13 items-center justify-center">
              <LoaderCircle
                aria-label="Carregando"
                className="size-5 animate-spin text-fg-3"
              />
            </span>
          ) : (
            <Switch
              checked={on}
              onCheckedChange={(next) => void toggle(next)}
              labelledBy={`${ids}-label`}
              describedBy={`${ids}-hint`}
              disabled={
                support !== "ready" || busy !== null || (!on && !publicKey)
              }
            />
          )}
        </div>
        {on && support === "ready" ? (
          <button
            type="button"
            aria-busy={busy === "test" || undefined}
            disabled={busy !== null}
            onClick={() => void sendTest()}
            className={actionRowClass}
          >
            <span aria-hidden="true" className={iconClass}>
              <Send />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-body font-semibold text-fg">
                Enviar notificação de teste
              </span>
              <span className="text-caption text-fg-3">
                Confira se ela chega e se o número aparece no ícone.
              </span>
            </span>
            {busy === "test" ? (
              <LoaderCircle
                aria-hidden="true"
                className="size-5 shrink-0 animate-spin text-fg-3"
              />
            ) : null}
          </button>
        ) : null}
        {on && support === "ready" && isAdmin ? (
          <button
            type="button"
            aria-busy={busy === "preview" || undefined}
            disabled={busy !== null}
            onClick={() => void sendPreview()}
            className={actionRowClass}
          >
            <span aria-hidden="true" className={iconClass}>
              <BellRing />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-body font-semibold text-fg">
                Enviar prévia dos avisos
              </span>
              <span className="text-caption text-fg-3">
                Os avisos ligados, com os dados de hoje, só neste aparelho.
              </span>
            </span>
            {busy === "preview" ? (
              <LoaderCircle
                aria-hidden="true"
                className="size-5 shrink-0 animate-spin text-fg-3"
              />
            ) : null}
          </button>
        ) : null}
      </div>
      <p className="mt-3 px-4 text-caption text-fg-3" aria-live="polite">
        {note ??
          "Vale só para este aparelho. Ao sair da sua conta nele, as notificações dele são desligadas."}
      </p>
    </section>
  );
}
