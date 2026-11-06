"use client";

import { Bell, BellRing, LoaderCircle, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { SectionHeader } from "@/components/app/section-header";
import { SettingRow, SettingRowButton } from "@/components/app/setting-row";
import {
  actionErrorMessage,
  NETWORK_ERROR,
} from "@/components/transactions/action-result";
import { Switch } from "@/components/ui/switch";
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
        <SettingRow
          id={ids}
          icon={Bell}
          label="Receber notificações"
          description="Avisos no aparelho e o número dos não lidos no ícone do app."
          control={
            busy === "toggle" ||
            support === null ||
            (support === "ready" && state === "checking") ? (
              <span className="flex min-h-11 min-w-11 items-center justify-center">
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
            )
          }
        />
        {on && support === "ready" ? (
          <SettingRowButton
            id={`${ids}-test`}
            icon={Send}
            label="Enviar notificação de teste"
            description="Confira se ela chega e se o número aparece no ícone."
            aria-busy={busy === "test" || undefined}
            disabled={busy !== null}
            onClick={() => void sendTest()}
            control={
              busy === "test" ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="size-5 animate-spin text-fg-3"
                />
              ) : null
            }
          />
        ) : null}
        {on && support === "ready" && isAdmin ? (
          <SettingRowButton
            id={`${ids}-preview`}
            icon={BellRing}
            label="Enviar prévia dos avisos"
            description="Os avisos ligados, com os dados de hoje, só neste aparelho."
            aria-busy={busy === "preview" || undefined}
            disabled={busy !== null}
            onClick={() => void sendPreview()}
            control={
              busy === "preview" ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="size-5 animate-spin text-fg-3"
                />
              ) : null
            }
          />
        ) : null}
      </div>
      <p className="mt-3 px-4 text-caption text-fg-3" aria-live="polite">
        {note ??
          "Vale só para este aparelho. Ao sair da sua conta nele, as notificações dele são desligadas."}
      </p>
    </section>
  );
}
