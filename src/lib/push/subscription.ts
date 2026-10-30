// Web Push subscriptions (doc 01 §8, §10): what the browser hands over when a
// person turns notifications on, and the message the service worker
// (public/sw.js) shows. Pure: no I/O, shared by the server and the browser.
import { z } from "zod";

/**
 * Hosts of the browsers' push services. The server POSTs every notification
 * to the endpoint a browser handed over, so anything else (an internal
 * address, someone else's server) is refused instead of being called.
 */
const PUSH_SERVICE_HOSTS = [
  // Safari (iPhone and iPad from iOS 16.4 on the home screen, macOS)
  "push.apple.com",
  // Chrome, Android and most Chromium browsers
  "fcm.googleapis.com",
  "android.googleapis.com",
  // Firefox
  "push.services.mozilla.com",
  // Edge on Windows
  "notify.windows.com",
] as const;

/** An https URL on one of the browsers' push services. */
export function isPushServiceEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  if (url.port && url.port !== "443") return false;
  const host = url.hostname.toLowerCase();
  return PUSH_SERVICE_HOSTS.some(
    (service) => host === service || host.endsWith(`.${service}`),
  );
}

/** Base64url (padding tolerated), the encoding of the subscription keys. */
const base64url = (min: number, max: number) =>
  z
    .string()
    .min(min)
    .max(max)
    .regex(/^[A-Za-z0-9_-]+={0,2}$/);

/** `PushSubscription.toJSON()`, as the browser sends it. */
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().max(1024).refine(isPushServiceEndpoint, {
    error: "Serviço de notificações desconhecido.",
  }),
  expirationTime: z.number().nullish(),
  keys: z.object({
    // Uncompressed P-256 public key (65 bytes) and auth secret (16 bytes).
    p256dh: base64url(80, 100),
    auth: base64url(16, 32),
  }),
});

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

/**
 * What one push carries to the service worker. Kept short: push services cap
 * the payload at about 4 KB, and the lock screen shows two or three lines.
 */
export type PushMessage = {
  title: string;
  body: string;
  /** Page the notification opens, always a path in this app ("/inicio"). */
  url: string;
  /**
   * Notifications with the same tag replace each other instead of piling up
   * (e.g. one per bill).
   */
  tag?: string;
  /** Number on the app icon after this push; 0 clears it. */
  badge: number;
};

/** A path inside the app, never another origin ("//evil", "https://…"). */
export function isAppPath(path: string): boolean {
  return /^\/(?![/\\])/.test(path);
}

/** The number the app icon can show: a whole number from 0 to 99. */
export function badgeNumber(count: number): number {
  if (!Number.isFinite(count) || count <= 0) return 0;
  return Math.min(99, Math.floor(count));
}
