// This device's side of Web Push (doc 01 §10): the service worker
// (public/sw.js), the browser's push subscription and the number on the app
// icon. Browser-only: call from effects and event handlers.
import { unsubscribePushAction } from "@/server/actions/push";

/** What this device can do, before anyone asks for permission. */
export type PushSupport =
  /** Ready: the switch can turn notifications on. */
  | "ready"
  /** iPhone or iPad in Safari: push only exists in the app on the home screen. */
  | "install"
  /** The person blocked notifications for the app in the device's settings. */
  | "denied"
  /** This browser has no Web Push. */
  | "unsupported";

function isAppleMobile(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS reports itself as a Mac.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Older iOS only sets this.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function pushSupport(): PushSupport {
  const hasPush =
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
  if (!hasPush) {
    return isAppleMobile() && !isStandalone() ? "install" : "unsupported";
  }
  return Notification.permission === "denied" ? "denied" : "ready";
}

/** Registers the service worker (once per page load) and waits for it. */
let registering: Promise<ServiceWorkerRegistration> | null = null;
export function serviceWorker(): Promise<ServiceWorkerRegistration> {
  registering ??= navigator.serviceWorker
    .register("/sw.js", { scope: "/", updateViaCache: "none" })
    .then(() => navigator.serviceWorker.ready)
    .catch((error: unknown) => {
      registering = null;
      throw error;
    });
  return registering;
}

/** This device's subscription, if it has one. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return null;
  }
  const registration = await serviceWorker();
  return registration.pushManager.getSubscription();
}

function base64urlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function sameKey(subscription: PushSubscription, key: Uint8Array): boolean {
  const current = subscription.options.applicationServerKey;
  if (!current) return false;
  const bytes = new Uint8Array(current);
  return bytes.length === key.length && bytes.every((b, i) => b === key[i]);
}

/**
 * Asks for permission and subscribes this device. Call it straight from a
 * tap: iOS only shows the permission prompt for a user gesture, so nothing
 * may be awaited before it. Resolves null when the person says no.
 */
export async function subscribeDevice(
  publicKey: string,
): Promise<PushSubscription | null> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;
  const registration = await serviceWorker();
  const key = base64urlToBytes(publicKey);
  const existing = await registration.pushManager.getSubscription();
  if (existing && sameKey(existing, key)) return existing;
  // Made with other keys (the VAPID pair changed): it would never deliver.
  await existing?.unsubscribe();
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: key,
  });
}

/** The number on the app icon; 0 clears it. Silently skipped where unsupported. */
export async function setAppBadge(count: number): Promise<void> {
  if (!("setAppBadge" in navigator)) return;
  try {
    if (count > 0) await navigator.setAppBadge(count);
    else await navigator.clearAppBadge();
  } catch {
    // No permission for badges (iOS needs notifications on): nothing to show.
  }
}

/**
 * Before signing out: this device stops receiving the person's notifications
 * and drops their number from the icon, so whoever uses it next sees none of
 * it. Best effort and quick: signing out never waits more than a moment.
 */
export async function forgetDevice(): Promise<void> {
  const work = (async () => {
    await setAppBadge(0);
    if (!("serviceWorker" in navigator)) return;
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager?.getSubscription();
    if (!subscription) return;
    await unsubscribePushAction({ endpoint: subscription.endpoint });
    await subscription.unsubscribe();
  })().catch(() => {
    // Offline or refused: the server drops it once the push service says so.
  });
  await Promise.race([
    work,
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
}
